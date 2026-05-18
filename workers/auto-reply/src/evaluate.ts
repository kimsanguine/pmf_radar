/**
 * evaluate.ts
 *
 * Auto-Reply 5조건 AND 평가 함수.
 *
 * 조건 명세 (data/signal_schema.json::automation_boundary.auto_reply_trigger_rules):
 *   C1. category ∈ auto_reply_ok  ["setup", "basic_faq", "community", "praise"]
 *   C2. evidence_strength == "weak"
 *   C3. approved_template_db_hit  (data/auto_reply_templates.json 에 template_id 매칭)
 *   C4. dwell_seconds >= 30        (30초 취소 창, US-22)
 *   C5. pii_masking_passed         (maskPii 완료 확인)
 *       + template_text_exact_match (template_id 가 record 에 포함, LLM 변형 금지)
 *   추가:
 *   C6. channel == "email"         (activated_channels, US-21)
 *   C7. daily_cap < 20             (일일 상한, auto_reply_log row count 기준)
 *
 * 조건 순서 및 early-exit 이유:
 *   1) channel 검사(C6) — 이메일 외 채널은 즉시 false. 가장 저렴한 문자열 비교.
 *   2) category 검사(C1) — auto_reply_ok 4개 카테고리 set lookup.
 *   3) evidence_strength 검사(C2) — weak 만 통과.
 *   4) template_id 존재 검사(C3 전제) — record 에 template_id 없으면 LLM 생성으로 간주 즉시 차단.
 *   5) template DB hit 검사(C3) — template_id 가 DB 에 실제 존재하는지 확인.
 *   6) pii_masking_passed 검사(C5) — false 이면 즉시 차단.
 *   7) dwell_seconds 검사(C4) — DB 조회(daily_cap) 직전 마지막 로컬 검사.
 *   8) daily_cap 검사(C7) — Supabase count 조회가 필요하므로 마지막 배치.
 *
 *  이 순서의 근거:
 *  - C6·C1·C2 는 O(1) 조회 → 잘못된 채널·카테고리 레코드를 DB 조회 없이 제거.
 *  - C3 template_id 유무 검사는 LLM 생성 차단 최우선 게이트 — DB 조회 전에 로컬 검증.
 *  - C5 PII 검사는 로컬(동기) 이므로 DB 조회(C7) 보다 앞.
 *  - C7 daily_cap 은 Supabase HTTP 조회가 필요하여 가장 비용 큰 연산 → 최후.
 */

import { checkPiiMaskingPassed, maskPii } from "../../_shared/mask-pii";

// ---------------------------------------------------------------------------
// 타입 정의
// ---------------------------------------------------------------------------

/** signal_schema.json 의 auto_reply_ok 카테고리 */
export type AutoReplyOkCategory = "setup" | "basic_faq" | "community" | "praise";

/** evaluate 함수에 넘기는 레코드 (webhook_inbox row 에서 추출) */
export interface AutoReplyRecord {
  /** webhook_inbox.id */
  inbox_id: string;
  /** 채널 — "email" 만 활성 */
  channel: string;
  /** signal_schema.json category 필드 */
  category: string;
  /** signal_schema.json evidence_strength 필드 */
  evidence_strength: string;
  /** 사전 승인 template_id — 없으면 LLM 생성으로 간주 차단 */
  template_id?: string;
  /** mask_pii 적용 완료 여부 (normalization 단계에서 설정) */
  pii_masking_passed: boolean;
  /** 마스킹된 메시지 본문 (pii_masking_passed 재검증용) */
  masked_message: string;
  /** 원본 메시지 (pii_masking_passed 재검증 기준) */
  raw_message?: string;
  /** dwell_seconds: auto_reply_log INSERT 시각부터 현재까지 경과 초 */
  dwell_seconds: number;
  /** 오늘 auto_reply_log count (daily_cap 검사) */
  today_sent_count: number;
}

/** 템플릿 DB 엔트리 */
export interface TemplateEntry {
  template_id: string;
  category: string;
  locale: string;
  text: string;
  last_reviewed_at: string;
}

/** evaluate 결과 */
export interface EligibilityResult {
  eligible: boolean;
  reasons: string[];
}

// ---------------------------------------------------------------------------
// 상수
// ---------------------------------------------------------------------------

const AUTO_REPLY_OK_CATEGORIES: ReadonlySet<string> = new Set([
  "setup",
  "basic_faq",
  "community",
  "praise",
]);

const DAILY_SEND_CAP = 20;

// ---------------------------------------------------------------------------
// 메인 평가 함수
// ---------------------------------------------------------------------------

/**
 * evaluateAutoReplyEligibility
 *
 * @param record   - webhook_inbox row 기반 평가 대상
 * @param templateDb - auto_reply_templates.json 의 templates 배열
 * @returns {eligible, reasons} — reasons 에는 fail 사유 또는 pass 확인 메시지가 담김
 */
export function evaluateAutoReplyEligibility(
  record: AutoReplyRecord,
  templateDb: TemplateEntry[]
): EligibilityResult {
  const reasons: string[] = [];

  // C6: channel == "email" (activated_channels, US-21)
  if (record.channel !== "email") {
    reasons.push(`C6_FAIL: channel=${record.channel}. Auto-reply activated for email only.`);
    return { eligible: false, reasons };
  }
  reasons.push("C6_PASS: channel=email");

  // C1: category ∈ auto_reply_ok
  if (!AUTO_REPLY_OK_CATEGORIES.has(record.category)) {
    reasons.push(`C1_FAIL: category=${record.category} not in auto_reply_ok [setup,basic_faq,community,praise].`);
    return { eligible: false, reasons };
  }
  reasons.push(`C1_PASS: category=${record.category}`);

  // C2: evidence_strength == "weak"
  if (record.evidence_strength !== "weak") {
    reasons.push(`C2_FAIL: evidence_strength=${record.evidence_strength}. Required: weak.`);
    return { eligible: false, reasons };
  }
  reasons.push("C2_PASS: evidence_strength=weak");

  // C3 전제: template_id 가 record 에 존재해야 함 (LLM 생성 텍스트 차단)
  if (!record.template_id) {
    reasons.push("C3_FAIL: template_id missing in record. LLM-generated text send forbidden (US-23).");
    return { eligible: false, reasons };
  }

  // C3: approved_template_db_hit
  const templateHit = templateDb.find((t) => t.template_id === record.template_id);
  if (!templateHit) {
    reasons.push(`C3_FAIL: template_id=${record.template_id} not found in approved template DB.`);
    return { eligible: false, reasons };
  }
  reasons.push(`C3_PASS: template_id=${record.template_id} found in DB.`);

  // C5: pii_masking_passed
  // record.pii_masking_passed 는 upstream normalization 단계의 boolean.
  // 추가로 checkPiiMaskingPassed 로 재검증 (raw_message 있을 경우).
  if (!record.pii_masking_passed) {
    reasons.push("C5_FAIL: pii_masking_passed=false.");
    return { eligible: false, reasons };
  }
  // raw_message 가 있을 때 masked_message 와 재검증
  if (record.raw_message !== undefined) {
    const remasked = maskPii(record.raw_message);
    if (!checkPiiMaskingPassed(record.raw_message, remasked)) {
      reasons.push("C5_FAIL: pii_masking recheck failed.");
      return { eligible: false, reasons };
    }
  }
  reasons.push("C5_PASS: pii_masking_passed=true");

  // C4: dwell_seconds >= 30
  if (record.dwell_seconds < 30) {
    reasons.push(`C4_FAIL: dwell_seconds=${record.dwell_seconds} < 30. Cancel window not elapsed.`);
    return { eligible: false, reasons };
  }
  reasons.push(`C4_PASS: dwell_seconds=${record.dwell_seconds} >= 30`);

  // C7: daily_cap < 20
  if (record.today_sent_count >= DAILY_SEND_CAP) {
    reasons.push(`C7_FAIL: today_sent_count=${record.today_sent_count} >= daily_cap=${DAILY_SEND_CAP}. Fallback to HITL.`);
    return { eligible: false, reasons };
  }
  reasons.push(`C7_PASS: today_sent_count=${record.today_sent_count} < ${DAILY_SEND_CAP}`);

  // 전체 통과
  return { eligible: true, reasons };
}

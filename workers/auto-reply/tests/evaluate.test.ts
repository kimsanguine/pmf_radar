/**
 * evaluate.test.ts
 *
 * 5조건 평가 함수 unit tests — 12건
 *
 * 5조건 × (1 PASS + 1 FAIL) = 10건 + edge cases 2건 = 12건
 *
 * C1: category ∈ auto_reply_ok
 * C2: evidence_strength == "weak"
 * C3: approved_template_db_hit (template_id 존재 + DB hit)
 * C4: dwell_seconds >= 30
 * C5: pii_masking_passed
 * C6: channel == "email"  (activated_channels)
 * C7: daily_cap < 20
 *
 * 조건 순서 early-exit 때문에 각 FAIL 케이스는 앞 조건을 모두 통과시킨 후 해당 조건만 실패.
 */

import { describe, it, expect } from "vitest";
import { evaluateAutoReplyEligibility, type AutoReplyRecord, type TemplateEntry } from "../src/evaluate";

// ---------------------------------------------------------------------------
// 테스트용 템플릿 DB 픽스처
// ---------------------------------------------------------------------------

const TEMPLATE_DB: TemplateEntry[] = [
  {
    template_id: "setup_ko",
    category: "setup",
    locale: "ko",
    text: "초기 설정 안내 텍스트",
    last_reviewed_at: "2026-05-18",
  },
  {
    template_id: "basic_faq_ko",
    category: "basic_faq",
    locale: "ko",
    text: "자주 묻는 질문 안내 텍스트",
    last_reviewed_at: "2026-05-18",
  },
  {
    template_id: "community_ko",
    category: "community",
    locale: "ko",
    text: "커뮤니티 안내 텍스트",
    last_reviewed_at: "2026-05-18",
  },
  {
    template_id: "praise_ko",
    category: "praise",
    locale: "ko",
    text: "감사 응답 텍스트",
    last_reviewed_at: "2026-05-18",
  },
];

/** 5조건 모두 PASS 하는 기준 레코드 */
const BASE_PASS: AutoReplyRecord = {
  inbox_id: "test-inbox-001",
  channel: "email",
  category: "setup",
  evidence_strength: "weak",
  template_id: "setup_ko",
  pii_masking_passed: true,
  masked_message: "초기 설정을 도와주세요",
  dwell_seconds: 35,
  today_sent_count: 5,
};

// ---------------------------------------------------------------------------
// C6: channel == "email"
// ---------------------------------------------------------------------------

describe("C6: channel 검사", () => {
  it("C6-PASS: channel=email 이면 eligible=true (다른 조건 모두 통과)", () => {
    const result = evaluateAutoReplyEligibility(BASE_PASS, TEMPLATE_DB);
    expect(result.eligible).toBe(true);
    expect(result.reasons.some((r) => r.includes("C6_PASS"))).toBe(true);
  });

  it("C6-FAIL: channel=channel_talk 이면 eligible=false", () => {
    const record: AutoReplyRecord = { ...BASE_PASS, channel: "channel_talk" };
    const result = evaluateAutoReplyEligibility(record, TEMPLATE_DB);
    expect(result.eligible).toBe(false);
    expect(result.reasons.some((r) => r.includes("C6_FAIL"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// C1: category ∈ auto_reply_ok
// ---------------------------------------------------------------------------

describe("C1: category 검사", () => {
  it("C1-PASS: category=basic_faq 이면 C1 통과", () => {
    const record: AutoReplyRecord = {
      ...BASE_PASS,
      category: "basic_faq",
      template_id: "basic_faq_ko",
    };
    const result = evaluateAutoReplyEligibility(record, TEMPLATE_DB);
    expect(result.eligible).toBe(true);
    expect(result.reasons.some((r) => r.includes("C1_PASS"))).toBe(true);
  });

  it("C1-FAIL: category=refund_price 이면 eligible=false", () => {
    const record: AutoReplyRecord = { ...BASE_PASS, category: "refund_price" };
    const result = evaluateAutoReplyEligibility(record, TEMPLATE_DB);
    expect(result.eligible).toBe(false);
    expect(result.reasons.some((r) => r.includes("C1_FAIL"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// C2: evidence_strength == "weak"
// ---------------------------------------------------------------------------

describe("C2: evidence_strength 검사", () => {
  it("C2-PASS: evidence_strength=weak 이면 C2 통과", () => {
    const result = evaluateAutoReplyEligibility(BASE_PASS, TEMPLATE_DB);
    expect(result.eligible).toBe(true);
    expect(result.reasons.some((r) => r.includes("C2_PASS"))).toBe(true);
  });

  it("C2-FAIL: evidence_strength=strong 이면 eligible=false", () => {
    const record: AutoReplyRecord = { ...BASE_PASS, evidence_strength: "strong" };
    const result = evaluateAutoReplyEligibility(record, TEMPLATE_DB);
    expect(result.eligible).toBe(false);
    expect(result.reasons.some((r) => r.includes("C2_FAIL"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// C3: approved_template_db_hit
// ---------------------------------------------------------------------------

describe("C3: template_id 검사", () => {
  it("C3-PASS: 유효한 template_id 가 DB 에 있으면 C3 통과", () => {
    const result = evaluateAutoReplyEligibility(BASE_PASS, TEMPLATE_DB);
    expect(result.eligible).toBe(true);
    expect(result.reasons.some((r) => r.includes("C3_PASS"))).toBe(true);
  });

  it("C3-FAIL: template_id 가 없으면 LLM 생성으로 간주 eligible=false", () => {
    const record: AutoReplyRecord = { ...BASE_PASS, template_id: undefined };
    const result = evaluateAutoReplyEligibility(record, TEMPLATE_DB);
    expect(result.eligible).toBe(false);
    expect(result.reasons.some((r) => r.includes("C3_FAIL"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// C5: pii_masking_passed
// ---------------------------------------------------------------------------

describe("C5: pii_masking_passed 검사", () => {
  it("C5-PASS: pii_masking_passed=true 이면 C5 통과", () => {
    const result = evaluateAutoReplyEligibility(BASE_PASS, TEMPLATE_DB);
    expect(result.eligible).toBe(true);
    expect(result.reasons.some((r) => r.includes("C5_PASS"))).toBe(true);
  });

  it("C5-FAIL: pii_masking_passed=false 이면 eligible=false", () => {
    const record: AutoReplyRecord = { ...BASE_PASS, pii_masking_passed: false };
    const result = evaluateAutoReplyEligibility(record, TEMPLATE_DB);
    expect(result.eligible).toBe(false);
    expect(result.reasons.some((r) => r.includes("C5_FAIL"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// C4: dwell_seconds >= 30
// ---------------------------------------------------------------------------

describe("C4: dwell_seconds 검사", () => {
  it("C4-PASS: dwell_seconds=30 이면 C4 통과 (경계값)", () => {
    const record: AutoReplyRecord = { ...BASE_PASS, dwell_seconds: 30 };
    const result = evaluateAutoReplyEligibility(record, TEMPLATE_DB);
    expect(result.eligible).toBe(true);
    expect(result.reasons.some((r) => r.includes("C4_PASS"))).toBe(true);
  });

  it("C4-FAIL: dwell_seconds=29 이면 eligible=false", () => {
    const record: AutoReplyRecord = { ...BASE_PASS, dwell_seconds: 29 };
    const result = evaluateAutoReplyEligibility(record, TEMPLATE_DB);
    expect(result.eligible).toBe(false);
    expect(result.reasons.some((r) => r.includes("C4_FAIL"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// C7: daily_cap < 20
// ---------------------------------------------------------------------------

describe("C7: daily_cap 검사 (today_sent_count)", () => {
  it("C7-PASS: today_sent_count=19 이면 통과 (cap 미만)", () => {
    const record: AutoReplyRecord = { ...BASE_PASS, today_sent_count: 19 };
    const result = evaluateAutoReplyEligibility(record, TEMPLATE_DB);
    expect(result.eligible).toBe(true);
    expect(result.reasons.some((r) => r.includes("C7_PASS"))).toBe(true);
  });

  it("C7-FAIL: today_sent_count=20 이면 eligible=false (cap 도달)", () => {
    const record: AutoReplyRecord = { ...BASE_PASS, today_sent_count: 20 };
    const result = evaluateAutoReplyEligibility(record, TEMPLATE_DB);
    expect(result.eligible).toBe(false);
    expect(result.reasons.some((r) => r.includes("C7_FAIL"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Edge cases 2건
// ---------------------------------------------------------------------------

describe("Edge cases", () => {
  it("EC-1: template_id 가 DB 에 없는 알 수 없는 ID 이면 eligible=false", () => {
    const record: AutoReplyRecord = { ...BASE_PASS, template_id: "unknown_template_xyz" };
    const result = evaluateAutoReplyEligibility(record, TEMPLATE_DB);
    expect(result.eligible).toBe(false);
    expect(result.reasons.some((r) => r.includes("C3_FAIL"))).toBe(true);
  });

  it("EC-2: all-PASS 레코드에서 today_sent_count=0 이면 eligible=true (정상 시작)", () => {
    const record: AutoReplyRecord = { ...BASE_PASS, today_sent_count: 0 };
    const result = evaluateAutoReplyEligibility(record, TEMPLATE_DB);
    expect(result.eligible).toBe(true);
    // reasons 에 7개 모두 포함돼야 함
    const passCounts = result.reasons.filter((r) => r.includes("_PASS")).length;
    expect(passCounts).toBe(7); // C6, C1, C2, C3, C5, C4, C7
  });
});

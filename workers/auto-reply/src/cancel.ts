/**
 * cancel.ts
 *
 * Telegram callback "취소" 버튼 핸들러.
 *
 * 운영자가 Telegram 알림의 [취소] 버튼 클릭 →
 * auto_reply_log.cancelled = true, cancelled_at = now(), status = 'cancelled' 업데이트.
 *
 * atomic PATCH 패턴:
 *   PATCH WHERE id=? AND status='pending' AND sent_at IS NULL AND cancelled=false
 *   RETURNING id
 *   → affected=1: cancel 성공
 *   → affected=0: 이미 sent / processing / cancelled → 적절한 결과 반환
 *
 * SELECT 제거, PATCH 1회로 atomic 처리 (Select → check → PATCH 의 race window 제거).
 *
 * 보안: Supabase HTTP API 직접 호출 (Service Binding X).
 */

import type { SupabaseEnv } from "./dwell-queue";

export interface CancelResult {
  success: boolean;
  /** true 이면 이미 발송(sent) 또는 processing 중 — 취소 불가 */
  already_sent: boolean;
  error?: string;
}

/**
 * auto_reply_log row 를 취소 상태로 atomic 업데이트.
 *
 * @param env      - Supabase 환경 변수
 * @param logId    - auto_reply_log.id (Telegram callback_data 에 포함)
 * @returns CancelResult
 *
 * 응답 해석:
 *   affected=1 → cancel 성공 (success=true, already_sent=false)
 *   affected=0 → 다음 중 하나:
 *     - status='processing' or 'sent' or 'failed' → already_sent=true
 *     - status='cancelled' → 멱등 성공 (success=true)
 *     - id 자체가 없음 → error
 *
 * affected=0 의 원인 구분: 단일 PATCH 로는 판별 불가.
 * 운영 요구사항상 "이미 처리 중이거나 발송된 경우"는 동일하게 취소 불가로 처리하므로
 * 원인 세분화 없이 already_sent=true 를 반환한다.
 * (정확한 원인이 필요한 경우 별도 SELECT 추가 — 현재 scope 아님)
 */
export async function cancelAutoReply(env: SupabaseEnv, logId: string): Promise<CancelResult> {
  // atomic PATCH: status='pending' 인 row 만 취소 가능
  const url =
    `${env.SUPABASE_URL}/rest/v1/auto_reply_log` +
    `?id=eq.${logId}&status=eq.pending&sent_at=is.null&cancelled=eq.false`;

  try {
    const resp = await fetch(url, {
      method: "PATCH",
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        cancelled: true,
        cancelled_at: new Date().toISOString(),
        status: "cancelled",
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return {
        success: false,
        already_sent: false,
        error: `PATCH 실패: HTTP ${resp.status} — ${errText}`,
      };
    }

    const rows = (await resp.json()) as Array<{ id: string }>;

    if (rows.length === 0) {
      // affected=0: status 가 pending 이 아님 (processing/sent/failed/cancelled)
      // 또는 id 자체가 없음.
      // 운영 관점: 이미 claim/sent 됐거나 이미 취소됨 → already_sent=true 로 통일.
      return { success: false, already_sent: true, error: "이미 처리 중이거나 발송된 항목입니다." };
    }

    // affected=1 → cancel 성공
    return { success: true, already_sent: false };
  } catch (err) {
    return { success: false, already_sent: false, error: String(err) };
  }
}

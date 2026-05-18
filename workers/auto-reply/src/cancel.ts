/**
 * cancel.ts
 *
 * Telegram callback "취소" 버튼 핸들러.
 *
 * 운영자가 Telegram 알림의 [취소] 버튼 클릭 →
 * auto_reply_log.cancelled = true, cancelled_at = now() 업데이트.
 *
 * dwell-queue.ts 의 processDwellQueue 는 cancelled=true row 를 건너뜀.
 * 취소는 dwell_seconds < 30 구간에서만 유효 — 이미 sent_at 설정된 row 는 취소 불가.
 *
 * 보안: Supabase HTTP API 직접 호출 (Service Binding X).
 */

import type { SupabaseEnv } from "./dwell-queue";

export interface CancelResult {
  success: boolean;
  already_sent: boolean;
  error?: string;
}

/**
 * auto_reply_log row 를 취소 상태로 업데이트.
 *
 * @param env      - Supabase 환경 변수
 * @param logId    - auto_reply_log.id (Telegram callback_data 에 포함)
 * @returns CancelResult
 */
export async function cancelAutoReply(env: SupabaseEnv, logId: string): Promise<CancelResult> {
  // 먼저 현재 row 상태 조회 (이미 발송됐는지 확인)
  const checkUrl =
    `${env.SUPABASE_URL}/rest/v1/auto_reply_log` +
    `?id=eq.${logId}&select=id,sent_at,cancelled`;

  let rows: Array<{ id: string; sent_at: string | null; cancelled: boolean }>;
  try {
    const resp = await fetch(checkUrl, {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });
    if (!resp.ok) {
      return { success: false, already_sent: false, error: `조회 실패: HTTP ${resp.status}` };
    }
    rows = (await resp.json()) as typeof rows;
  } catch (err) {
    return { success: false, already_sent: false, error: String(err) };
  }

  if (rows.length === 0) {
    return { success: false, already_sent: false, error: `log_id=${logId} 없음` };
  }

  const row = rows[0];

  // 이미 발송됨 → 취소 불가
  if (row.sent_at !== null) {
    return { success: false, already_sent: true, error: "이미 발송된 항목입니다." };
  }

  // 이미 취소됨 → 멱등 처리 (성공으로 간주)
  if (row.cancelled) {
    return { success: true, already_sent: false };
  }

  // cancelled = true, cancelled_at = now() 업데이트
  const updateUrl = `${env.SUPABASE_URL}/rest/v1/auto_reply_log?id=eq.${logId}`;
  try {
    const resp = await fetch(updateUrl, {
      method: "PATCH",
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        cancelled: true,
        cancelled_at: new Date().toISOString(),
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return { success: false, already_sent: false, error: `UPDATE 실패: HTTP ${resp.status} — ${errText}` };
    }
    return { success: true, already_sent: false };
  } catch (err) {
    return { success: false, already_sent: false, error: String(err) };
  }
}

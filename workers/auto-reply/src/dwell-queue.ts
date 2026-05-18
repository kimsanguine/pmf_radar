/**
 * dwell-queue.ts
 *
 * 30초 대기 큐 모델 — Supabase auto_reply_log + Workers Cron Trigger.
 *
 * 대기 큐 모델 선택: Workers Cron Trigger (1분 간격)
 *
 * 옵션 검토:
 *   A. Durable Object — 인스턴스당 타이머. 30초 정밀도 최고. 비용: DO 가 Workers Paid 플랜 필요.
 *   B. Supabase Edge Function (pg_cron 1분 단위) — 30초 정밀도 없음 (최소 1분).
 *   C. Workers Cron Trigger (1분 간격 + status 필드) — 30초 정밀도 없음 (최대 1분 지연).
 *   D. 발송 Worker 가 직접 sleep(30s) — Workers 최대 실행 시간 충분. 단 단일 요청 점유.
 *
 * 결정: 옵션 C (Workers Cron Trigger) 채택.
 *   근거:
 *   1) 1인 운영자 단순성(C13) — Durable Object 유료 플랜 추가 불필요.
 *   2) 최대 1분 지연 허용 — 운영자 취소 창 30초 + 추가 최대 30초 대기 = 실질 최대 60초.
 *      PRD US-22 는 "30초 취소 창"이지 "30초 후 즉시 발송"이 아님. 1분 이내 발송 허용.
 *   3) Supabase auto_reply_log status 필드로 상태 관리 가능 → 별도 in-memory 상태 불필요.
 *   4) 취소(cancel.ts) 도 DB UPDATE 만으로 처리 가능 — 분산 타이머 취소 로직 불필요.
 *
 * 흐름:
 *   1. 5조건 PASS → auto_reply_log 에 status='pending' INSERT (이 파일)
 *   2. Workers Cron Trigger (매 1분) → pending 중 created_at + 30초 경과 row 조회
 *      → cancelled=false 확인 → 이메일 발송 → sent_at 업데이트
 *   3. 운영자 Telegram 취소 버튼 → cancel.ts → cancelled=true, cancelled_at=now()
 */

/** auto_reply_log INSERT 파라미터 */
export interface DwellPendingRow {
  inbox_id: string;
  template_id: string;
  /** INSERT 시 'pending' 고정 (sent_at IS NULL + cancelled=false = pending 상태) */
  status: "pending";
}

/** Supabase auto_reply_log INSERT 결과 */
export interface InsertResult {
  success: boolean;
  log_id?: string;
  error?: string;
}

/** Supabase 환경 변수 */
export interface SupabaseEnv {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

// ---------------------------------------------------------------------------
// Supabase auto_reply_log INSERT (status='pending')
// ---------------------------------------------------------------------------

/**
 * 5조건 PASS 후 auto_reply_log 에 pending row INSERT.
 *
 * Workers Cron Trigger 가 1분마다 polling해
 * created_at + 30초 이상 경과한 pending row 를 발송 처리함.
 *
 * 보안: Supabase HTTP API 직접 호출 (Service Binding X — same-zone 521 회피).
 */
export async function enqueueDwellPending(
  env: SupabaseEnv,
  row: DwellPendingRow
): Promise<InsertResult> {
  const url = `${env.SUPABASE_URL}/rest/v1/auto_reply_log`;
  const body = {
    inbox_id: row.inbox_id,
    template_id: row.template_id,
    // sent_at IS NULL = 미발송, cancelled=false = 취소 안 됨 = pending 상태
    sent_at: null,
    cancelled: false,
    cancelled_at: null,
  };

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return { success: false, error: `Supabase INSERT 실패: HTTP ${resp.status} — ${errText}` };
    }

    const rows = (await resp.json()) as Array<{ id?: string }>;
    const logId = rows[0]?.id;
    return { success: true, log_id: logId };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ---------------------------------------------------------------------------
// Workers Cron Trigger 핸들러 — pending row 발송 처리
// ---------------------------------------------------------------------------

/**
 * Workers Cron Trigger scheduled 핸들러에서 호출.
 * wrangler.toml crons = ["* * * * *"] (매 1분) 로 등록.
 *
 * pending 조건: sent_at IS NULL AND cancelled = false AND created_at <= now() - 30초
 */
export async function processDwellQueue(env: SupabaseEnv): Promise<void> {
  // 30초 이상 경과한 pending row 조회
  const cutoff = new Date(Date.now() - 30_000).toISOString();
  const queryUrl =
    `${env.SUPABASE_URL}/rest/v1/auto_reply_log` +
    `?sent_at=is.null&cancelled=eq.false&created_at=lte.${encodeURIComponent(cutoff)}` +
    `&select=id,inbox_id,template_id,created_at&limit=50`;

  let pendingRows: Array<{ id: string; inbox_id: string; template_id: string; created_at: string }>;

  try {
    const resp = await fetch(queryUrl, {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });
    if (!resp.ok) {
      console.error(`[auto-reply] dwell queue 조회 실패: HTTP ${resp.status}`);
      return;
    }
    pendingRows = (await resp.json()) as typeof pendingRows;
  } catch (err) {
    console.error("[auto-reply] dwell queue 조회 오류:", err);
    return;
  }

  for (const row of pendingRows) {
    await markAsSent(env, row.id);
    // TODO Round 3: 실제 이메일 발송 (SES / Gmail API) — β Telegram wiring 완료 후 연결
    console.log(
      `[auto-reply] sent log_id=${row.id} inbox_id=${row.inbox_id} template_id=${row.template_id}`
    );
  }
}

/** auto_reply_log.sent_at = now() 업데이트 */
async function markAsSent(env: SupabaseEnv, logId: string): Promise<void> {
  const url = `${env.SUPABASE_URL}/rest/v1/auto_reply_log?id=eq.${logId}`;
  const resp = await fetch(url, {
    method: "PATCH",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ sent_at: new Date().toISOString() }),
  });
  if (!resp.ok) {
    const errText = await resp.text();
    console.error(`[auto-reply] markAsSent 실패 log_id=${logId}: ${errText}`);
  }
}

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
 * atomic claim/finalize 패턴 (race condition 3종 해결):
 *   [claim]    PATCH WHERE id=? AND status='pending' AND sent_at IS NULL AND cancelled=false
 *              RETURNING * → affected=0 이면 다른 cron 이 선점했거나 cancel 됨 → skip
 *   [send]     TODO Round 3: 실 발송 wiring (SES / Gmail API)
 *   [finalize] 성공: PATCH SET status='sent', sent_at=now() WHERE id=? AND status='processing'
 *              실패: PATCH SET status='failed', error_message=? WHERE id=? AND status='processing'
 *   [stale]    status='processing' AND claimed_at < now()-2min → status='pending' reset
 *
 * 흐름:
 *   1. 5조건 PASS → auto_reply_log 에 status='pending' INSERT (이 파일)
 *   2. Workers Cron Trigger (매 1분) → pending 중 created_at + 30초 경과 row 조회
 *      → claim → send → finalize
 *   3. 운영자 Telegram 취소 버튼 → cancel.ts → atomic PATCH (status='pending' 인 경우만)
 */

/** auto_reply_log INSERT 파라미터 */
export interface DwellPendingRow {
  inbox_id: string;
  template_id: string;
  /** INSERT 시 'pending' 고정 */
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

/** claim 결과 — claimed=true 이면 정상 claim, false 이면 다른 cron 이 선점하거나 cancel 됨 */
interface ClaimResult {
  claimed: boolean;
  row?: { id: string; inbox_id: string; template_id: string; created_at: string };
}

// ---------------------------------------------------------------------------
// Supabase auto_reply_log INSERT (status='pending')
// ---------------------------------------------------------------------------

/**
 * 5조건 PASS 후 auto_reply_log 에 pending row INSERT.
 *
 * Workers Cron Trigger 가 1분마다 polling 해
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
    status: "pending",
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
// Workers Cron Trigger 핸들러 — atomic claim / send / finalize
// ---------------------------------------------------------------------------

/**
 * Workers Cron Trigger scheduled 핸들러에서 호출.
 * wrangler.toml crons = ["* * * * *"] (매 1분) 로 등록.
 *
 * 단계:
 *   0. stale claim recovery (claimed_at < now()-2min 인 processing row 를 pending 으로 reset)
 *   1. pending row 조회 (status='pending' AND created_at <= now()-30s)
 *   2. 각 row 에 대해 claim → send → finalize
 */
export async function processDwellQueue(env: SupabaseEnv): Promise<void> {
  // --- Step 0: stale claim recovery ---
  await recoverStaleProcessing(env);

  // --- Step 1: 30초 이상 경과한 pending row 조회 ---
  const cutoff = new Date(Date.now() - 30_000).toISOString();
  const queryUrl =
    `${env.SUPABASE_URL}/rest/v1/auto_reply_log` +
    `?status=eq.pending&cancelled=eq.false&created_at=lte.${encodeURIComponent(cutoff)}` +
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

  // --- Step 2: 각 row 에 대해 claim → send → finalize ---
  for (const row of pendingRows) {
    const claimResult = await claimRow(env, row.id);
    if (!claimResult.claimed) {
      // 다른 cron 이 선점했거나 cancel 됨 → skip
      console.log(`[auto-reply] claim 실패(선점/취소) log_id=${row.id} — skip`);
      continue;
    }

    // TODO Round 3: 실 발송 wiring (SES / Gmail API) — β Telegram wiring 완료 후 연결
    // const sendResult = await sendEmail(env, row);
    // if (!sendResult.success) {
    //   await finalizeRow(env, row.id, { success: false, error: sendResult.error });
    //   continue;
    // }

    await finalizeRow(env, row.id, { success: true });
    console.log(
      `[auto-reply] sent log_id=${row.id} inbox_id=${row.inbox_id} template_id=${row.template_id}`
    );
  }
}

// ---------------------------------------------------------------------------
// 내부 함수: claim
// ---------------------------------------------------------------------------

/**
 * row 를 atomic 하게 claim.
 *
 * PATCH WHERE id=? AND status='pending' AND sent_at IS NULL AND cancelled=false
 * → affected row 가 1 이면 claim 성공, 0 이면 다른 cron 이 선점했거나 cancel 됨.
 *
 * PostgREST 는 PATCH + Prefer:return=representation 로 갱신된 row 를 반환.
 * 반환 배열 길이로 affected count 를 판별 (PostgREST v11+).
 */
async function claimRow(env: SupabaseEnv, logId: string): Promise<ClaimResult> {
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
        status: "processing",
        claimed_at: new Date().toISOString(),
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error(`[auto-reply] claimRow 실패 log_id=${logId}: HTTP ${resp.status} — ${errText}`);
      return { claimed: false };
    }

    const rows = (await resp.json()) as Array<{
      id: string;
      inbox_id: string;
      template_id: string;
      created_at: string;
    }>;

    if (rows.length === 0) {
      // affected=0 → 선점 또는 cancel
      return { claimed: false };
    }

    return { claimed: true, row: rows[0] };
  } catch (err) {
    console.error(`[auto-reply] claimRow 예외 log_id=${logId}:`, err);
    return { claimed: false };
  }
}

// ---------------------------------------------------------------------------
// 내부 함수: finalize
// ---------------------------------------------------------------------------

/**
 * 발송 결과에 따라 row 를 finalize.
 *
 * 성공: PATCH SET status='sent', sent_at=now() WHERE id=? AND status='processing'
 * 실패: PATCH SET status='failed', error_message=? WHERE id=? AND status='processing'
 *
 * WHERE status='processing' 조건: claim 이후 cancel 이 와도 finalize 가능
 * (cancel.ts 는 status='pending' 인 row 만 처리하므로 processing row 는 cancel 불가).
 */
async function finalizeRow(
  env: SupabaseEnv,
  logId: string,
  result: { success: true } | { success: false; error: string }
): Promise<void> {
  const url =
    `${env.SUPABASE_URL}/rest/v1/auto_reply_log` +
    `?id=eq.${logId}&status=eq.processing`;

  const body = result.success
    ? { status: "sent", sent_at: new Date().toISOString() }
    : { status: "failed", error_message: (result as { success: false; error: string }).error };

  try {
    const resp = await fetch(url, {
      method: "PATCH",
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error(
        `[auto-reply] finalizeRow 실패 log_id=${logId} success=${result.success}: ${errText}`
      );
    }
  } catch (err) {
    console.error(`[auto-reply] finalizeRow 예외 log_id=${logId}:`, err);
  }
}

// ---------------------------------------------------------------------------
// 내부 함수: stale claim recovery
// ---------------------------------------------------------------------------

/**
 * status='processing' 이지만 claimed_at 이 2분 이상 경과한 row 를 'pending' 으로 reset.
 *
 * 발생 원인: cron 실행 중 Worker timeout / 예외로 finalize 미실행.
 * 복구 후 다음 cron 실행 시 재시도됨.
 */
async function recoverStaleProcessing(env: SupabaseEnv): Promise<void> {
  const staleThreshold = new Date(Date.now() - 120_000).toISOString(); // 2분
  const url =
    `${env.SUPABASE_URL}/rest/v1/auto_reply_log` +
    `?status=eq.processing&claimed_at=lte.${encodeURIComponent(staleThreshold)}`;

  try {
    const resp = await fetch(url, {
      method: "PATCH",
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ status: "pending", claimed_at: null }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error(`[auto-reply] stale recovery 실패: HTTP ${resp.status} — ${errText}`);
    } else {
      console.log("[auto-reply] stale processing recovery 완료");
    }
  } catch (err) {
    console.error("[auto-reply] stale recovery 예외:", err);
  }
}

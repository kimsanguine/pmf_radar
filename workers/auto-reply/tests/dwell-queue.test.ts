/**
 * dwell-queue.test.ts
 *
 * atomic claim/send/finalize 패턴 검증
 *
 * 기존 TC-D1~D3 (dwell.test.ts 와 동일 시나리오 커버) +
 * 신규 Race condition 3종:
 *   TC-R1: claim → cancel 동시 (cancel 이 claim 뒤에 와도 affected=0 → cancel 실패)
 *   TC-R2: 병렬 cron claim (두 번째 claim 은 affected=0 → skip)
 *   TC-R3: finalize 는 status='processing' 인 row 에만 적용 (pending/sent row 는 0 affected)
 *
 * stale recovery:
 *   TC-S1: recoverStaleProcessing 이 processing row 를 pending 으로 reset 하는 PATCH 를 호출함
 *
 * Supabase HTTP fetch 를 vi.stubGlobal("fetch", ...) 로 대체.
 * miniflare 불필요 (Cloudflare Worker 환경 API 미사용 — fetch + console 만 의존).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { enqueueDwellPending, processDwellQueue, type SupabaseEnv } from "../src/dwell-queue";
import { cancelAutoReply } from "../src/cancel";

// ---------------------------------------------------------------------------
// Mock Supabase 환경
// ---------------------------------------------------------------------------

const MOCK_ENV: SupabaseEnv = {
  SUPABASE_URL: "https://mock-project.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "mock-service-role-key",
};

// ---------------------------------------------------------------------------
// fetch mock 헬퍼
// ---------------------------------------------------------------------------

/**
 * 순서대로 응답을 반환하는 fetch mock.
 * responses 를 소진하면 마지막 응답을 반복한다.
 */
function mockFetch(responses: Array<{ ok: boolean; status: number; json?: unknown; text?: string }>) {
  let callIndex = 0;
  return vi.fn((_url: string, _init?: RequestInit) => {
    const idx = Math.min(callIndex++, responses.length - 1);
    const response = responses[idx];
    return Promise.resolve({
      ok: response.ok,
      status: response.status,
      json: () => Promise.resolve(response.json ?? []),
      text: () => Promise.resolve(response.text ?? ""),
    } as Response);
  });
}

// ---------------------------------------------------------------------------
// 기존 TC-D1~D3: dwell queue 기본 동작
// ---------------------------------------------------------------------------

describe("dwell-queue processDwellQueue — 기본 동작", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("TC-D1: 30초 이상 경과한 pending row 가 있으면 claim + finalize PATCH 를 호출한다", async () => {
    const pendingRows = [
      {
        id: "log-001",
        inbox_id: "inbox-001",
        template_id: "setup_ko",
        created_at: new Date(Date.now() - 35_000).toISOString(),
      },
    ];

    // 호출 순서:
    // 1. recoverStaleProcessing PATCH (stale recovery)
    // 2. SELECT pending rows
    // 3. claimRow PATCH → rows=[{...}] (affected=1)
    // 4. finalizeRow PATCH → ok
    const fetchMock = mockFetch([
      { ok: true, status: 200, json: [] },        // stale recovery
      { ok: true, status: 200, json: pendingRows }, // SELECT pending
      { ok: true, status: 200, json: pendingRows }, // claimRow → affected=1
      { ok: true, status: 200, json: [] },          // finalizeRow
    ]);

    vi.stubGlobal("fetch", fetchMock);

    await processDwellQueue(MOCK_ENV);

    // 총 4번 호출 확인
    expect(fetchMock).toHaveBeenCalledTimes(4);

    // claimRow PATCH (3번째) 의 body: status='processing', claimed_at 포함
    const claimCall = fetchMock.mock.calls[2];
    const claimBody = JSON.parse((claimCall[1] as RequestInit).body as string);
    expect(claimBody.status).toBe("processing");
    expect(claimBody.claimed_at).toBeTruthy();

    // finalizeRow PATCH (4번째) 의 body: status='sent', sent_at 포함
    const finalizeCall = fetchMock.mock.calls[3];
    const finalizeBody = JSON.parse((finalizeCall[1] as RequestInit).body as string);
    expect(finalizeBody.status).toBe("sent");
    expect(finalizeBody.sent_at).toBeTruthy();
  });

  it("TC-D2: 30초 미경과 pending row 는 processDwellQueue 가 처리하지 않는다", async () => {
    // Supabase 가 cutoff 조건으로 필터링 → 빈 배열
    const fetchMock = mockFetch([
      { ok: true, status: 200, json: [] }, // stale recovery
      { ok: true, status: 200, json: [] }, // SELECT pending → 빈 배열
    ]);

    vi.stubGlobal("fetch", fetchMock);

    await processDwellQueue(MOCK_ENV);

    // stale recovery + SELECT 2번만 (claim/finalize 없음)
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const selectUrl = fetchMock.mock.calls[1][0] as string;
    expect(selectUrl).toContain("lte.");
  });

  it("TC-D3: 취소된(cancelled=true) row 는 cancelAutoReply 가 멱등 실패로 처리한다", async () => {
    // atomic PATCH WHERE status='pending' → affected=0 (이미 cancelled)
    const fetchMock = mockFetch([
      { ok: true, status: 200, json: [] }, // PATCH → affected=0
    ]);

    vi.stubGlobal("fetch", fetchMock);

    const result = await cancelAutoReply(MOCK_ENV, "log-002");

    // affected=0 → already_sent=true (이미 처리됨으로 통일)
    expect(result.success).toBe(false);
    expect(result.already_sent).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// TC-R1~R3: race condition 시나리오
// ---------------------------------------------------------------------------

describe("dwell-queue — race condition 방어", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("TC-R1: claim 후 cancel 이 도착해도 status=processing 이라 cancel PATCH affected=0 → cancel 실패", async () => {
    // 시나리오: cron 이 이미 claimRow 로 status='processing' 으로 변경한 상태.
    // 이후 cancelAutoReply 가 호출됨.
    // cancelAutoReply PATCH: WHERE status='pending' → affected=0 (status='processing' 이라 미일치)
    const fetchMock = mockFetch([
      { ok: true, status: 200, json: [] }, // PATCH → affected=0
    ]);

    vi.stubGlobal("fetch", fetchMock);

    const result = await cancelAutoReply(MOCK_ENV, "log-processing");

    expect(result.success).toBe(false);
    expect(result.already_sent).toBe(true);

    // PATCH 1회만 호출 (SELECT 없음 — atomic 단일 PATCH)
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // PATCH URL 에 status=eq.pending 조건이 포함되어야 함
    const patchUrl = fetchMock.mock.calls[0][0] as string;
    expect(patchUrl).toContain("status=eq.pending");
  });

  it("TC-R2: 병렬 cron — 두 번째 claimRow 는 affected=0 → skip 된다", async () => {
    const pendingRows = [
      {
        id: "log-race",
        inbox_id: "inbox-race",
        template_id: "setup_ko",
        created_at: new Date(Date.now() - 35_000).toISOString(),
      },
    ];

    // 두 번째 cron 시뮬레이션:
    // stale recovery → SELECT → claimRow: affected=0 (첫 번째 cron 이 이미 claim)
    const fetchMock = mockFetch([
      { ok: true, status: 200, json: [] },        // stale recovery
      { ok: true, status: 200, json: pendingRows }, // SELECT pending
      { ok: true, status: 200, json: [] },          // claimRow → affected=0 (선점됨)
      // finalize/send 호출 없어야 함
    ]);

    vi.stubGlobal("fetch", fetchMock);

    await processDwellQueue(MOCK_ENV);

    // stale recovery + SELECT + claimRow = 3회 (finalizeRow 없음)
    expect(fetchMock).toHaveBeenCalledTimes(3);

    // claimRow PATCH body 확인
    const claimCall = fetchMock.mock.calls[2];
    const claimBody = JSON.parse((claimCall[1] as RequestInit).body as string);
    expect(claimBody.status).toBe("processing");
  });

  it("TC-R3: finalizeRow 는 status=processing 조건이 붙어야 한다 (URL 검증)", async () => {
    const pendingRows = [
      {
        id: "log-finalize-guard",
        inbox_id: "inbox-001",
        template_id: "setup_ko",
        created_at: new Date(Date.now() - 35_000).toISOString(),
      },
    ];

    const fetchMock = mockFetch([
      { ok: true, status: 200, json: [] },        // stale recovery
      { ok: true, status: 200, json: pendingRows }, // SELECT pending
      { ok: true, status: 200, json: pendingRows }, // claimRow → affected=1
      { ok: true, status: 200, json: [] },          // finalizeRow
    ]);

    vi.stubGlobal("fetch", fetchMock);

    await processDwellQueue(MOCK_ENV);

    // finalizeRow PATCH URL 에 status=eq.processing 조건 포함 확인
    const finalizeUrl = fetchMock.mock.calls[3][0] as string;
    expect(finalizeUrl).toContain("status=eq.processing");
  });
});

// ---------------------------------------------------------------------------
// TC-S1: stale claim recovery
// ---------------------------------------------------------------------------

describe("dwell-queue — stale claim recovery", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("TC-S1: processDwellQueue 실행 시 stale recovery PATCH 가 첫 번째로 호출된다", async () => {
    const fetchMock = mockFetch([
      { ok: true, status: 200, json: [] }, // stale recovery
      { ok: true, status: 200, json: [] }, // SELECT pending → 빈 배열
    ]);

    vi.stubGlobal("fetch", fetchMock);

    await processDwellQueue(MOCK_ENV);

    // 첫 번째 호출이 stale recovery PATCH 인지 확인
    const firstCall = fetchMock.mock.calls[0];
    const firstUrl = firstCall[0] as string;
    const firstInit = firstCall[1] as RequestInit;

    expect(firstInit.method).toBe("PATCH");
    expect(firstUrl).toContain("status=eq.processing");
    expect(firstUrl).toContain("claimed_at=lte.");

    const firstBody = JSON.parse(firstInit.body as string);
    expect(firstBody.status).toBe("pending");
    expect(firstBody.claimed_at).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// enqueueDwellPending INSERT 검증
// ---------------------------------------------------------------------------

describe("enqueueDwellPending", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("INSERT 성공 시 success=true 와 log_id 를 반환한다", async () => {
    const fetchMock = mockFetch([
      { ok: true, status: 201, json: [{ id: "log-uuid-001" }] },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    const result = await enqueueDwellPending(MOCK_ENV, {
      inbox_id: "inbox-001",
      template_id: "setup_ko",
      status: "pending",
    });

    expect(result.success).toBe(true);
    expect(result.log_id).toBe("log-uuid-001");

    // INSERT body 에 status='pending' 포함 확인
    const insertBody = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(insertBody.status).toBe("pending");
  });

  it("INSERT 실패(HTTP 500) 시 success=false 와 error 를 반환한다", async () => {
    const fetchMock = mockFetch([
      { ok: false, status: 500, text: "Internal Server Error" },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    const result = await enqueueDwellPending(MOCK_ENV, {
      inbox_id: "inbox-002",
      template_id: "setup_ko",
      status: "pending",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("HTTP 500");
  });
});

// ---------------------------------------------------------------------------
// cancelAutoReply — atomic PATCH 동작 검증
// ---------------------------------------------------------------------------

describe("cancelAutoReply — atomic PATCH", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("pending row 취소 성공: affected=1 → success=true", async () => {
    const fetchMock = mockFetch([
      { ok: true, status: 200, json: [{ id: "log-cancel-ok" }] }, // affected=1
    ]);
    vi.stubGlobal("fetch", fetchMock);

    const result = await cancelAutoReply(MOCK_ENV, "log-cancel-ok");

    expect(result.success).toBe(true);
    expect(result.already_sent).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // PATCH body: cancelled=true, cancelled_at, status='cancelled'
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.cancelled).toBe(true);
    expect(body.cancelled_at).toBeTruthy();
    expect(body.status).toBe("cancelled");
  });

  it("이미 sent/processing 인 row 취소 시도: affected=0 → already_sent=true", async () => {
    const fetchMock = mockFetch([
      { ok: true, status: 200, json: [] }, // affected=0
    ]);
    vi.stubGlobal("fetch", fetchMock);

    const result = await cancelAutoReply(MOCK_ENV, "log-already-sent");

    expect(result.success).toBe(false);
    expect(result.already_sent).toBe(true);
    // SELECT 없이 단일 PATCH 만 호출
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("PATCH HTTP 오류 시 success=false, already_sent=false 반환", async () => {
    const fetchMock = mockFetch([
      { ok: false, status: 500, text: "DB error" },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    const result = await cancelAutoReply(MOCK_ENV, "log-err");

    expect(result.success).toBe(false);
    expect(result.already_sent).toBe(false);
    expect(result.error).toContain("HTTP 500");
  });
});

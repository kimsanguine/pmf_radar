/**
 * dwell.test.ts
 *
 * atomic claim/finalize 패턴 기반 기본 동작 검증 (TC-D1~D3 업데이트).
 *
 * TC-D1: pending row 가 30초 이상 경과 → processDwellQueue 가 claim + finalize 를 호출
 * TC-D2: pending row 가 30초 미경과 → processDwellQueue 가 건너뜀
 * TC-D3: 취소된 row(cancelled=true) → cancelAutoReply atomic PATCH affected=0 → 실패 반환
 *
 * 더 상세한 race condition / stale recovery 검증은 dwell-queue.test.ts 참조.
 * Supabase HTTP fetch 를 mock 으로 대체.
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
// TC-D1~D3
// ---------------------------------------------------------------------------

describe("dwell-queue processDwellQueue", () => {
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
        created_at: new Date(Date.now() - 35_000).toISOString(), // 35초 전
      },
    ];

    // 호출 순서:
    // 1. recoverStaleProcessing PATCH
    // 2. SELECT pending rows
    // 3. claimRow PATCH → rows=[{...}] (affected=1)
    // 4. finalizeRow PATCH
    const fetchMock = mockFetch([
      { ok: true, status: 200, json: [] },          // stale recovery
      { ok: true, status: 200, json: pendingRows },  // SELECT pending
      { ok: true, status: 200, json: pendingRows },  // claimRow → affected=1
      { ok: true, status: 200, json: [] },           // finalizeRow
    ]);

    vi.stubGlobal("fetch", fetchMock);

    await processDwellQueue(MOCK_ENV);

    // fetch 4번 호출 확인
    expect(fetchMock).toHaveBeenCalledTimes(4);

    // finalizeRow PATCH (4번째) body 에 status='sent', sent_at 포함
    const finalizeCall = fetchMock.mock.calls[3];
    const finalizeBody = JSON.parse((finalizeCall[1] as RequestInit).body as string);
    expect(finalizeBody).toHaveProperty("sent_at");
    expect(finalizeBody.sent_at).toBeTruthy();
    expect(finalizeBody.status).toBe("sent");
  });

  it("TC-D2: 30초 미경과 pending row 는 processDwellQueue 가 처리하지 않는다", async () => {
    // Supabase 쿼리가 cutoff 조건으로 필터링하므로 빈 배열 반환
    const fetchMock = mockFetch([
      { ok: true, status: 200, json: [] }, // stale recovery
      { ok: true, status: 200, json: [] }, // SELECT → 빈 배열 (cutoff 조건으로 필터링됨)
    ]);

    vi.stubGlobal("fetch", fetchMock);

    await processDwellQueue(MOCK_ENV);

    // stale recovery + SELECT = 2번 (claim/finalize 없음)
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const selectUrl = fetchMock.mock.calls[1][0] as string;
    // created_at lte 조건이 URL 에 포함되어 있는지 확인
    expect(selectUrl).toContain("lte.");
  });

  it("TC-D3: 취소된 row(cancelled=true)는 cancelAutoReply atomic PATCH affected=0 → 실패 반환", async () => {
    // atomic PATCH WHERE status='pending' → affected=0 (이미 cancelled)
    const fetchMock = mockFetch([
      { ok: true, status: 200, json: [] }, // PATCH → affected=0
    ]);

    vi.stubGlobal("fetch", fetchMock);

    const result = await cancelAutoReply(MOCK_ENV, "log-002");

    // affected=0 → already_sent=true (이미 처리됨으로 통일)
    expect(result.success).toBe(false);
    expect(result.already_sent).toBe(true);

    // atomic PATCH 1번만 (SELECT 없음)
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Bonus: enqueueDwellPending INSERT 검증
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

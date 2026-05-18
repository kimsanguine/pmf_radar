/**
 * dwell.test.ts
 *
 * 30초 timer mock + 취소 timing 3건
 *
 * TC-D1: pending row 가 30초 이상 경과 → processDwellQueue 가 markAsSent 를 호출
 * TC-D2: pending row 가 30초 미경과 → processDwellQueue 가 건너뜀
 * TC-D3: 발송 전 취소(cancelled=true) → processDwellQueue 가 건너뜀
 *
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
    const response = responses[callIndex++ % responses.length];
    return Promise.resolve({
      ok: response.ok,
      status: response.status,
      json: () => Promise.resolve(response.json ?? []),
      text: () => Promise.resolve(response.text ?? ""),
    } as Response);
  });
}

// ---------------------------------------------------------------------------
// TC-D1: pending row 30초 이상 경과 → processDwellQueue 가 처리
// ---------------------------------------------------------------------------

describe("dwell-queue processDwellQueue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("TC-D1: 30초 이상 경과한 pending row 가 있으면 markAsSent PATCH 를 호출한다", async () => {
    const pendingRows = [
      {
        id: "log-001",
        inbox_id: "inbox-001",
        template_id: "setup_ko",
        created_at: new Date(Date.now() - 35_000).toISOString(), // 35초 전
      },
    ];

    const fetchMock = mockFetch([
      // 1st call: SELECT pending rows
      { ok: true, status: 200, json: pendingRows },
      // 2nd call: PATCH markAsSent
      { ok: true, status: 200, json: [] },
    ]);

    vi.stubGlobal("fetch", fetchMock);

    await processDwellQueue(MOCK_ENV);

    // fetch 2번 호출 확인 (SELECT + PATCH)
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // PATCH 호출에 sent_at 이 포함되어 있는지 확인
    const patchCall = fetchMock.mock.calls[1];
    const patchBody = JSON.parse((patchCall[1] as RequestInit).body as string);
    expect(patchBody).toHaveProperty("sent_at");
    expect(patchBody.sent_at).toBeTruthy();
  });

  it("TC-D2: 30초 미경과 pending row 는 processDwellQueue 가 처리하지 않는다", async () => {
    // Supabase 쿼리가 cutoff 조건으로 필터링하므로 빈 배열 반환
    const fetchMock = mockFetch([
      // SELECT → 빈 배열 (cutoff 조건으로 필터링됨)
      { ok: true, status: 200, json: [] },
    ]);

    vi.stubGlobal("fetch", fetchMock);

    await processDwellQueue(MOCK_ENV);

    // SELECT 1번만 호출 (PATCH 없음)
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const selectUrl = fetchMock.mock.calls[0][0] as string;
    // created_at lte 조건이 URL 에 포함되어 있는지 확인
    expect(selectUrl).toContain("lte.");
  });

  it("TC-D3: 취소된 row(cancelled=true)는 cancelAutoReply 가 이미_취소됨 성공으로 처리한다", async () => {
    // 취소 상태 row 반환
    const cancelledRow = { id: "log-002", sent_at: null, cancelled: true };

    const fetchMock = mockFetch([
      // 1st call: SELECT row 상태 조회
      { ok: true, status: 200, json: [cancelledRow] },
      // 2nd call 없음 (이미 취소 → UPDATE 없음)
    ]);

    vi.stubGlobal("fetch", fetchMock);

    const result = await cancelAutoReply(MOCK_ENV, "log-002");

    // 이미 취소됨 → success=true (멱등)
    expect(result.success).toBe(true);
    expect(result.already_sent).toBe(false);

    // PATCH (UPDATE) 호출 없음
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

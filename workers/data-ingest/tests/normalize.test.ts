import { describe, it, expect } from "vitest";
import { normalizeRows, toInsertPair, classifyScope } from "../src/normalize";

describe("normalizeRows", () => {
  it("기본 정규화 — manual_upload", () => {
    const rows = [{ message: "habix 강의 너무 좋아요" }];
    const out = normalizeRows(rows, "manual_upload", "u1");
    expect(out).toHaveLength(1);
    expect(out[0].source).toBe("manual_upload");
    expect(out[0].channel).toBe("manual_upload");
    expect(out[0].product_scope).toBe("habix_course");
    expect(out[0].token_verified).toBe(true);
    // id 포맷: uploadId:idx (source prefix 제거됨)
    expect(out[0].id).toBe("u1:0");
  });

  it("PII 마스킹 적용 — 이메일", () => {
    const rows = [{ message: "test@example.com 으로 답변 주세요" }];
    const out = normalizeRows(rows, "url_share", "u2");
    expect(out[0].message).toContain("[이메일]");
    expect(out[0].message).not.toContain("test@example.com");
  });

  it("900자 truncation", () => {
    const long = "a".repeat(1000);
    const out = normalizeRows([{ message: long }], "manual_upload", "u3");
    expect(out[0].message.length).toBe(900);
  });

  it("received_at 은 ISO-8601", () => {
    const out = normalizeRows([{ message: "test" }], "manual_upload", "u4");
    expect(out[0].received_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});

describe("toInsertPair — webhook_inbox schema 정합 검증", () => {
  it("inbox payload 에 id 필드 없음 (DB gen_random_uuid 자동 부여)", () => {
    const rows = normalizeRows([{ message: "테스트 문의" }], "manual_upload", "abc");
    const { inbox } = toInsertPair(rows[0]);
    expect((inbox as unknown as Record<string, unknown>).id).toBeUndefined();
  });

  it("masked_message 컬럼명 정확 (message 가 아님)", () => {
    const rows = normalizeRows([{ message: "habix 수강 문의" }], "manual_upload", "b1");
    const { inbox } = toInsertPair(rows[0]);
    expect(inbox.masked_message).toBeTruthy();
    expect((inbox as unknown as Record<string, unknown>).message).toBeUndefined();
  });

  it("message_id 는 uploadId:idx 형식 (UNIQUE(source, message_id) 키)", () => {
    const rows = normalizeRows([{ message: "문의" }, { message: "두번째" }], "url_share", "xyz");
    const pair0 = toInsertPair(rows[0]);
    const pair1 = toInsertPair(rows[1]);
    expect(pair0.inbox.message_id).toBe("xyz:0");
    expect(pair1.inbox.message_id).toBe("xyz:1");
  });

  it("source 는 NormalizedRow source 그대로 전달", () => {
    const rows = normalizeRows([{ message: "test" }], "url_share", "s1");
    const { inbox } = toInsertPair(rows[0]);
    expect(inbox.source).toBe("url_share");
  });

  it("product_scope CHECK constraint 값만 허용 ('habix_course'|'pmf_radar_lab'|'other')", () => {
    const validScopes = ["habix_course", "pmf_radar_lab", "other"] as const;
    const msgs = [
      { message: "habix 강의 문의" },
      { message: "pmf radar 도입" },
      { message: "일반 문의" },
    ];
    const rows = normalizeRows(msgs, "manual_upload", "ps1");
    for (const row of rows) {
      const { inbox } = toInsertPair(row);
      expect(validScopes).toContain(inbox.product_scope);
    }
  });

  it("hitl_required 는 boolean (기본 false)", () => {
    const rows = normalizeRows([{ message: "문의" }], "manual_upload", "hr1");
    const { inbox } = toInsertPair(rows[0]);
    expect(inbox.hitl_required).toBe(false);
  });

  it("schema 외 필드 없음 — received_at, sender_id_hash, token_verified, raw_payload 포함 안 됨", () => {
    const rows = normalizeRows([{ message: "테스트" }], "manual_upload", "sf1");
    const { inbox } = toInsertPair(rows[0]);
    const inboxAny = inbox as unknown as Record<string, unknown>;
    expect(inboxAny.received_at).toBeUndefined();
    expect(inboxAny.sender_id_hash).toBeUndefined();
    expect(inboxAny.token_verified).toBeUndefined();
    expect(inboxAny.raw_payload).toBeUndefined();
  });

  it("rawPayload 쌍은 source·message_id·raw_payload 세 필드만", () => {
    const rows = normalizeRows([{ message: "원문 데이터" }], "url_share", "rp1");
    const { rawPayload } = toInsertPair(rows[0]);
    expect(rawPayload.source).toBe("url_share");
    expect(rawPayload.message_id).toBe("rp1:0");
    expect(rawPayload.raw_payload).toEqual({ message: "원문 데이터" });
  });

  it("masked_message 가 비어 있으면 '(내용 없음)' fallback (NOT NULL 제약 보호)", () => {
    // 공백만 있는 입력 → maskPii → truncate → toInsertPair
    const rows = normalizeRows([{ message: "   " }], "manual_upload", "empty1");
    const { inbox } = toInsertPair(rows[0]);
    expect(inbox.masked_message).toBe("(내용 없음)");
  });
});

describe("classifyScope", () => {
  it("habix 키워드 → habix_course", () => {
    expect(classifyScope("habix 강의 듣고 있어요")).toBe("habix_course");
  });

  it("pmf 키워드 → pmf_radar_lab", () => {
    expect(classifyScope("PMF radar 가 뭔가요?")).toBe("pmf_radar_lab");
  });

  it("매칭 없으면 other", () => {
    expect(classifyScope("그냥 일반 문의에요")).toBe("other");
  });
});

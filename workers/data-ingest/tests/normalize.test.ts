import { describe, it, expect } from "vitest";
import { normalizeRows, classifyScope } from "../src/normalize";

describe("normalizeRows", () => {
  it("기본 정규화 — manual_upload", () => {
    const rows = [{ message: "habix 강의 너무 좋아요" }];
    const out = normalizeRows(rows, "manual_upload", "u1");
    expect(out).toHaveLength(1);
    expect(out[0].source).toBe("manual_upload");
    expect(out[0].channel).toBe("manual_upload");
    expect(out[0].product_scope).toBe("habix_course");
    expect(out[0].token_verified).toBe(true);
    expect(out[0].id).toBe("manual_upload:u1:0");
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

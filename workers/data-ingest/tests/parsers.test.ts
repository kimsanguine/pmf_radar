import { describe, it, expect } from "vitest";
import { parseCsv, extractMessageText } from "../src/parsers";

describe("parseCsv", () => {
  it("기본 헤더+행 파싱", () => {
    const csv = "message,channel\n안녕하세요,kakao\n문의드립니다,email";
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0].message).toBe("안녕하세요");
    expect(rows[1].channel).toBe("email");
  });

  it("따옴표 안 쉼표 보존", () => {
    const csv = 'message,note\n"안녕, 반갑습니다",hello';
    const rows = parseCsv(csv);
    expect(rows[0].message).toBe("안녕, 반갑습니다");
  });

  it("빈 라인 skip", () => {
    const csv = "message\n안녕\n\n반가워";
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(2);
  });

  it("헤더만 있으면 빈 배열", () => {
    expect(parseCsv("message,channel")).toEqual([]);
  });

  it("헤더 lowercase 변환", () => {
    const csv = "MESSAGE,Channel\n안녕,kakao";
    expect(parseCsv(csv)[0].message).toBe("안녕");
    expect(parseCsv(csv)[0].channel).toBe("kakao");
  });
});

describe("extractMessageText", () => {
  it("message 컬럼 우선", () => {
    expect(extractMessageText({ message: "안녕", content: "반갑" })).toBe("안녕");
  });

  it("한글 헤더 fallback", () => {
    expect(extractMessageText({ 내용: "안녕" })).toBe("안녕");
  });

  it("매칭 실패 시 모든 값 concat", () => {
    expect(extractMessageText({ foo: "a", bar: "b" })).toBe("a | b");
  });
});

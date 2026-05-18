/**
 * normalize.ts — maskPii 포팅 검증 테스트
 *
 * Python server.py::mask_pii 와 동일 출력을 내는지 확인.
 * expected 값은 Python 실행 결과 ground truth.
 */

import { describe, it, expect } from "vitest";
import { maskPii, classifyProductScope } from "../src/normalize";

describe("maskPii — server.py 1:1 포팅 검증 (10 fixtures)", () => {
  const fixtures: Array<[string, string, string]> = [
    ["이메일", "문의사항이 있어요 test@habix.ai 로 연락주세요", "문의사항이 있어요 [이메일] 로 연락주세요"],
    ["전화번호(하이픈)", "010-1234-5678로 전화해주세요", "[전화번호]로 전화해주세요"],
    ["전화번호(연속)", "01012345678 문의드립니다", "[전화번호] 문의드립니다"],
    ["주문번호(숫자)", "주문번호 1234-5678-9012 확인 부탁", "주문번호 [주문번호] 확인 부탁"],
    // 이름(님) — [가-힣]{2,4} + 님 + lookahead '이' ✓
    ["이름(님)", "김철수님이 문의하셨습니다", "[이름]이 문의하셨습니다"],
    // 이름(대표) — '박대표가' 는 [가-힣]{2,4}=박대 + 직책=표 → 단, '표'는 직책목록 X, 불일치 → 미치환
    // Python 원본과 동일하게 미치환
    ["이름(대표) 미치환", "박대표가 연락주셨어요", "박대표가 연락주셨어요"],
    // 이름(팀장) — '이팀장께' 는 [가-힣]{2,4}=이팀 + 직책=장 → '장'은 직책목록 X, 불일치 → 미치환
    ["이름(팀장) 미치환", "이팀장께 전달해주세요", "이팀장께 전달해주세요"],
    // 회사명(주식회사) — 패턴 치환 후 '에서' 앞 공백
    ["회사명(주식회사)", "주식회사삼성전자에서 문의왔습니다", "[회사명] 문의왔습니다"],
    // 회사명(영문) — Acme Co -> Acme [회사명] / 'Corp.' 의 '.' 이 정규식 점과 충돌 → Python 동일 부분 치환
    ["회사명(영문) Python 동일", "Acme Corp. 담당자입니다", "[회사명]rp. 담당자입니다"],
    // 주문번호(영문코드) — ORD + 8자리
    ["주문번호(영문코드)", "주문번호 ORD20260518 확인 부탁드립니다", "주문번호 [주문번호] 확인 부탁드립니다"],
  ];

  for (const [name, input, expected] of fixtures) {
    it(`${name}: "${input}" → "${expected}"`, () => {
      expect(maskPii(input)).toBe(expected);
    });
  }
});

describe("classifyProductScope", () => {
  it("강의 키워드 포함 → habix_course", () => {
    expect(classifyProductScope("수강 문의", "강의 일정이 궁금합니다")).toBe("habix_course");
  });

  it("PMF 키워드 포함 → pmf_radar_lab", () => {
    expect(classifyProductScope("PMF Radar 도입 문의", "pmf radar 기능 관련")).toBe("pmf_radar_lab");
  });

  it("양쪽 없음 → other", () => {
    expect(classifyProductScope("안녕하세요", "궁금한 게 있어요")).toBe("other");
  });

  it("양쪽 모두 있으면 habix_course 우선", () => {
    expect(classifyProductScope("강의 pmf", "수강 pmf radar")).toBe("habix_course");
  });
});

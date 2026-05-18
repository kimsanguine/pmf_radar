/**
 * _shared/mask-pii.ts
 *
 * Round 1 email-inbound/src/normalize.ts 의 maskPii 함수를
 * 공유 모듈로 추출한 것. T2 Channel Talk Worker 와 T5 Auto-Reply 엔진이 동일 코드 재사용.
 *
 * 변경 금지: 이 파일은 server.py::mask_pii 1:1 포팅 canonical 본.
 * 실제 정규식 로직 수정 시 email-inbound/src/normalize.ts 와 반드시 동기화.
 */

/**
 * PII 마스킹 (server.py::mask_pii 1:1 TypeScript 포팅)
 *
 * 적용 순서:
 * 1. 이메일 주소 → [이메일]
 * 2. 국내 휴대전화 → [전화번호]
 * 3. 하이픈 구분 주문번호(숫자 패턴) → [주문번호]
 * 4. 한글 이름 + 직책/조사 → [이름]
 * 5. 회사명(주식회사/㈜/영문 법인) → [회사명]
 * 6. 대문자 영문 코드 + 6자리 이상 숫자 주문번호 → [주문번호]
 */
export function maskPii(text: string): string {
  // 1. 이메일
  let masked = text.replace(
    /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g,
    "[이메일]"
  );

  // 2. 국내 휴대전화
  masked = masked.replace(
    /01[016789][-\s.]?\d{3,4}[-\s.]?\d{4}/g,
    "[전화번호]"
  );

  // 3. 하이픈 구분 주문번호
  masked = masked.replace(
    /\b\d{3,4}[-\s]\d{4}[-\s]\d{4}\b/g,
    "[주문번호]"
  );

  // 4. 한글 이름 + 직책/조사
  masked = masked.replace(
    /[가-힣]{2,4}\s*(?:씨|님|대표|매니저|팀장|과장|부장|차장|이사|책임|선임|주임)(?=[은는이가을를도와과의에서로께,.\s!?]|$)/g,
    "[이름]"
  );

  // 5. 회사명
  masked = masked.replace(
    /(?:주식회사\s*[가-힣A-Za-z0-9]+|㈜\s*[가-힣A-Za-z0-9]+|[A-Z][A-Za-z0-9]+(?:\s+[A-Z][A-Za-z0-9]+)*\s+(?:Inc|Co|Ltd|Corp)\.?)/g,
    "[회사명]"
  );

  // 6. 대문자 영문코드 + 숫자 주문번호
  masked = masked.replace(
    /\b[A-Z]{2,}[-_]?\d{6,}\b/g,
    "[주문번호]"
  );

  return masked;
}

/**
 * maskPii 적용 후 빈 문자열이 아니면 masking_passed = true 로 판정.
 * Auto-Reply 5조건 중 pii_masking_passed 검증에 사용.
 *
 * 규칙: maskPii 가 throw 없이 완료되고 결과물이 존재하면 passed.
 * (PII 포함 여부 검사가 아니라 마스킹 처리 완료 여부 검사)
 */
export function checkPiiMaskingPassed(originalText: string, maskedText: string): boolean {
  // 원문이 비어 있으면 마스킹 할 대상이 없으므로 passed
  if (!originalText.trim()) return true;
  // maskedText 가 존재하면 maskPii 가 정상 완료된 것
  return maskedText.trim().length > 0;
}

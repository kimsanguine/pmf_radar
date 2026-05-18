/**
 * verify-token.ts
 *
 * Channel Talk webhook URL token 검증.
 *
 * Channel Talk 인증 방식 (공식 docs ground truth, P2_PENDING_INPUTS.md D1):
 *   POST https://YOUR_SERVER_ENDPOINT/PATH?token=<CHANNEL_TALK_WEBHOOK_TOKEN>
 *
 * HMAC 서명 헤더 없음. URL query string 토큰 비교만 수행.
 *
 * timing-safe 비교 구현:
 *   Workers 환경에서 crypto.subtle.timingSafeEqual 은 비표준이므로
 *   TextEncoder → Uint8Array → byte-by-byte XOR 누적 후 OR 판정.
 *   길이 불일치도 상수 시간으로 처리(패딩 후 XOR).
 */

/**
 * URL query string 에서 token 파라미터를 추출해 env secret 과 비교.
 *
 * @param requestUrl - Request URL 전체 (new URL(request.url))
 * @param expectedToken - env.CHANNEL_TALK_WEBHOOK_TOKEN
 * @returns true: 유효 / false: 불일치 또는 토큰 없음
 */
export function verifyChannelTalkToken(
  requestUrl: URL,
  expectedToken: string
): boolean {
  const receivedToken = requestUrl.searchParams.get("token");
  if (!receivedToken) return false;
  if (!expectedToken) return false;

  return timingSafeEqual(receivedToken, expectedToken);
}

/**
 * 문자열 두 개를 상수 시간(constant-time)으로 비교.
 *
 * 구현 방식:
 * 1. UTF-8 → Uint8Array 변환
 * 2. 두 배열의 최대 길이까지 byte XOR 누적 (diff |= a ^ b)
 * 3. 길이 불일치 시 extra byte 에 대해 0x00 vs 0x01 XOR → diff 0이 되지 않음
 * 4. diff === 0 이고 길이 동일해야 true
 *
 * Workers 내장 crypto.subtle.timingSafeEqual 비표준 → 이 구현으로 대체.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const aBytes = enc.encode(a);
  const bBytes = enc.encode(b);

  const maxLen = Math.max(aBytes.length, bBytes.length);
  let diff = 0;

  for (let i = 0; i < maxLen; i++) {
    // 범위 초과 byte 는 0x00 vs 0x01 로 강제 불일치 기여
    const aByte = i < aBytes.length ? aBytes[i] : 0x00;
    const bByte = i < bBytes.length ? bBytes[i] : 0x01;
    diff |= aByte ^ bByte;
  }

  // 길이 자체도 상수 시간으로 비교
  diff |= aBytes.length ^ bBytes.length;

  return diff === 0;
}

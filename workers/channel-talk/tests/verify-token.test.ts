/**
 * verify-token.test.ts
 *
 * Channel Talk URL token 검증 unit tests (3건)
 *
 * TC-1: 유효한 token — verifyChannelTalkToken returns true
 * TC-2: 잘못된 token — returns false
 * TC-3: token 파라미터 없음 — returns false
 *
 * bonus: timingSafeEqual 직접 검증 (4건)
 */

import { describe, it, expect } from "vitest";
import { verifyChannelTalkToken, timingSafeEqual } from "../src/verify-token";

// ---------------------------------------------------------------------------
// verifyChannelTalkToken 3건
// ---------------------------------------------------------------------------

describe("verifyChannelTalkToken", () => {
  const EXPECTED = "secret-webhook-token-abc123";

  it("TC-1: 유효한 token 이면 true 를 반환한다", () => {
    const url = new URL(`https://cs-inbound.habix.ai/channel-talk?token=${EXPECTED}`);
    expect(verifyChannelTalkToken(url, EXPECTED)).toBe(true);
  });

  it("TC-2: 잘못된 token 이면 false 를 반환한다", () => {
    const url = new URL("https://cs-inbound.habix.ai/channel-talk?token=wrong-token");
    expect(verifyChannelTalkToken(url, EXPECTED)).toBe(false);
  });

  it("TC-3: token 파라미터가 없으면 false 를 반환한다", () => {
    const url = new URL("https://cs-inbound.habix.ai/channel-talk");
    expect(verifyChannelTalkToken(url, EXPECTED)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// timingSafeEqual 직접 검증 (bonus 4건)
// ---------------------------------------------------------------------------

describe("timingSafeEqual", () => {
  it("TC-4: 동일한 문자열은 true 를 반환한다", () => {
    expect(timingSafeEqual("abc123", "abc123")).toBe(true);
  });

  it("TC-5: 다른 문자열은 false 를 반환한다", () => {
    expect(timingSafeEqual("abc123", "abc124")).toBe(false);
  });

  it("TC-6: 길이가 다른 문자열은 false 를 반환한다 (길이 정보 leak 없음)", () => {
    expect(timingSafeEqual("short", "longer-string")).toBe(false);
  });

  it("TC-7: 빈 문자열 두 개는 true 를 반환한다", () => {
    expect(timingSafeEqual("", "")).toBe(true);
  });
});

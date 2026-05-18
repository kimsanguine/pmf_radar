/**
 * SNS Signature 검증 unit tests (3건)
 *
 * 테스트 대상:
 * 1. parseSnsMessage — valid JSON 파싱
 * 2. parseSnsMessage — invalid/missing fields → null
 * 3. verifySnsSignature — SigningCertURL 도메인 불일치 시 throw
 *
 * 실제 RSA-SHA1 검증은 외부 AWS 인증서가 필요하므로
 * 도메인 화이트리스트 검증 (SSRF 방지) 을 unit test 범위로 삼음.
 * 실제 인증서 기반 검증은 integration test 에서 커버.
 *
 * vitest 사용 (Workers 런타임 없는 Node 환경에서 실행 가능)
 */

import { describe, it, expect } from "vitest";
import { parseSnsMessage, verifySnsSignature, type SnsMessage } from "../src/sns-verify";

// ---------------------------------------------------------------------------
// 테스트용 픽스처
// ---------------------------------------------------------------------------

const VALID_NOTIFICATION: SnsMessage = {
  Type: "Notification",
  MessageId: "test-message-id-001",
  TopicArn: "arn:aws:sns:ap-northeast-1:123456789012:habix-ses-inbound",
  Message: '{"notificationType":"Received","mail":{"messageId":"abc123"}}',
  Timestamp: "2026-05-18T00:00:00.000Z",
  SignatureVersion: "1",
  Signature: "dGVzdA==", // base64("test") — 실제 서명 아님
  SigningCertURL: "https://sns.ap-northeast-1.amazonaws.com/SimpleNotificationService-abc123.pem",
  Subject: "테스트 이메일",
  UnsubscribeURL: "https://sns.ap-northeast-1.amazonaws.com/?Action=Unsubscribe&SubscriptionArn=...",
};

const VALID_SUBSCRIPTION_CONFIRMATION: SnsMessage = {
  Type: "SubscriptionConfirmation",
  MessageId: "test-sub-confirm-001",
  TopicArn: "arn:aws:sns:ap-northeast-1:123456789012:habix-ses-inbound",
  Message: "You have chosen to subscribe to the topic...",
  Timestamp: "2026-05-18T00:00:00.000Z",
  SignatureVersion: "1",
  Signature: "dGVzdA==",
  SigningCertURL: "https://sns.ap-northeast-1.amazonaws.com/SimpleNotificationService-abc123.pem",
  Token: "test-token-12345",
  SubscribeURL: "https://sns.ap-northeast-1.amazonaws.com/?Action=ConfirmSubscription&TopicArn=...&Token=...",
};

// ---------------------------------------------------------------------------
// Test Case 1: parseSnsMessage — valid Notification JSON 정상 파싱
// ---------------------------------------------------------------------------

describe("parseSnsMessage", () => {
  it("TC-1: valid Notification JSON 을 SnsMessage 객체로 파싱한다", () => {
    const json = JSON.stringify(VALID_NOTIFICATION);
    const result = parseSnsMessage(json);

    expect(result).not.toBeNull();
    expect(result!.Type).toBe("Notification");
    expect(result!.MessageId).toBe("test-message-id-001");
    expect(result!.SignatureVersion).toBe("1");
    expect(result!.TopicArn).toBe("arn:aws:sns:ap-northeast-1:123456789012:habix-ses-inbound");
  });

  // ---------------------------------------------------------------------------
  // Test Case 2: parseSnsMessage — 필수 필드 누락 시 null 반환
  // ---------------------------------------------------------------------------

  it("TC-2: 필수 필드(Signature) 누락 시 null 을 반환한다", () => {
    const incomplete = {
      Type: "Notification",
      MessageId: "test-id",
      TopicArn: "arn:aws:sns:ap-northeast-1:123456789012:test",
      Message: "hello",
      Timestamp: "2026-05-18T00:00:00.000Z",
      SignatureVersion: "1",
      // Signature 필드 없음
      SigningCertURL: "https://sns.ap-northeast-1.amazonaws.com/cert.pem",
    };
    const result = parseSnsMessage(JSON.stringify(incomplete));
    expect(result).toBeNull();
  });

  it("TC-2b: 빈 문자열 입력 시 null 을 반환한다", () => {
    expect(parseSnsMessage("")).toBeNull();
    expect(parseSnsMessage("not-json")).toBeNull();
    expect(parseSnsMessage("{}")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Test Case 3: verifySnsSignature — SigningCertURL 도메인 불일치 시 throw
// ---------------------------------------------------------------------------

describe("verifySnsSignature", () => {
  it("TC-3: SigningCertURL 이 sns.*.amazonaws.com 외 도메인이면 Error 를 throw 한다", async () => {
    const maliciousMsg: SnsMessage = {
      ...VALID_NOTIFICATION,
      // 공격자 제어 서버 URL (SSRF 시도)
      SigningCertURL: "https://attacker.example.com/fake-cert.pem",
    };

    await expect(verifySnsSignature(maliciousMsg)).rejects.toThrow(
      /SNS cert URL 도메인 불일치/
    );
  });

  it("TC-3b: http:// 프로토콜 SigningCertURL 도 거부한다", async () => {
    const httpMsg: SnsMessage = {
      ...VALID_NOTIFICATION,
      SigningCertURL: "http://sns.ap-northeast-1.amazonaws.com/cert.pem",
    };

    await expect(verifySnsSignature(httpMsg)).rejects.toThrow(
      /SNS cert URL 도메인 불일치/
    );
  });

  it("TC-3c: sns.amazonaws.com 서브도메인 없는 URL 도 거부한다", async () => {
    const noSubdomainMsg: SnsMessage = {
      ...VALID_NOTIFICATION,
      SigningCertURL: "https://amazonaws.com/sns/cert.pem",
    };

    await expect(verifySnsSignature(noSubdomainMsg)).rejects.toThrow(
      /SNS cert URL 도메인 불일치/
    );
  });
});

// ---------------------------------------------------------------------------
// Bonus: SubscriptionConfirmation 픽스처 파싱 검증
// ---------------------------------------------------------------------------

describe("parseSnsMessage SubscriptionConfirmation", () => {
  it("TC-4: valid SubscriptionConfirmation 을 올바르게 파싱한다", () => {
    const json = JSON.stringify(VALID_SUBSCRIPTION_CONFIRMATION);
    const result = parseSnsMessage(json);

    expect(result).not.toBeNull();
    expect(result!.Type).toBe("SubscriptionConfirmation");
    expect(result!.Token).toBe("test-token-12345");
    expect(result!.SubscribeURL).toContain("ConfirmSubscription");
  });
});

import { describe, expect, it } from "vitest";
import {
  toSignalToGrowthExport,
  type SignalToGrowthExportInput,
} from "../../_shared/stg-export";

function validInput(): SignalToGrowthExportInput {
  return {
    sourceRecordRef: "ref:pmf_radar_inbox_001",
    productScope: "pmf_radar_lab",
    segment: "초기 SaaS 운영자",
    provider: "naver_talktalk",
    providerEventId: "message-public-001",
    channel: "naver_talktalk",
    occurredAt: "2026-07-26T03:00:00Z",
    receivedAt: "2026-07-26T03:00:01Z",
    conversationRef: "hmac:conversation_001_safe",
    messageRef: "ref:message_001_safe",
    customerRefHmac: "hmac:customer_001_safe_hash",
    maskedMessage: "결제 내역이 두 번 표시되어 확인을 요청합니다.",
    rawPayloadRef: "restricted://pmf-radar/inbox/message-public-001",
    processingBasisRef: "POL-CS-OPERATIONS-001",
    authVerified: true,
    verificationAssurance: "strong",
    providerStatus: "send",
    privacy: {
      classification: "restricted",
      redaction_status: "not_required",
      pii_types_removed: [],
    },
  };
}

describe("toSignalToGrowthExport", () => {
  it("creates a deterministic, evidence-free portable record", async () => {
    const first = await toSignalToGrowthExport(validInput());
    const second = await toSignalToGrowthExport(validInput());

    expect(first).toEqual(second);
    expect(first.export_version).toBe("pmf-radar.stg.v1");
    expect(first.event.event_id).toMatch(/^CSE-[a-f0-9]{32}$/);
    expect(first.event.source_evidence_ids).toEqual([]);
    expect(first.event.idempotency_key).toBe(first.event.event_id);
  });

  it("rejects a known provider/channel mismatch", async () => {
    await expect(
      toSignalToGrowthExport({ ...validInput(), channel: "kakao_consulttalk" })
    ).rejects.toThrow("naver_talktalk must use channel naver_talktalk");
  });

  it("rejects an unmasked direct identifier", async () => {
    await expect(
      toSignalToGrowthExport({
        ...validInput(),
        maskedMessage: "답장은 buyer@example.com 으로 주세요.",
      })
    ).rejects.toThrow("supported direct identifier");
  });

  it("rejects a high-risk Korean identifier", async () => {
    await expect(
      toSignalToGrowthExport({
        ...validInput(),
        maskedMessage: "주민 식별번호는 900101-1234567 입니다.",
      })
    ).rejects.toThrow("high-risk Korean identifier");
  });

  it("rejects raw source identity and unrestricted payload locations", async () => {
    await expect(
      toSignalToGrowthExport({
        ...validInput(),
        sourceRecordRef: "customer@example.com",
      })
    ).rejects.toThrow("sourceRecordRef must be opaque");

    await expect(
      toSignalToGrowthExport({
        ...validInput(),
        rawPayloadRef: "https://example.com/raw/customer.json",
      })
    ).rejects.toThrow("rawPayloadRef must be a restricted ref or null");
  });
});

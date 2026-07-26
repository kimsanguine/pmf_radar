import { describe, expect, it } from "vitest";
import { toStgOutboxRow } from "../../_shared/stg-outbox";
import type { StgOutboxInput } from "../../_shared/stg-outbox";

function validInput(): StgOutboxInput {
  return {
    inboxId: "9c5b55bc-e5cb-4f1d-bfb8-bf968d010001",
    sourceRecordRef: "ref:pmf_radar_inbox_001",
    productScope: "pmf_radar_lab",
    segment: null,
    provider: "naver_talktalk",
    providerEventId: "message-public-001",
    channel: "naver_talktalk",
    occurredAt: "2026-07-26T03:00:00Z",
    receivedAt: "2026-07-26T03:00:01Z",
    conversationRef: "hmac:conversation_001_safe",
    messageRef: null,
    customerRefHmac: "hmac:customer_001_safe_hash",
    maskedMessage: "마스킹된 메시지는 outbox에 복사하지 않습니다.",
    rawPayloadRef: "restricted://pmf-radar/inbox/message-public-001",
    processingBasisRef: "POL-CS-OPERATIONS-001",
    authVerified: true,
    verificationAssurance: "strong",
    providerStatus: null,
    privacy: { classification: "restricted", redaction_status: "not_required", pii_types_removed: [] },
  };
}

describe("toStgOutboxRow", () => {
  it("creates an opaque pending projection without customer message text", () => {
    const row = toStgOutboxRow(validInput());
    expect(row.export_status).toBe("pending");
    expect(row.retry_count).toBe(0);
    expect(row).not.toHaveProperty("masked_message");
    expect(row).not.toHaveProperty("raw_payload");
  });

  it("rejects invalid lifecycle and assurance combinations", () => {
    expect(() => toStgOutboxRow({ ...validInput(), exportStatus: "dead_letter" })).toThrow("dead_letter_reason");
    expect(() => toStgOutboxRow({ ...validInput(), authVerified: true, verificationAssurance: "none" })).toThrow("assurance");
    expect(() => toStgOutboxRow({ ...validInput(), inboxId: "not-a-uuid" })).toThrow("inboxId");
  });
});

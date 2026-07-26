/** Build a restricted, database-ready Signal to Growth outbox projection. */

import type { SignalToGrowthExportInput, VerificationAssurance } from "./stg-export";

export type StgOutboxStatus = "pending" | "blocked" | "dead_letter" | "exported";

export interface StgOutboxInput extends SignalToGrowthExportInput {
  inboxId: string;
  exportStatus?: StgOutboxStatus;
  retryCount?: number;
  deadLetterReason?: string | null;
  exportedAt?: string | null;
}

export interface StgOutboxRow {
  inbox_id: string;
  source_record_ref: string;
  provider: string;
  provider_event_id: string;
  customer_ref_hmac: string;
  conversation_ref: string;
  message_ref: string | null;
  auth_verified: boolean;
  verification_assurance: VerificationAssurance;
  processing_basis_ref: string;
  raw_payload_ref: string | null;
  export_status: StgOutboxStatus;
  retry_count: number;
  dead_letter_reason: string | null;
  exported_at: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Invalid Signal to Growth outbox row: ${message}`);
}

/**
 * This function has no I/O. A worker can insert its output only after the
 * corresponding normalized inbox row and the migration both exist.
 */
export function toStgOutboxRow(input: StgOutboxInput): StgOutboxRow {
  assert(UUID_RE.test(input.inboxId), "inboxId must be a UUID");
  const exportStatus = input.exportStatus ?? "pending";
  const retryCount = input.retryCount ?? 0;
  const deadLetterReason = input.deadLetterReason ?? null;
  const exportedAt = input.exportedAt ?? null;
  assert(Number.isInteger(retryCount) && retryCount >= 0 && retryCount <= 20, "retryCount is invalid");
  assert(
    !(input.authVerified && input.verificationAssurance === "none"),
    "verified authentication requires non-none assurance"
  );
  assert(
    (exportStatus === "dead_letter") === (deadLetterReason !== null),
    "dead_letter_reason must exist only for dead_letter"
  );
  assert(
    (exportStatus === "exported") === (exportedAt !== null),
    "exported_at must exist only for exported"
  );

  return {
    inbox_id: input.inboxId,
    source_record_ref: input.sourceRecordRef,
    provider: input.provider,
    provider_event_id: input.providerEventId,
    customer_ref_hmac: input.customerRefHmac,
    conversation_ref: input.conversationRef,
    message_ref: input.messageRef,
    auth_verified: input.authVerified,
    verification_assurance: input.verificationAssurance,
    processing_basis_ref: input.processingBasisRef,
    raw_payload_ref: input.rawPayloadRef,
    export_status: exportStatus,
    retry_count: retryCount,
    dead_letter_reason: deadLetterReason,
    exported_at: exportedAt,
  };
}

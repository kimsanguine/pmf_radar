/**
 * PMF Radar -> Signal to Growth portable handoff.
 *
 * This module is deliberately pure: it does not query Supabase, send network
 * requests, create evidence, or classify customer intent. The calling worker
 * must supply an already normalized, privacy-reduced event and an opaque source
 * reference.
 */

import { maskPii } from "./mask-pii";

export type StgChannel =
  | "naver_talktalk"
  | "channel_talk"
  | "happytalk"
  | "kakao_channel_chatbot"
  | "kakao_consulttalk"
  | "kakao_alimtalk"
  | "kakao_brand_message"
  | "web_chat"
  | "other";

export type VerificationAssurance = "none" | "weak" | "medium" | "strong";
export type PrivacyClassification = "public" | "internal" | "restricted";
export type RedactionStatus = "not_required" | "redacted";
export type RemovedPiiType =
  | "name"
  | "phone"
  | "email"
  | "address"
  | "account_identifier"
  | "other";

export interface StgPrivacy {
  classification: PrivacyClassification;
  redaction_status: RedactionStatus;
  pii_types_removed: RemovedPiiType[];
}

export interface SignalToGrowthExportInput {
  sourceRecordRef: string;
  productScope: string;
  segment: string | null;
  provider: string;
  providerEventId: string;
  channel: StgChannel;
  occurredAt: string;
  receivedAt: string;
  conversationRef: string;
  messageRef: string | null;
  customerRefHmac: string;
  maskedMessage: string;
  rawPayloadRef: string | null;
  processingBasisRef: string;
  authVerified: boolean;
  verificationAssurance: VerificationAssurance;
  providerStatus: string | null;
  privacy: StgPrivacy;
}

export interface SignalToGrowthExportRecord {
  export_version: "pmf-radar.stg.v1";
  source_record_ref: string;
  product_scope: string;
  segment: string | null;
  event: {
    event_id: string;
    provider: string;
    provider_event_id: string;
    channel: StgChannel;
    direction: "inbound";
    event_type: "message_received";
    occurred_at: string;
    received_at: string;
    conversation_ref: string;
    message_ref: string | null;
    customer_ref_hmac: string;
    content_redacted: string;
    attachment_metadata: [];
    raw_payload_ref: string | null;
    privacy: StgPrivacy;
    consent_or_processing_basis_ref: string;
    idempotency_key: string;
    auth_verified: boolean;
    verification_assurance: VerificationAssurance;
    provider_status: string | null;
    canonical_status: "normalized";
    source_evidence_ids: [];
  };
}

const OPAQUE_REF_RE = /^(ref|hmac):[A-Za-z0-9_-]{8,192}$/;
const SOURCE_REF_RE = /^ref:[A-Za-z0-9_-]{8,192}$/;
const HMAC_REF_RE = /^hmac(?:-sha256)?:[A-Za-z0-9_-]{16,128}$/;
const POLICY_REF_RE = /^POL-[A-Z0-9][A-Z0-9._-]{2,127}$/;
const RESTRICTED_REF_RE = /^restricted:\/\/[A-Za-z0-9][A-Za-z0-9/._-]{2,255}$/;
const ISO_DATE_TIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

const PROVIDER_CHANNEL: Record<string, StgChannel> = {
  kakao_openbuilder: "kakao_channel_chatbot",
  channel_talk: "channel_talk",
  naver_talktalk: "naver_talktalk",
};

const HIGH_RISK_IDENTIFIER_PATTERNS = [
  /\b\d{6}[- ]?[1-8]\d{6}\b/,
  /\b\d{3}[- ]?\d{2}[- ]?\d{5}\b/,
  /\b(?:\d[ -]?){15,19}\b/,
  /(?:계좌|account)\s*[:：]?\s*\d[\d -]{7,20}/i,
  /(?:주소|address)\s*[:：]?\s*[^\n]{4,120}/i,
  /(?:성명|이름|name)\s*[:：]?\s*[가-힣A-Za-z][가-힣A-Za-z ]{1,40}/i,
];

function requireCondition(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Invalid Signal to Growth export: ${message}`);
}

function assertPortableMaskedMessage(message: string): void {
  requireCondition(message.trim().length > 0, "maskedMessage must not be empty");
  requireCondition(message.length <= 20_000, "maskedMessage exceeds 20,000 characters");
  requireCondition(
    maskPii(message) === message,
    "maskedMessage still contains a supported direct identifier"
  );
  requireCondition(
    !HIGH_RISK_IDENTIFIER_PATTERNS.some((pattern) => pattern.test(message)),
    "maskedMessage still contains a high-risk Korean identifier"
  );
}

function assertProviderChannel(provider: string, channel: StgChannel): void {
  const expected = PROVIDER_CHANNEL[provider];
  requireCondition(!expected || expected === channel, `${provider} must use channel ${expected}`);
}

async function sha256Hex(value: string): Promise<string> {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Convert one normalized PMF Radar record into the canonical portable wrapper.
 *
 * The event ID is deterministic for provider + providerEventId. No evidence ID
 * is created because a customer message is an observation, not validated
 * research evidence.
 */
export async function toSignalToGrowthExport(
  input: SignalToGrowthExportInput
): Promise<SignalToGrowthExportRecord> {
  requireCondition(SOURCE_REF_RE.test(input.sourceRecordRef), "sourceRecordRef must be opaque");
  requireCondition(input.productScope.trim().length > 0, "productScope is required");
  requireCondition(input.segment === null || input.segment.trim().length > 0, "segment is empty");
  requireCondition(/^[a-z][a-z0-9_]{1,63}$/.test(input.provider), "provider is invalid");
  requireCondition(input.providerEventId.trim().length > 0, "providerEventId is required");
  requireCondition(ISO_DATE_TIME_RE.test(input.occurredAt), "occurredAt must be UTC ISO-8601");
  requireCondition(ISO_DATE_TIME_RE.test(input.receivedAt), "receivedAt must be UTC ISO-8601");
  requireCondition(OPAQUE_REF_RE.test(input.conversationRef), "conversationRef must be opaque");
  requireCondition(
    input.messageRef === null || OPAQUE_REF_RE.test(input.messageRef),
    "messageRef must be opaque or null"
  );
  requireCondition(HMAC_REF_RE.test(input.customerRefHmac), "customerRefHmac must be an HMAC ref");
  requireCondition(
    input.rawPayloadRef === null || RESTRICTED_REF_RE.test(input.rawPayloadRef),
    "rawPayloadRef must be a restricted ref or null"
  );
  requireCondition(POLICY_REF_RE.test(input.processingBasisRef), "processingBasisRef is invalid");
  requireCondition(
    input.authVerified || input.verificationAssurance !== "strong",
    "strong assurance requires verified authentication"
  );
  requireCondition(
    new Set(input.privacy.pii_types_removed).size === input.privacy.pii_types_removed.length,
    "privacy.pii_types_removed must be unique"
  );
  assertProviderChannel(input.provider, input.channel);
  assertPortableMaskedMessage(input.maskedMessage);

  const digest = await sha256Hex(`${input.provider}\u001f${input.providerEventId}`);
  const eventId = `CSE-${digest.slice(0, 32)}`;

  return {
    export_version: "pmf-radar.stg.v1",
    source_record_ref: input.sourceRecordRef,
    product_scope: input.productScope,
    segment: input.segment,
    event: {
      event_id: eventId,
      provider: input.provider,
      provider_event_id: input.providerEventId,
      channel: input.channel,
      direction: "inbound",
      event_type: "message_received",
      occurred_at: input.occurredAt,
      received_at: input.receivedAt,
      conversation_ref: input.conversationRef,
      message_ref: input.messageRef,
      customer_ref_hmac: input.customerRefHmac,
      content_redacted: input.maskedMessage,
      attachment_metadata: [],
      raw_payload_ref: input.rawPayloadRef,
      privacy: input.privacy,
      consent_or_processing_basis_ref: input.processingBasisRef,
      idempotency_key: eventId,
      auth_verified: input.authVerified,
      verification_assurance: input.verificationAssurance,
      provider_status: input.providerStatus,
      canonical_status: "normalized",
      source_evidence_ids: [],
    },
  };
}

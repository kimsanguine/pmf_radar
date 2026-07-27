/**
 * _shared/stg-bridge-export.ts
 *
 * webhook_inbox row → signal-to-growth `pmf-radar.stg.v1` bridge record.
 *
 * 배경:
 *   docs/integrations/pmf-radar-hplan.md (signal-to-growth 저장소)가 이 export
 *   format을 문서로 정의했지만, pmf_radar 쪽에는 실제로 emit하는 코드가
 *   없었다(2026-07-27 확인 — 소스 전체 grep 0건). 이 파일이 그 첫 구현이다.
 *
 * 스키마 ground truth:
 *   signal-to-growth/contracts/cs-event.schema.json (event 필드)
 *   signal-to-growth/docs/integrations/pmf-radar-hplan.md (wrapper 필드)
 *
 * 알려진 한계 (fabricate하지 않고 명시):
 *   - webhook_inbox는 sender_id_hash를 저장하지 않는다(inbox-mapper.ts 주석
 *     "schema 외 필드... 포함 안 함" 참조 — 의도된 PIPA 최소화). customer_ref_hmac은
 *     source:message_id 기반으로 파생하므로 대화 단위 상관관계이지 고객 단위가
 *     아니다. 진짜 고객 단위 상관관계가 필요해지면 webhook_inbox 확장이 먼저다.
 *   - maskPii()는 제거한 PII 종류를 구조화된 값으로 반환하지 않는다. 따라서
 *     pii_types_removed는 항상 빈 배열이다 — "아무것도 없었다"가 아니라
 *     "아직 추적하지 않는다"는 뜻이다.
 *   - attachment는 webhook_inbox에 저장되지 않는다. attachment_metadata는
 *     항상 빈 배열이다.
 *   - raw_payload_ref는 기본 null이다. raw_payload_retention 테이블은 이
 *     함수가 조회하지 않는다 — 원문 노출 범위를 넓히지 않기 위한 의도적 제한.
 */

export interface WebhookInboxRow {
  id: string;
  source: string;
  message_id: string;
  channel: string;
  segment?: string | null;
  masked_message: string;
  hitl_required: boolean;
  product_scope: "habix_course" | "pmf_radar_lab" | "other";
  created_at: string;
}

export interface StgCsEvent {
  event_id: string;
  provider: string;
  provider_event_id: string;
  channel: string;
  direction: "inbound";
  event_type: "message_received";
  occurred_at: string;
  received_at: string;
  conversation_ref: string;
  message_ref: string;
  customer_ref_hmac: string;
  content_redacted: string;
  attachment_metadata: never[];
  raw_payload_ref: string | null;
  privacy: {
    classification: "restricted";
    redaction_status: "redacted";
    pii_types_removed: never[];
  };
  consent_or_processing_basis_ref: string;
  idempotency_key: string;
  auth_verified: boolean;
  verification_assurance: "none" | "weak" | "medium" | "strong";
  provider_status: null;
  canonical_status: "normalized";
  source_evidence_ids: never[];
}

export interface StgBridgeRecord {
  export_version: "pmf-radar.stg.v1";
  source_record_ref: string;
  product_scope: string;
  segment?: string;
  event: StgCsEvent;
}

/** pmf_radar `source` → signal-to-growth 스키마의 `provider`/`channel`. */
const SOURCE_MAP: Record<
  string,
  { provider: string; channel: string; authVerified: boolean; assurance: StgCsEvent["verification_assurance"] }
> = {
  // pmf_radar 자체 schema는 "kakao_consultalk"(오타, t 1개)로 적혀 있으나
  // signal-to-growth의 locked channel enum은 "kakao_consulttalk"(t 2개, 상담+톡)이다.
  // 여기서 철자를 교정해 emit한다.
  kakao_consultalk: {
    provider: "kakao_consulttalk",
    channel: "kakao_consulttalk",
    authVerified: true,
    assurance: "medium",
  },
  channel_talk: {
    provider: "channel_talk",
    channel: "channel_talk",
    authVerified: true,
    assurance: "medium",
  },
  manual_import: {
    provider: "manual_import",
    channel: "other",
    authVerified: false,
    assurance: "none",
  },
};

/**
 * kakao_channel_event(채널 추가/차단 등 관계 이벤트)는 이 함수에서 제외한다.
 * pmf_radar 자신의 channel_adapter_schema.json이 이미 이 이벤트를
 * "PMF signal extraction 대상에서 제외"한다고 명시하므로, 여기서도
 * 같은 정책을 따른다 — cs-event로 만들어 내보내지 않는다.
 */
export function isBridgeEligible(source: string): boolean {
  return source in SOURCE_MAP;
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * customer_ref_hmac용 진짜 keyed HMAC-SHA256.
 * secretKey는 호출자가 Worker secret(`wrangler secret put`)으로 주입한다 —
 * 이 파일은 secret을 발급하거나 배포하지 않는다.
 */
async function hmacSha256Hex(secretKey: string, input: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secretKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(input)
  );
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface BridgeExportOptions {
  /** customer_ref_hmac 파생에 쓰는 keyed secret. Worker secret으로 주입. */
  customerRefSecret: string;
  /** POL- 접두 정책 참조. 기본값은 실제 고객 데이터용 policy ref. */
  processingBasisRef?: string;
}

/**
 * webhook_inbox row 1건을 pmf-radar.stg.v1 브리지 레코드로 변환한다.
 * kakao_channel_event처럼 브리지 대상이 아닌 source는 null을 반환한다 —
 * 호출자가 filter(Boolean)으로 걸러낸다.
 */
export async function toStgBridgeRecord(
  row: WebhookInboxRow,
  options: BridgeExportOptions
): Promise<StgBridgeRecord | null> {
  const mapping = SOURCE_MAP[row.source];
  if (!mapping) {
    return null;
  }

  const idHex = await sha256Hex(`${row.source}:${row.message_id}`);
  const eventId = `CSE-${idHex.slice(0, 32)}`;
  const messageRefHex = await sha256Hex(`msg:${row.source}:${row.message_id}`);
  const customerRefHex = await hmacSha256Hex(
    options.customerRefSecret,
    `${row.source}:${row.message_id}`
  );

  return {
    export_version: "pmf-radar.stg.v1",
    source_record_ref: `ref:pmf_radar_inbox_${row.id}`,
    product_scope: row.product_scope,
    ...(row.segment ? { segment: row.segment } : {}),
    event: {
      event_id: eventId,
      provider: mapping.provider,
      provider_event_id: row.message_id,
      channel: mapping.channel,
      direction: "inbound",
      event_type: "message_received",
      occurred_at: row.created_at,
      received_at: row.created_at,
      conversation_ref: `ref:${idHex.slice(0, 32)}`,
      message_ref: `ref:${messageRefHex.slice(0, 32)}`,
      customer_ref_hmac: `hmac:${customerRefHex}`,
      content_redacted: row.masked_message,
      attachment_metadata: [],
      raw_payload_ref: null,
      privacy: {
        classification: "restricted",
        redaction_status: "redacted",
        pii_types_removed: [],
      },
      consent_or_processing_basis_ref:
        options.processingBasisRef ?? "POL-PMF-RADAR-INBOX",
      idempotency_key: eventId,
      auth_verified: mapping.authVerified,
      verification_assurance: mapping.assurance,
      provider_status: null,
      canonical_status: "normalized",
      source_evidence_ids: [],
    },
  };
}

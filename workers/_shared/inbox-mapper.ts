/**
 * _shared/inbox-mapper.ts
 *
 * webhook_inbox 테이블 schema 에 정합하는 INSERT payload 생성 유틸.
 *
 * 배경:
 *   data-ingest / email-inbound / channel-talk Worker 가 각자 normalize 한 결과를
 *   webhook_inbox schema 에 맞게 변환하는 공통 레이어.
 *   schema ground truth: supabase/migrations/20260518000001_p2_inbox_schema.sql:93-108
 *
 * webhook_inbox 컬럼:
 *   id              uuid   PK  default gen_random_uuid()  ← INSERT 시 생략 (DB 자동 부여)
 *   source          text   NOT NULL
 *   message_id      text   NOT NULL
 *   channel         text   NOT NULL
 *   segment         text   (nullable)
 *   masked_message  text   NOT NULL
 *   classified_json jsonb  (nullable)
 *   hitl_required   boolean NOT NULL default false
 *   product_scope   text   NOT NULL default 'other'  CHECK('habix_course'|'pmf_radar_lab'|'other')
 *   created_at      timestamptz NOT NULL default now()  ← INSERT 시 생략
 *   UNIQUE(source, message_id)
 *
 * raw_payload → raw_payload_retention 테이블로 분리 (PIPA 30일 보존).
 *   컬럼: id(uuid PK), source(text), message_id(text), raw_payload(jsonb), created_at
 */

export type ProductScope = "habix_course" | "pmf_radar_lab" | "other";

/** webhook_inbox INSERT payload (id·created_at 제외) */
export interface InboxRow {
  source: string;
  message_id: string;
  channel: string;
  segment?: string;
  masked_message: string;
  classified_json?: unknown;
  hitl_required: boolean;
  product_scope: ProductScope;
}

/** raw_payload_retention INSERT payload */
export interface RawPayloadRow {
  source: string;
  message_id: string;
  raw_payload: unknown;
}

/** toInboxRow 입력 파라미터 */
export interface InboxMapperInput {
  /** Worker 별 고유 식별자 (이메일 messageId, CT 메시지 id, 업로드 uploadId:idx 등) */
  message_id: string;
  source: string;
  channel: string;
  segment?: string;
  /** maskPii 적용 완료 본문 (900자 truncation 포함) */
  masked_message: string;
  product_scope: ProductScope;
  /** HITL 필요 여부. 기본 false (운영 Round 에서 classifier 연결 후 갱신 예정) */
  hitl_required?: boolean;
  /** LLM classifier 결과 (현재 null, Round 4 이후 채워짐) */
  classified_json?: unknown;
}

/**
 * normalize 출력 → webhook_inbox INSERT payload 변환.
 *
 * - id 필드 제거 (DB gen_random_uuid 자동 부여).
 * - schema 외 필드(received_at, sender_id_hash, token_verified, raw_payload 등) 포함 안 함.
 * - masked_message 가 빈 문자열이면 fallback으로 "(내용 없음)" 대입 (NOT NULL 제약).
 */
export function toInboxRow(input: InboxMapperInput): InboxRow {
  return {
    source: input.source,
    message_id: input.message_id,
    channel: input.channel,
    segment: input.segment,
    masked_message: input.masked_message.trim() || "(내용 없음)",
    classified_json: input.classified_json ?? null,
    hitl_required: input.hitl_required ?? false,
    product_scope: input.product_scope,
  };
}

/**
 * raw_payload_retention INSERT payload 생성.
 *
 * toInboxRow 와 쌍으로 호출해 raw payload 를 분리 테이블에 저장.
 * PIPA R6 / C6: 30일 보존 후 pg_cron 자동 삭제.
 */
export function toRawPayloadRow(
  source: string,
  message_id: string,
  raw_payload: unknown
): RawPayloadRow {
  return { source, message_id, raw_payload };
}

/**
 * Parsed row → 내부 정규화 표현 (NormalizedRow).
 *
 * NormalizedRow 는 Worker 내부 처리용 중간 표현이며,
 * Supabase INSERT 시에는 반드시 inbox-mapper.ts::toInboxRow 를 거쳐야 함.
 *
 * 내부 필드 목적:
 *   id           — 중복 탐지·로깅용 string 식별자 (DB uuid 와 다름)
 *   message      — maskPii 완료 본문 (DB 컬럼명은 masked_message)
 *   received_at  — 로깅/감사 목적 (DB 컬럼 없음 — created_at 은 DB default)
 *   sender_id_hash — 내부 감사용 (DB webhook_inbox 에 없음)
 *   token_verified — 내부 감사용
 *   raw_payload  — raw_payload_retention INSERT 에 사용
 */

import { maskPii } from "../../_shared/mask-pii";
import { toInboxRow, toRawPayloadRow } from "../../_shared/inbox-mapper";
import type { InboxRow, RawPayloadRow } from "../../_shared/inbox-mapper";
import type { ParsedRow } from "./parsers";
import { extractMessageText } from "./parsers";

export type { InboxRow, RawPayloadRow };

export interface NormalizedRow {
  /** 중복 탐지·로깅용 식별자 (uploadId:idx 형식). DB uuid 와 별개. */
  id: string;
  source: "manual_upload" | "url_share";
  channel: string;
  segment: string;
  /** maskPii 완료 본문. DB 컬럼명은 masked_message. */
  message: string;
  received_at: string;
  sender_id_hash: string;
  product_scope: "habix_course" | "pmf_radar_lab" | "other";
  token_verified: boolean;
  raw_payload: ParsedRow;
}

const HABIX_KEYWORDS = ["habix", "해빅스", "강의", "수업", "코스", "course"];
const PMF_KEYWORDS = ["pmf", "radar", "레이더", "cs", "inbox", "고객문의"];

export function normalizeRows(
  rows: ParsedRow[],
  source: "manual_upload" | "url_share",
  uploadId: string
): NormalizedRow[] {
  return rows.map((row, idx) => normalizeRow(row, source, uploadId, idx));
}

function normalizeRow(
  row: ParsedRow,
  source: "manual_upload" | "url_share",
  uploadId: string,
  idx: number
): NormalizedRow {
  const rawText = extractMessageText(row);
  const masked = maskPii(rawText);
  const truncated = masked.length > 900 ? masked.slice(0, 900) : masked;

  return {
    id: `${uploadId}:${idx}`,
    source,
    channel: source,
    segment: `${source} customer`,
    message: truncated,
    received_at: new Date().toISOString(),
    sender_id_hash: "manual_upload_anonymous",
    product_scope: classifyScope(masked),
    token_verified: true,
    raw_payload: row
  };
}

/**
 * NormalizedRow → webhook_inbox INSERT payload 변환.
 *
 * message_id: `${uploadId}:${idx}` 형식 (normalizeRow 의 id 필드 재사용).
 * raw_payload: raw_payload_retention INSERT 용 페어로 반환.
 */
export function toInsertPair(
  row: NormalizedRow
): { inbox: InboxRow; rawPayload: RawPayloadRow } {
  return {
    inbox: toInboxRow({
      message_id: row.id,
      source: row.source,
      channel: row.channel,
      segment: row.segment,
      masked_message: row.message,
      product_scope: row.product_scope,
    }),
    rawPayload: toRawPayloadRow(row.source, row.id, row.raw_payload),
  };
}

export function classifyScope(text: string): "habix_course" | "pmf_radar_lab" | "other" {
  const lower = text.toLowerCase();

  if (HABIX_KEYWORDS.some((kw) => lower.includes(kw))) return "habix_course";
  if (PMF_KEYWORDS.some((kw) => lower.includes(kw))) return "pmf_radar_lab";
  return "other";
}

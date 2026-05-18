/**
 * Parsed row → webhook_inbox INSERT row.
 *
 * P2 인입 표준 (webhook_payload_schema.json::normalized_messages) 와 정합:
 *   id / source / channel / segment / message / received_at /
 *   sender_id_hash / product_scope / token_verified
 */

import { maskPii } from "../../_shared/mask-pii";
import type { ParsedRow } from "./parsers";
import { extractMessageText } from "./parsers";

export interface NormalizedRow {
  id: string;
  source: "manual_upload" | "url_share";
  channel: string;
  segment: string;
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
    id: `${source}:${uploadId}:${idx}`,
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

export function classifyScope(text: string): "habix_course" | "pmf_radar_lab" | "other" {
  const lower = text.toLowerCase();

  if (HABIX_KEYWORDS.some((kw) => lower.includes(kw))) return "habix_course";
  if (PMF_KEYWORDS.some((kw) => lower.includes(kw))) return "pmf_radar_lab";
  return "other";
}

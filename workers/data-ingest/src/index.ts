/**
 * T6 Data Ingest Worker
 *
 * 처리 흐름:
 *   POST /upload  ← multipart/form-data (file=.csv|.xlsx, max 5 MiB)
 *   POST /url     ← JSON { url } — HTTPS 외부 URL 에서 CSV/JSON fetch
 *   GET  /healthz ← health check
 *
 * 보안:
 *   - INTERNAL_API_KEY (X-Internal-Auth 헤더) 필수
 *   - URL fetch: HTTPS 전용 + private IP 차단 (SSRF 가드)
 *   - 파일 크기 상한 5 MiB
 *   - PII 마스킹 (_shared/mask-pii)
 *
 * Supabase insert:
 *   service_role key 로 webhook_inbox INSERT (RLS 우회).
 *   D2 정책: anon DENY, service_role permissive ALL.
 */

import { parseCsv, parseXlsx } from "./parsers";
import { normalizeRows, toInsertPair } from "./normalize";

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  INTERNAL_API_KEY: string;
  MAX_UPLOAD_BYTES: string;
  MAX_URL_FETCH_BYTES: string;
}

const PRIVATE_HOST_RE = /^(127\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|169\.254\.|fc00:|fe80:|::1|localhost$|0\.0\.0\.0$)/i;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/healthz") {
      return json({ ok: true, ts: new Date().toISOString() });
    }

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    const authError = checkAuth(request, env);
    if (authError) return authError;

    if (request.method !== "POST") {
      return json({ error: "method_not_allowed" }, 405);
    }

    try {
      if (url.pathname === "/upload") return await handleUpload(request, env);
      if (url.pathname === "/url") return await handleUrl(request, env);
      return json({ error: "not_found" }, 404);
    } catch (err) {
      console.error("data-ingest error:", err);
      return json({ error: "internal_error", detail: String(err) }, 500);
    }
  }
};

function checkAuth(request: Request, env: Env): Response | null {
  const provided = request.headers.get("x-internal-auth");
  if (!provided) return json({ error: "missing_auth" }, 401);
  if (provided !== env.INTERNAL_API_KEY) return json({ error: "invalid_auth" }, 401);
  return null;
}

async function handleUpload(request: Request, env: Env): Promise<Response> {
  const maxBytes = parseInt(env.MAX_UPLOAD_BYTES ?? "5242880", 10);
  const contentLength = parseInt(request.headers.get("content-length") ?? "0", 10);
  if (contentLength > maxBytes) {
    return json({ error: "file_too_large", max_bytes: maxBytes }, 413);
  }

  const ct = request.headers.get("content-type") ?? "";
  if (!ct.includes("multipart/form-data")) {
    return json({ error: "expected_multipart" }, 400);
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) return json({ error: "missing_file" }, 400);

  const filename = file.name.toLowerCase();
  const uploadId = generateUploadId();

  let rows: Record<string, string>[];
  if (filename.endsWith(".csv")) {
    rows = parseCsv(await file.text());
  } else if (filename.endsWith(".xlsx") || filename.endsWith(".xls")) {
    rows = parseXlsx(await file.arrayBuffer());
  } else {
    return json({ error: "unsupported_format", supported: ["csv", "xlsx", "xls"] }, 400);
  }

  if (rows.length === 0) return json({ inserted: 0, total: 0, upload_id: uploadId }, 200);

  const normalized = normalizeRows(rows, "manual_upload", uploadId);
  const inserted = await insertToSupabase(normalized, env);

  return json({ inserted, total: rows.length, upload_id: uploadId }, 200);
}

async function handleUrl(request: Request, env: Env): Promise<Response> {
  const body = await request.json<{ url?: string }>();
  if (!body.url) return json({ error: "missing_url" }, 400);

  let target: URL;
  try {
    target = new URL(body.url);
  } catch {
    return json({ error: "invalid_url" }, 400);
  }

  if (target.protocol !== "https:") {
    return json({ error: "https_required" }, 400);
  }

  if (PRIVATE_HOST_RE.test(target.hostname)) {
    return json({ error: "private_host_blocked" }, 400);
  }

  const maxBytes = parseInt(env.MAX_URL_FETCH_BYTES ?? "10485760", 10);
  const response = await fetch(target.toString(), {
    headers: { "user-agent": "pmf-radar-data-ingest/1.0" },
    cf: { cacheTtl: 0 }
  });

  if (!response.ok) {
    return json({ error: "fetch_failed", status: response.status }, 502);
  }

  const contentLength = parseInt(response.headers.get("content-length") ?? "0", 10);
  if (contentLength > 0 && contentLength > maxBytes) {
    return json({ error: "response_too_large", max_bytes: maxBytes }, 413);
  }

  const ct = (response.headers.get("content-type") ?? "").toLowerCase();
  const text = await response.text();
  if (text.length > maxBytes) {
    return json({ error: "response_too_large", max_bytes: maxBytes }, 413);
  }

  let rows: Record<string, string>[];
  if (ct.includes("csv") || target.pathname.endsWith(".csv")) {
    rows = parseCsv(text);
  } else if (ct.includes("json") || target.pathname.endsWith(".json")) {
    const parsed = JSON.parse(text);
    rows = (Array.isArray(parsed) ? parsed : [parsed]).map(rowFromJson);
  } else {
    return json({ error: "unsupported_url_format", content_type: ct }, 400);
  }

  if (rows.length === 0) return json({ inserted: 0, total: 0, url: body.url }, 200);

  const uploadId = generateUploadId();
  const normalized = normalizeRows(rows, "url_share", uploadId);
  const inserted = await insertToSupabase(normalized, env);

  return json({ inserted, total: rows.length, url: body.url, upload_id: uploadId }, 200);
}

function rowFromJson(obj: unknown): Record<string, string> {
  if (typeof obj !== "object" || obj === null) return { message: String(obj) };
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    out[k.toLowerCase()] = String(v ?? "");
  }
  return out;
}

/**
 * normalized rows → webhook_inbox + raw_payload_retention 두 테이블에 INSERT.
 *
 * 처리 순서:
 *   1. toInsertPair 로 schema 정합 payload 생성 (id 제거, masked_message 이름 변환 등)
 *   2. webhook_inbox 배치 INSERT (UNIQUE(source, message_id) 충돌 시 on_conflict=ignore)
 *   3. raw_payload_retention 배치 INSERT (성공 건만 — 실패해도 inbox 롤백 안 함)
 *
 * on_conflict: Prefer: resolution=ignore-duplicates 사용 → UNIQUE 충돌 시 skip, 오류 아님.
 */
async function insertToSupabase(
  rows: ReturnType<typeof normalizeRows>,
  env: Env
): Promise<number> {
  const pairs = rows.map(toInsertPair);
  const inboxRows = pairs.map((p) => p.inbox);
  const rawPayloadRows = pairs.map((p) => p.rawPayload);

  // webhook_inbox INSERT
  const inboxResp = await fetch(`${env.SUPABASE_URL}/rest/v1/webhook_inbox`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation,resolution=ignore-duplicates",
    },
    body: JSON.stringify(inboxRows),
  });

  if (!inboxResp.ok) {
    const errorText = await inboxResp.text();
    throw new Error(`Supabase webhook_inbox INSERT 실패: ${inboxResp.status} ${errorText}`);
  }

  const inserted = await inboxResp.json<unknown[]>();
  const insertedCount = Array.isArray(inserted) ? inserted.length : 0;

  // raw_payload_retention INSERT (실패는 경고만 — inbox 데이터 손실 방지 우선)
  if (rawPayloadRows.length > 0) {
    const rawResp = await fetch(`${env.SUPABASE_URL}/rest/v1/raw_payload_retention`, {
      method: "POST",
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(rawPayloadRows),
    });

    if (!rawResp.ok) {
      const rawErrText = await rawResp.text();
      console.warn(
        `[data-ingest] raw_payload_retention INSERT 경고: ${rawResp.status} ${rawErrText}`
      );
    }
  }

  return insertedCount;
}

function generateUploadId(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders() }
  });
}

function corsHeaders(): Record<string, string> {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "POST, GET, OPTIONS",
    "access-control-allow-headers": "content-type, x-internal-auth"
  };
}

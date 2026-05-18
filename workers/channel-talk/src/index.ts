/**
 * T2 Channel Talk Inbound Worker
 *
 * 처리 흐름:
 * POST /?token=<CHANNEL_TALK_WEBHOOK_TOKEN>  ← Channel Talk webhook
 *
 * 1. Content-Length guard (≤1MB)
 * 2. URL token 검증 (verify-token.ts — timing-safe 비교)
 * 3. payload 파싱 → normalize → mask_pii
 * 4. Supabase webhook_inbox INSERT (placeholder, Round 3 에서 wiring)
 * 5. 200 즉시 반환
 *
 * 보안:
 * - token 불일치 → 401 (상수 시간 비교, timing-attack 방지)
 * - Supabase 호출은 HTTP API 직접 (Service Binding X — same-zone 521 회피)
 *
 * Channel Talk 인증 방식 확정 (B1 closed 2026-05-18, P2_PENDING_INPUTS.md D1):
 *   HMAC 서명 헤더 없음. URL ?token= query 토큰 비교만 수행.
 *   sandbox 실측(Round 3) 에서 추가 헤더 발견 시 이 파일 업데이트.
 */

import { verifyChannelTalkToken } from "./verify-token";
import { maskPii } from "../../_shared/mask-pii";

// ---------------------------------------------------------------------------
// 환경 변수 타입
// ---------------------------------------------------------------------------

export interface Env {
  /** Channel Talk webhook token (env secret) */
  CHANNEL_TALK_WEBHOOK_TOKEN: string;
  /** Supabase 프로젝트 URL */
  SUPABASE_URL: string;
  /** Supabase service role key (secret) */
  SUPABASE_SERVICE_ROLE_KEY: string;
}

// ---------------------------------------------------------------------------
// Channel Talk webhook payload 타입 (공식 docs 기반)
// ---------------------------------------------------------------------------

interface ChannelTalkWebhookPayload {
  /** 이벤트 유형: "userMessage" | "operatorMessage" | "botMessage" 등 */
  event?: string;
  /** 채널 ID */
  channelId?: string;
  /** conversation 객체 */
  conversation?: {
    id?: string;
    createdAt?: number; // Unix timestamp ms
  };
  /** 메시지 객체 */
  message?: {
    id?: string;
    plainText?: string;
    createdAt?: number;
  };
  /** 유저 객체 */
  user?: {
    id?: string;
    name?: string;
  };
}

// ---------------------------------------------------------------------------
// 정규화 결과 타입 (channel_adapter_schema.json normalized_inquiry_fields 호환)
// ---------------------------------------------------------------------------

export interface NormalizedChannelTalkInquiry {
  id: string;
  source: "channel_talk";
  channel: "channel_talk";
  segment: string;
  message: string;        // mask_pii 적용 후
  received_at: string;    // ISO-8601
  sender_id_hash: string; // sha-256 hex of user id
  product_scope: "habix_course" | "pmf_radar_lab" | "other";
  token_verified: boolean;
}

const MAX_PAYLOAD_BYTES = 1_048_576; // 1MB

// ---------------------------------------------------------------------------
// 핸들러
// ---------------------------------------------------------------------------

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    // GET /healthz
    if (request.method === "GET" && new URL(request.url).pathname === "/healthz") {
      return ok({ ok: true });
    }

    if (request.method !== "POST") {
      return err(405, "Method Not Allowed");
    }

    // 1. Payload size guard
    const contentLength = parseInt(request.headers.get("Content-Length") ?? "0", 10);
    if (contentLength > MAX_PAYLOAD_BYTES) {
      return err(413, "Payload exceeds 1MB limit");
    }

    let rawBody: string;
    try {
      const buffer = await request.arrayBuffer();
      if (buffer.byteLength > MAX_PAYLOAD_BYTES) {
        return err(413, "Payload exceeds 1MB limit");
      }
      rawBody = new TextDecoder("utf-8").decode(buffer);
    } catch {
      return err(400, "Failed to read request body");
    }

    // 2. URL token 검증 (timing-safe)
    const requestUrl = new URL(request.url);
    if (!verifyChannelTalkToken(requestUrl, env.CHANNEL_TALK_WEBHOOK_TOKEN)) {
      return err(401, "Invalid or missing token");
    }

    // 3. payload 파싱 + normalize
    let normalized: NormalizedChannelTalkInquiry | null;
    try {
      normalized = await normalizeChannelTalkPayload(rawBody, requestUrl);
    } catch {
      return err(400, "Failed to parse Channel Talk payload");
    }

    if (!normalized) {
      // 무시할 이벤트 유형 (userMessage 외) — 200 응답으로 CT 재전송 방지
      return ok({ accepted: false, reason: "event_skipped" });
    }

    // 4. Supabase INSERT placeholder
    // Round 3 에서 β의 webhook_inbox 스키마와 wiring
    // (feedback_cf_worker_same_zone: Service Binding X, HTTP API 직접 호출)
    console.log(
      `[channel-talk] normalized id=${normalized.id} channel=${normalized.channel} ` +
      `scope=${normalized.product_scope} sender_hash=${normalized.sender_id_hash.slice(0, 8)}... ` +
      `msg_len=${normalized.message.length}`
    );

    // TODO Round 3: webhook_inbox schema 정합 INSERT
    // webhook_inbox 컬럼 (20260518000001_p2_inbox_schema.sql):
    //   source, message_id, channel, segment, masked_message,
    //   classified_json, hitl_required, product_scope
    //   (id·created_at 제외 — DB default)
    //
    // await supabaseInsert(env, "webhook_inbox", {
    //   source: normalized.source,
    //   message_id: normalized.id,         // Channel Talk 메시지 id
    //   channel: normalized.channel,
    //   segment: normalized.segment,
    //   masked_message: normalized.message, // 컬럼명 주의: masked_message
    //   hitl_required: false,
    //   product_scope: normalized.product_scope,
    // });
    //
    // raw_payload_retention 분리 INSERT (PIPA 30일 보존):
    // await supabaseInsert(env, "raw_payload_retention", {
    //   source: normalized.source,
    //   message_id: normalized.id,
    //   raw_payload: { raw_ct_body: rawBody },
    // });

    return ok({ accepted: true, id: normalized.id });
  },
};

// ---------------------------------------------------------------------------
// normalize
// ---------------------------------------------------------------------------

async function normalizeChannelTalkPayload(
  rawBody: string,
  _requestUrl: URL
): Promise<NormalizedChannelTalkInquiry | null> {
  let payload: ChannelTalkWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as ChannelTalkWebhookPayload;
  } catch {
    throw new Error("JSON parse failed");
  }

  // userMessage 이벤트만 처리 (operatorMessage 등 무시)
  if (payload.event !== "userMessage") {
    return null;
  }

  const messageId = payload.message?.id ?? payload.conversation?.id ?? `ct-${Date.now()}`;
  const receivedAtMs = payload.message?.createdAt ?? payload.conversation?.createdAt ?? Date.now();
  const receivedAt = new Date(receivedAtMs).toISOString();
  const rawText = payload.message?.plainText ?? "";
  const userId = payload.user?.id ?? "unknown";

  // mask_pii (_shared 공유 모듈 사용)
  const maskedMessage = maskPii(rawText.slice(0, 900));

  if (!maskedMessage.trim()) {
    return null;
  }

  const senderIdHash = await hashUserId(userId);

  // product_scope: 키워드 기반 분류 (LLM 사용 금지, Rule 5)
  const productScope = classifyScope(maskedMessage);

  return {
    id: messageId,
    source: "channel_talk",
    channel: "channel_talk",
    segment: "channel_talk customer",
    message: maskedMessage,
    received_at: receivedAt,
    sender_id_hash: senderIdHash,
    product_scope: productScope,
    token_verified: true,
  };
}

async function hashUserId(userId: string): Promise<string> {
  const data = new TextEncoder().encode(userId.toLowerCase().trim());
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const HABIX_COURSE_KW = ["강의", "수업", "수강", "커리큘럼", "과제", "실습", "학습", "habix course", "habix_course"];
const PMF_RADAR_KW = ["pmf", "radar", "피드백", "기능", "개선", "버그", "pmf radar", "신청", "도입"];

function classifyScope(text: string): "habix_course" | "pmf_radar_lab" | "other" {
  const lower = text.toLowerCase();
  const hasCourse = HABIX_COURSE_KW.some((kw) => lower.includes(kw));
  const hasPmf = PMF_RADAR_KW.some((kw) => lower.includes(kw));
  if (hasCourse && !hasPmf) return "habix_course";
  if (hasPmf && !hasCourse) return "pmf_radar_lab";
  if (hasCourse && hasPmf) return "habix_course";
  return "other";
}

// ---------------------------------------------------------------------------
// Supabase INSERT (Round 3 wiring 예정, placeholder)
// ---------------------------------------------------------------------------

// async function supabaseInsert(env: Env, table: string, row: Record<string, unknown>): Promise<void> {
//   const url = `${env.SUPABASE_URL}/rest/v1/${table}`;
//   const resp = await fetch(url, {
//     method: "POST",
//     headers: {
//       "apikey": env.SUPABASE_SERVICE_ROLE_KEY,
//       "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
//       "Content-Type": "application/json",
//       "Prefer": "return=minimal",
//     },
//     body: JSON.stringify(row),
//   });
//   if (!resp.ok) {
//     const text = await resp.text();
//     throw new Error(`Supabase INSERT 실패: HTTP ${resp.status} — ${text}`);
//   }
// }

// ---------------------------------------------------------------------------
// 응답 헬퍼
// ---------------------------------------------------------------------------

function ok(body: Record<string, unknown>): Response {
  return new Response(JSON.stringify({ ok: true, ...body }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function err(status: number, message: string): Response {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

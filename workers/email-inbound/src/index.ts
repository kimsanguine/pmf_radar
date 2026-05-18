/**
 * T1 Email Inbound Worker
 *
 * 처리 흐름:
 * POST / ← AWS SNS HTTPS subscription (SubscriptionConfirmation | Notification)
 *
 * 1. Content-Length guard (≤1MB)
 * 2. SNS Message Signature Version 1 검증 (sns-verify.ts)
 * 3. Type: SubscriptionConfirmation → SubscribeURL GET 자동 핸들링
 * 4. Type: Notification → SES payload 파싱 → normalize + mask_pii → console.log
 *    (Supabase INSERT 는 Round 2 에서 wiring — β 스키마 완성 후)
 * 5. 200 즉시 반환 + 후처리 event.waitUntil()
 *
 * 보안:
 * - X-Amz-SNS-Signature 검증 실패 → 401
 * - SigningCertURL 은 sns.*.amazonaws.com 도메인만 허용 (SSRF 방지)
 * - Supabase 호출은 Service Binding X (same-zone 521 회피, feedback_cf_worker_same_zone)
 *   → env.SUPABASE_URL + env.SUPABASE_SERVICE_ROLE_KEY HTTP API 직접 호출
 */

import { verifySnsSignature, parseSnsMessage, type SnsMessage } from "./sns-verify";
import { normalizeSesPayload } from "./normalize";

// ---------------------------------------------------------------------------
// Worker 환경 변수 타입
// ---------------------------------------------------------------------------

export interface Env {
  /** AWS SNS Topic ARN — 화이트리스트 검증용 */
  SNS_TOPIC_ARN: string;
  /** Supabase 프로젝트 URL (예: https://xxxx.supabase.co) */
  SUPABASE_URL: string;
  /** Supabase service role key (secret) */
  SUPABASE_SERVICE_ROLE_KEY: string;
}

// ---------------------------------------------------------------------------
// 상수
// ---------------------------------------------------------------------------

const MAX_PAYLOAD_BYTES = 1_048_576; // 1MB

// ---------------------------------------------------------------------------
// 핸들러
// ---------------------------------------------------------------------------

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // GET /healthz — Cloudflare health check
    if (request.method === "GET" && new URL(request.url).pathname === "/healthz") {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (request.method !== "POST") {
      return errorResponse(405, "Method Not Allowed");
    }

    // 1. Payload size guard (Content-Length 헤더 기준)
    const contentLength = parseInt(request.headers.get("Content-Length") ?? "0", 10);
    if (contentLength > MAX_PAYLOAD_BYTES) {
      return errorResponse(413, "Payload exceeds 1MB limit");
    }

    // body 읽기 — 실제 크기도 검증
    let rawBody: string;
    try {
      const buffer = await request.arrayBuffer();
      if (buffer.byteLength > MAX_PAYLOAD_BYTES) {
        return errorResponse(413, "Payload exceeds 1MB limit");
      }
      rawBody = new TextDecoder("utf-8").decode(buffer);
    } catch {
      return errorResponse(400, "Failed to read request body");
    }

    // 2. SNS 메시지 파싱
    const snsMsg = parseSnsMessage(rawBody);
    if (!snsMsg) {
      return errorResponse(400, "Invalid SNS message format");
    }

    // SNS Topic ARN 화이트리스트 (설정된 경우)
    if (env.SNS_TOPIC_ARN && snsMsg.TopicArn !== env.SNS_TOPIC_ARN) {
      console.warn(`[email-inbound] TopicArn 불일치: ${snsMsg.TopicArn}`);
      return errorResponse(403, "TopicArn not allowed");
    }

    // 3. SNS Signature Version 1 검증
    let signatureVerified = false;
    try {
      signatureVerified = await verifySnsSignature(snsMsg);
    } catch (err) {
      console.error("[email-inbound] SNS signature 검증 오류:", err);
      return errorResponse(401, "Signature verification error");
    }

    if (!signatureVerified) {
      return errorResponse(401, "Invalid SNS signature");
    }

    // 4. 메시지 유형별 처리
    if (snsMsg.Type === "SubscriptionConfirmation" || snsMsg.Type === "UnsubscribeConfirmation") {
      // 200 즉시 반환 후 SubscribeURL GET (비동기)
      const subscribeUrl = snsMsg.SubscribeURL;
      if (subscribeUrl) {
        ctx.waitUntil(handleSubscriptionConfirmation(subscribeUrl, snsMsg.MessageId));
      }
      return okResponse({ accepted: true, type: snsMsg.Type });
    }

    if (snsMsg.Type === "Notification") {
      // 200 즉시 반환 후 후처리 (비동기)
      ctx.waitUntil(processNotification(snsMsg, env));
      return okResponse({ accepted: true, type: "Notification" });
    }

    return errorResponse(400, `Unknown SNS Type: ${snsMsg.Type}`);
  },
};

// ---------------------------------------------------------------------------
// SubscriptionConfirmation 처리
// ---------------------------------------------------------------------------

async function handleSubscriptionConfirmation(subscribeUrl: string, messageId: string): Promise<void> {
  try {
    const resp = await fetch(subscribeUrl);
    if (resp.ok) {
      console.log(`[email-inbound] SNS subscription confirmed. MessageId=${messageId}`);
    } else {
      console.error(`[email-inbound] SubscribeURL fetch 실패: HTTP ${resp.status}`);
    }
  } catch (err) {
    console.error("[email-inbound] SubscribeURL fetch 오류:", err);
  }
}

// ---------------------------------------------------------------------------
// Notification 처리 (SES 이메일 파싱 → normalize → Supabase placeholder)
// ---------------------------------------------------------------------------

async function processNotification(snsMsg: SnsMessage, env: Env): Promise<void> {
  try {
    const normalized = await normalizeSesPayload(snsMsg.Message, true);

    if (normalized.length === 0) {
      console.log("[email-inbound] normalize 결과 0건 (본문 없음 또는 notificationType 불일치)");
      return;
    }

    for (const record of normalized) {
      // TODO Round 2: Supabase INSERT
      // β 스키마(webhook_inbox, webhook_idempotency) 완성 후 아래 주석 해제
      //
      // await supabaseInsert(env, "webhook_inbox", {
      //   id: record.id,
      //   source: record.source,
      //   channel: record.channel,
      //   segment: record.segment,
      //   message: record.message,
      //   received_at: record.received_at,
      //   sender_id_hash: record.sender_id_hash,
      //   product_scope: record.product_scope,
      //   signature_verified: record.signature_verified,
      // });

      // Round 1: console.log 만 (PII 는 이미 mask_pii 적용됨)
      console.log(
        `[email-inbound] normalized id=${record.id} channel=${record.channel} ` +
        `product_scope=${record.product_scope} sender_hash=${record.sender_id_hash.slice(0, 8)}... ` +
        `msg_len=${record.message.length}`
      );
    }
  } catch (err) {
    console.error("[email-inbound] processNotification 오류:", err);
  }
}

// ---------------------------------------------------------------------------
// Supabase HTTP API 직접 호출 (placeholder — Round 2 에서 실제 wiring)
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
//     const errText = await resp.text();
//     throw new Error(`Supabase INSERT 실패: HTTP ${resp.status} — ${errText}`);
//   }
// }

// ---------------------------------------------------------------------------
// 응답 헬퍼
// ---------------------------------------------------------------------------

function okResponse(body: Record<string, unknown>): Response {
  return new Response(JSON.stringify({ ok: true, ...body }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function errorResponse(status: number, message: string): Response {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

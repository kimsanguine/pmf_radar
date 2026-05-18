/**
 * T5 Auto-Reply Worker
 *
 * 두 가지 진입점:
 *   1. POST /evaluate  — 5조건 평가 + pending INSERT (email-inbound Round 3 wiring 예정)
 *   2. POST /cancel    — Telegram [취소] 버튼 callback (β Round 2 Telegram wiring 예정)
 *   3. GET  /healthz   — health check
 *   4. scheduled       — Workers Cron Trigger (매 1분) → dwell queue 처리
 *
 * 보안:
 *   - Bearer 토큰 인증 (INTERNAL_API_KEY) — email-inbound Worker → auto-reply Worker 내부 호출
 *   - Supabase HTTP API 직접 호출 (Service Binding X — same-zone 521 회피)
 *   - LLM 생성 텍스트 발송 금지 (template_id 없으면 즉시 차단)
 */

import { evaluateAutoReplyEligibility, type AutoReplyRecord, type TemplateEntry } from "./evaluate";
import { enqueueDwellPending, processDwellQueue } from "./dwell-queue";
import { cancelAutoReply } from "./cancel";
import TEMPLATES_JSON from "../../../data/auto_reply_templates.json";

// ---------------------------------------------------------------------------
// 환경 변수 타입
// ---------------------------------------------------------------------------

export interface Env {
  /** 내부 API 인증 키 (email-inbound → auto-reply Worker 호출 시 Bearer) */
  INTERNAL_API_KEY: string;
  /** Supabase 프로젝트 URL */
  SUPABASE_URL: string;
  /** Supabase service role key (secret) */
  SUPABASE_SERVICE_ROLE_KEY: string;
}

// ---------------------------------------------------------------------------
// 템플릿 DB 로드 (번들 타임 상수 — LLM 호출 없음)
// ---------------------------------------------------------------------------

const TEMPLATE_DB: TemplateEntry[] = (TEMPLATES_JSON as { templates: TemplateEntry[] }).templates;

// ---------------------------------------------------------------------------
// 핸들러
// ---------------------------------------------------------------------------

export default {
  // HTTP fetch 핸들러
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/healthz") {
      return ok({ ok: true, templates_loaded: TEMPLATE_DB.length });
    }

    // 내부 API 인증
    const authHeader = request.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ") || authHeader.slice(7) !== env.INTERNAL_API_KEY) {
      return err(401, "Unauthorized");
    }

    if (request.method === "POST" && url.pathname === "/evaluate") {
      return handleEvaluate(request, env);
    }

    if (request.method === "POST" && url.pathname === "/cancel") {
      return handleCancel(request, env);
    }

    return err(404, "Not Found");
  },

  // Workers Cron Trigger 핸들러 (매 1분)
  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
    await processDwellQueue(env);
  },
};

// ---------------------------------------------------------------------------
// POST /evaluate
// ---------------------------------------------------------------------------

async function handleEvaluate(request: Request, env: Env): Promise<Response> {
  let record: AutoReplyRecord;
  try {
    record = (await request.json()) as AutoReplyRecord;
  } catch {
    return err(400, "Invalid JSON body");
  }

  const result = evaluateAutoReplyEligibility(record, TEMPLATE_DB);

  if (!result.eligible) {
    return ok({ eligible: false, reasons: result.reasons });
  }

  // 5조건 PASS → dwell queue INSERT
  const insertResult = await enqueueDwellPending(env, {
    inbox_id: record.inbox_id,
    template_id: record.template_id!,
    status: "pending",
  });

  if (!insertResult.success) {
    console.error("[auto-reply] dwell enqueue 실패:", insertResult.error);
    return err(500, `Dwell queue INSERT 실패: ${insertResult.error}`);
  }

  return ok({
    eligible: true,
    reasons: result.reasons,
    log_id: insertResult.log_id,
  });
}

// ---------------------------------------------------------------------------
// POST /cancel
// ---------------------------------------------------------------------------

async function handleCancel(request: Request, env: Env): Promise<Response> {
  let body: { log_id?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return err(400, "Invalid JSON body");
  }

  if (!body.log_id) {
    return err(400, "log_id required");
  }

  const result = await cancelAutoReply(env, body.log_id);

  if (!result.success) {
    if (result.already_sent) {
      return ok({ cancelled: false, already_sent: true, message: result.error });
    }
    return err(500, result.error ?? "Cancel 실패");
  }

  return ok({ cancelled: true, already_sent: false });
}

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

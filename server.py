#!/usr/bin/env python3
"""Local demo server for PMF Signal Radar.

Serves the static demo and exposes a small OpenAI-backed classifier endpoint.
The API key stays on the local server and is never sent to the browser.
"""

from __future__ import annotations

import csv
import hashlib
import hmac
import json
import mimetypes
import os
import re
import sys
import time
import urllib.error
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent
DEFAULT_MODEL = "gpt-5.4-nano"
WEBHOOK_INBOX: list[dict[str, str]] = []
WEBHOOK_IDS: set[str] = set()


SIGNAL_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "run_summary": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "model": {"type": "string"},
                "total_records": {"type": "integer"},
                "summary": {"type": "string"},
                "hplan_gate": {"type": "string", "enum": ["evidence", "product", "build"]},
            },
            "required": ["model", "total_records", "summary", "hplan_gate"],
        },
        "signals": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "id": {"type": "string"},
                    "channel": {"type": "string", "enum": ["kakao", "openchat", "channel_talk", "manual"]},
                    "segment": {"type": "string"},
                    "raw": {"type": "string"},
                    "category": {
                        "type": "string",
                        "enum": [
                            "setup",
                            "practice_blocker",
                            "concept_confusion",
                            "output_quality",
                            "visualization",
                            "privacy",
                            "refund_price",
                            "buying_trigger",
                            "retention",
                            "praise",
                            "other",
                        ],
                    },
                    "clusterName": {"type": "string"},
                    "strength": {"type": "string", "enum": ["strong", "medium", "weak"]},
                    "priority": {"type": "integer", "minimum": 1, "maximum": 5},
                    "decisionType": {"type": "string", "enum": ["build", "interview", "guardrail", "hold"]},
                    "push": {"type": "string"},
                    "anxiety": {"type": "string"},
                    "workaround": {"type": "string"},
                    "trigger": {"type": "string"},
                    "decision": {"type": "string"},
                    "reply": {"type": "string"},
                    "hold": {"type": "string"},
                    "evidence_reason": {"type": "string"},
                },
                "required": [
                    "id",
                    "channel",
                    "segment",
                    "raw",
                    "category",
                    "clusterName",
                    "strength",
                    "priority",
                    "decisionType",
                    "push",
                    "anxiety",
                    "workaround",
                    "trigger",
                    "decision",
                    "reply",
                    "hold",
                    "evidence_reason",
                ],
            },
        },
        "backlog": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "title": {"type": "string"},
                    "decisionType": {"type": "string", "enum": ["build", "interview", "guardrail", "hold"]},
                    "why": {"type": "string"},
                    "next_action": {"type": "string"},
                    "not_now": {"type": "string"},
                },
                "required": ["title", "decisionType", "why", "next_action", "not_now"],
            },
        },
    },
    "required": ["run_summary", "signals", "backlog"],
}


def normalize_channel(channel: str) -> str:
    text = channel.lower()
    if "channel_talk" in text or "채널톡" in text:
        return "channel_talk"
    if "open" in text or "오픈" in text:
        return "openchat"
    if "manual" in text or "csv" in text:
        return "manual"
    if "kakao" in text or "카카오" in text:
        return "kakao"
    return "manual"


def verify_signature(secret: str, raw_body: bytes, header_sig: str) -> bool:
    """HMAC-SHA256 webhook signature 검증. constant-time 비교(`hmac.compare_digest`)."""
    if not secret or not header_sig:
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected.lower(), header_sig.lower())


def mask_pii(text: str) -> str:
    masked = re.sub(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", "[이메일]", text)
    masked = re.sub(r"01[016789][-\s.]?\d{3,4}[-\s.]?\d{4}", "[전화번호]", masked)
    masked = re.sub(r"\b\d{3,4}[-\s]\d{4}[-\s]\d{4}\b", "[주문번호]", masked)
    masked = re.sub(r"[가-힣]{2,4}\s*(씨|님|대표|매니저|팀장|과장|부장|차장|이사|책임|선임|주임)(?=[은는이가을를도와과의에서로께,.\s!?]|$)", "[이름]", masked)
    masked = re.sub(r"(주식회사\s*[가-힣A-Za-z0-9]+|㈜\s*[가-힣A-Za-z0-9]+|[A-Z][A-Za-z0-9]+(?:\s+[A-Z][A-Za-z0-9]+)*\s+(?:Inc|Co|Ltd|Corp)\.?)", "[회사명]", masked)
    masked = re.sub(r"\b[A-Z]{2,}[-_]?\d{6,}\b", "[주문번호]", masked)
    return masked


def normalize_records(records: list[dict[str, Any]]) -> list[dict[str, str]]:
    normalized = []
    for index, record in enumerate(records[:80]):
        message = str(record.get("message") or record.get("raw") or record.get("text") or "")
        if not message.strip():
            continue
        normalized.append(
            {
                "id": str(record.get("id") or record.get("message_id") or f"input-{index + 1}"),
                "channel": normalize_channel(str(record.get("channel") or record.get("source") or "")),
                "segment": str(record.get("segment") or record.get("customer_segment") or "unknown"),
                "message": mask_pii(message.strip())[:900],
                "label_hint": str(record.get("label_hint") or "other"),
            }
        )
    return normalized


def parse_csv(text: str) -> list[dict[str, Any]]:
    rows = list(csv.DictReader(text.splitlines()))
    return [
        {
            "id": row.get("id") or row.get("message_id") or f"csv-{i + 1}",
            "channel": row.get("channel") or row.get("source") or "manual_import",
            "segment": row.get("segment") or row.get("customer_segment") or "csv import",
            "message": row.get("message") or row.get("text") or "",
        }
        for i, row in enumerate(rows)
    ]


def normalize_webhook_payload(source: str, payload: dict[str, Any]) -> list[dict[str, str]]:
    items = payload.get("events") or payload.get("messages") or payload.get("raw_payloads")
    if not isinstance(items, list):
        items = [payload]
    records: list[dict[str, str]] = []
    for index, item in enumerate(items):
        body = item.get("payload") if isinstance(item.get("payload"), dict) else item
        message = (
            body.get("plainText")
            or body.get("text")
            or body.get("content")
            or body.get("message", {}).get("text")
            or item.get("message")
            or item.get("text")
            or ""
        )
        if not str(message).strip():
            continue
        record_source = body.get("source") or item.get("source") or source
        records.append(
            {
                "id": str(body.get("messageId") or body.get("eventId") or item.get("id") or f"{source}-{int(time.time())}-{index}"),
                "source": str(record_source),
                "channel": normalize_channel(str(record_source)),
                "segment": str(body.get("segment") or item.get("segment") or body.get("sender_type") or "webhook customer"),
                "message": mask_pii(str(message).strip()),
            }
        )
    return records


def configured_integration_status() -> dict[str, Any]:
    channel_token = bool(os.environ.get("CHANNEL_TALK_WEBHOOK_TOKEN"))
    kakao_token = bool(os.environ.get("KAKAO_WEBHOOK_TOKEN"))
    public_url = os.environ.get("PUBLIC_WEBHOOK_BASE_URL")
    return {
        "openai": {
            "status": "ready" if os.environ.get("OPENAI_API_KEY") else "missing_key",
            "detail": "server-side structured classifier",
        },
        "channel_talk": {
            "status": "receiver_stub" if not (channel_token and public_url) else "callback_ready",
            "endpoint": "/api/webhooks/channel-talk",
            "missing": [
                item
                for item, ready in {
                    "public_https_url": bool(public_url),
                    "webhook_token_validation": channel_token,
                    "admin_webhook_config": False,
                }.items()
                if not ready
            ],
        },
        "kakao": {
            "status": "receiver_stub",
            "endpoint": "/api/webhooks/kakao",
            "missing": [
                item
                for item, ready in {
                    "consultalk_partner_access": bool(os.environ.get("KAKAO_CONSULTALK_PARTNER_READY")),
                    "official_payload_sample": bool(os.environ.get("KAKAO_OFFICIAL_PAYLOAD_CONFIRMED")),
                    "public_https_url": bool(public_url),
                    "webhook_token_validation": kakao_token,
                }.items()
                if not ready
            ],
        },
    }


def response_text(payload: dict[str, Any]) -> str:
    if isinstance(payload.get("output_text"), str):
        return payload["output_text"]
    chunks: list[str] = []
    for item in payload.get("output", []):
        for content in item.get("content", []):
            if content.get("type") in {"output_text", "text"} and isinstance(content.get("text"), str):
                chunks.append(content["text"])
    return "".join(chunks)


def call_openai(records: list[dict[str, str]]) -> dict[str, Any]:
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not set")
    model = os.environ.get("OPENAI_MODEL", DEFAULT_MODEL)
    prompt = {
        "task": "Classify Korean customer inquiries into PMF evidence for a habix.ai course demo.",
        "instructions": [
            "Return JSON only through the provided schema.",
            "Translate support messages into PMF evidence, not just support categories.",
            "Use Korean for user-facing fields.",
            "decisionType build means repeated high-risk product/course improvement.",
            "decisionType interview means worth validating before build.",
            "decisionType guardrail means privacy/legal/safety/human-review boundary.",
            "decisionType hold means praise or weak evidence that should not drive build priority.",
            "reply must be a draft only and must never imply auto-send.",
            "hold must explicitly say what not to build now.",
        ],
        "records": records,
    }
    body = {
        "model": model,
        "input": [
            {
                "role": "system",
                "content": "You are a Korean AI PM analyst. Produce PMF evidence from customer inquiries. JSON must follow the schema.",
            },
            {"role": "user", "content": json.dumps(prompt, ensure_ascii=False)},
        ],
        "text": {
            "format": {
                "type": "json_schema",
                "name": "pmf_signal_radar_result",
                "strict": True,
                "schema": SIGNAL_SCHEMA,
            }
        },
    }
    request = urllib.request.Request(
        "https://api.openai.com/v1/responses",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    started = time.time()
    with urllib.request.urlopen(request, timeout=60) as response:
        raw = response.read().decode("utf-8")
    data = json.loads(raw)
    text = response_text(data)
    parsed = json.loads(text)
    parsed["run_summary"]["model"] = model
    parsed["run_summary"]["latency_ms"] = int((time.time() - started) * 1000)
    return parsed


class Handler(SimpleHTTPRequestHandler):
    server_version = "PMFSignalRadar/0.2"

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_json(self, status: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        if self.path.startswith("/api/health"):
            self.send_json(
                200,
                {
                    "ok": True,
                    "openai_key": bool(os.environ.get("OPENAI_API_KEY")),
                    "model": os.environ.get("OPENAI_MODEL", DEFAULT_MODEL),
                },
            )
            return
        if self.path.startswith("/api/integration-status"):
            self.send_json(200, {"ok": True, "integrations": configured_integration_status()})
            return
        if self.path.startswith("/api/webhooks/inbox"):
            expected_token = os.environ.get("INBOX_READ_TOKEN", "")
            if expected_token:
                auth_header = self.headers.get("Authorization", "")
                if not auth_header.startswith("Bearer ") or auth_header[7:] != expected_token:
                    self.send_json(401, {"ok": False, "error": "Unauthorized"})
                    return
            self.send_json(200, {"ok": True, "records": WEBHOOK_INBOX[-100:]})
            return
        if self.path == "/":
            self.path = "/demo/index.html"
        return super().do_GET()

    def do_POST(self) -> None:
        length = int(self.headers.get("Content-Length", "0"))
        if length > 1_048_576:
            self.send_json(413, {"ok": False, "error": "Payload exceeds 1MB limit"})
            return
        if self.path.startswith("/api/webhooks/channel-talk") or self.path.startswith("/api/webhooks/kakao"):
            try:
                raw_bytes = self.rfile.read(length)
                if self.path.startswith("/api/webhooks/channel-talk"):
                    secret = os.environ.get("CHANNEL_TALK_WEBHOOK_SECRET", "")
                    if secret:
                        header_sig = self.headers.get("X-Channel-Signature", "")
                        if not verify_signature(secret, raw_bytes, header_sig):
                            self.send_json(401, {"ok": False, "error": "Invalid signature"})
                            return
                raw = raw_bytes.decode("utf-8")
                payload = json.loads(raw or "{}")
                source = "channel_talk" if "channel-talk" in self.path else "kakao_consultalk"
                records = normalize_webhook_payload(source, payload)
                fresh = []
                for record in records:
                    if record["id"] in WEBHOOK_IDS:
                        continue
                    WEBHOOK_IDS.add(record["id"])
                    fresh.append(record)
                WEBHOOK_INBOX.extend(fresh)
                self.send_json(200, {"ok": True, "accepted": len(fresh), "duplicates": len(records) - len(fresh), "records": fresh})
            except Exception as error:  # noqa: BLE001
                self.send_json(400, {"ok": False, "error": str(error)})
            return
        if not self.path.startswith("/api/classify"):
            self.send_error(404)
            return
        try:
            raw = self.rfile.read(length).decode("utf-8")
            payload = json.loads(raw)
            records = payload.get("records", [])
            if payload.get("csv"):
                records.extend(parse_csv(str(payload["csv"])))
            normalized = normalize_records(records)
            if not normalized:
                self.send_json(400, {"ok": False, "error": "No classifiable records"})
                return
            result = call_openai(normalized)
            self.send_json(200, {"ok": True, "normalized_records": normalized, **result})
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", errors="replace")
            self.send_json(error.code, {"ok": False, "error": "OpenAI API error", "detail": detail})
        except Exception as error:  # noqa: BLE001 - demo server should surface local setup issues.
            self.send_json(500, {"ok": False, "error": str(error)})


def main() -> int:
    mimetypes.add_type("text/javascript", ".js")
    port = int(os.environ.get("PORT", "8892"))
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"PMF Signal Radar server running at http://127.0.0.1:{port}/demo/index.html", flush=True)
    print(f"OpenAI model: {os.environ.get('OPENAI_MODEL', DEFAULT_MODEL)}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("Shutting down", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

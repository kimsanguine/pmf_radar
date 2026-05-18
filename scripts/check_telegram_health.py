"""
check_telegram_health.py — 일 1회 Telegram round-trip health check
====================================================================
PRD-P2 §12 NFR "Telegram 알림 round-trip 1회/일 health check" 구현.

동작:
  1. 운영자 chat 에 "[Health] OK — {timestamp}" 발송
  2. 발송 성공 여부 반환 (응답 수신 확인은 Telegram API sendMessage ok: true 로 대체)

cron 등록 hint:
  Cloudflare Workers scheduled handler 에서 호출 (매일 08:05 KST = 23:05 UTC):
    wrangler.toml 에 cron = ["5 23 * * *"] 추가 후
    Worker scheduled() 에서 fetch("https://localhost/__health") 대신
    Scripts.checkTelegramHealth() 를 직접 호출하거나,
    Workers 내 Python 브릿지가 없으므로 TypeScript Worker 가
    Supabase Edge Function 을 트리거하는 패턴 사용.

  로컬/서버 cron (crontab):
    5 23 * * *  cd /path/to/project && python scripts/check_telegram_health.py

의존성: stdlib 전용.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from datetime import datetime, timezone


def _get_bot_token() -> str:
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
    if not token:
        raise ValueError("TELEGRAM_BOT_TOKEN 환경변수가 설정되지 않았습니다.")
    return token


def _get_chat_id() -> str:
    return os.environ.get("TELEGRAM_OPERATOR_CHAT_ID", "8595911950")


def run_health_check(dry_run: bool = False) -> dict:
    """
    Telegram sendMessage round-trip health check.

    dry_run=True: 실제 Telegram 호출 없이 성공 dict 반환.
    반환값: {"ok": bool, "timestamp": str, ...}
    """
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    message = f"[Health] OK — {timestamp}"

    if dry_run:
        return {"ok": True, "dry_run": True, "timestamp": timestamp, "message": message}

    token = _get_bot_token()
    chat_id = _get_chat_id()

    payload = {
        "chat_id": chat_id,
        "text": message,
    }
    data = json.dumps(payload).encode("utf-8")
    url = f"https://api.telegram.org/bot{token}/sendMessage"

    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            body = json.loads(resp.read().decode("utf-8"))
            ok = body.get("ok", False)
            return {
                "ok": ok,
                "timestamp": timestamp,
                "message_id": body.get("result", {}).get("message_id"),
            }
    except urllib.error.HTTPError as exc:
        return {"ok": False, "timestamp": timestamp, "error": f"HTTP {exc.code}"}
    except urllib.error.URLError as exc:
        return {"ok": False, "timestamp": timestamp, "error": str(exc.reason)}


if __name__ == "__main__":
    import sys

    dry_run = "--dry-run" in sys.argv
    result = run_health_check(dry_run=dry_run)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    sys.exit(0 if result.get("ok") else 1)

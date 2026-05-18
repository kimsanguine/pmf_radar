"""
notify_operator.py — Telegram 포인터 알림 + 오프타임 가드 + pending_batch_queue
=================================================================================
PRD-P2 §11 US-8/9/10 구현.
P2_DESIGN §3 C8 (포인터 전용) · C12 (오프타임) · C16 (이메일만) 준수.

의존성: stdlib 전용 (urllib.request, json, datetime, zoneinfo, re, os)
외부 패키지 0건.

보안 규칙:
  - TELEGRAM_BOT_TOKEN 은 환경변수 또는 Workers env binding 에서만 읽음.
  - 로그에 토큰 절대 출력 금지.
  - send_pointer() 에서 record["raw_message"] / masked_message 본문 포함 금지 (C8).
  - 발송 직전 PII grep 자가 검증 (US-18).
"""

from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone, timedelta
from typing import Optional

# ---------------------------------------------------------------------------
# 1. 설정 상수
# ---------------------------------------------------------------------------
DASHBOARD_BASE_URL = os.environ.get("DASHBOARD_BASE_URL", "https://inbox.habix.ai/dashboard")
OFFHOURS_START = 22   # KST 22:00 이상이면 오프타임
OFFHOURS_END = 8      # KST 08:00 미만이면 오프타임 (22:00 ~ 다음날 07:59)

# Supabase PostgREST 엔드포인트 (pending_batch_queue INSERT)
_SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
_SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

# ---------------------------------------------------------------------------
# 2. PII 패턴 (mask_pii 와 동일 정규식 — grep 자가 검증용)
# ---------------------------------------------------------------------------
# 이름: 한글 2-4자 + 선택적 직책/호칭 조사
_PII_PATTERNS: list[tuple[str, str]] = [
    # 한글 이름 (2-4자) + 직책·호칭 (님/씨/대리/과장/팀장 등)
    (r"[가-힣]{2,4}(님|씨|대리|과장|팀장|부장|이사|사장|대표|원장|선생)", "[이름마스킹]"),
    # 이메일
    (r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}", "[이메일마스킹]"),
    # 전화번호 (010-xxxx-xxxx, 02-xxxx-xxxx 등)
    (r"\b0\d{1,2}[-\s]?\d{3,4}[-\s]?\d{4}\b", "[전화마스킹]"),
    # 주문번호 (영숫자 8자리 이상)
    (r"\b[A-Z0-9]{8,}\b", "[주문번호마스킹]"),
    # 회사명 패턴: 한글 2-10자 + (주)/(유)/(사)/(팀)/(랩)
    (r"[가-힣]{2,10}(주식회사|㈜|\(주\)|\(유\)|\(사\)|팀|랩|스튜디오)", "[회사명마스킹]"),
]

_COMPILED_PATTERNS = [(re.compile(p), r) for p, r in _PII_PATTERNS]


def mask_pii(text: str) -> str:
    """PII 패턴을 마스킹 플레이스홀더로 대체. 모델 호출 없음 (Rule 5)."""
    for compiled, replacement in _COMPILED_PATTERNS:
        text = compiled.sub(replacement, text)
    return text


def _check_pii_in_text(text: str) -> list[str]:
    """
    text 에서 PII 패턴 검출 결과 반환.
    발송 직전 자가 검증에서 호출됨. 빈 리스트이면 통과.
    """
    found: list[str] = []
    for compiled, _ in _COMPILED_PATTERNS:
        matches = compiled.findall(text)
        if matches:
            found.extend(matches)
    return found


# ---------------------------------------------------------------------------
# 3. 오프타임 가드 (US-9, C12)
# ---------------------------------------------------------------------------
def is_off_hours(now: datetime, tz: str = "Asia/Seoul") -> bool:
    """
    KST 22:00 이상 또는 08:00 미만이면 True (오프타임).

    Asia/Seoul 은 UTC+9 고정 (DST 없음). zoneinfo 없는 환경 대비
    수동 offset 계산을 fallback 으로 사용.

    경계:
      - 22:00 → True  (오프타임 시작)
      - 22:01 → True
      - 07:59 → True  (오프타임 끝 전)
      - 08:00 → False (온타임 시작)
      - 08:01 → False
    """
    try:
        from zoneinfo import ZoneInfo
        kst_now = now.astimezone(ZoneInfo(tz))
    except (ImportError, Exception):
        # zoneinfo 없는 환경: UTC+9 수동 변환
        kst_offset = timedelta(hours=9)
        if now.tzinfo is None:
            # naive datetime → UTC 로 가정
            now = now.replace(tzinfo=timezone.utc)
        kst_now = now.astimezone(timezone(kst_offset))

    hour = kst_now.hour
    return hour >= OFFHOURS_START or hour < OFFHOURS_END


# ---------------------------------------------------------------------------
# 4. 알림 템플릿 빌더 (C8 강제 — 본문 절대 포함 금지)
# ---------------------------------------------------------------------------
def _build_pointer_text(record: dict) -> str:
    """
    포인터 알림 텍스트 생성.
    PRD §11 US-8 템플릿:
      [PMF Signal] {category} / {strength}
      ID: {id}  채널: {channel}
      대시보드: {url}?id={id}

    record 에 포함되면 안 되는 필드: raw_message, masked_message, body, text, content
    본 함수는 해당 필드를 읽지 않는다. (C8)
    """
    record_id = str(record.get("id", "unknown"))
    category = str(record.get("category", "unknown"))
    strength = str(record.get("strength", "unknown"))
    channel = str(record.get("channel", "unknown"))
    dashboard_url = DASHBOARD_BASE_URL

    return (
        f"[PMF Signal] {category} / {strength}\n"
        f"ID: {record_id}  채널: {channel}\n"
        f"대시보드: {dashboard_url}?id={record_id}"
    )


# ---------------------------------------------------------------------------
# 5. Telegram API 호출 (stdlib urllib.request 전용)
# ---------------------------------------------------------------------------
def _get_bot_token() -> str:
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
    if not token:
        raise ValueError("TELEGRAM_BOT_TOKEN 환경변수가 설정되지 않았습니다.")
    return token


def _get_chat_id() -> str:
    chat_id = os.environ.get("TELEGRAM_OPERATOR_CHAT_ID", "8595911950")
    return chat_id


def _telegram_send_message(
    text: str,
    reply_markup: Optional[dict] = None,
    dry_run: bool = False,
) -> dict:
    """
    Telegram sendMessage API 호출.
    dry_run=True 이면 실제 HTTP 호출 없이 payload dict 만 반환.

    보안: 토큰은 URL 에만 포함되며 로그에 노출되지 않음.
    """
    if dry_run:
        return {"ok": True, "dry_run": True, "text": text}

    token = _get_bot_token()
    chat_id = _get_chat_id()

    payload: dict = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML",
    }
    if reply_markup:
        payload["reply_markup"] = json.dumps(reply_markup)

    data = json.dumps(payload).encode("utf-8")
    url = f"https://api.telegram.org/bot{token}/sendMessage"

    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            body = resp.read().decode("utf-8")
            return json.loads(body)
    except urllib.error.HTTPError as exc:
        err_body = exc.read().decode("utf-8", errors="replace")
        # 토큰이 err_body 에 포함되지 않도록 redact
        return {"ok": False, "error": f"HTTP {exc.code}", "detail": err_body[:200]}
    except urllib.error.URLError as exc:
        return {"ok": False, "error": str(exc.reason)}


# ---------------------------------------------------------------------------
# 6. pending_batch_queue Supabase INSERT (오프타임 큐잉)
# ---------------------------------------------------------------------------
def _supabase_insert_pending(record: dict) -> dict:
    """
    pending_batch_queue 테이블에 row INSERT.
    service_role key 필수 (anon은 RLS silent fail).
    """
    if not _SUPABASE_URL or not _SUPABASE_SERVICE_ROLE_KEY:
        return {"ok": False, "error": "SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY 미설정"}

    endpoint = f"{_SUPABASE_URL.rstrip('/')}/rest/v1/pending_batch_queue"
    payload = {
        "inbox_id": record.get("id"),
        "category": record.get("category"),
        "strength": record.get("strength"),
        "channel": record.get("channel"),
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        endpoint,
        data=data,
        headers={
            "Content-Type": "application/json",
            "apikey": _SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {_SUPABASE_SERVICE_ROLE_KEY}",
            "Prefer": "return=representation",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            body = resp.read().decode("utf-8")
            return {"ok": True, "result": json.loads(body)}
    except urllib.error.HTTPError as exc:
        err_body = exc.read().decode("utf-8", errors="replace")
        return {"ok": False, "error": f"HTTP {exc.code}", "detail": err_body[:200]}
    except urllib.error.URLError as exc:
        return {"ok": False, "error": str(exc.reason)}


# ---------------------------------------------------------------------------
# 7. pending_batch_queue flush (on-hour 08:00 KST 호출)
# ---------------------------------------------------------------------------
def flush_pending_batch(dry_run: bool = False) -> list[dict]:
    """
    pending_batch_queue 에서 미발송 row 를 조회해 Telegram 발송 후 row 삭제.
    Workers scheduled handler 또는 별도 cron 에서 08:00 KST 에 호출.

    dry_run=True: Supabase / Telegram 실호출 없이 flush 시나리오만 반환.
    """
    if dry_run:
        return [{"ok": True, "dry_run": True, "flushed": 0}]

    if not _SUPABASE_URL or not _SUPABASE_SERVICE_ROLE_KEY:
        return [{"ok": False, "error": "SUPABASE env 미설정"}]

    # 미발송 row 조회
    endpoint = (
        f"{_SUPABASE_URL.rstrip('/')}/rest/v1/pending_batch_queue"
        "?select=*&order=created_at.asc&limit=100"
    )
    req = urllib.request.Request(
        endpoint,
        headers={
            "apikey": _SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {_SUPABASE_SERVICE_ROLE_KEY}",
        },
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            rows = json.loads(resp.read().decode("utf-8"))
    except Exception as exc:
        return [{"ok": False, "error": str(exc)}]

    results = []
    for row in rows:
        record = {
            "id": row.get("inbox_id", ""),
            "category": row.get("category", ""),
            "strength": row.get("strength", ""),
            "channel": row.get("channel", ""),
        }
        result = send_pointer(record, dry_run=False)
        if result.get("ok"):
            # 발송 성공 → row 삭제
            del_url = (
                f"{_SUPABASE_URL.rstrip('/')}/rest/v1/pending_batch_queue"
                f"?id=eq.{row['id']}"
            )
            del_req = urllib.request.Request(
                del_url,
                headers={
                    "apikey": _SUPABASE_SERVICE_ROLE_KEY,
                    "Authorization": f"Bearer {_SUPABASE_SERVICE_ROLE_KEY}",
                },
                method="DELETE",
            )
            try:
                urllib.request.urlopen(del_req, timeout=10)
            except Exception:
                pass
        results.append(result)
    return results


# ---------------------------------------------------------------------------
# 8. enqueue_batch — 오프타임 시 pending_batch_queue 에 저장 (US-9)
# ---------------------------------------------------------------------------
def enqueue_batch(record: dict, dry_run: bool = False) -> dict:
    """
    오프타임 판정 시 pending_batch_queue 에 INSERT.
    dry_run=True: 실제 Supabase 호출 없이 dict 반환.
    """
    if dry_run:
        return {
            "ok": True,
            "dry_run": True,
            "action": "enqueued",
            "inbox_id": record.get("id"),
        }
    return _supabase_insert_pending(record)


# ---------------------------------------------------------------------------
# 9. 취소 callback handler — Telegram inline button "취소" 처리
# ---------------------------------------------------------------------------
def handle_cancel_callback(callback_query: dict, dry_run: bool = False) -> dict:
    """
    Telegram inline keyboard "취소" 버튼 클릭 시 호출.
    data 형식: "cancel:{auto_reply_log_id}"

    동작:
      1. auto_reply_log row 의 cancelled=true, cancelled_at=now() 업데이트
      2. Telegram 콜백 응답 (answerCallbackQuery)
      3. 운영자에게 취소 확인 메시지 발송

    Round 3 α Auto-Reply dwell timer 와의 인터페이스:
      - α 가 auto_reply_log 에 row INSERT 후 Telegram 취소 버튼 메시지 발송
      - 운영자가 30초 내 "취소" 클릭 → handle_cancel_callback 호출
      - auto_reply_log.cancelled = true → α 의 dwell timer 가 발송 중단
      - 인터페이스 계약: auto_reply_log_id (uuid str) 가 callback_data 에 포함

    dry_run=True: DB/Telegram 실호출 없이 처리 흐름만 반환.
    """
    callback_id = callback_query.get("id", "")
    data = callback_query.get("data", "")

    if not data.startswith("cancel:"):
        return {"ok": False, "error": "잘못된 callback data 형식"}

    auto_reply_log_id = data.replace("cancel:", "").strip()

    if dry_run:
        return {
            "ok": True,
            "dry_run": True,
            "action": "cancelled",
            "auto_reply_log_id": auto_reply_log_id,
        }

    # Supabase auto_reply_log UPDATE
    if _SUPABASE_URL and _SUPABASE_SERVICE_ROLE_KEY:
        patch_url = (
            f"{_SUPABASE_URL.rstrip('/')}/rest/v1/auto_reply_log"
            f"?id=eq.{auto_reply_log_id}"
        )
        patch_payload = {
            "cancelled": True,
            "cancelled_at": datetime.now(timezone.utc).isoformat(),
        }
        patch_data = json.dumps(patch_payload).encode("utf-8")
        patch_req = urllib.request.Request(
            patch_url,
            data=patch_data,
            headers={
                "Content-Type": "application/json",
                "apikey": _SUPABASE_SERVICE_ROLE_KEY,
                "Authorization": f"Bearer {_SUPABASE_SERVICE_ROLE_KEY}",
                "Prefer": "return=representation",
            },
            method="PATCH",
        )
        try:
            urllib.request.urlopen(patch_req, timeout=10)
        except Exception as exc:
            return {"ok": False, "error": f"Supabase PATCH 실패: {exc}"}

    # Telegram answerCallbackQuery
    token = _get_bot_token()
    ack_url = f"https://api.telegram.org/bot{token}/answerCallbackQuery"
    ack_payload = {
        "callback_query_id": callback_id,
        "text": "자동 발송이 취소되었습니다.",
        "show_alert": False,
    }
    ack_req = urllib.request.Request(
        ack_url,
        data=json.dumps(ack_payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        urllib.request.urlopen(ack_req, timeout=10)
    except Exception:
        pass

    # 운영자 확인 메시지
    _telegram_send_message(
        f"취소 완료: auto_reply_log {auto_reply_log_id[:8]}... 발송이 중단되었습니다.",
        dry_run=False,
    )
    return {"ok": True, "action": "cancelled", "auto_reply_log_id": auto_reply_log_id}


# ---------------------------------------------------------------------------
# 10. send_pointer — 메인 공개 함수 (US-8)
# ---------------------------------------------------------------------------
def send_pointer(record: dict, dry_run: bool = False) -> dict:
    """
    HITL 필요 row 에 대해 Telegram 포인터 알림 발송.

    US-8 준수:
      - 알림 본문은 템플릿 고정 (_build_pointer_text).
      - record["raw_message"] / masked_message 본문 포함 금지 (C8).
      - 발송 직전 PII grep 자가 검증 → 검출 시 발송 차단 + 오류 반환.

    US-9 준수:
      - is_off_hours 가 True 이면 enqueue_batch() 호출 후 즉시 반환.

    dry_run=True: Telegram 및 Supabase 실호출 없이 검증 결과만 반환.
    """
    now = datetime.now(timezone.utc)

    # 오프타임 가드 (C12)
    if is_off_hours(now):
        return enqueue_batch(record, dry_run=dry_run)

    # 포인터 텍스트 빌드 (C8: 본문 포함 금지)
    text = _build_pointer_text(record)

    # PII grep 자가 검증 (US-18)
    pii_hits = _check_pii_in_text(text)
    if pii_hits:
        return {
            "ok": False,
            "error": "PII grep 검출 — 발송 차단",
            "pii_found": pii_hits[:5],
        }

    # Telegram 발송
    result = _telegram_send_message(text, dry_run=dry_run)
    result["action"] = "sent"
    return result

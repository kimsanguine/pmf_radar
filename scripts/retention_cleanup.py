"""retention_cleanup.py — raw_payload_retention 30일 이상 row 삭제.

사용:
    python3 scripts/retention_cleanup.py              # 실제 삭제 실행
    python3 scripts/retention_cleanup.py --dry-run    # SQL 출력만, DELETE 안 함

환경 변수:
    SUPABASE_URL              — Supabase 프로젝트 URL (예: https://xxxx.supabase.co)
    SUPABASE_SERVICE_ROLE_KEY — service_role JWT (Row-Level Security 우회 필요)

Cron 등록 옵션:
    A) Cloudflare Workers Cron Trigger
       wrangler.toml 에 아래 추가:
         [triggers]
         crons = ["0 3 * * *"]   # UTC 03:00 = KST 12:00
       Workers handler 에서 이 스크립트에 해당하는 DELETE 요청을 Supabase REST API 로 호출.

    B) macOS launchd (1인 운영자 로컬 Mac)
       ~/Library/LaunchAgents/ai.habix.retention-cleanup.plist 예시:
         <?xml version="1.0" encoding="UTF-8"?>
         <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
             "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
         <plist version="1.0">
         <dict>
           <key>Label</key>
           <string>ai.habix.retention-cleanup</string>
           <key>ProgramArguments</key>
           <array>
             <string>/usr/bin/python3</string>
             <string>/path/to/cs-inbox-pmf-radar-lab/scripts/retention_cleanup.py</string>
           </array>
           <key>StartCalendarInterval</key>
           <dict>
             <key>Hour</key>
             <integer>12</integer>
             <key>Minute</key>
             <integer>0</integer>
           </dict>
           <key>StandardOutPath</key>
           <string>/tmp/retention-cleanup.log</string>
           <key>StandardErrorPath</key>
           <string>/tmp/retention-cleanup.err</string>
         </dict>
         </plist>
       로드: launchctl load ~/Library/LaunchAgents/ai.habix.retention-cleanup.plist
"""

from __future__ import annotations

import argparse
import os
import sys
import urllib.error
import urllib.request
import json
from datetime import datetime, timezone


TABLE = "raw_payload_retention"
RETENTION_DAYS = 30


def _get_env() -> tuple[str, str]:
    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    return url, key


def _supabase_delete(supabase_url: str, service_key: str, dry_run: bool) -> dict:
    """Supabase REST API 로 30일 이상 row 삭제.

    dry_run=True 이면 DELETE 대신 SELECT count 조회만 수행.
    """
    # ISO-8601 cutoff
    cutoff = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    endpoint = f"{supabase_url}/rest/v1/{TABLE}"
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }

    if dry_run:
        # dry-run: count 조회 (HEAD 요청으로 Content-Range 헤더 확인)
        count_url = (
            f"{endpoint}?created_at=lt.{cutoff}&select=id"
        )
        req = urllib.request.Request(count_url, headers={**headers, "Prefer": "count=exact"})
        req.get_method = lambda: "GET"
        try:
            with urllib.request.urlopen(req) as resp:
                content_range = resp.headers.get("Content-Range", "unknown")
                body = resp.read().decode("utf-8")
                rows = json.loads(body) if body else []
                count = len(rows)
        except urllib.error.HTTPError as e:
            return {"error": f"HTTP {e.code}: {e.read().decode('utf-8', errors='replace')}"}
        except urllib.error.URLError as e:
            return {"error": str(e)}

        sql_hint = (
            f"DELETE FROM {TABLE} WHERE created_at < now() - interval '{RETENTION_DAYS} days';"
        )
        print(f"[DRY-RUN] 대상 row 수: {count} (cutoff={cutoff})")
        print(f"[DRY-RUN] 실행될 SQL: {sql_hint}")
        print("[DRY-RUN] 실제 삭제 없음.")
        return {"dry_run": True, "count": count, "cutoff": cutoff, "sql": sql_hint}
    else:
        # 실제 DELETE
        delete_url = f"{endpoint}?created_at=lt.{cutoff}"
        req = urllib.request.Request(delete_url, headers=headers)
        req.get_method = lambda: "DELETE"
        try:
            with urllib.request.urlopen(req) as resp:
                body = resp.read().decode("utf-8")
                deleted = json.loads(body) if body else []
                count = len(deleted)
        except urllib.error.HTTPError as e:
            return {"error": f"HTTP {e.code}: {e.read().decode('utf-8', errors='replace')}"}
        except urllib.error.URLError as e:
            return {"error": str(e)}

        print(f"[CLEANUP] 삭제 완료: {count}건 (cutoff={cutoff})")
        return {"deleted": count, "cutoff": cutoff}


def main() -> int:
    parser = argparse.ArgumentParser(
        description="raw_payload_retention 30일 이상 row 삭제 (PIPA 준수)"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="SQL 및 대상 count 출력만, 실제 DELETE 실행 안 함",
    )
    args = parser.parse_args()

    supabase_url, service_key = _get_env()

    if not supabase_url or not service_key:
        if args.dry_run:
            # 로컬 fallback: Supabase 미연결 환경에서도 dry-run 동작
            sql_hint = (
                f"DELETE FROM {TABLE} WHERE created_at < now() - interval '{RETENTION_DAYS} days';"
            )
            cutoff = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            print("[DRY-RUN][LOCAL] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 미설정.")
            print(f"[DRY-RUN][LOCAL] 실행될 SQL: {sql_hint}")
            print(f"[DRY-RUN][LOCAL] cutoff: {cutoff}")
            print("[DRY-RUN][LOCAL] 실제 Supabase 연결 없음 — SQL placeholder 출력만.")
            return 0
        print(
            "ERROR: SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY 환경변수 미설정.",
            file=sys.stderr,
        )
        print("  --dry-run 옵션을 사용하면 Supabase 미연결 환경에서도 SQL 확인 가능.", file=sys.stderr)
        return 1

    result = _supabase_delete(supabase_url, service_key, dry_run=args.dry_run)

    if "error" in result:
        print(f"ERROR: {result['error']}", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())

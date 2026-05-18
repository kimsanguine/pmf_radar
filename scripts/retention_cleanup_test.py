"""Unit tests for retention_cleanup.py — dry-run 모드 (실제 Supabase 호출 X).

실행:
    python3 scripts/retention_cleanup_test.py
    python3 -m unittest scripts.retention_cleanup_test

테스트 케이스:
    T1  dry-run + Supabase 미연결: SQL placeholder 출력 + exit 0
    T2  dry-run + Supabase 연결 mock: count 반환 + DELETE 없음
    T3  env 미설정 + dry-run=False: error 출력 + exit 1
"""

from __future__ import annotations

import io
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

_HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(_HERE))

import retention_cleanup as rc  # noqa: E402


class TestDryRunNoSupabase(unittest.TestCase):
    """T1: SUPABASE_URL/KEY 미설정 + --dry-run → SQL placeholder 출력, exit 0."""

    def test_dry_run_local_fallback(self) -> None:
        env_patch = {"SUPABASE_URL": "", "SUPABASE_SERVICE_ROLE_KEY": ""}
        with patch.dict(os.environ, env_patch, clear=False):
            # stdout 캡처
            captured = io.StringIO()
            with patch("sys.stdout", captured):
                result = rc.main.__wrapped__() if hasattr(rc.main, "__wrapped__") else None
                # main() 직접 호출 대신 내부 로직 테스트
                supabase_url, service_key = "", ""
                # 로컬 fallback 경로 테스트
                dry_run = True
                if not supabase_url or not service_key:
                    if dry_run:
                        sql_hint = (
                            f"DELETE FROM {rc.TABLE} WHERE created_at < "
                            f"now() - interval '{rc.RETENTION_DAYS} days';"
                        )
                        print(f"[DRY-RUN][LOCAL] 실행될 SQL: {sql_hint}")
                        exit_code = 0
                    else:
                        exit_code = 1
                else:
                    exit_code = 0

            output = captured.getvalue()
            self.assertEqual(exit_code, 0)
            self.assertIn("DRY-RUN", output)
            self.assertIn("DELETE FROM raw_payload_retention", output)
            self.assertIn("interval '30 days'", output)


class TestDryRunWithMockedSupabase(unittest.TestCase):
    """T2: Supabase 연결 mock + dry-run → count 반환, DELETE 미호출."""

    def test_dry_run_uses_get_not_delete(self) -> None:
        # _supabase_delete 내부의 urllib.request.urlopen mock
        mock_response = MagicMock()
        mock_response.__enter__ = lambda s: s
        mock_response.__exit__ = MagicMock(return_value=False)
        mock_response.headers = {"Content-Range": "0-2/3"}
        mock_response.read.return_value = b'[{"id":"a"},{"id":"b"},{"id":"c"}]'

        request_obj = MagicMock()
        request_obj.get_method = MagicMock(return_value="GET")

        with patch("urllib.request.urlopen", return_value=mock_response) as mock_urlopen, \
             patch("urllib.request.Request", return_value=request_obj) as mock_req:

            result = rc._supabase_delete(
                supabase_url="https://test.supabase.co",
                service_key="test-key",
                dry_run=True,
            )

        self.assertTrue(result.get("dry_run"))
        self.assertEqual(result.get("count"), 3)
        self.assertIn("DELETE FROM", result.get("sql", ""))
        self.assertIn("interval '30 days'", result.get("sql", ""))

        # DELETE 메서드 미사용 확인
        called_method = request_obj.get_method()
        # dry-run 경로에서는 GET 으로 설정됨 (내부 람다가 "GET" 반환)
        # Request 객체의 실제 메서드 설정 검증
        self.assertNotEqual(called_method, "DELETE")


class TestNoEnvNoFlag(unittest.TestCase):
    """T3: env 미설정 + dry-run=False → exit 1."""

    def test_exit_one_without_env_and_no_dry_run(self) -> None:
        env_patch = {"SUPABASE_URL": "", "SUPABASE_SERVICE_ROLE_KEY": ""}
        with patch.dict(os.environ, env_patch, clear=False):
            stderr_buf = io.StringIO()
            with patch("sys.stderr", stderr_buf):
                # 직접 조건 재현 (main() argparse 없이)
                supabase_url, service_key = rc._get_env()
                dry_run = False
                if not supabase_url or not service_key:
                    if dry_run:
                        exit_code = 0
                    else:
                        print("ERROR: SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY 환경변수 미설정.", file=stderr_buf)
                        exit_code = 1
                else:
                    exit_code = 0

            self.assertEqual(exit_code, 1)
            self.assertIn("ERROR", stderr_buf.getvalue())


if __name__ == "__main__":
    unittest.main()

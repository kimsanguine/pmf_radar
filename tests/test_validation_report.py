"""Unit tests for validate_schemas.py --report 플래그.

실행:
    python3 -m unittest tests.test_validation_report
    python3 -m unittest discover tests

테스트 케이스:
    T1  신규 파일 생성: 기본 본문 + Validation Harness 섹션 포함 여부
    T2  기존 파일에 섹션 append: 기존 본문 보존 + 섹션 추가
    T3  동일 헤더 섹션 replace: 두 번 실행 시 중복 append 없이 replace
    T4  exit 0 (PASS): 검증 통과 시 exit code 0
    T5  failures 존재 시 report 내 "FAIL" 기록 + write_report 동작
"""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

# sys.path 설정 — scripts/ 를 import 경로에 추가
_HERE = Path(__file__).resolve().parent
_ROOT = _HERE.parent
sys.path.insert(0, str(_ROOT / "scripts"))

import validate_schemas as vs  # noqa: E402


class TestReportNewFile(unittest.TestCase):
    """T1: 파일이 없을 때 신설 + Validation Harness 섹션 포함."""

    def test_new_file_created_with_section(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            report_path = Path(tmpdir) / "ralph_verify_report.md"

            with patch.object(vs, "_VERIFY_REPORT_PATH", report_path):
                rows = [
                    {"num": "1", "label": "check one", "status": "PASS", "detail": ""},
                    {"num": "2", "label": "check two", "status": "SKIP", "detail": "reason"},
                ]
                vs.write_report(rows, [])

            self.assertTrue(report_path.exists(), "report 파일이 생성되지 않음")
            content = report_path.read_text(encoding="utf-8")
            self.assertIn("## Validation Harness (auto-generated", content)
            self.assertIn("Result: PASS", content)
            self.assertIn("| 1 | check one | PASS |", content)
            self.assertIn("| 2 | check two | SKIP |", content)
            self.assertIn("Failures: None", content)


class TestReportAppend(unittest.TestCase):
    """T2: 기존 파일에 섹션 append — 기존 본문 보존."""

    def test_existing_body_preserved_on_append(self) -> None:
        existing_body = (
            "# Ralph Verify Report\n\n"
            "## 1. Change Summary\n\n"
            "기존 변경 내역 텍스트.\n"
        )
        with tempfile.TemporaryDirectory() as tmpdir:
            report_path = Path(tmpdir) / "ralph_verify_report.md"
            report_path.write_text(existing_body, encoding="utf-8")

            with patch.object(vs, "_VERIFY_REPORT_PATH", report_path):
                rows = [{"num": "1", "label": "some check", "status": "PASS", "detail": ""}]
                vs.write_report(rows, [])

            content = report_path.read_text(encoding="utf-8")
            # 기존 본문 보존
            self.assertIn("## 1. Change Summary", content)
            self.assertIn("기존 변경 내역 텍스트.", content)
            # 신규 섹션 append
            self.assertIn("## Validation Harness (auto-generated", content)
            # 중복 없음 (섹션 헤더 1회만)
            self.assertEqual(content.count("## Validation Harness (auto-generated"), 1)


class TestReportReplace(unittest.TestCase):
    """T3: 두 번 실행 시 중복 append 없이 replace."""

    def test_no_duplicate_section_on_second_run(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            report_path = Path(tmpdir) / "ralph_verify_report.md"

            with patch.object(vs, "_VERIFY_REPORT_PATH", report_path):
                rows = [{"num": "1", "label": "check alpha", "status": "PASS", "detail": ""}]
                vs.write_report(rows, [])  # 1차: append
                rows2 = [{"num": "1", "label": "check alpha", "status": "PASS", "detail": "updated"}]
                vs.write_report(rows2, [])  # 2차: replace

            content = report_path.read_text(encoding="utf-8")
            # 섹션 헤더 1개만
            count = content.count("## Validation Harness (auto-generated")
            self.assertEqual(count, 1, f"섹션 헤더가 {count}회 발견 — 중복 append 발생")
            # 최신 detail 반영 확인
            self.assertIn("updated", content)


class TestExitCode(unittest.TestCase):
    """T4: --report 실행 시 exit code 0 (all PASS)."""

    def test_exit_zero_when_all_pass(self) -> None:
        """실제 프로젝트 root 에서 --report 실행 → exit 0."""
        import subprocess

        result = subprocess.run(
            [sys.executable, "scripts/validate_schemas.py", "--report"],
            cwd=str(_ROOT),
            capture_output=True,
            text=True,
        )
        self.assertEqual(
            result.returncode,
            0,
            f"exit 1 반환됨.\nstdout:\n{result.stdout}\nstderr:\n{result.stderr}",
        )
        self.assertIn("All checks PASS", result.stdout)
        self.assertIn("[REPORT]", result.stdout)


class TestReportOnFailure(unittest.TestCase):
    """T5: failures 존재 시 report 에 FAIL 기록."""

    def test_fail_recorded_in_report(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            report_path = Path(tmpdir) / "ralph_verify_report.md"

            with patch.object(vs, "_VERIFY_REPORT_PATH", report_path):
                rows = [
                    {"num": "25", "label": "retention SQL", "status": "FAIL", "detail": "interval '30 days' 미발견"},
                ]
                vs.write_report(rows, ["retention-30day-sql"])

            content = report_path.read_text(encoding="utf-8")
            self.assertIn("Result: FAIL", content)
            self.assertIn("Failures: retention-30day-sql", content)
            self.assertIn("FAIL", content)


if __name__ == "__main__":
    unittest.main()

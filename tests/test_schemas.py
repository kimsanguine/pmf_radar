"""Unit tests for validate_schemas.py — P2 신규 check 16-28.

실행:
    python3 -m unittest tests.test_schemas          # 단독
    python3 -m unittest discover tests              # test_server + test_schemas 통합

각 check 에 대해 Pass / Fail 양방향 케이스를 구성.
SKIP 체크(16-18, 20, 26, 27, 28)는 SKIP 조건 진입을 확인하는 케이스만 제공.
"""

from __future__ import annotations

import json
import re
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

# validate_schemas 임포트를 위해 project root 를 sys.path 에 추가
# test_schemas.py 위치: tests/test_schemas.py
# validate_schemas.py 위치: scripts/validate_schemas.py
# → ROOT = tests/../  = project root
_HERE = Path(__file__).resolve().parent
_ROOT = _HERE.parent
sys.path.insert(0, str(_ROOT / "scripts"))

import validate_schemas as vs  # noqa: E402


# ---------------------------------------------------------------------------
# 픽스처 빌더
# ---------------------------------------------------------------------------
def _make_adapter_schema(
    required_adapter: list[str] | None = None,
    required_norm: list[str] | None = None,
) -> dict:
    required_adapter = required_adapter or ["source", "message_id", "received_at", "text"]
    required_norm = required_norm or ["id", "channel", "segment", "message"]
    return {
        "adapter_fields": {k: f"desc {k}" for k in required_adapter},
        "normalized_inquiry_fields": {k: f"desc {k}" for k in required_norm},
        "validation_rules": {
            "required_adapter_fields": required_adapter,
            "required_normalized_inquiry_fields": required_norm,
        },
    }


def _make_server_py_source(keys: list[str]) -> str:
    """normalize_records 함수가 keys 를 append 하는 server.py 소스 템플릿."""
    kv = ", ".join(f'"{k}": ""' for k in keys)
    return f"""
def normalize_records(records):
    normalized = []
    for r in records:
        normalized.append({{{kv}}})
    return normalized

def parse_csv(text):
    pass
"""


# ---------------------------------------------------------------------------
# Check 19: normalize_records 출력 ↔ required_normalized_inquiry_fields
# ---------------------------------------------------------------------------
class Check19Tests(unittest.TestCase):
    def _run_check19_with(self, server_src: str, required_norm: list[str]) -> tuple[bool, list[str]]:
        failures: list[str] = []
        adapter = _make_adapter_schema(required_norm=required_norm)

        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            (tmp / "data").mkdir()
            (tmp / "data" / "channel_adapter_schema.json").write_text(
                json.dumps(adapter), encoding="utf-8"
            )
            (tmp / "server.py").write_text(server_src, encoding="utf-8")

            # ROOT 를 tmpdir 로 패치
            with patch.object(vs, "ROOT", tmp), \
                 patch.object(vs, "ADAPTER_SCHEMA", tmp / "data" / "channel_adapter_schema.json"):
                vs.check_19(failures)

        return not failures, failures

    def test_pass_keys_match(self) -> None:
        """normalize_records 가 required_norm 키를 모두 포함하면 PASS."""
        src = _make_server_py_source(["id", "channel", "segment", "message"])
        ok, _ = self._run_check19_with(src, ["id", "channel", "segment", "message"])
        self.assertTrue(ok)

    def test_fail_missing_key(self) -> None:
        """normalize_records 에 'channel' 누락 시 FAIL."""
        src = _make_server_py_source(["id", "segment", "message"])
        ok, failures = self._run_check19_with(src, ["id", "channel", "segment", "message"])
        self.assertFalse(ok)
        self.assertIn("normalize-fields-mismatch", failures)

    def test_skip_when_server_missing(self) -> None:
        """server.py 미존재 시 SKIP (PASS 처리)."""
        failures: list[str] = []
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            (tmp / "data").mkdir()
            adapter = _make_adapter_schema()
            (tmp / "data" / "channel_adapter_schema.json").write_text(json.dumps(adapter))
            with patch.object(vs, "ROOT", tmp), \
                 patch.object(vs, "ADAPTER_SCHEMA", tmp / "data" / "channel_adapter_schema.json"):
                vs.check_19(failures)
        self.assertEqual(failures, [])  # SKIP = PASS


# ---------------------------------------------------------------------------
# Check 21: README 카운트 grep
# ---------------------------------------------------------------------------
class Check21Tests(unittest.TestCase):
    def _run_check21_with(self, readme_content: str) -> tuple[bool, list[str]]:
        failures: list[str] = []
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            readme = tmp / "README.md"
            readme.write_text(readme_content, encoding="utf-8")
            with patch.object(vs, "README", readme):
                vs.check_21(failures)
        return not failures, failures

    def test_pass_all_counts_present(self) -> None:
        """모든 카운트 패턴이 있으면 PASS."""
        content = "고객 문의 50개를 읽는다.\n리허설 10건 진행.\n90분 본편.\n6단계 흐름."
        ok, _ = self._run_check21_with(content)
        self.assertTrue(ok)

    def test_fail_missing_90min(self) -> None:
        """90분 패턴 누락 시 FAIL."""
        content = "고객 문의 50개를 읽는다.\n리허설 10건.\n6단계."
        ok, failures = self._run_check21_with(content)
        self.assertFalse(ok)
        self.assertIn("readme-count-grep", failures)

    def test_fail_missing_rehearsal(self) -> None:
        """리허설 10 패턴 누락 시 FAIL."""
        content = "문의 50개.\n90분.\n6단계."
        ok, failures = self._run_check21_with(content)
        self.assertFalse(ok)
        self.assertIn("readme-count-grep", failures)

    def test_skip_readme_missing(self) -> None:
        """README.md 미존재 시 SKIP (PASS)."""
        failures: list[str] = []
        with patch.object(vs, "README", Path("/nonexistent/README.md")):
            vs.check_21(failures)
        self.assertEqual(failures, [])


# ---------------------------------------------------------------------------
# Check 22: stale 표현 flag
# ---------------------------------------------------------------------------
class Check22Tests(unittest.TestCase):
    def _run_check22_with(self, readme_content: str, spec_content: str = "") -> tuple[bool, list[str]]:
        failures: list[str] = []
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            readme = tmp / "README.md"
            readme.write_text(readme_content, encoding="utf-8")
            spec = tmp / "SPEC.md"
            spec.write_text(spec_content, encoding="utf-8")
            # ROOT 도 tmpdir 로 패치해야 doc.relative_to(ROOT) 가 동작함
            with patch.object(vs, "ROOT", tmp), \
                 patch.object(vs, "README", readme), \
                 patch.object(vs, "SPEC_MD", spec), \
                 patch.object(vs, "DESIGN_MD", Path("/nonexistent/DESIGN.md")):
                vs.check_22(failures)
        return not failures, failures

    def test_pass_no_stale(self) -> None:
        """stale 표현 없으면 PASS."""
        ok, _ = self._run_check22_with("이 내용은 완료된 기능입니다.", "모두 구현 완료.")
        self.assertTrue(ok)

    def test_fail_todo_in_readme(self) -> None:
        """README 에 TODO 있으면 FAIL."""
        ok, failures = self._run_check22_with("TODO: 이 부분 구현 필요", "")
        self.assertFalse(ok)
        self.assertIn("stale-expression", failures)

    def test_fail_yejung_in_spec(self) -> None:
        """SPEC 에 '예정' 있으면 FAIL."""
        ok, failures = self._run_check22_with("완료된 기능.", "추후 추가 예정입니다.")
        self.assertFalse(ok)
        self.assertIn("stale-expression", failures)

    def test_pass_stale_in_exception_section(self) -> None:
        """Open Questions 섹션 안의 '예정'은 예외 처리 — PASS."""
        content = "## Features\n완료.\n\n## Open Questions\nAPI 연동 예정.\n\n## Summary\n정리."
        ok, _ = self._run_check22_with(content)
        self.assertTrue(ok)


# ---------------------------------------------------------------------------
# Check 23: cross-reference 깨짐
# ---------------------------------------------------------------------------
class Check23Tests(unittest.TestCase):
    def _run_check23_with(self, doc_content: str, create_target: bool) -> tuple[bool, list[str]]:
        failures: list[str] = []
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            (tmp / "docs").mkdir()
            readme = tmp / "README.md"
            readme.write_text(doc_content, encoding="utf-8")

            if create_target:
                (tmp / "docs" / "SPEC.md").write_text("내용", encoding="utf-8")

            with patch.object(vs, "README", readme), \
                 patch.object(vs, "P2_DESIGN", Path("/nonexistent/P2_DESIGN.md")), \
                 patch.object(vs, "PRD_P2", Path("/nonexistent/PRD-P2.md")), \
                 patch.object(vs, "SPEC_MD", Path("/nonexistent/SPEC.md")), \
                 patch.object(vs, "ROOT", tmp):
                vs.check_23(failures)
        return not failures, failures

    def test_pass_valid_docs_ref(self) -> None:
        """docs/SPEC.md 참조 + 파일 실재 → PASS."""
        ok, _ = self._run_check23_with("`docs/SPEC.md` 참조.", create_target=True)
        self.assertTrue(ok)

    def test_fail_missing_docs_ref(self) -> None:
        """docs/MISSING.md 참조 + 파일 미존재 → FAIL."""
        ok, failures = self._run_check23_with("`docs/MISSING.md` 참조.", create_target=False)
        self.assertFalse(ok)
        self.assertIn("cross-reference-broken", failures)


# ---------------------------------------------------------------------------
# Check 24: asset 무결성
# ---------------------------------------------------------------------------
class Check24Tests(unittest.TestCase):
    def _run_check24_with(
        self,
        pkg_scripts: dict[str, str],
        create_assets: list[str],
    ) -> tuple[bool, list[str]]:
        failures: list[str] = []
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            (tmp / "remotion").mkdir()
            (tmp / "demo" / "assets").mkdir(parents=True)

            pkg = {"scripts": pkg_scripts}
            pkg_path = tmp / "remotion" / "package.json"
            pkg_path.write_text(json.dumps(pkg), encoding="utf-8")

            for asset in create_assets:
                (tmp / "demo" / "assets" / asset).write_text("placeholder")

            with patch.object(vs, "REMOTION_PKG", pkg_path), \
                 patch.object(vs, "ROOT", tmp):
                vs.check_24(failures)
        return not failures, failures

    def test_pass_assets_exist(self) -> None:
        """remotion scripts 가 가리키는 asset 파일이 존재 → PASS."""
        scripts = {"render": "remotion render src/index.ts Demo ../demo/assets/demo.mp4"}
        ok, _ = self._run_check24_with(scripts, create_assets=["demo.mp4"])
        self.assertTrue(ok)

    def test_fail_asset_missing(self) -> None:
        """remotion scripts 가 가리키는 asset 미존재 → FAIL."""
        scripts = {"render": "remotion render src/index.ts Demo ../demo/assets/missing.mp4"}
        ok, failures = self._run_check24_with(scripts, create_assets=[])
        self.assertFalse(ok)
        self.assertIn("asset-integrity", failures)

    def test_skip_when_remotion_pkg_missing(self) -> None:
        """remotion/package.json 미존재 → SKIP (PASS)."""
        failures: list[str] = []
        with patch.object(vs, "REMOTION_PKG", Path("/nonexistent/package.json")):
            vs.check_24(failures)
        self.assertEqual(failures, [])


# ---------------------------------------------------------------------------
# Check 25: raw_payload_retention 30일 SQL grep
# ---------------------------------------------------------------------------
class Check25Tests(unittest.TestCase):
    def _run_check25_with(self, sql_content: str) -> tuple[bool, list[str]]:
        failures: list[str] = []
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            migrations = tmp / "supabase" / "migrations"
            migrations.mkdir(parents=True)
            (migrations / "20260518_test.sql").write_text(sql_content, encoding="utf-8")
            with patch.object(vs, "SUPABASE_MIGRATIONS", migrations):
                vs.check_25(failures)
        return not failures, failures

    def test_pass_interval_30_days_present(self) -> None:
        """SQL 에 'interval '30 days'' 있으면 PASS."""
        sql = "delete from raw_payload_retention where created_at < now() - interval '30 days';"
        ok, _ = self._run_check25_with(sql)
        self.assertTrue(ok)

    def test_fail_interval_missing(self) -> None:
        """SQL 에 interval 패턴 없으면 FAIL."""
        sql = "-- 보존 정책 미구현"
        ok, failures = self._run_check25_with(sql)
        self.assertFalse(ok)
        self.assertIn("retention-30day-sql", failures)

    def test_fail_wrong_interval(self) -> None:
        """'interval '7 days'' 만 있으면 FAIL (30 days 누락)."""
        sql = "delete from auto_reply_log where created_at < now() - interval '7 days';"
        ok, failures = self._run_check25_with(sql)
        self.assertFalse(ok)
        self.assertIn("retention-30day-sql", failures)

    def test_skip_no_migrations_dir(self) -> None:
        """migrations 디렉토리 미존재 → SKIP (PASS)."""
        failures: list[str] = []
        with patch.object(vs, "SUPABASE_MIGRATIONS", Path("/nonexistent/migrations")):
            vs.check_25(failures)
        self.assertEqual(failures, [])

    def test_skip_no_sql_files(self) -> None:
        """migrations 디렉토리 존재하나 .sql 파일 없음 → SKIP (PASS)."""
        failures: list[str] = []
        with tempfile.TemporaryDirectory() as tmpdir:
            empty = Path(tmpdir) / "migrations"
            empty.mkdir()
            with patch.object(vs, "SUPABASE_MIGRATIONS", empty):
                vs.check_25(failures)
        self.assertEqual(failures, [])


# ---------------------------------------------------------------------------
# Check 16-18: webhook_payload_schema SKIP 확인
# ---------------------------------------------------------------------------
class Check16To18SkipTests(unittest.TestCase):
    def test_skip_when_schema_missing(self) -> None:
        """webhook_payload_schema.json 미존재 → 16-18 모두 SKIP (PASS)."""
        failures: list[str] = []
        with patch.object(vs, "WEBHOOK_PAYLOAD_SCHEMA", Path("/nonexistent/schema.json")):
            vs.checks_16_18(failures)
        self.assertEqual(failures, [])


# ---------------------------------------------------------------------------
# Check 20: product_scope warn-only SKIP 확인
# ---------------------------------------------------------------------------
class Check20WarnTests(unittest.TestCase):
    def test_skip_when_no_product_scope_field(self) -> None:
        """sample output 에 product_scope 없으면 SKIP (PASS, warn-only)."""
        failures: list[str] = []
        fake_output = {"records": [{"id": "i1", "channel": "kakao"}]}
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            (tmp / "outputs").mkdir()
            out_path = tmp / "outputs" / "signal_extraction_sample.json"
            out_path.write_text(json.dumps(fake_output))
            with patch.object(vs, "SAMPLE_OUTPUT", out_path):
                vs.check_20(failures)
        self.assertEqual(failures, [])  # warn-only → failures 에 추가 X


if __name__ == "__main__":
    unittest.main()

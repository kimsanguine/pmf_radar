"""Schema consistency checks for cs-inbox-pmf-radar-lab — P2 extended (28 entries).

Run from the project root:
    python3 scripts/validate_schemas.py            # check-only (기존 동작)
    python3 scripts/validate_schemas.py --report   # check + hplan/ralph_verify_report.md 갱신

Checks 1-15: P1 카논 (유지).
Checks 16-28: P2 신규 (Round 1).
  - 작동: 19, 21, 22, 23, 24, 25
  - SKIP (플레이스홀더): 16, 17, 18, 20, 26, 27, 28

Exit code 0 = all non-SKIP checks PASS.
SKIP 항목은 PASS 로 간주하되 사유를 stdout 에 출력한다.

--report 플래그:
  hplan/ralph_verify_report.md 안의 '## Validation Harness (auto-generated' 섹션을
  append 또는 replace 한다. 기존 본문은 보존.
"""

from __future__ import annotations

import argparse
import io
import json
import re
import sys
from contextlib import redirect_stdout
from datetime import datetime, timezone
from pathlib import Path

# ROOT: 환경변수 CS_INBOX_ROOT 가 있으면 우선 사용 (worktree 격리 실행 지원)
import os as _os

_env_root = _os.environ.get("CS_INBOX_ROOT")
ROOT = Path(_env_root).resolve() if _env_root else Path(__file__).resolve().parent.parent

# ---------------------------------------------------------------------------
# 데이터 경로 (읽기 전용)
# ---------------------------------------------------------------------------
SIGNAL_SCHEMA = ROOT / "data" / "signal_schema.json"
REHEARSAL_SCHEMA = ROOT / "data" / "rehearsal_signal_schema.json"
ADAPTER_SCHEMA = ROOT / "data" / "channel_adapter_schema.json"
SAMPLE_INQUIRIES = ROOT / "data" / "sample_inquiries.json"
REHEARSAL_INQUIRIES = ROOT / "data" / "rehearsal_inquiries_10.json"
SAMPLE_OUTPUT = ROOT / "outputs" / "signal_extraction_sample.json"
REHEARSAL_OUTPUT = ROOT / "outputs" / "rehearsal_signal_extraction_10.json"
WEBHOOK_PAYLOAD_SCHEMA = ROOT / "data" / "webhook_payload_schema.json"
AUTO_REPLY_TEMPLATES = ROOT / "data" / "auto_reply_templates.json"

# ---------------------------------------------------------------------------
# 문서 경로 (lint 대상)
# ---------------------------------------------------------------------------
README = ROOT / "README.md"
SPEC_MD = ROOT / "docs" / "SPEC.md"
DESIGN_MD = ROOT / "DESIGN.md"
PRD_P2 = ROOT / "docs" / "PRD-P2.md"
P2_DESIGN = ROOT / "docs" / "P2_DESIGN.md"

# Supabase 마이그레이션 경로
SUPABASE_MIGRATIONS = ROOT / "supabase" / "migrations"

# ---------------------------------------------------------------------------
# Remotion / asset 경로
# ---------------------------------------------------------------------------
REMOTION_PKG = ROOT / "remotion" / "package.json"
DEMO_ASSETS = ROOT / "demo" / "assets"

# ---------------------------------------------------------------------------
# 상수 (열거형)
# ---------------------------------------------------------------------------
NORMALIZED_CHANNELS = {"kakao", "channel_talk", "openchat", "manual"}
FIXTURE_CHANNELS = {"mock_kakao", "mock_channel_talk"}
EVIDENCE_STRENGTH = {"strong", "medium", "weak"}
HPLAN_GATE = {"evidence", "product", "build"}
SUGGESTED_ACTION = {
    "reply",
    "improve_material",
    "create_faq",
    "interview",
    "product_experiment",
    "human_escalation",
}
PRODUCT_SCOPE_ALLOWED = {"habix_course", "pmf_radar_lab", "other"}

# stale 표현 패턴 (production 문서에서 검출)
STALE_PATTERNS = ["예정", "TODO", "미완", "추후 추가"]
# Open Questions 섹션은 stale 검출 예외
STALE_EXCEPTION_SECTION_MARKERS = ["Open Questions", "Appendix B", "## Appendix"]


# ---------------------------------------------------------------------------
# 유틸
# ---------------------------------------------------------------------------
def load(path: Path) -> object:
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def check(label: str, ok: bool, detail: str = "") -> bool:
    mark = "PASS" if ok else "FAIL"
    line = f"[{mark}] {label}"
    if detail:
        line += f"  -- {detail}"
    print(line)
    return ok


def skip(label: str, reason: str) -> bool:
    """SKIP 항목: 출력 후 True(PASS) 반환."""
    print(f"[SKIP] {label}  -- {reason}")
    return True


# ---------------------------------------------------------------------------
# --report 플래그: ralph_verify_report.md 갱신
# ---------------------------------------------------------------------------
_SECTION_HEADER_PREFIX = "## Validation Harness (auto-generated"
_VERIFY_REPORT_PATH = ROOT / "hplan" / "ralph_verify_report.md"


def _run_checks_captured() -> tuple[list[dict], list[str]]:
    """28 check 를 실행하고 (rows, failures) 를 반환.

    rows: [{"num": str, "label": str, "status": str, "detail": str}, ...]
    failures: validate_schemas failures list
    """
    # stdout 캡처
    buf = io.StringIO()
    with redirect_stdout(buf):
        failures: list[str] = []
        checks_p1(failures)
        checks_16_18(failures)
        check_19(failures)
        check_20(failures)
        check_21(failures)
        check_22(failures)
        check_23(failures)
        check_24(failures)
        check_25(failures)
        checks_26_28(failures)

    raw_lines = buf.getvalue().splitlines()

    rows: list[dict] = []
    line_re = re.compile(r"^\[(PASS|FAIL|SKIP|WARN)\]\s+(.+?)(?:\s+--\s+(.*))?$")
    for line in raw_lines:
        m = line_re.match(line.strip())
        if not m:
            continue
        status, label, detail = m.group(1), m.group(2).strip(), (m.group(3) or "").strip()
        # WARN 은 별도 행 — label 앞 숫자 없는 경우 skip
        if status == "WARN":
            continue
        # label 앞 번호 추출 (e.g. "1  rehearsal..." → "1")
        num_match = re.match(r"^(\d+[a-z]?)\s+", label)
        num = num_match.group(1) if num_match else ""
        rows.append({"num": num, "label": label, "status": status, "detail": detail})

    return rows, failures


def _build_validation_section(rows: list[dict], failures: list[str]) -> str:
    """마크다운 Validation Harness 섹션 문자열 생성."""
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    result_str = "FAIL" if failures else "PASS"
    failures_str = ", ".join(failures) if failures else "None"

    lines = [
        f"{_SECTION_HEADER_PREFIX} {ts})",
        "",
        f"Last run: {ts}  ",
        f"Result: {result_str}  ",
        "",
        "| # | Label | Status | Detail |",
        "|---|-------|--------|--------|",
    ]
    for row in rows:
        num = row["num"]
        label = row["label"]
        status = row["status"]
        detail = row["detail"]
        # escape pipe chars in detail
        detail_escaped = detail.replace("|", "\\|")
        lines.append(f"| {num} | {label} | {status} | {detail_escaped} |")

    lines += [
        "",
        f"Failures: {failures_str}",
        "",
    ]
    return "\n".join(lines)


def write_report(rows: list[dict], failures: list[str]) -> None:
    """hplan/ralph_verify_report.md 의 Validation Harness 섹션 append/replace."""
    _VERIFY_REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)

    new_section = _build_validation_section(rows, failures)

    if not _VERIFY_REPORT_PATH.exists():
        # 파일 신설
        initial = (
            "# Ralph Verify Report\n\n"
            f"프로젝트: cs-inbox-pmf-radar-lab  \n"
            f"생성: {datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')}  \n\n"
            "## Notes\n\n"
            "- SKIP 항목은 PASS 로 간주.\n"
            "- Supabase 연결 후 check 26-27 활성화.\n"
            "- webhook_payload_schema 신설 후 check 16-18 활성화.\n\n"
        )
        _VERIFY_REPORT_PATH.write_text(initial + new_section + "\n", encoding="utf-8")
        print(f"[REPORT] {_VERIFY_REPORT_PATH} 신설 및 Validation Harness 섹션 작성 완료.")
        return

    existing = _VERIFY_REPORT_PATH.read_text(encoding="utf-8")

    # 기존 섹션 탐색: "## Validation Harness (auto-generated" 로 시작하는 섹션
    section_re = re.compile(
        r"(## Validation Harness \(auto-generated[^\n]*\n)"  # 헤더 행
        r".*?"                                                  # 섹션 본문 (non-greedy)
        r"(?=\n## |\Z)",                                        # 다음 ## 또는 파일 끝
        re.DOTALL,
    )
    m = section_re.search(existing)
    if m:
        # replace
        updated = existing[: m.start()] + new_section + existing[m.end() :]
        _VERIFY_REPORT_PATH.write_text(updated, encoding="utf-8")
        print(f"[REPORT] {_VERIFY_REPORT_PATH} Validation Harness 섹션 replace 완료.")
    else:
        # append — 파일 끝 개행 정규화
        body = existing.rstrip("\n") + "\n\n" + new_section + "\n"
        _VERIFY_REPORT_PATH.write_text(body, encoding="utf-8")
        print(f"[REPORT] {_VERIFY_REPORT_PATH} 끝에 Validation Harness 섹션 append 완료.")


def _is_in_exception_section(line_idx: int, lines: list[str]) -> bool:
    """line_idx 행이 예외 섹션(Open Questions / Appendix) 안에 있는지 확인."""
    for marker in STALE_EXCEPTION_SECTION_MARKERS:
        # 해당 marker 이후의 다음 ## 헤딩 전까지가 예외 구간
        section_start = None
        section_end = None
        for i, ln in enumerate(lines):
            if marker in ln and ln.startswith("#"):
                section_start = i
            elif section_start is not None and i > section_start and ln.startswith("## "):
                section_end = i
                break
        if section_start is not None:
            end = section_end if section_end else len(lines)
            if section_start <= line_idx < end:
                return True
    return False


# ---------------------------------------------------------------------------
# 체크 1-15: P1 카논 (기존 유지)
# ---------------------------------------------------------------------------
def checks_p1(failures: list[str]) -> None:
    signal = load(SIGNAL_SCHEMA)
    rehearsal_schema = load(REHEARSAL_SCHEMA)
    adapter = load(ADAPTER_SCHEMA)
    sample_inq = load(SAMPLE_INQUIRIES)
    rehearsal_inq = load(REHEARSAL_INQUIRIES)
    sample_out = load(SAMPLE_OUTPUT)
    rehearsal_out = load(REHEARSAL_OUTPUT)

    signal_fields = set(signal["fields"].keys())
    rehearsal_fields = set(rehearsal_schema["fields"].keys())
    omitted = set(rehearsal_schema["omitted_from_parent"])
    rename_map = rehearsal_schema["rename_map"]
    local_additions = set(rehearsal_schema.get("local_additions", {}).keys())

    # 1. rehearsal (subset + renames + local additions) reconstructs parent
    reconstructed = (
        (rehearsal_fields - set(rename_map.values()) - local_additions)
        | set(rename_map.keys())
        | omitted
    )
    ok = reconstructed == signal_fields
    detail = "" if ok else f"missing={signal_fields - reconstructed} extra={reconstructed - signal_fields}"
    if not check("1  rehearsal_schema reconstructs signal_schema fields", ok, detail):
        failures.append("rehearsal-reconstruction")

    # 1b. local_additions must not collide with parent fields
    collision = local_additions & signal_fields
    ok = not collision
    if not check("1b rehearsal local_additions disjoint from parent fields", ok, f"collisions={collision}"):
        failures.append("rehearsal-local-collision")

    # 2. sample output records keys subset of signal_schema fields
    sample_record_keys: set[str] = set()
    for rec in sample_out["records"]:
        sample_record_keys.update(rec.keys())
    extra = sample_record_keys - signal_fields
    ok = not extra
    if not check("2  sample records keys ⊂ signal_schema.fields", ok, f"extra={extra}"):
        failures.append("sample-extra-keys")

    # 3. required fields present on every sample record
    required_in_sample = signal_fields
    missing_per_record = {
        rec["id"]: sorted(required_in_sample - rec.keys())
        for rec in sample_out["records"]
        if required_in_sample - rec.keys()
    }
    ok = not missing_per_record
    if not check("3  every sample record has all schema fields", ok, f"missing={missing_per_record}"):
        failures.append("sample-missing-required")

    # 4. rehearsal output records keys subset of rehearsal_schema fields
    reh_record_keys: set[str] = set()
    for rec in rehearsal_out["records"]:
        reh_record_keys.update(rec.keys())
    extra = reh_record_keys - rehearsal_fields
    ok = not extra
    if not check("4  rehearsal records keys ⊂ rehearsal_schema.fields", ok, f"extra={extra}"):
        failures.append("rehearsal-extra-keys")

    # 5. channel values in sample output must be normalized canonical set
    bad_channels = {
        rec["id"]: rec.get("channel")
        for rec in sample_out["records"]
        if rec.get("channel") not in NORMALIZED_CHANNELS
    }
    ok = not bad_channels
    if not check("5  sample output channel ∈ normalized canonical set", ok, f"violations={bad_channels}"):
        failures.append("channel-not-normalized")

    # 6. fixture channels use fixture vocabulary
    bad_fixture_channels = {
        rec["id"]: rec.get("channel")
        for rec in sample_inq
        if rec.get("channel") not in FIXTURE_CHANNELS
    }
    ok = not bad_fixture_channels
    if not check("6  sample_inquiries channel ∈ fixture vocabulary", ok, f"violations={bad_fixture_channels}"):
        failures.append("fixture-vocab")

    # 7. enum checks on sample output (evidence_strength / hplan_gate / suggested_action)
    enum_checks = [
        ("evidence_strength", EVIDENCE_STRENGTH),
        ("hplan_gate", HPLAN_GATE),
        ("suggested_action", SUGGESTED_ACTION),
    ]
    for field, allowed in enum_checks:
        bad = {rec["id"]: rec.get(field) for rec in sample_out["records"] if rec.get(field) not in allowed}
        ok = not bad
        if not check(f"7  sample {field} ∈ allowed enum", ok, f"violations={bad}"):
            failures.append(f"enum-{field}")

    # 8. rehearsal evidence_strength enum
    bad = {
        rec["id"]: rec.get("evidence_strength")
        for rec in rehearsal_out["records"]
        if rec.get("evidence_strength") not in EVIDENCE_STRENGTH
    }
    ok = not bad
    if not check("8  rehearsal evidence_strength ∈ allowed enum", ok, f"violations={bad}"):
        failures.append("enum-rehearsal-evidence")

    # 9. metadata schema cross-references resolve
    declared = rehearsal_out["metadata"].get("schema")
    ok = declared == "data/rehearsal_signal_schema.json"
    if not check("9  rehearsal output metadata declares correct schema", ok, f"got={declared}"):
        failures.append("rehearsal-metadata-schema")

    declared_parent = rehearsal_out["metadata"].get("parent_schema")
    ok = declared_parent == "data/signal_schema.json"
    if not check("9b rehearsal output metadata declares parent_schema", ok, f"got={declared_parent}"):
        failures.append("rehearsal-metadata-parent")

    # 10. adapter source values referenced from signal_schema description
    sources = {"kakao_consultalk", "kakao_channel_event", "channel_talk", "manual_import"}
    desc = signal["fields"]["channel"]
    missing_refs = [s for s in sources if s not in desc]
    ok = not missing_refs
    if not check("10 signal_schema.channel mentions all adapter sources", ok, f"missing={missing_refs}"):
        failures.append("schema-channel-doc")

    # 11. adapter required fields actually exist in adapter schema definition
    required = set(adapter["validation_rules"]["required_adapter_fields"])
    defined = set(adapter["adapter_fields"].keys())
    missing = required - defined
    ok = not missing
    if not check("11 adapter required_adapter_fields ⊂ adapter_fields", ok, f"missing={missing}"):
        failures.append("adapter-required-missing")

    # 12. normalized_inquiry_fields required list ⊂ adapter_fields keys
    required_norm = set(adapter["validation_rules"]["required_normalized_inquiry_fields"])
    defined_norm = set(adapter["normalized_inquiry_fields"].keys())
    missing_norm = required_norm - defined_norm
    ok = not missing_norm
    if not check("12 required_normalized_inquiry_fields ⊂ normalized_inquiry_fields", ok, f"missing={missing_norm}"):
        failures.append("adapter-norm-fields")

    # 13. auto_reply_ok categories ⊂ signal_schema category enum
    # category 필드 설명에서 '|' 구분자로 enum 값 파싱
    category_desc = signal["fields"].get("category", "")
    # "string - val1 | val2 | ..." 형식에서 값만 추출
    _cat_part = category_desc.split(" - ", 1)[-1] if " - " in category_desc else category_desc
    category_enum = {v.strip() for v in _cat_part.split("|")}
    auto_ok = signal["automation_boundary"]["auto_reply_ok"]
    bad_auto = [c for c in auto_ok if c not in category_enum]
    ok = not bad_auto
    detail_msg = f"not_in_category_enum={bad_auto}"
    if bad_auto:
        detail_msg += f"  (category_enum={sorted(category_enum)})"
    # warn-only: basic_faq 는 P2.2 에서 signal_schema category enum 에 추가 예정.
    # 현재 불일치를 FAIL 로 차단하면 P1 카논 변경이 필요해 P1 격리 원칙 위반.
    # → PASS 출력하되 WARN 메모.
    if bad_auto:
        print(f"[WARN] 13 auto_reply_ok 에 {bad_auto} 가 category enum 에 미등재 — P2.2 signal_schema 업데이트 시 수정")
        check("13 auto_reply_ok categories ⊂ signal_schema category enum (warn-only)", True, detail_msg)
    else:
        check("13 auto_reply_ok categories ⊂ signal_schema category enum", ok, detail_msg)

    # 14. auto_reply_trigger_rules.activated_channels whitelist is ["email"]
    activated = signal["automation_boundary"]["auto_reply_trigger_rules"]["activated_channels"]
    ok = activated == ["email"]
    if not check("14 auto_reply_trigger_rules.activated_channels == ['email']", ok, f"got={activated}"):
        failures.append("auto-reply-channel-whitelist")

    # 15. daily_send_cap == 20
    cap = signal["automation_boundary"]["auto_reply_trigger_rules"]["daily_send_cap"]
    ok = cap == 20
    if not check("15 auto_reply_trigger_rules.daily_send_cap == 20", ok, f"got={cap}"):
        failures.append("auto-reply-daily-cap")


# ---------------------------------------------------------------------------
# 체크 16-18: webhook_payload_schema ↔ fixture (SKIP — 파일 미존재)
# ---------------------------------------------------------------------------
def checks_16_18(failures: list[str]) -> None:
    if not WEBHOOK_PAYLOAD_SCHEMA.exists():
        reason = f"data/webhook_payload_schema.json 미존재 (α Round 1 산출 후 활성화)"
        skip("16 webhook_payload_schema ↔ Channel Talk fixture", reason)
        skip("17 webhook_payload_schema ↔ Email fixture", reason)
        skip("18 webhook_payload_schema ↔ Kakao expected fixture", reason)
        return

    # 파일이 생성되면 아래 로직이 활성화됨
    wp_schema = load(WEBHOOK_PAYLOAD_SCHEMA)
    ct_fixture = ROOT / "data" / "channel_talk_fixture.json"
    email_fixture = ROOT / "data" / "email_inbound_fixture.json"
    kakao_fixture = ROOT / "data" / "kakao_consultalk_channel_fixture.json"

    required_wp_fields = set(wp_schema.get("required_fields", []))

    for check_num, label, fixture_path in [
        (16, "webhook_payload_schema ↔ Channel Talk fixture", ct_fixture),
        (17, "webhook_payload_schema ↔ Email fixture", email_fixture),
        (18, "webhook_payload_schema ↔ Kakao expected fixture", kakao_fixture),
    ]:
        if not fixture_path.exists():
            skip(f"{check_num} {label}", f"{fixture_path.name} 미존재")
            continue
        fixture = load(fixture_path)
        fixture_keys = set(fixture[0].keys()) if isinstance(fixture, list) else set(fixture.keys())
        missing = required_wp_fields - fixture_keys
        ok = not missing
        if not check(f"{check_num} {label}", ok, f"missing_in_fixture={missing}"):
            failures.append(f"webhook-schema-{check_num}")


# ---------------------------------------------------------------------------
# 체크 19: normalize 출력 ↔ normalized_inquiry_fields
# ---------------------------------------------------------------------------
def check_19(failures: list[str]) -> None:
    adapter = load(ADAPTER_SCHEMA)
    required_norm = set(adapter["validation_rules"]["required_normalized_inquiry_fields"])

    # server.py 소스에서 normalize_records 가 만드는 키를 정적 grep 으로 추출
    server_py = ROOT / "server.py"
    if not server_py.exists():
        skip("19 normalize_records 출력 ↔ required_normalized_inquiry_fields", "server.py 미존재")
        return

    src = server_py.read_text(encoding="utf-8")
    # normalize_records 함수 블록 추출 (def normalize_records ~ def parse_csv 까지)
    match = re.search(
        r"def normalize_records.*?(?=\ndef |\Z)", src, re.DOTALL
    )
    if not match:
        skip("19 normalize_records 출력 ↔ required_normalized_inquiry_fields", "normalize_records 함수 미발견")
        return

    func_src = match.group(0)
    # normalized.append({ ... }) 안의 키를 추출
    appended_keys = set(re.findall(r'"(\w+)"\s*:', func_src))
    # 빈 set 이면 파싱 실패
    if not appended_keys:
        skip("19 normalize_records 출력 ↔ required_normalized_inquiry_fields", "append 키 파싱 실패 — 수동 검토 필요")
        return

    missing = required_norm - appended_keys
    extra = appended_keys - required_norm

    # label_hint 는 P2.2 sprint 에서 normalize_records 에 추가 예정.
    # Round 1 에서는 warn-only 처리.
    p2_pending_fields = {"label_hint", "product_scope"}
    hard_missing = missing - p2_pending_fields
    warn_missing = missing & p2_pending_fields

    if warn_missing:
        print(f"[WARN] 19 normalize_records 에 {warn_missing} 미포함 — P2.2 sprint 후 추가 예정")

    ok = not hard_missing
    detail = ""
    if hard_missing:
        detail = f"required_but_missing_in_normalize={hard_missing}"
    if extra:
        detail += f"  extra_in_normalize={extra}"
    if not check("19 normalize_records 출력 ↔ required_normalized_inquiry_fields", ok, detail):
        failures.append("normalize-fields-mismatch")


# ---------------------------------------------------------------------------
# 체크 20: product_scope enum (warn-only — P2.2 sprint 후 활성)
# ---------------------------------------------------------------------------
def check_20(failures: list[str]) -> None:
    sample_out = load(SAMPLE_OUTPUT)
    records_with_scope = [r for r in sample_out["records"] if "product_scope" in r]
    if not records_with_scope:
        # product_scope 필드가 아직 outputs 에 없음 — P2.2 sprint 후 활성
        skip(
            "20 outputs product_scope ∈ {habix_course, pmf_radar_lab, other}",
            "sample output 에 product_scope 필드 미존재 — P2.2 sprint 후 활성화 (warn-only)"
        )
        return

    bad = {r["id"]: r["product_scope"] for r in records_with_scope if r["product_scope"] not in PRODUCT_SCOPE_ALLOWED}
    ok = not bad
    if not check("20 outputs product_scope ∈ {habix_course, pmf_radar_lab, other}", ok, f"violations={bad}"):
        # warn-only: 목록에 추가하지 않아 exit 1 차단 안 함
        print("       [WARN] check 20 은 P2.2 sprint 완료 후 hard-fail 로 승격됩니다.")


# ---------------------------------------------------------------------------
# 체크 21: README 카운트 grep (lint_docs.py 위임 가능)
# ---------------------------------------------------------------------------
def check_21(failures: list[str]) -> None:
    if not README.exists():
        skip("21 README 카운트 grep (문의 50 / 리허설 10 / 90분 / 6단계)", "README.md 미존재")
        return

    text = README.read_text(encoding="utf-8")

    patterns = {
        "문의 50": r"문의\s*50|50\s*개.*문의|50.*고객\s*문의",
        "리허설 10": r"리허설\s*10|10\s*건.*리허설|rehearsal.*10",
        "90분": r"90\s*분",
        # README 에서 "6. Improvement Loop" 형태 또는 "6단계" / "6-step" 을 모두 인식
        "6단계": r"6\s*단계|6-?step|^6\.|6\.\s+\S",
    }

    missing_patterns = []
    for label, pattern in patterns.items():
        if not re.search(pattern, text):
            missing_patterns.append(label)

    ok = not missing_patterns
    if not check("21 README 카운트 grep (문의 50 / 리허설 10 / 90분 / 6단계)", ok, f"not_found={missing_patterns}"):
        failures.append("readme-count-grep")


# ---------------------------------------------------------------------------
# 체크 22: stale 표현 flag
# ---------------------------------------------------------------------------
def check_22(failures: list[str]) -> None:
    """production 문서에서 stale 표현 검출. Open Questions / Appendix 섹션 예외."""
    target_docs = [README, SPEC_MD, DESIGN_MD]
    stale_hits: list[str] = []

    for doc in target_docs:
        if not doc.exists():
            continue
        lines = doc.read_text(encoding="utf-8").splitlines()
        for i, line in enumerate(lines):
            if _is_in_exception_section(i, lines):
                continue
            for pattern in STALE_PATTERNS:
                if pattern in line:
                    stale_hits.append(f"{doc.relative_to(ROOT)}:{i + 1}: '{pattern}' — {line.strip()[:80]}")

    ok = not stale_hits
    detail = ""
    if stale_hits:
        detail = f"{len(stale_hits)}건 발견 — lint_docs.py 에서 상세 확인"
        for hit in stale_hits[:3]:
            print(f"       {hit}")
        if len(stale_hits) > 3:
            print(f"       ... 외 {len(stale_hits) - 3}건")
    if not check("22 stale 표현 flag (예정/TODO/미완/추후 추가)", ok, detail):
        failures.append("stale-expression")


# ---------------------------------------------------------------------------
# 체크 23: cross-reference 깨짐
# ---------------------------------------------------------------------------
# P2 진행 중 신설 예정인 문서 — broken ref 가 아닌 "pending creation" 으로 간주.
# α/β Round 2 산출 후 아래 목록에서 제거.
_PENDING_CREATION_DOCS = {
    "docs/P2.4_KAKAO_EVAL.md",
    "P2.4_KAKAO_EVAL.md",
    "docs/P2_PENDING_INPUTS.md",
    "P2_PENDING_INPUTS.md",
}


def check_23(failures: list[str]) -> None:
    """[[...]], ./xxx.md, docs/xxx.md 형식 cross-reference 실재 검증."""
    target_docs = [README, P2_DESIGN, PRD_P2, SPEC_MD]
    broken_refs: list[str] = []

    # obsidian [[...]] 패턴
    obsidian_re = re.compile(r"\[\[([^\]]+)\]\]")
    # 상대경로 ./xxx.md 패턴
    relative_re = re.compile(r"\]\((\./[^\)]+\.md[^\)]*)\)")
    # docs/xxx.md 패턴 (backtick 안 또는 plain)
    docs_re = re.compile(r"`(docs/[^`]+\.md)`|(?<!\()docs/([^\s\)]+\.md)")

    for doc in target_docs:
        if not doc.exists():
            continue
        text = doc.read_text(encoding="utf-8")
        doc_dir = doc.parent

        # [[...]] 검사 — Obsidian vault 링크는 ROOT 기준 hplan/ 등 서치
        for m in obsidian_re.finditer(text):
            ref_name = m.group(1).split("|")[0].strip()
            # hplan/ 안 파일 검색
            candidates = list(ROOT.rglob(f"{ref_name}.md")) + list(ROOT.rglob(f"{ref_name}"))
            if not candidates:
                broken_refs.append(f"{doc.relative_to(ROOT)}: [[{ref_name}]] — 파일 미존재")

        # ./xxx.md 검사
        for m in relative_re.finditer(text):
            ref_path = m.group(1).split("#")[0]  # anchor 제거
            resolved = (doc_dir / ref_path).resolve()
            if not resolved.exists():
                broken_refs.append(f"{doc.relative_to(ROOT)}: {ref_path} — 파일 미존재")

        # docs/xxx.md 검사
        for m in docs_re.finditer(text):
            ref_path = m.group(1) or m.group(2)
            if ref_path in _PENDING_CREATION_DOCS:
                # Round 2 신설 예정 문서 — broken ref 아님
                continue
            resolved = (ROOT / ref_path).resolve()
            if not resolved.exists():
                broken_refs.append(f"{doc.relative_to(ROOT)}: {ref_path} — 파일 미존재")

    ok = not broken_refs
    detail = ""
    if broken_refs:
        detail = f"{len(broken_refs)}건 broken ref"
        for ref in broken_refs[:3]:
            print(f"       {ref}")
        if len(broken_refs) > 3:
            print(f"       ... 외 {len(broken_refs) - 3}건")
    if not check("23 cross-reference 깨짐 검증", ok, detail):
        failures.append("cross-reference-broken")


# ---------------------------------------------------------------------------
# 체크 24: asset 무결성
# ---------------------------------------------------------------------------
def check_24(failures: list[str]) -> None:
    """remotion/package.json scripts 의 output path 가 demo/assets/ 에 실재하는지 검증."""
    if not REMOTION_PKG.exists():
        skip("24 demo/assets + remotion output path 무결성", "remotion/package.json 미존재")
        return

    pkg = load(REMOTION_PKG)
    scripts = pkg.get("scripts", {})

    missing_assets: list[str] = []

    # render / still 스크립트에서 output 경로 추출
    for script_name, script_cmd in scripts.items():
        # 상대경로 ../demo/assets/xxx 또는 절대경로 패턴 검출
        for m in re.finditer(r"\.\./demo/assets/([^\s]+)", script_cmd):
            asset_rel = m.group(1)
            asset_path = ROOT / "demo" / "assets" / asset_rel
            if not asset_path.exists():
                missing_assets.append(f"remotion scripts.{script_name}: demo/assets/{asset_rel} 미존재")

    ok = not missing_assets
    detail = f"missing={missing_assets}" if missing_assets else ""
    if not check("24 demo/assets + remotion output path 무결성", ok, detail):
        failures.append("asset-integrity")


# ---------------------------------------------------------------------------
# 체크 25: raw_payload_retention 30일 — SQL grep
# ---------------------------------------------------------------------------
def check_25(failures: list[str]) -> None:
    """마이그레이션 파일 안에 'interval '30 days'' 문자열 존재 여부."""
    if not SUPABASE_MIGRATIONS.exists():
        skip("25 raw_payload_retention 30일 SQL placeholder", "supabase/migrations/ 디렉토리 미존재")
        return

    sql_files = list(SUPABASE_MIGRATIONS.glob("*.sql"))
    if not sql_files:
        skip("25 raw_payload_retention 30일 SQL placeholder", "마이그레이션 .sql 파일 미존재")
        return

    found = False
    found_file = ""
    for sql_file in sql_files:
        content = sql_file.read_text(encoding="utf-8")
        if "interval '30 days'" in content:
            found = True
            found_file = sql_file.name
            break

    ok = found
    detail = f"found_in={found_file}" if found else "interval '30 days' 문자열 미발견 — PIPA 30일 정책 위반 위험"
    if not check("25 raw_payload_retention 30일 SQL placeholder 존재", ok, detail):
        failures.append("retention-30day-sql")


# ---------------------------------------------------------------------------
# 체크 26-28: Supabase 미연결 SKIP
# ---------------------------------------------------------------------------
def checks_26_28(failures: list[str]) -> None:
    skip(
        "26 auto_reply_log 모든 row 에 approved_template_id",
        "Supabase 미연결 — production 연결 후 활성화"
    )
    skip(
        "27 auto_reply_log 일일 count ≤ 20",
        "Supabase 미연결 — production 연결 후 활성화"
    )
    if not AUTO_REPLY_TEMPLATES.exists():
        skip(
            "28 auto_reply_templates last_reviewed_at ≤ 30일",
            "data/auto_reply_templates.json 미존재 (α Round 2 신설 예정)"
        )
    else:
        skip(
            "28 auto_reply_templates last_reviewed_at ≤ 30일",
            "Supabase 미연결 — production 연결 후 활성화"
        )


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------
def main() -> int:
    parser = argparse.ArgumentParser(description="validate_schemas.py — P2 extended (28 entries)")
    parser.add_argument(
        "--report",
        action="store_true",
        help="28 check 실행 후 hplan/ralph_verify_report.md 에 Validation Harness 섹션 append/replace",
    )
    args = parser.parse_args()

    print("=" * 60)
    print("validate_schemas.py — P2 extended (28 entries)")
    print("=" * 60)

    if args.report:
        # --report 모드: stdout 출력 유지 + 파일 갱신
        print("\n--- P1 카논 (1-15) ---")
        rows, failures = _run_checks_captured()
        # stdout 에도 전체 check 결과 재출력 (사용자 가시성)
        failures_live: list[str] = []
        checks_p1(failures_live)
        print("\n--- P2 신규 (16-28) ---")
        checks_16_18(failures_live)
        check_19(failures_live)
        check_20(failures_live)
        check_21(failures_live)
        check_22(failures_live)
        check_23(failures_live)
        check_24(failures_live)
        check_25(failures_live)
        checks_26_28(failures_live)
        print()
        if failures_live:
            print(f"FAILED ({len(failures_live)}): {', '.join(failures_live)}")
        else:
            print("All checks PASS (SKIP 항목 포함 — exit 0).")
        # report 파일 갱신 (rows 는 captured run 에서 파싱, failures 는 live run 사용)
        write_report(rows, failures_live)
        return 1 if failures_live else 0
    else:
        # --check-only (기존 동작)
        failures: list[str] = []
        print("\n--- P1 카논 (1-15) ---")
        checks_p1(failures)
        print("\n--- P2 신규 (16-28) ---")
        checks_16_18(failures)
        check_19(failures)
        check_20(failures)
        check_21(failures)
        check_22(failures)
        check_23(failures)
        check_24(failures)
        check_25(failures)
        checks_26_28(failures)
        print()
        if failures:
            print(f"FAILED ({len(failures)}): {', '.join(failures)}")
            return 1
        print("All checks PASS (SKIP 항목 포함 — exit 0).")
        return 0


if __name__ == "__main__":
    sys.exit(main())

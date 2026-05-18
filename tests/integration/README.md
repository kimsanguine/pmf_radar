# webhook_inbox Schema-Contract Integration Test

## 왜 이 테스트가 필요한가

pmf_radar P2 CS Inbox 시스템은 107개 단위 테스트가 모두 PASS이지만,
data-ingest Worker의 `normalizeRows → insertToSupabase` 경로에서
`webhook_inbox` 마이그레이션 스키마와 payload 필드명이 맞지 않아
실제 INSERT 시 422를 던지는 상태가 발견되었다.

근본 원인: **schema(migration)와 worker code(normalize)가 서로 분리되어 있고
cross-check하는 테스트가 없었다.**

이 디렉토리는 그 gap을 메우는 integration test suite이다.

## 검증 invariant

| ID | 항목 | 설명 |
|----|------|------|
| I1 | column 이름 화이트리스트 | payload의 모든 key가 스키마 컬럼 이름 ∈ |
| I2 | NOT NULL 충족 | NOT NULL + default 없는 컬럼이 payload에 존재 |
| I3 | type 정합 | uuid → UUID v4 패턴, jsonb → valid JSON, boolean → boolean |
| I4 | CHECK constraint | product_scope ∈ {habix_course, pmf_radar_lab, other} |
| I5 | UNIQUE 시뮬레이션 | 같은 fixture 두 번 → (source, message_id) 동일 |

## 실행

```bash
cd tests/integration
npm install
npx vitest run
```

## 현재 상태 (2026-05-18 기준)

| Worker | I1 | I2 | I4 | I5 | 비고 |
|--------|----|----|----|----|------|
| email-inbound | FAIL | FAIL | OK | OK | mapper 미연결, `message`→`masked_message` |
| channel-talk | FAIL | FAIL | OK | OK | mapper 미연결, `message`→`masked_message` |
| data-ingest | FAIL | FAIL | OK | OK | NormalizedRow 직접 INSERT, toInsertPair 미호출 |
| auto-reply | skip | skip | skip | skip | INSERT 없음, SELECT만 수행 |

**FAIL이 정상 결과.** 이 테스트는 mismatch를 드러내기 위해 작성되었다.
후속 PR(schema-mapper agent)이 worker code를 수정하면 PASS로 바뀐다.

## 다음 Worker 추가 시 fixture 등록 방법

1. `fixtures/` 에 `<worker_name>_sample.json` 추가
2. `test_webhook_inbox_contract.test.ts` 에 `describe("Worker: <name>")` 블록 추가
3. 규칙:
   - "현재 코드" 경로 (mismatch 검출)와 "올바른 경로" (mapper 경유) 두 케이스 모두 작성
   - Worker가 `webhook_inbox`에 INSERT하지 않으면 auto-reply처럼 skip 명시

## 파일 구조

```
tests/integration/
├── schema_extractor.ts        # migration SQL → column 정의 추출
├── test_webhook_inbox_contract.test.ts   # 5 invariant vitest
├── fixtures/
│   ├── email_inbound_sample.json
│   ├── channel_talk_sample.json
│   ├── data_ingest_csv_sample.csv
│   └── data_ingest_url_sample.json
├── package.json
├── tsconfig.json
└── README.md
```

## schema_extractor.ts 동작 원리

`supabase/migrations/20260518000001_p2_inbox_schema.sql` 를 정규식으로 파싱한다.
SQL parser를 도입하지 않는 이유: 마이그레이션 파일이 1개이고 형식이 고정되어 있어
정규식으로 충분하다 (Rule 2 Simplicity).

파일 경로가 바뀌면 `schema_extractor.ts` 의 `MIGRATION_PATH` 상수를 수정한다.

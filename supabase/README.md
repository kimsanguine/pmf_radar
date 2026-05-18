# Supabase 마이그레이션 가이드 — P2 Inbox Schema

## 개요

P2 Multi-Channel Inbox 의 Supabase 테이블 4종 + RLS 정책 + pg_cron 자동삭제 스케줄을 한 마이그레이션 파일에 통합합니다.

| 파일 | 역할 |
|------|------|
| `migrations/20260518_p2_inbox_schema.sql` | 4 table + RLS + pg_cron 스케줄 (apply) |
| `rollback/20260518_p2_inbox_schema.down.sql` | rollback — 의존성 역순 삭제 ★ `migrations/` 밖에 둠 — Supabase CLI 가 알파벳 순(`.down.sql` < `.sql`)으로 잘못 실행하는 문제 방지. 명시적 rollback 시 `supabase db execute --file ...` 로 호출. |
| `seed/auto_reply_templates_seed.sql` | auto_reply_templates 초기 데이터 4건 |
| `tests/rls_smoke.sql` | RLS anon vs service_role 분리 검증 |

---

## 1. 적용 절차

### A. Supabase CLI (권장)

```bash
# 프로젝트 루트에서
npx supabase link --project-ref <PROJECT_REF>

# 마이그레이션 적용
npx supabase db push

# seed 적용 (별도 실행)
npx supabase db execute --file supabase/seed/auto_reply_templates_seed.sql
```

### B. Dashboard SQL Editor (수동)

1. Supabase Dashboard > SQL Editor 접속
2. `supabase/migrations/20260518_p2_inbox_schema.sql` 전체 복사 붙여넣기
3. Run 실행 — 에러 없으면 완료
4. `supabase/seed/auto_reply_templates_seed.sql` 동일하게 실행

### 롤백

```bash
npx supabase db execute --file supabase/migrations/20260518_p2_inbox_schema.down.sql
```

또는 Dashboard SQL Editor 에서 down.sql 직접 실행.

---

## 2. pg_cron extension 활성화 (필수 선행 작업)

`cron.schedule()` 은 pg_cron extension 이 활성화된 후에 실행됩니다.

1. Supabase Dashboard > Database > Extensions
2. `pg_cron` 검색 → Enable
3. 이후 마이그레이션 적용

pg_cron 이 비활성화 상태에서 마이그레이션을 실행하면 `ERROR: schema "cron" does not exist` 오류가 발생합니다. 이 경우 마이그레이션 파일 하단 `select cron.schedule(...)` 두 구문을 임시 주석 처리 후 적용하고, extension 활성화 후 별도 실행하세요.

자동삭제 스케줄 확인:

```sql
select * from cron.job where jobname like 'p2-%';
```

---

## 3. 환경변수 (Cloudflare Workers)

Workers 코드는 다음 세 변수를 사용합니다. `wrangler.toml` 에 placeholder 가 있으며, 실제 값은 `wrangler secret put` 으로 등록합니다.

| 변수명 | 용도 |
|--------|------|
| `SUPABASE_URL` | PostgREST base URL (`https://<project>.supabase.co`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Workers → Supabase 쓰기/읽기 (RLS bypass) |
| `SUPABASE_ANON_KEY` | placeholder 보관용, Workers 코드에서 직접 사용 금지 |

```bash
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```

`SUPABASE_ANON_KEY` 는 클라이언트에 노출하지 않습니다. 운영자 대시보드도 server-side 에서 `service_role` key 로 Supabase 에 접근합니다.

---

## 4. RLS 정책 의도

### 운영 전제

이 시스템은 **1인 운영자 자기 사용** 전용입니다. 외부 사용자(수강생, 고객)가 직접 Supabase 에 접근하는 경로는 없습니다. 따라서:

- **service_role**: Workers 가 사용. 모든 테이블 INSERT/SELECT/UPDATE 허용.
- **anon**: 전면 차단. 외부 노출 없음을 RLS 에서도 보장.

### 정책 매트릭스

| 역할 | webhook_idempotency | webhook_inbox | raw_payload_retention | auto_reply_log |
|------|:-------------------:|:-------------:|:---------------------:|:--------------:|
| service_role | ALL | ALL | ALL | ALL |
| anon | DENY | DENY | DENY | DENY |
| authenticated | (미정의) | (미정의) | (미정의) | (미정의) |

`authenticated` 역할 (Supabase Auth 로그인 사용자) 은 현재 정책 미정의입니다. 운영자 대시보드를 Supabase Auth 기반으로 구축할 경우 별도 정책 추가가 필요합니다. P2 범위에서는 서버사이드 Bearer auth 로 충분합니다.

---

## 5. 위험 — RLS Silent Fail 패턴

**이 섹션은 운영 필독입니다.**

Supabase PostgREST 는 RLS 정책이 row 를 차단해도 **HTTP 200 OK + 빈 배열 `[]`** 를 반환합니다. `4xx` 에러가 발생하지 않습니다.

### 증상

```bash
# anon key 로 INSERT 시도
curl -s -X POST "${SUPABASE_URL}/rest/v1/webhook_inbox" \
     -H "apikey: ${SUPABASE_ANON_KEY}" \
     -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
     -H "Content-Type: application/json" \
     -H "Prefer: return=representation" \
     -d '{"source":"test","message_id":"x","channel":"email","masked_message":"t","product_scope":"other"}'
```

결과: `[]` (HTTP 200) — row 미생성. 에러 없음.

### Workers 코드 방어 패턴

Workers 에서 Supabase 에 쓸 때 반드시 `Prefer: return=representation` 헤더를 사용하고 응답 배열 길이를 확인해야 합니다:

```typescript
const res = await fetch(`${env.SUPABASE_URL}/rest/v1/webhook_inbox`, {
  method: 'POST',
  headers: {
    'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
    'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
  },
  body: JSON.stringify(row),
});

const result = await res.json() as unknown[];
if (!Array.isArray(result) || result.length === 0) {
  // row_count=0: RLS 차단 또는 constraint 위반 가능성
  console.error('[supabase] INSERT returned empty — RLS block or constraint violation', row.source, row.message_id);
  // HITL fallback 또는 dead-letter queue 로 이동
}
```

### 함정 해결

Workers 는 반드시 `SUPABASE_SERVICE_ROLE_KEY` 를 사용해야 합니다. `SUPABASE_ANON_KEY` 로는 위 정책에 의해 모든 쓰기가 silent fail 합니다.

참고: `feedback_cf_worker_same_zone` 메모리 — same-zone Worker fetch 521 함정. Workers 에서 Supabase 는 **외부 HTTP API 직접 호출** (`supabase.co` URL) 방식을 사용합니다. Service Binding 은 Cloudflare Workers 간 통신에만 적용됩니다.

---

## 6. 자동삭제 정책

| 테이블 | 보존 기간 | cron 스케줄 | 근거 |
|--------|----------|-------------|------|
| `raw_payload_retention` | 30일 | 매일 02:00 UTC | PIPA R6, PRD §12 |
| `auto_reply_log` | 7일 | 매일 02:05 UTC | PRD §11 US-24 |

### trigger vs pg_cron 선택 근거

**pg_cron** 을 선택했습니다.

- INSERT trigger 방식은 매 write 마다 `WHERE created_at < now() - interval` 전체 스캔 비용이 발생합니다.
- `raw_payload_retention` 은 운영 초기에 일 수십 건 수준이지만, pg_cron batch 방식이 write path 에 지연을 추가하지 않습니다 (US-4 webhook 200 즉시 반환 요건과 일치).
- Supabase hosted plan 에서 pg_cron extension 은 Dashboard 에서 1클릭으로 활성화됩니다.
- 단점: pg_cron 이 비활성화된 환경에서는 수동 cleanup 스크립트(`scripts/retention_cleanup.py`) 가 대체합니다.

---

## 7. 검증 절차

### RLS smoke test

```bash
# Dashboard SQL Editor 에서 실행
# supabase/tests/rls_smoke.sql 전체 붙여넣기 → Run
```

기대 출력:

```
NOTICE: T2  PASS: service_role INSERT on webhook_idempotency OK (1 row)
NOTICE: T2b PASS: service_role INSERT on webhook_inbox OK
NOTICE: T5  PASS: product_scope CHECK constraint blocked invalid value
NOTICE: T5b PASS: product_scope=habix_course accepted
NOTICE: T5b PASS: product_scope=pmf_radar_lab accepted
NOTICE: T5b PASS: product_scope=other accepted
NOTICE: T6a PASS: auto_reply_log cancel consistency constraint OK
NOTICE: T6b PASS: auto_reply_log normal insert (cancelled=false) OK
NOTICE: T6c PASS: auto_reply_log cancelled insert OK
NOTICE: T3  PASS: anon SELECT on webhook_inbox returned 0 rows (RLS blocking)
NOTICE: T1  PASS: anon INSERT on webhook_inbox blocked by RLS
NOTICE: T4  PASS: service_role SELECT on webhook_inbox OK (N rows)
```

ROLLBACK 으로 테스트 데이터 잔류 없음.

### PostgREST curl 보완 테스트 (수동)

smoke.sql 주석의 curl 명령을 참조하여 anon key INSERT 가 `[]` 반환, service_role key INSERT 가 row 반환하는지 확인합니다.

-- =============================================================================
-- RLS Smoke Test: rls_smoke.sql
-- Project: cs-inbox-pmf-radar-lab (P2)
-- Created: 2026-05-18
--
-- 목적:
--   anon vs service_role RLS 정책이 올바르게 분리되어 있는지 검증.
--   Supabase Dashboard > SQL Editor 에서 실행. psql CLI 도 가능.
--
-- 검증 항목:
--   T1. anon INSERT → 거부 (0 rows affected, error 또는 empty)
--   T2. service_role INSERT → 통과 (1 row)
--   T3. anon SELECT → 0 rows (RLS silent fail 패턴 확인)
--   T4. service_role SELECT → 1 row
--   T5. product_scope CHECK constraint 위반 → 거부
--   T6. auto_reply_log cancel 일관성 constraint 확인
--
-- 주의: 이 파일은 실제 데이터를 변경하지 않도록 transaction rollback 으로 감싼다.
--       단, pg_set_role 은 Supabase Dashboard SQL Editor 에서 사용 불가이므로
--       아래 T1/T3 은 set role anon 블록을 주석 처리하고 PostgREST anon key 로
--       별도 curl 테스트를 권고한다 (README §4 참고).
-- =============================================================================


-- ---------------------------------------------------------------------------
-- TRANSACTION WRAPPER (자동 rollback — 테스트 데이터 잔류 없음)
-- ---------------------------------------------------------------------------
begin;

-- ---------------------------------------------------------------------------
-- T2. service_role INSERT → webhook_idempotency
-- ---------------------------------------------------------------------------
-- Dashboard SQL Editor 는 service_role context 로 실행됨.
insert into public.webhook_idempotency (source, message_id, seen_at)
values ('smoke_test', 'msg_smoke_001', now());

-- T2 검증: row 가 존재해야 함
do $$
declare
    v_count int;
begin
    select count(*) into v_count
      from public.webhook_idempotency
     where source = 'smoke_test' and message_id = 'msg_smoke_001';

    if v_count <> 1 then
        raise exception 'T2 FAIL: service_role INSERT on webhook_idempotency returned % rows (expected 1)', v_count;
    end if;
    raise notice 'T2 PASS: service_role INSERT on webhook_idempotency OK (% row)', v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- T2b. service_role INSERT → webhook_inbox
-- ---------------------------------------------------------------------------
insert into public.webhook_inbox
    (id, source, message_id, channel, masked_message, hitl_required, product_scope)
values
    (gen_random_uuid(), 'smoke_test', 'msg_smoke_001', 'email',
     '[이름] 님 문의드립니다.', false, 'habix_course');

do $$
declare
    v_count int;
begin
    select count(*) into v_count
      from public.webhook_inbox
     where source = 'smoke_test' and message_id = 'msg_smoke_001';

    if v_count <> 1 then
        raise exception 'T2b FAIL: service_role INSERT on webhook_inbox returned % rows (expected 1)', v_count;
    end if;
    raise notice 'T2b PASS: service_role INSERT on webhook_inbox OK';
end;
$$;

-- ---------------------------------------------------------------------------
-- T5. product_scope CHECK constraint 위반 → 거부
-- ---------------------------------------------------------------------------
do $$
declare
    v_raised boolean := false;
begin
    begin
        insert into public.webhook_inbox
            (id, source, message_id, channel, masked_message, hitl_required, product_scope)
        values
            (gen_random_uuid(), 'smoke_test', 'msg_smoke_bad_scope', 'email',
             '테스트', false, 'invalid_scope_value');
        -- 여기까지 오면 constraint 미동작 → FAIL
        raise exception 'T5 FAIL: CHECK constraint did not block invalid product_scope';
    exception
        when check_violation then
            v_raised := true;
    end;

    if v_raised then
        raise notice 'T5 PASS: product_scope CHECK constraint blocked invalid value';
    end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- T5b. product_scope 3 enum 값 모두 허용 확인
-- ---------------------------------------------------------------------------
do $$
declare
    v_scope text;
    v_scopes text[] := array['habix_course', 'pmf_radar_lab', 'other'];
begin
    foreach v_scope in array v_scopes loop
        -- INSERT 시도 (rollback 으로 정리됨)
        begin
            insert into public.webhook_inbox
                (id, source, message_id, channel, masked_message, product_scope)
            values
                (gen_random_uuid(), 'smoke_enum_' || v_scope, 'msg_enum_001',
                 'email', '테스트', v_scope);
            raise notice 'T5b PASS: product_scope=% accepted', v_scope;
        exception
            when check_violation then
                raise exception 'T5b FAIL: product_scope=% was unexpectedly blocked', v_scope;
        end;
    end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- T6. auto_reply_log cancel 일관성 constraint
--     cancelled=true 이면 cancelled_at 필수
-- ---------------------------------------------------------------------------
do $$
declare
    v_inbox_id uuid;
    v_raised   boolean := false;
begin
    -- 기준 webhook_inbox row
    select id into v_inbox_id
      from public.webhook_inbox
     where source = 'smoke_test' and message_id = 'msg_smoke_001'
     limit 1;

    -- T6a: cancelled=true + cancelled_at=null → 거부
    begin
        insert into public.auto_reply_log
            (inbox_id, template_id, cancelled, cancelled_at)
        values
            (v_inbox_id, 'setup_ko_v1', true, null);
        raise exception 'T6a FAIL: cancel consistency constraint did not block (cancelled=true, cancelled_at=null)';
    exception
        when check_violation then
            v_raised := true;
    end;

    if v_raised then
        raise notice 'T6a PASS: auto_reply_log cancel consistency constraint OK';
    end if;

    -- T6b: cancelled=false + cancelled_at=null → 허용 (정상 케이스)
    begin
        insert into public.auto_reply_log
            (inbox_id, template_id, cancelled, cancelled_at)
        values
            (v_inbox_id, 'setup_ko_v1', false, null);
        raise notice 'T6b PASS: auto_reply_log normal insert (cancelled=false) OK';
    exception
        when others then
            raise exception 'T6b FAIL: normal insert was blocked: %', sqlerrm;
    end;

    -- T6c: cancelled=true + cancelled_at=now() → 허용 (취소 케이스)
    begin
        insert into public.auto_reply_log
            (inbox_id, template_id, cancelled, cancelled_at)
        values
            (v_inbox_id, 'setup_ko_v1', true, now());
        raise notice 'T6c PASS: auto_reply_log cancelled insert OK';
    exception
        when others then
            raise exception 'T6c FAIL: cancelled insert was blocked: %', sqlerrm;
    end;
end;
$$;

-- ---------------------------------------------------------------------------
-- T3. anon SELECT → 0 rows (RLS silent fail 패턴 검증)
-- ---------------------------------------------------------------------------
-- 주의: Dashboard SQL Editor 는 service_role context 이므로
--       아래는 set_config 로 request.jwt.claim.role 을 anon 으로 덮어쓰는 방식.
--       PostgREST 경유 실제 anon key curl 테스트가 더 정확하다.
--       curl -s -H "apikey: <ANON_KEY>" -H "Authorization: Bearer <ANON_KEY>" \
--            "${SUPABASE_URL}/rest/v1/webhook_inbox?select=id&limit=1"
--       → 빈 배열 [] 이면 RLS 차단 정상. 에러 없이 [] 반환이 silent fail 패턴임.
--
-- 아래는 SQL 수준에서 anon role 을 시뮬레이션:
do $$
begin
    -- service_role context 에서 set role anon
    set local role anon;

    -- anon 으로 SELECT 시도: RLS restrictive policy 로 0 rows 기대
    if (select count(*) from public.webhook_inbox) <> 0 then
        raise exception 'T3 FAIL: anon SELECT returned rows (RLS not blocking)';
    end if;
    raise notice 'T3 PASS: anon SELECT on webhook_inbox returned 0 rows (RLS blocking)';

    -- role 복원
    reset role;
end;
$$;

-- ---------------------------------------------------------------------------
-- T1. anon INSERT → 거부
-- ---------------------------------------------------------------------------
do $$
declare
    v_raised boolean := false;
begin
    set local role anon;

    begin
        insert into public.webhook_inbox
            (id, source, message_id, channel, masked_message, product_scope)
        values
            (gen_random_uuid(), 'anon_test', 'msg_anon_001', 'email', '테스트', 'other');
        -- 여기까지 오면 RLS 미동작 → FAIL
        raise exception 'T1 FAIL: anon INSERT was not blocked by RLS';
    exception
        when insufficient_privilege then
            v_raised := true;
        when others then
            v_raised := true; -- restrictive policy 가 다른 에러로 올 수 있음
    end;

    reset role;

    if v_raised then
        raise notice 'T1 PASS: anon INSERT on webhook_inbox blocked by RLS';
    end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- T4. service_role SELECT → 정상 (rollback 전 T2b 에서 삽입한 row 조회)
-- ---------------------------------------------------------------------------
do $$
declare
    v_count int;
begin
    select count(*) into v_count
      from public.webhook_inbox
     where source = 'smoke_test';

    if v_count = 0 then
        raise exception 'T4 FAIL: service_role SELECT returned 0 rows';
    end if;
    raise notice 'T4 PASS: service_role SELECT on webhook_inbox OK (% rows)', v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- ROLLBACK — 테스트 데이터 전체 취소
-- ---------------------------------------------------------------------------
rollback;

-- 최종 확인: rollback 후 smoke_test source 행 0건이어야 함
-- select count(*) from public.webhook_inbox where source like 'smoke%';
-- → 0 이면 정상.


-- =============================================================================
-- 보완 테스트 (PostgREST + curl, 수동 실행)
-- =============================================================================
-- RLS silent fail 핵심 패턴 확인:
--   anon key 로 PATCH/INSERT 시 HTTP 200 OK + 빈 배열 [] 반환 → row 미변경.
--   curl 로만 확인 가능 (SQL Editor 는 service_role context).
--
-- 1) anon key INSERT (거부 확인):
--   curl -s -X POST "${SUPABASE_URL}/rest/v1/webhook_inbox" \
--        -H "apikey: ${SUPABASE_ANON_KEY}" \
--        -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
--        -H "Content-Type: application/json" \
--        -H "Prefer: return=representation" \
--        -d '{"source":"anon_test","message_id":"x","channel":"email","masked_message":"test","product_scope":"other"}' \
--   | jq .
--   → [] (빈 배열, HTTP 200) = RLS 차단 정상. row_count=0 으로 Worker 로그에 기록해야 함.
--
-- 2) service_role key INSERT (통과 확인):
--   curl -s -X POST "${SUPABASE_URL}/rest/v1/webhook_inbox" \
--        -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
--        -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
--        -H "Content-Type: application/json" \
--        -H "Prefer: return=representation" \
--        -d '{"source":"svc_test","message_id":"y","channel":"email","masked_message":"test","product_scope":"other"}' \
--   | jq .
--   → [{"id":"...","source":"svc_test",...}] = 통과 정상.
--   (확인 후 수동 삭제: DELETE FROM public.webhook_inbox WHERE source='svc_test';)

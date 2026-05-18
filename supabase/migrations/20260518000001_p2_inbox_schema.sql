-- =============================================================================
-- Migration: 20260518_p2_inbox_schema.sql
-- Project  : cs-inbox-pmf-radar-lab (P2 Multi-Channel Inbox)
-- Created  : 2026-05-18
-- Author   : β Supabase/Edge Specialist
--
-- Tables:
--   1. webhook_idempotency      -- dedup 영속화 (idempotency key 기준)
--   2. webhook_inbox            -- normalized 인입 기록 (masked 전용)
--   3. raw_payload_retention    -- raw payload 30일 보존 후 자동삭제
--   4. auto_reply_log           -- auto-reply audit 7일 보존 후 자동삭제
--   (5. auto_reply_templates    -- seed.sql 에서 신설; 마이그레이션은 테이블만)
--
-- RLS 정책:
--   service_role → 모든 테이블 INSERT/SELECT/UPDATE
--   anon         → 전면 차단 (운영자 자기 사용 전제, 외부 노출 없음)
--
-- 자동삭제:
--   raw_payload_retention : pg_cron 매일 02:00 UTC (30일 초과 row 삭제)
--   auto_reply_log        : pg_cron 매일 02:05 UTC (7일 초과 row 삭제)
--   이유: INSERT trigger 방식은 매 write 마다 full-scan 비용 + 삭제 지연.
--         pg_cron batch 1회/일이 운영 부담 최소(C13) 원칙과 일치.
--         Supabase hosted plan 기준 pg_cron extension 기본 활성화됨.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 0. extensions
-- ---------------------------------------------------------------------------
-- pg_cron: Supabase hosted plan 에서는 대시보드 Database > Extensions 에서 활성화 필요.
-- gen_random_uuid(): PostgreSQL 13+ core 함수, extension 의존성 0 (2026-05-18 patch — uuid-ossp 가 Supabase 의 extensions 스키마에 격리되어 search_path 함정 회피)
-- 기존 uuid-ossp extension 라인은 제거됨 (extension already exists 시에도 unqualified uuid_generate_v4() 가 SQLSTATE 42883 fail).
-- pg_cron 은 superuser 권한 필요. Supabase Dashboard 에서 활성화 후
-- 아래 cron.schedule() 호출이 성공함. CLI 마이그레이션 실행 전 활성화 확인.


-- ---------------------------------------------------------------------------
-- 1. webhook_idempotency
-- ---------------------------------------------------------------------------
-- 목적: server 재시작 후에도 dedup 키가 유지됨 (US-7).
--       webhook_inbox normalize 실패 시에도 dedup 보장 (독립 분리 이유).
-- 복합 PK (source, message_id) → idempotency_key = source:message_id
-- ---------------------------------------------------------------------------
create table if not exists public.webhook_idempotency (
    source      text        not null,
    message_id  text        not null,
    seen_at     timestamptz not null default now(),
    primary key (source, message_id)
);

comment on table public.webhook_idempotency is
    'Webhook dedup 영속화. source:message_id PK로 재시작 후에도 중복 수신을 차단한다.';

-- RLS 활성화
alter table public.webhook_idempotency enable row level security;

-- service_role: 모든 작업 허용
-- ===== Idempotency guard (re-run safety) =====
-- PostgreSQL 의 CREATE POLICY 는 IF NOT EXISTS 미지원 → 기존 policy 모두 drop 후 recreate.
do $$ declare pol record; begin
    for pol in select policyname, tablename from pg_policies
               where schemaname='public'
                 and tablename in ('webhook_idempotency','webhook_inbox','raw_payload_retention','auto_reply_log','auto_reply_templates')
    loop execute format('drop policy if exists %I on public.%I', pol.policyname, pol.tablename); end loop;
end $$;

create policy "service_role_all_webhook_idempotency"
    on public.webhook_idempotency
    as permissive
    for all
    to service_role
    using (true)
    with check (true);

-- anon: 전면 차단 (정책 미정의 = 기본 차단, 명시적 deny 추가)
create policy "anon_deny_webhook_idempotency"
    on public.webhook_idempotency
    as restrictive
    for all
    to anon
    using (false)
    with check (false);


-- ---------------------------------------------------------------------------
-- 2. webhook_inbox
-- ---------------------------------------------------------------------------
-- 목적: normalized + masked 인입 기록 영속화.
--       raw payload 는 raw_payload_retention 에 분리 저장.
-- UNIQUE(source, message_id): idempotency 2중 보호 (idempotency 테이블과 함께).
-- product_scope: habix_course | pmf_radar_lab | other (C14)
-- ---------------------------------------------------------------------------
create table if not exists public.webhook_inbox (
    id              uuid        primary key default gen_random_uuid(),
    source          text        not null,
    message_id      text        not null,
    channel         text        not null,
    segment         text,
    masked_message  text        not null,
    classified_json jsonb,
    hitl_required   boolean     not null default false,
    product_scope   text        not null default 'other'
                    constraint webhook_inbox_product_scope_check
                    check (product_scope in ('habix_course', 'pmf_radar_lab', 'other')),
    created_at      timestamptz not null default now(),
    constraint webhook_inbox_source_message_id_unique
        unique (source, message_id)
);

comment on table public.webhook_inbox is
    'Normalized + masked 인입 기록. raw payload 는 raw_payload_retention 에 분리. '
    'UNIQUE(source, message_id) 로 idempotency 2중 보호.';

comment on column public.webhook_inbox.product_scope is
    'habix_course | pmf_radar_lab | other. CHECK constraint 로 3 enum 값만 허용.';

comment on column public.webhook_inbox.masked_message is
    'PII 마스킹 완료 본문. 원문은 raw_payload_retention 에 30일 보존 후 삭제.';

-- RLS 활성화
alter table public.webhook_inbox enable row level security;

create policy "service_role_all_webhook_inbox"
    on public.webhook_inbox
    as permissive
    for all
    to service_role
    using (true)
    with check (true);

create policy "anon_deny_webhook_inbox"
    on public.webhook_inbox
    as restrictive
    for all
    to anon
    using (false)
    with check (false);


-- ---------------------------------------------------------------------------
-- 3. raw_payload_retention
-- ---------------------------------------------------------------------------
-- 목적: raw payload 를 30일 동안만 보존 (PIPA, R6, C6).
--       30일 초과 row 는 pg_cron 에 의해 매일 자동 삭제.
-- ---------------------------------------------------------------------------
create table if not exists public.raw_payload_retention (
    id          uuid        primary key default gen_random_uuid(),
    source      text        not null,
    message_id  text        not null,
    raw_payload jsonb       not null,
    created_at  timestamptz not null default now()
);

comment on table public.raw_payload_retention is
    'Raw webhook payload 30일 임시 보존 (PIPA). '
    'pg_cron 이 매일 02:00 UTC 에 30일 초과 row 를 삭제한다.';

-- RLS 활성화
alter table public.raw_payload_retention enable row level security;

create policy "service_role_all_raw_payload_retention"
    on public.raw_payload_retention
    as permissive
    for all
    to service_role
    using (true)
    with check (true);

create policy "anon_deny_raw_payload_retention"
    on public.raw_payload_retention
    as restrictive
    for all
    to anon
    using (false)
    with check (false);


-- ---------------------------------------------------------------------------
-- 4. auto_reply_log
-- ---------------------------------------------------------------------------
-- 목적: auto-reply audit trail 7일 보존 (US-24, PRD §11).
--       일일 cap 20건 검증의 count 기준 테이블.
--       cancelled 필드: 30초 dwell timer 취소 여부 (US-22).
-- ---------------------------------------------------------------------------
create table if not exists public.auto_reply_log (
    id                  uuid        primary key default gen_random_uuid(),
    inbox_id            uuid        not null
                        references public.webhook_inbox(id)
                        on delete restrict,
    template_id         text        not null,
    sent_at             timestamptz,
    cancelled           boolean     not null default false,
    cancelled_at        timestamptz,
    created_at          timestamptz not null default now(),
    -- 취소 일관성: cancelled=true 이면 cancelled_at 필수
    constraint auto_reply_log_cancel_consistency
        check (
            (cancelled = false and cancelled_at is null)
            or
            (cancelled = true and cancelled_at is not null)
        )
);

comment on table public.auto_reply_log is
    'Auto-reply 발송/취소 audit log. 7일 보존 후 pg_cron 자동 삭제. '
    'daily cap 20건 count 기준 테이블. cancelled=true 이면 cancelled_at 필수.';

comment on column public.auto_reply_log.template_id is
    'data/auto_reply_templates.json 의 entry key. '
    'exact match 만 허용 (LLM 생성 텍스트 발송 금지, US-23).';

-- RLS 활성화
alter table public.auto_reply_log enable row level security;

create policy "service_role_all_auto_reply_log"
    on public.auto_reply_log
    as permissive
    for all
    to service_role
    using (true)
    with check (true);

create policy "anon_deny_auto_reply_log"
    on public.auto_reply_log
    as restrictive
    for all
    to anon
    using (false)
    with check (false);


-- ---------------------------------------------------------------------------
-- 5. auto_reply_templates (metadata 추적용)
-- ---------------------------------------------------------------------------
-- 목적: data/auto_reply_templates.json 의 템플릿 metadata 를 Supabase 에서 추적.
--       last_reviewed_at > 30일 경과 시 validate_schemas check 28 에서 flag.
--       seed 데이터는 supabase/seed/auto_reply_templates_seed.sql 에서 INSERT.
-- ---------------------------------------------------------------------------
create table if not exists public.auto_reply_templates (
    template_id     text        primary key,
    category        text        not null,
    locale          text        not null default 'ko',
    last_reviewed_at timestamptz not null default now(),
    active          boolean     not null default true,
    created_at      timestamptz not null default now()
);

comment on table public.auto_reply_templates is
    'auto_reply_templates.json 의 템플릿 metadata 추적. '
    'last_reviewed_at > 30일 초과 시 validate_schemas check 28 flag.';

-- RLS 활성화
alter table public.auto_reply_templates enable row level security;

create policy "service_role_all_auto_reply_templates"
    on public.auto_reply_templates
    as permissive
    for all
    to service_role
    using (true)
    with check (true);

create policy "anon_deny_auto_reply_templates"
    on public.auto_reply_templates
    as restrictive
    for all
    to anon
    using (false)
    with check (false);


-- ---------------------------------------------------------------------------
-- 6. 인덱스
-- ---------------------------------------------------------------------------
-- webhook_inbox: hitl_required=true 항목 빠른 조회 (HITL 대시보드)
create index if not exists idx_webhook_inbox_hitl
    on public.webhook_inbox (hitl_required, created_at desc)
    where hitl_required = true;

-- webhook_inbox: product_scope 별 PMF Lab 분석
create index if not exists idx_webhook_inbox_product_scope
    on public.webhook_inbox (product_scope, created_at desc);

-- raw_payload_retention: cron 삭제 성능 (created_at 기준)
create index if not exists idx_raw_payload_retention_created_at
    on public.raw_payload_retention (created_at);

-- auto_reply_log: 일일 cap count 성능 (today 기준)
create index if not exists idx_auto_reply_log_created_at
    on public.auto_reply_log (created_at desc);


-- ---------------------------------------------------------------------------
-- 7. pg_cron 자동삭제 스케줄
-- ---------------------------------------------------------------------------
-- 전제: Supabase Dashboard > Database > Extensions > pg_cron 활성화 필요.
-- cron.schedule() 는 superuser 권한으로 실행됨.
-- Supabase SQL Editor (Dashboard) 에서 직접 실행하거나,
-- Supabase CLI 마이그레이션이 superuser context 로 실행될 때만 동작.
--
-- raw_payload_retention: 매일 02:00 UTC, 30일 초과 row 삭제 (PIPA, R6)
select cron.schedule(
    'p2-raw-payload-retention-cleanup',
    '0 2 * * *',
    $$
    delete from public.raw_payload_retention
    where created_at < now() - interval '30 days';
    $$
);

-- auto_reply_log: 매일 02:05 UTC, 7일 초과 row 삭제 (PRD §11 US-24)
select cron.schedule(
    'p2-auto-reply-log-cleanup',
    '5 2 * * *',
    $$
    delete from public.auto_reply_log
    where created_at < now() - interval '7 days';
    $$
);

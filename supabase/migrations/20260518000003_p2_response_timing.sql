-- =============================================================================
-- Migration: 20260518_p2_response_timing.sql
-- Project  : cs-inbox-pmf-radar-lab (P2 Multi-Channel Inbox)
-- Created  : 2026-05-18
-- Author   : β Supabase/Edge Specialist (Round 3)
-- Resolves : ε R2 P2_OPEN_ISSUES_R2.md §E4 (응답시각 컬럼)
--
-- 목적:
--   1. webhook_inbox 에 responded_at timestamptz 컬럼 추가 (M4 의존성)
--   2. 미응답 row 빠른 조회용 partial index 신설
--   3. operator_response_metrics view 신설 (P2_VOLUME_TRACKING_PLAN §M4)
--   4. View RLS: service_role only (anon 차단)
--   5. Trigger: auto_reply_log.sent_at 채워질 때 webhook_inbox.responded_at 자동 갱신
--
-- 전제:
--   20260518_p2_inbox_schema.sql       (Round 1) 이 먼저 적용되어 있어야 함.
--   20260518_p2_telegram_extension.sql (Round 2) 이 먼저 적용되어 있어야 함.
--   uuid-ossp extension 은 Round 1 에서 이미 활성화됨.
--   webhook_inbox.notified_at 은 Round 2 에서 이미 추가됨.
--
-- RLS:
--   operator_response_metrics view → service_role only, anon 전면 차단.
--   base table(webhook_inbox) RLS 는 Round 1 에서 이미 설정됨.
--
-- Idempotency:
--   모든 DDL 에 IF NOT EXISTS / OR REPLACE / DO $$ IF NOT EXISTS $$ 사용.
--   재실행 안전.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. responded_at 컬럼 추가 (idempotent)
-- ---------------------------------------------------------------------------
-- 의미: 운영자가 수동 reply 전송 또는 auto-reply 발송 완료 시각.
--       NULL = 아직 응답 안 됨 (운영 1주 측정 기준점 — 기존 row 모두 NULL 유지).
--
-- 패턴: Round 2 notified_at 컬럼 추가와 동일 (information_schema 확인 후 조건부 실행).
-- ---------------------------------------------------------------------------
do $$
begin
    if not exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name   = 'webhook_inbox'
          and column_name  = 'responded_at'
    ) then
        alter table public.webhook_inbox
            add column responded_at timestamptz;

        comment on column public.webhook_inbox.responded_at is
            '운영자 수동 reply 전송 또는 auto-reply 발송 완료 시각. '
            'NULL = 아직 응답 안 됨. M4 운영자 응답 시간 메트릭 기준 컬럼.';
    end if;
end;
$$;


-- ---------------------------------------------------------------------------
-- 2. 미응답 row partial index
-- ---------------------------------------------------------------------------
-- 목적: responded_at IS NULL 인 row 만 인덱싱 → 미응답 건 빠른 조회.
-- ---------------------------------------------------------------------------
create index if not exists webhook_inbox_responded_at_idx
    on public.webhook_inbox (responded_at)
    where responded_at is null;


-- ---------------------------------------------------------------------------
-- 3. operator_response_metrics view (M4 메트릭 base)
-- ---------------------------------------------------------------------------
-- 목적: 일별 평균 응답 시간·pending 건수·응답 완료 건수 집계.
--       weekly_metrics.py 에서 직접 SELECT 하는 단일 entry point.
--
-- avg_response_seconds:
--   responded_at - created_at (초 단위) 의 평균.
--   responded_at IS NOT NULL 인 row 만 포함 (FILTER 조건).
--   CAST → int (소수점 제거, 가독성).
--
-- day: created_at 기준 day_trunc. 동일 날짜 row 를 하나의 집계 행으로 묶음.
-- ---------------------------------------------------------------------------
create or replace view public.operator_response_metrics
    with (security_invoker = true)
as
select
    date_trunc('day', created_at)                                           as day,
    avg(
        extract(epoch from (responded_at - created_at))
    ) filter (where responded_at is not null)::int                          as avg_response_seconds,
    count(*) filter (where responded_at is null)                            as pending_count,
    count(*) filter (where responded_at is not null)                        as responded_count
from public.webhook_inbox
group by date_trunc('day', created_at);

comment on view public.operator_response_metrics is
    'M4 운영자 응답 시간 메트릭 집계 view. '
    'service_role 전용 (security_invoker = true + base table RLS anon 차단). '
    'weekly_metrics.py 가 이 view 를 직접 SELECT 한다.';


-- ---------------------------------------------------------------------------
-- 4. View RLS 보호 — service_role only
-- ---------------------------------------------------------------------------
-- Postgres view 에 직접 RLS 를 걸 수 없음. 보호 전략:
--   A) security_invoker = true (위 3번 WITH 옵션): view 를 호출하는 role 의
--      권한으로 base table 조회 → anon 이 SELECT 하면 webhook_inbox RLS 차단.
--   B) webhook_inbox 에 이미 "anon_deny_webhook_inbox" restrictive 정책이
--      Round 1 에서 정의됨 → anon SELECT → 0 rows 반환 (silent deny 아님,
--      policy 가 using(false) → 실질적 빈 결과).
--
-- 추가 명시 정책은 필요 없음. 단, service_role 이 anon key 로 호출하는 상황
-- 방지를 위해 webhook_metrics_service_role_only comment 로 운영 정책 명시.
-- ---------------------------------------------------------------------------
-- (RLS 정책은 Round 1 에서 이미 적용됨 — 아래는 정책 문서화 comment 전용)
comment on table public.webhook_inbox is
    'Normalized + masked 인입 기록. raw payload 는 raw_payload_retention 에 분리. '
    'UNIQUE(source, message_id) 로 idempotency 2중 보호. '
    'RLS: service_role all / anon deny. '
    'M4 메트릭: operator_response_metrics view (security_invoker=true) 경유 service_role 전용.';


-- ---------------------------------------------------------------------------
-- 5. Trigger: auto_reply_log.sent_at → webhook_inbox.responded_at 자동 갱신
-- ---------------------------------------------------------------------------
-- 목적: auto-reply 발송 완료(sent_at 채워짐) 시 연결된 webhook_inbox row 의
--       responded_at 을 자동으로 기입. 운영자 수동 기입 없이 M4 메트릭 수집.
--
-- 동작 조건:
--   AFTER INSERT OR UPDATE OF sent_at ON auto_reply_log
--   FOR EACH ROW — 새 row INSERT 시 또는 sent_at 컬럼 UPDATE 시 발동.
--   NEW.sent_at IS NOT NULL: 취소(cancelled=true, sent_at=NULL) 건은 무시.
--   NEW.inbox_id 기준 webhook_inbox.responded_at 을 NEW.sent_at 으로 설정.
--
-- FK 의존성: auto_reply_log.inbox_id → webhook_inbox.id (Round 1 정의).
--   auto_reply_log row 가 없는 경우(수동 reply only) → trigger 미발동 → 정상.
--   운영자 수동 reply 시 responded_at 은 별도 대시보드 컴포넌트(δ R3)에서 기입.
--
-- Idempotency: CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS + CREATE TRIGGER.
-- ---------------------------------------------------------------------------

-- 5-1. trigger function
create or replace function public.sync_responded_at()
returns trigger
language plpgsql
security definer
as $$
begin
    -- sent_at 이 채워진 경우에만 webhook_inbox.responded_at 갱신
    if new.sent_at is not null then
        update public.webhook_inbox
           set responded_at = new.sent_at
         where id = new.inbox_id
           -- 이미 responded_at 이 설정된 경우 덮어쓰지 않음 (최초 응답 시각 보존)
           and responded_at is null;
    end if;
    return new;
end;
$$;

comment on function public.sync_responded_at() is
    'auto_reply_log.sent_at 가 채워질 때 webhook_inbox.responded_at 을 동기화. '
    'security definer: service_role 권한으로 실행. '
    'responded_at IS NULL 조건: 최초 응답 시각만 기록 (덮어쓰기 방지).';

-- 5-2. trigger 연결 (idempotent: 기존 trigger 제거 후 재생성)
drop trigger if exists trg_sync_responded_at on public.auto_reply_log;

create trigger trg_sync_responded_at
    after insert or update of sent_at
    on public.auto_reply_log
    for each row
    execute function public.sync_responded_at();

comment on trigger trg_sync_responded_at on public.auto_reply_log is
    'auto_reply_log INSERT 또는 sent_at UPDATE 시 webhook_inbox.responded_at 자동 기입. '
    'M4 메트릭 자동 수집 트리거.';

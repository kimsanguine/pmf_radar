-- =============================================================================
-- Migration: 20260518_p2_telegram_extension.sql
-- Project  : cs-inbox-pmf-radar-lab (P2 Multi-Channel Inbox)
-- Created  : 2026-05-18
-- Author   : β Supabase/Edge Specialist (Round 2)
--
-- 목적:
--   Telegram 오프타임 가드 (US-9, C12) 를 위한 pending_batch_queue 테이블 추가.
--   Round 1 마이그레이션(20260518_p2_inbox_schema.sql) 이후에 적용됨.
--
-- 전제:
--   20260518_p2_inbox_schema.sql 이 먼저 적용되어 있어야 함.
--   uuid-ossp extension 은 Round 1 에서 이미 활성화됨.
--
-- RLS 정책:
--   service_role → 모든 작업 허용
--   anon         → 전면 차단 (D2 옵션 A, service_role only 확정)
--
-- Idempotency:
--   모든 DDL 에 IF NOT EXISTS 사용 → 중복 실행 안전.
--   cron.schedule 은 job 이름이 이미 존재하면 오류. 먼저 unschedule 후 재등록.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. pending_batch_queue
-- ---------------------------------------------------------------------------
-- 목적: 오프타임(22:00–08:00 KST) 동안 도착한 HITL 알림을 임시 보관.
--       다음 on-hour(08:00 KST)에 flush_pending_batch() 가 일괄 발송.
--
-- 설계 결정:
--   - webhook_inbox.id 를 inbox_id 로 참조 (FK). record 가 처리 완료되면 삭제됨.
--   - on delete cascade: webhook_inbox row 삭제 시 queue row 도 정리됨.
--   - flushed_at: 발송 완료 시점 (NULL = 미발송).
-- ---------------------------------------------------------------------------
create table if not exists public.pending_batch_queue (
    id          uuid        primary key default gen_random_uuid(),
    inbox_id    uuid        not null
                references public.webhook_inbox(id)
                on delete cascade,
    category    text        not null default 'unknown',
    strength    text        not null default 'unknown',
    channel     text        not null default 'unknown',
    flushed_at  timestamptz,
    created_at  timestamptz not null default now()
);

comment on table public.pending_batch_queue is
    'Telegram 오프타임(22:00–08:00 KST) HITL 알림 임시 큐. '
    'flush_pending_batch() 가 08:00 KST 에 일괄 발송 후 row 삭제. '
    'inbox_id FK → webhook_inbox.id (on delete cascade).';

comment on column public.pending_batch_queue.flushed_at is
    'NULL = 미발송. flush 완료 시 timestamp 기입.';

-- RLS 활성화
alter table public.pending_batch_queue enable row level security;

-- service_role: 모든 작업 허용
-- ===== Idempotency guard (re-run safety) =====
do $$ declare pol record; begin
    for pol in select policyname, tablename from pg_policies
               where schemaname='public' and tablename='pending_batch_queue'
    loop execute format('drop policy if exists %I on public.%I', pol.policyname, pol.tablename); end loop;
end $$;

create policy "service_role_all_pending_batch_queue"
    on public.pending_batch_queue
    as permissive
    for all
    to service_role
    using (true)
    with check (true);

-- anon: 전면 차단 (D2 옵션 A, C8 강제)
create policy "anon_deny_pending_batch_queue"
    on public.pending_batch_queue
    as restrictive
    for all
    to anon
    using (false)
    with check (false);


-- ---------------------------------------------------------------------------
-- 2. 인덱스
-- ---------------------------------------------------------------------------
-- 미발송(flushed_at IS NULL) row 빠른 조회 — flush 시 사용
create index if not exists idx_pending_batch_queue_flushed_at
    on public.pending_batch_queue (flushed_at)
    where flushed_at is null;

-- created_at 정렬 — flush 순서 보장 (FIFO)
create index if not exists idx_pending_batch_queue_created_at
    on public.pending_batch_queue (created_at asc);


-- ---------------------------------------------------------------------------
-- 3. pg_cron: pending_batch_queue 오래된 row 정리
-- ---------------------------------------------------------------------------
-- 발송 완료(flushed_at IS NOT NULL) 후 7일 초과 row 정리.
-- 미발송 row 는 삭제하지 않음 (flush 전 삭제 방지).
--
-- 전제: pg_cron extension 이 활성화되어 있어야 함.
--       (Round 1 README 참조: Dashboard > Database > Extensions > pg_cron)
-- ---------------------------------------------------------------------------
-- 기존 job 이 있으면 제거 후 재등록 (idempotency)
select cron.unschedule('p2-pending-batch-queue-cleanup')
where exists (
    select 1 from cron.job where jobname = 'p2-pending-batch-queue-cleanup'
);

select cron.schedule(
    'p2-pending-batch-queue-cleanup',
    '10 2 * * *',
    $$
    delete from public.pending_batch_queue
    where flushed_at is not null
      and flushed_at < now() - interval '7 days';
    $$
);


-- ---------------------------------------------------------------------------
-- 4. webhook_inbox: notified_at 컬럼 추가 (batch flush 추적용)
-- ---------------------------------------------------------------------------
-- flush 완료 시 webhook_inbox.notified_at 기입 → HITL 대시보드 상태 표시.
-- IF NOT EXISTS 패턴 (ALTER TABLE ADD COLUMN 은 표준 구문 사용).
-- ---------------------------------------------------------------------------
do $$
begin
    if not exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'webhook_inbox'
          and column_name = 'notified_at'
    ) then
        alter table public.webhook_inbox
            add column notified_at timestamptz;

        comment on column public.webhook_inbox.notified_at is
            'Telegram 알림 발송 완료 시점. NULL = 미발송(오프타임 큐잉 중 포함).';
    end if;
end;
$$;

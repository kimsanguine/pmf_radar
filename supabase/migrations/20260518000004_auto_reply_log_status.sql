-- =============================================================================
-- Migration: 20260518000004_auto_reply_log_status.sql
-- Project  : cs-inbox-pmf-radar-lab (P2 Multi-Channel Inbox)
-- Created  : 2026-05-18
-- Author   : cloudflare-supabase-debugger
--
-- 목적:
--   auto_reply_log 에 atomic claim/finalize 패턴을 지원하기 위한 컬럼 추가.
--   status        : 처리 단계 enum (pending | processing | sent | failed | cancelled)
--   claimed_at    : cron 이 row 를 claim 한 시각 (stale recovery 기준)
--   error_message : finalize 실패 시 원인 기록
--
-- 전제:
--   20260518000001_p2_inbox_schema.sql (Round 1) 이 먼저 적용되어 있어야 함.
--
-- Idempotency:
--   information_schema 확인 후 조건부 ALTER — 재실행 안전.
--   CHECK constraint: auto_reply_log_cancel_consistency 는 Round 1 에서 정의됨.
--   status 컬럼 추가 후 기존 row 의 status 를 현재 상태에서 역산 (one-time back-fill).
--
-- back-fill 규칙 (Round 1 이전 row 없으므로 사실상 빈 테이블이나 안전하게 명시):
--   cancelled=true          → 'cancelled'
--   sent_at IS NOT NULL     → 'sent'
--   else                    → 'pending'
--
-- stale claim recovery:
--   status='processing' AND claimed_at < now()-2min 인 row 를 'pending' 으로 reset.
--   processDwellQueue 에서 별도 step 으로 처리 (migration 과 무관).
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. status 컬럼 추가 (idempotent)
-- ---------------------------------------------------------------------------
do $$
begin
    if not exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name   = 'auto_reply_log'
          and column_name  = 'status'
    ) then
        alter table public.auto_reply_log
            add column status text not null default 'pending'
            constraint auto_reply_log_status_check
                check (status in ('pending', 'processing', 'sent', 'failed', 'cancelled'));

        comment on column public.auto_reply_log.status is
            'atomic claim/finalize 처리 단계: pending | processing | sent | failed | cancelled. '
            'pending: 대기 중. processing: cron 이 claim 함. '
            'sent: 발송 완료. failed: 발송 실패. cancelled: 운영자 취소.';

        -- back-fill: 기존 row 상태 역산
        update public.auto_reply_log
           set status = case
               when cancelled = true            then 'cancelled'
               when sent_at is not null         then 'sent'
               else                                  'pending'
           end;
    end if;
end;
$$;


-- ---------------------------------------------------------------------------
-- 2. claimed_at 컬럼 추가 (idempotent)
-- ---------------------------------------------------------------------------
do $$
begin
    if not exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name   = 'auto_reply_log'
          and column_name  = 'claimed_at'
    ) then
        alter table public.auto_reply_log
            add column claimed_at timestamptz;

        comment on column public.auto_reply_log.claimed_at is
            'cron 이 row 를 claim 한 시각. '
            'status=processing 진입 시 기입. '
            'now()-claimed_at > 2min 이면 stale claim → status 를 pending 으로 reset.';
    end if;
end;
$$;


-- ---------------------------------------------------------------------------
-- 3. error_message 컬럼 추가 (idempotent)
-- ---------------------------------------------------------------------------
do $$
begin
    if not exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name   = 'auto_reply_log'
          and column_name  = 'error_message'
    ) then
        alter table public.auto_reply_log
            add column error_message text;

        comment on column public.auto_reply_log.error_message is
            '발송 실패(status=failed) 시 원인 메시지. 성공/취소/대기 시 NULL.';
    end if;
end;
$$;


-- ---------------------------------------------------------------------------
-- 4. status 기준 조회 성능 인덱스
-- ---------------------------------------------------------------------------
-- pending row 조회 (processDwellQueue SELECT): status='pending' partial index
create index if not exists idx_auto_reply_log_status_pending
    on public.auto_reply_log (status, created_at)
    where status = 'pending';

-- processing + claimed_at: stale recovery 조회
create index if not exists idx_auto_reply_log_status_processing
    on public.auto_reply_log (status, claimed_at)
    where status = 'processing';

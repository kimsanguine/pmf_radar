-- =============================================================================
-- Rollback: 20260518_p2_inbox_schema.down.sql
-- Project  : cs-inbox-pmf-radar-lab (P2 Multi-Channel Inbox)
-- Created  : 2026-05-18
--
-- 적용 순서: 의존성 역순 (auto_reply_log → webhook_inbox → 나머지)
--   1. pg_cron 스케줄 제거
--   2. auto_reply_log (webhook_inbox FK 참조 → 먼저 삭제)
--   3. auto_reply_templates
--   4. raw_payload_retention
--   5. webhook_inbox
--   6. webhook_idempotency
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. pg_cron 스케줄 제거
-- ---------------------------------------------------------------------------
select cron.unschedule('p2-raw-payload-retention-cleanup');
select cron.unschedule('p2-auto-reply-log-cleanup');


-- ---------------------------------------------------------------------------
-- 2. auto_reply_log
-- ---------------------------------------------------------------------------
drop policy if exists "anon_deny_auto_reply_log"           on public.auto_reply_log;
drop policy if exists "service_role_all_auto_reply_log"    on public.auto_reply_log;
drop index  if exists idx_auto_reply_log_created_at;
drop table  if exists public.auto_reply_log;


-- ---------------------------------------------------------------------------
-- 3. auto_reply_templates
-- ---------------------------------------------------------------------------
drop policy if exists "anon_deny_auto_reply_templates"         on public.auto_reply_templates;
drop policy if exists "service_role_all_auto_reply_templates"  on public.auto_reply_templates;
drop table  if exists public.auto_reply_templates;


-- ---------------------------------------------------------------------------
-- 4. raw_payload_retention
-- ---------------------------------------------------------------------------
drop policy if exists "anon_deny_raw_payload_retention"         on public.raw_payload_retention;
drop policy if exists "service_role_all_raw_payload_retention"  on public.raw_payload_retention;
drop index  if exists idx_raw_payload_retention_created_at;
drop table  if exists public.raw_payload_retention;


-- ---------------------------------------------------------------------------
-- 5. webhook_inbox
-- ---------------------------------------------------------------------------
drop policy if exists "anon_deny_webhook_inbox"      on public.webhook_inbox;
drop policy if exists "service_role_all_webhook_inbox" on public.webhook_inbox;
drop index  if exists idx_webhook_inbox_product_scope;
drop index  if exists idx_webhook_inbox_hitl;
drop table  if exists public.webhook_inbox;


-- ---------------------------------------------------------------------------
-- 6. webhook_idempotency
-- ---------------------------------------------------------------------------
drop policy if exists "anon_deny_webhook_idempotency"         on public.webhook_idempotency;
drop policy if exists "service_role_all_webhook_idempotency"  on public.webhook_idempotency;
drop table  if exists public.webhook_idempotency;

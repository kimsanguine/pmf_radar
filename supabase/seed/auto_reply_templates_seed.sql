-- =============================================================================
-- Seed: auto_reply_templates_seed.sql
-- Project: cs-inbox-pmf-radar-lab (P2)
-- Created: 2026-05-18
--
-- 목적: auto_reply_templates.json 의 category × locale 조합을 Supabase 에서 추적.
--       last_reviewed_at > 30일 초과 시 validate_schemas check 28 에서 stale flag.
--
-- 적용:
--   Supabase Dashboard > SQL Editor 에서 직접 실행
--   또는 supabase db seed --file supabase/seed/auto_reply_templates_seed.sql
--
-- 주의: ON CONFLICT DO NOTHING -- 재실행 idempotent 보장.
-- =============================================================================

insert into public.auto_reply_templates
    (template_id, category, locale, last_reviewed_at, active)
values
    -- setup 카테고리 (auto_reply_ok 분류, US-21)
    ('setup_ko_v1',         'setup',     'ko', now(), true),

    -- basic_faq 카테고리 (auto_reply_ok 분류)
    ('basic_faq_ko_v1',     'basic_faq', 'ko', now(), true),

    -- community 카테고리 (auto_reply_ok 분류)
    ('community_ko_v1',     'community', 'ko', now(), true),

    -- praise 카테고리 (auto_reply_ok 분류, weak evidence 전형)
    ('praise_ko_v1',        'praise',    'ko', now(), true)
on conflict (template_id) do nothing;

-- 적용 확인용 쿼리 (실행 후 결과가 4건이면 정상)
-- select template_id, category, locale, last_reviewed_at, active
--   from public.auto_reply_templates
--  order by category, locale;

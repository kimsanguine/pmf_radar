-- Prepared only: do not apply without separate Supabase approval.
-- A service-role-only restricted projection for PMF Radar -> Signal to Growth.

create table if not exists public.signal_to_growth_outbox (
    id                      uuid primary key default gen_random_uuid(),
    inbox_id                uuid not null references public.webhook_inbox(id) on delete restrict,
    source_record_ref       text not null unique
                            check (source_record_ref ~ '^ref:[A-Za-z0-9_-]{8,192}$'),
    provider                text not null
                            check (provider ~ '^[a-z][a-z0-9_]{1,63}$'),
    provider_event_id       text not null,
    customer_ref_hmac       text not null
                            check (customer_ref_hmac ~ '^hmac(-sha256)?:[A-Za-z0-9_-]{16,128}$'),
    conversation_ref        text not null
                            check (conversation_ref ~ '^(ref|hmac):[A-Za-z0-9_-]{8,192}$'),
    message_ref             text,
    auth_verified           boolean not null,
    verification_assurance  text not null
                            check (verification_assurance in ('none', 'weak', 'medium', 'strong')),
    processing_basis_ref    text not null
                            check (processing_basis_ref ~ '^POL-[A-Z0-9][A-Z0-9._-]{2,127}$'),
    raw_payload_ref         text
                            check (raw_payload_ref is null or raw_payload_ref ~ '^restricted://[A-Za-z0-9][A-Za-z0-9/._-]{2,255}$'),
    export_status           text not null default 'pending'
                            check (export_status in ('pending', 'blocked', 'dead_letter', 'exported')),
    retry_count             integer not null default 0 check (retry_count >= 0 and retry_count <= 20),
    dead_letter_reason      text,
    exported_at             timestamptz,
    created_at              timestamptz not null default now(),
    updated_at              timestamptz not null default now(),
    constraint stg_outbox_identity_unique unique (provider, provider_event_id),
    constraint stg_outbox_assurance_check check (not auth_verified or verification_assurance <> 'none'),
    constraint stg_outbox_dead_letter_check check (
        (export_status = 'dead_letter' and dead_letter_reason is not null)
        or (export_status <> 'dead_letter' and dead_letter_reason is null)
    ),
    constraint stg_outbox_exported_check check (
        (export_status = 'exported' and exported_at is not null)
        or (export_status <> 'exported' and exported_at is null)
    )
);

comment on table public.signal_to_growth_outbox is
    'Restricted PMF Radar projection queue for Signal to Growth. Opaque references only; no raw payload, no trigger, no scheduler.';

alter table public.signal_to_growth_outbox enable row level security;

create policy "service_role_all_signal_to_growth_outbox"
    on public.signal_to_growth_outbox as permissive for all to service_role
    using (true) with check (true);

create policy "anon_deny_signal_to_growth_outbox"
    on public.signal_to_growth_outbox as restrictive for all to anon
    using (false) with check (false);

create index if not exists signal_to_growth_outbox_pending_idx
    on public.signal_to_growth_outbox (created_at)
    where export_status in ('pending', 'blocked');

create index if not exists signal_to_growth_outbox_inbox_idx
    on public.signal_to_growth_outbox (inbox_id);

create extension if not exists pgcrypto;

do $$ begin
  create type public.mp_payment_status as enum ('pending','paid','failed','cancelled','refunded');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.mp_outbound_status as enum ('pending','delivered','skipped','dead');
exception when duplicate_object then null; end $$;

create table if not exists public.mp_merchants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  active boolean not null default true,
  webhook_url text,
  webhook_secret text,
  created_at timestamptz not null default now()
);

create table if not exists public.mp_api_keys (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.mp_merchants(id) on delete cascade,
  key_name text not null default 'default',
  key_prefix text not null,
  key_hash text not null unique,
  active boolean not null default true,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.mp_payments (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.mp_merchants(id),
  idempotency_key text,
  external_reference text,
  amount_cents integer not null check (amount_cents >= 1),
  currency text not null default 'ZAR' check (currency = 'ZAR'),
  description text not null,
  customer_email text,
  return_url text,
  cancel_url text,
  provider text not null default 'payfast',
  provider_payment_id text,
  provider_payload jsonb not null default '{}'::jsonb,
  status public.mp_payment_status not null default 'pending',
  metadata jsonb not null default '{}'::jsonb,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists mp_payments_idempotency_unique on public.mp_payments(merchant_id,idempotency_key) where idempotency_key is not null;
create index if not exists mp_payments_merchant_created_idx on public.mp_payments(merchant_id,created_at desc);
create index if not exists mp_payments_status_idx on public.mp_payments(status);

create table if not exists public.mp_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_hash text not null unique,
  payload jsonb not null,
  valid boolean,
  error text,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.mp_outbound_events (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.mp_merchants(id) on delete cascade,
  event_type text not null,
  dedupe_key text,
  payload jsonb not null,
  status public.mp_outbound_status not null default 'pending',
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  delivered_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);
create index if not exists mp_outbound_retry_idx on public.mp_outbound_events(status,next_attempt_at);
create unique index if not exists mp_outbound_dedupe_unique on public.mp_outbound_events(merchant_id,dedupe_key) where dedupe_key is not null;

alter table public.mp_merchants enable row level security;
alter table public.mp_api_keys enable row level security;
alter table public.mp_payments enable row level security;
alter table public.mp_webhook_events enable row level security;
alter table public.mp_outbound_events enable row level security;

revoke all on table public.mp_merchants from anon, authenticated;
revoke all on table public.mp_api_keys from anon, authenticated;
revoke all on table public.mp_payments from anon, authenticated;
revoke all on table public.mp_webhook_events from anon, authenticated;
revoke all on table public.mp_outbound_events from anon, authenticated;

do $$ begin
  create policy mp_server_only_merchants on public.mp_merchants for all to anon, authenticated using (false) with check (false);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy mp_server_only_api_keys on public.mp_api_keys for all to anon, authenticated using (false) with check (false);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy mp_server_only_payments on public.mp_payments for all to anon, authenticated using (false) with check (false);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy mp_server_only_webhook_events on public.mp_webhook_events for all to anon, authenticated using (false) with check (false);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy mp_server_only_outbound_events on public.mp_outbound_events for all to anon, authenticated using (false) with check (false);
exception when duplicate_object then null; end $$;

create or replace view public.mp_payment_metrics with (security_invoker=true) as
select count(*)::bigint as payment_count,
       count(*) filter (where status='paid')::bigint as paid_count,
       coalesce(sum(amount_cents) filter (where status='paid'),0)::bigint as paid_volume_cents
from public.mp_payments;
revoke all on table public.mp_payment_metrics from anon, authenticated;

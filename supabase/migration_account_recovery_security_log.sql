-- NightGram 2.22.0 — trusted-device 2FA recovery and account security journal.
create extension if not exists pgcrypto;

create table if not exists public.auth_security_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  session_id uuid,
  event_type text not null,
  success boolean not null default true,
  ip_address text,
  device_name text,
  platform text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_auth_security_events_user_created
  on public.auth_security_events(user_id, created_at desc);
create index if not exists idx_auth_security_events_type_created
  on public.auth_security_events(event_type, created_at desc);

alter table public.auth_security_events enable row level security;
drop policy if exists "deny direct security event access" on public.auth_security_events;
create policy "deny direct security event access"
  on public.auth_security_events for all using (false) with check (false);

create table if not exists public.two_factor_recovery_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  session_id uuid not null,
  requested_at timestamptz not null default now(),
  available_at timestamptz not null,
  expires_at timestamptz not null,
  completed_at timestamptz,
  cancelled_at timestamptz,
  ip_address text,
  device_name text,
  constraint two_factor_recovery_dates check (available_at > requested_at and expires_at > available_at)
);

create unique index if not exists idx_two_factor_recovery_one_active
  on public.two_factor_recovery_requests(user_id)
  where completed_at is null and cancelled_at is null;
create index if not exists idx_two_factor_recovery_available
  on public.two_factor_recovery_requests(available_at)
  where completed_at is null and cancelled_at is null;

alter table public.two_factor_recovery_requests enable row level security;
drop policy if exists "deny direct 2fa recovery access" on public.two_factor_recovery_requests;
create policy "deny direct 2fa recovery access"
  on public.two_factor_recovery_requests for all using (false) with check (false);

comment on table public.two_factor_recovery_requests is
  'Delayed TOTP reset requests tied to an established authenticated device.';

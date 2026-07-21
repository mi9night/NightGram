-- NightGram 2.19.0 — active devices and revocable refresh sessions.
create extension if not exists pgcrypto;

create table if not exists public.auth_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  token_hash text not null unique,
  device_name text not null default 'Неизвестное устройство',
  platform text not null default 'unknown',
  user_agent text,
  ip_address text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);

create index if not exists idx_auth_sessions_user_active
  on public.auth_sessions(user_id, revoked_at, last_seen_at desc);
create index if not exists idx_auth_sessions_expires
  on public.auth_sessions(expires_at);

alter table public.auth_sessions enable row level security;

-- The backend uses the service-role key. Do not expose session tokens directly to clients.
drop policy if exists "deny direct auth session access" on public.auth_sessions;
create policy "deny direct auth session access"
  on public.auth_sessions for all
  using (false)
  with check (false);

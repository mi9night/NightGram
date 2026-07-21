-- NightGram 2.21.1 — TOTP authenticator 2FA without email, SMS or a custom domain.
-- Safe to run whether or not migration_two_factor_auth.sql was previously applied.

alter table public.users
  add column if not exists two_factor_enabled boolean not null default false;

alter table public.users
  add column if not exists two_factor_backup_codes jsonb not null default '[]'::jsonb;

alter table public.users
  add column if not exists two_factor_secret_encrypted text;

alter table public.users
  add column if not exists two_factor_last_counter bigint;

create table if not exists public.auth_two_factor_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  purpose text not null check (purpose in ('login', 'enable', 'disable', 'regenerate')),
  token_hash text not null unique,
  code_hash text not null,
  email text not null default 'authenticator@nightgram.local',
  attempts integer not null default 0 check (attempts >= 0),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  ip_address text,
  device_name text,
  pending_secret_encrypted text,
  created_at timestamptz not null default now()
);

alter table public.auth_two_factor_challenges
  add column if not exists pending_secret_encrypted text;

create index if not exists idx_auth_two_factor_challenges_user_purpose
  on public.auth_two_factor_challenges(user_id, purpose, created_at desc);

create index if not exists idx_auth_two_factor_challenges_expiry
  on public.auth_two_factor_challenges(expires_at)
  where consumed_at is null;

alter table public.auth_two_factor_challenges enable row level security;

-- Email-only 2FA from 2.21.0 cannot be verified after switching to TOTP.
-- Keep accounts accessible and let users configure an authenticator app again.
update public.users
   set two_factor_enabled = false,
       two_factor_backup_codes = '[]'::jsonb,
       two_factor_last_counter = null
 where two_factor_enabled = true
   and two_factor_secret_encrypted is null;

create or replace function public.consume_two_factor_counter(p_user_id uuid, p_counter bigint)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.users
     set two_factor_last_counter = p_counter
   where id = p_user_id
     and coalesce(two_factor_last_counter, -1) < p_counter;
  return found;
end;
$$;

revoke all on function public.consume_two_factor_counter(uuid, bigint) from public;
grant execute on function public.consume_two_factor_counter(uuid, bigint) to service_role;

comment on column public.users.two_factor_secret_encrypted is
  'AES-256-GCM encrypted TOTP secret. Encryption key is derived server-side and never returned after setup.';
comment on column public.users.two_factor_backup_codes is
  'SHA-256 hashes of one-time backup codes. Plain codes are only shown once.';
comment on column public.users.two_factor_last_counter is
  'Last accepted TOTP time-step counter, used to reject replayed codes.';

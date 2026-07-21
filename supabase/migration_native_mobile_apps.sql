-- NightGram 3.4.0 — native Android/iOS device push tokens.
create table if not exists public.native_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  token text not null,
  platform text not null check (platform in ('android', 'ios')),
  device_id text not null,
  app_version text,
  timezone_offset_minutes integer not null default 0 check (timezone_offset_minutes between -840 and 840),
  voip boolean not null default false,
  enabled boolean not null default true,
  last_success_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform, token)
);

create index if not exists native_push_tokens_user_id_idx on public.native_push_tokens(user_id);
create index if not exists native_push_tokens_device_id_idx on public.native_push_tokens(user_id, device_id);
create index if not exists native_push_tokens_enabled_idx on public.native_push_tokens(user_id, enabled) where enabled = true;

alter table public.native_push_tokens enable row level security;

revoke all on public.native_push_tokens from anon, authenticated;
-- Tokens are managed only through the authenticated backend service role.

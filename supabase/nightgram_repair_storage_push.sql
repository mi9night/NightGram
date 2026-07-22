-- NightGram repair: Storage + Web Push
-- Run in Supabase Dashboard -> SQL Editor -> New query -> Run.

-- ---------------------------------------------------------------------------
-- 1. Public media bucket used by backend/src/routes/upload.js
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('nightgram-media', 'nightgram-media', true, 52428800)
on conflict (id) do update
set public = true,
    file_size_limit = 52428800;

drop policy if exists "nightgram-media-public-read" on storage.objects;
create policy "nightgram-media-public-read"
on storage.objects
for select
using (bucket_id = 'nightgram-media');

-- Uploads are made by Railway with SUPABASE_SERVICE_ROLE_KEY.
-- Anonymous INSERT/UPDATE/DELETE policies are intentionally not created.

-- ---------------------------------------------------------------------------
-- 2. Browser push subscriptions
-- ---------------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  platform text,
  timezone_offset_minutes integer not null default 0,
  enabled boolean not null default true,
  last_success_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Keep an older/partial table compatible with the current backend.
alter table public.push_subscriptions add column if not exists p256dh text;
alter table public.push_subscriptions add column if not exists auth text;
alter table public.push_subscriptions add column if not exists user_agent text;
alter table public.push_subscriptions add column if not exists platform text;
alter table public.push_subscriptions add column if not exists timezone_offset_minutes integer not null default 0;
alter table public.push_subscriptions add column if not exists enabled boolean not null default true;
alter table public.push_subscriptions add column if not exists last_success_at timestamptz;
alter table public.push_subscriptions add column if not exists last_error text;
alter table public.push_subscriptions add column if not exists created_at timestamptz not null default now();
alter table public.push_subscriptions add column if not exists updated_at timestamptz not null default now();

create unique index if not exists idx_push_subscriptions_endpoint
  on public.push_subscriptions(endpoint);

create index if not exists idx_push_subscriptions_user
  on public.push_subscriptions(user_id, enabled);

alter table public.push_subscriptions enable row level security;

drop policy if exists push_subscriptions_select_own on public.push_subscriptions;
create policy push_subscriptions_select_own
on public.push_subscriptions
for select
using (auth.uid() = user_id);

drop policy if exists push_subscriptions_insert_own on public.push_subscriptions;
create policy push_subscriptions_insert_own
on public.push_subscriptions
for insert
with check (auth.uid() = user_id);

drop policy if exists push_subscriptions_update_own on public.push_subscriptions;
create policy push_subscriptions_update_own
on public.push_subscriptions
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists push_subscriptions_delete_own on public.push_subscriptions;
create policy push_subscriptions_delete_own
on public.push_subscriptions
for delete
using (auth.uid() = user_id);

select id, name, public, file_size_limit
from storage.buckets
where id = 'nightgram-media';

select to_regclass('public.push_subscriptions') as push_subscriptions_table;

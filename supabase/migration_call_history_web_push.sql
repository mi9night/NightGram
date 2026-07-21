-- NightGram 3.2.0 — call history and Web Push subscriptions
-- Run once in Supabase SQL Editor before deploying backend 3.2.0.

create table if not exists public.call_history (
  id uuid primary key default gen_random_uuid(),
  call_id text not null,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  initiator_id uuid not null references public.users(id) on delete cascade,
  direction text not null check (direction in ('incoming','outgoing')),
  call_type text not null default 'audio' check (call_type in ('audio','video')),
  is_group boolean not null default false,
  status text not null default 'ringing' check (status in ('ringing','active','completed','missed','rejected','cancelled','failed')),
  conversation_title text,
  avatar_url text,
  initiator_username text,
  participant_ids jsonb not null default '[]'::jsonb,
  started_at timestamptz not null default now(),
  answered_at timestamptz,
  ended_at timestamptz,
  duration_sec integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (call_id, user_id)
);

create index if not exists idx_call_history_user_started
  on public.call_history(user_id, started_at desc);
create index if not exists idx_call_history_pending
  on public.call_history(user_id, status, started_at desc)
  where status = 'ringing';
create index if not exists idx_call_history_call_id
  on public.call_history(call_id);

alter table public.call_history enable row level security;
drop policy if exists call_history_select_own on public.call_history;
create policy call_history_select_own on public.call_history
for select using (auth.uid() = user_id);

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

create index if not exists idx_push_subscriptions_user
  on public.push_subscriptions(user_id, enabled);

alter table public.push_subscriptions enable row level security;
drop policy if exists push_subscriptions_select_own on public.push_subscriptions;
create policy push_subscriptions_select_own on public.push_subscriptions
for select using (auth.uid() = user_id);
drop policy if exists push_subscriptions_insert_own on public.push_subscriptions;
create policy push_subscriptions_insert_own on public.push_subscriptions
for insert with check (auth.uid() = user_id);
drop policy if exists push_subscriptions_update_own on public.push_subscriptions;
create policy push_subscriptions_update_own on public.push_subscriptions
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists push_subscriptions_delete_own on public.push_subscriptions;
create policy push_subscriptions_delete_own on public.push_subscriptions
for delete using (auth.uid() = user_id);

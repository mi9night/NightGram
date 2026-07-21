-- =============================================================================
--  NightGram — Supabase / PostgreSQL schema
--  Shared by Web, Mobile & Backend. Run this in the Supabase SQL editor.
--  All writes go through the backend (service role); the browser uses anon + RLS.
-- =============================================================================

-- Enable extensions ----------------------------------------------------------
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- Users ---------------------------------------------------------------------
create table if not exists public.users (
  id            uuid primary key default uuid_generate_v4(),
  username      text unique not null check (char_length(username) between 3 and 30),
  display_name  text not null default '',
  email         text unique not null,
  password_hash text not null,
  avatar_url    text,
  bio           text not null default '',
  name_color    text not null default '#a855f7',
  glow_effect   text,
  avatar_frame  text,
  is_premium    boolean not null default false,
  premium_until timestamptz,
  night_coins   integer not null default 0,
  role          text not null default 'user' check (role in ('user','creator','moderator','admin')),
  followers_count integer not null default 0,
  following_count integer not null default 0,
  posts_count     integer not null default 0,
  created_at    timestamptz not null default now()
);

-- Channels ------------------------------------------------------------------
create table if not exists public.channels (
  id               uuid primary key default uuid_generate_v4(),
  name             text not null,
  handle           text unique not null,
  avatar_url       text,
  description      text not null default '',
  subscribers_count integer not null default 0,
  verified         boolean not null default false,
  owner_id         uuid references public.users(id) on delete set null,
  created_at       timestamptz not null default now()
);

-- Posts ---------------------------------------------------------------------
create table if not exists public.posts (
  id            uuid primary key default uuid_generate_v4(),
  author_user_id    uuid references public.users(id) on delete cascade,
  author_channel_id uuid references public.channels(id) on delete cascade,
  text          text,
  tags          text[] not null default '{}',
  likes_count   integer not null default 0,
  comments_count integer not null default 0,
  views_count   integer not null default 0,
  shares_count  integer not null default 0,
  created_at    timestamptz not null default now(),
  check (author_user_id is not null or author_channel_id is not null)
);
create index if not exists idx_posts_created_at on public.posts (created_at desc);

-- Post media ----------------------------------------------------------------
create table if not exists public.post_media (
  id          uuid primary key default uuid_generate_v4(),
  post_id     uuid references public.posts(id) on delete cascade,
  type        text not null check (type in ('image','video')),
  url         text not null,
  thumbnail_url text,
  width       integer,
  height      integer,
  duration_sec integer,
  position    integer not null default 0
);

-- Likes / saves -------------------------------------------------------------
create table if not exists public.post_likes (
  post_id uuid references public.posts(id) on delete cascade,
  user_id uuid references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create table if not exists public.post_saves (
  post_id uuid references public.posts(id) on delete cascade,
  user_id uuid references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

-- Comments ------------------------------------------------------------------
create table if not exists public.comments (
  id          uuid primary key default uuid_generate_v4(),
  post_id     uuid references public.posts(id) on delete cascade,
  author_id   uuid references public.users(id) on delete cascade,
  text        text not null,
  likes_count integer not null default 0,
  created_at  timestamptz not null default now()
);

-- Views ---------------------------------------------------------------------
create table if not exists public.post_views (
  post_id uuid references public.posts(id) on delete cascade,
  user_id uuid references public.users(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

-- Messenger -----------------------------------------------------------------
create table if not exists public.conversations (
  id    uuid primary key default uuid_generate_v4(),
  type  text not null check (type in ('direct','group')),
  title text not null default '',
  avatar_url text,
  folder text not null default 'all',
  created_at timestamptz not null default now()
);

create table if not exists public.conversation_participants (
  conversation_id uuid references public.conversations(id) on delete cascade,
  user_id uuid references public.users(id) on delete cascade,
  role text not null default 'member' check (role in ('member','admin','owner')),
  pinned boolean not null default false,
  muted boolean not null default false,
  last_read_at timestamptz,
  primary key (conversation_id, user_id)
);

create table if not exists public.messages (
  id uuid primary key default uuid_generate_v4(),
  conversation_id uuid references public.conversations(id) on delete cascade,
  sender_id uuid references public.users(id) on delete cascade,
  client_id text,
  text text,
  type text not null default 'text' check (type in ('text','image','video','audio','file','sticker','poll','system')),
  attachment_url text,
  attachment_thumbnail_url text,
  media_width integer,
  media_height integer,
  media_duration_sec integer,
  reply_to uuid references public.messages(id) on delete set null,
  edited_at timestamptz,
  deleted_at timestamptz,
  pinned_at timestamptz,
  pinned_by uuid references public.users(id) on delete set null,
  status text not null default 'sent' check (status in ('sending','sent','delivered','read')),
  created_at timestamptz not null default now()
);
alter table public.messages add column if not exists client_id text;
create index if not exists idx_messages_conv on public.messages (conversation_id, created_at);
create unique index if not exists uq_messages_sender_client_id on public.messages (sender_id, client_id) where client_id is not null;
create index if not exists idx_messages_client_id on public.messages (client_id) where client_id is not null;
create index if not exists idx_messages_pinned on public.messages (conversation_id, pinned_at desc) where pinned_at is not null;

CREATE TABLE IF NOT EXISTS public.message_polls (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id uuid NOT NULL UNIQUE REFERENCES public.messages(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  question text NOT NULL,
  allow_multiple boolean NOT NULL DEFAULT false,
  anonymous boolean NOT NULL DEFAULT true,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.message_poll_options (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  poll_id uuid NOT NULL REFERENCES public.message_polls(id) ON DELETE CASCADE,
  text text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (poll_id, position)
);
CREATE TABLE IF NOT EXISTS public.message_poll_votes (
  poll_id uuid NOT NULL REFERENCES public.message_polls(id) ON DELETE CASCADE,
  option_id uuid NOT NULL REFERENCES public.message_poll_options(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (option_id, user_id)
);
CREATE TABLE IF NOT EXISTS public.message_mentions (
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);

create table if not exists public.message_reactions (
  message_id uuid references public.messages(id) on delete cascade,
  user_id uuid references public.users(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

-- Night Store ---------------------------------------------------------------
create table if not exists public.store_items (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  description text not null default '',
  category text not null check (category in ('theme','color_pack','sticker_pack','frame','glow_effect','badge')),
  preview_url text not null,
  price_coins integer not null default 0,
  stripe_price_id text,
  rarity text not null default 'common' check (rarity in ('common','rare','epic','legendary')),
  created_at timestamptz not null default now()
);

create table if not exists public.user_items (
  user_id uuid references public.users(id) on delete cascade,
  item_id uuid references public.store_items(id) on delete cascade,
  purchased_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

-- Coin transactions (ledger) ------------------------------------------------
create table if not exists public.coin_transactions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.users(id) on delete cascade,
  delta integer not null,            -- positive = credit, negative = debit
  reason text not null,              -- 'purchase','topup','reward','refund'
  reference_id text,                 -- stripe payment intent / item id
  created_at timestamptz not null default now()
);

-- Presence ------------------------------------------------------------------
create table if not exists public.presence (
  user_id uuid primary key references public.users(id) on delete cascade,
  is_online boolean not null default false,
  last_seen timestamptz not null default now()
);

-- ============================================================================
-- Row Level Security
-- The browser anon key can READ public content. All writes go through the
-- backend service-role key (which bypasses RLS), so anon has insert/update
-- restricted. Adjust per your trust model.
-- ============================================================================
alter table public.users enable row level security;
alter table public.posts enable row level security;
alter table public.post_media enable row level security;
alter table public.comments enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.store_items enable row level security;

-- Public read policies (anon can browse the feed / store)
create policy "public read users" on public.users for select using (true);
create policy "public read posts" on public.posts for select using (true);
create policy "public read media" on public.post_media for select using (true);
create policy "public read comments" on public.comments for select using (true);
create policy "public read store" on public.store_items for select using (true);

-- Conversations/messages: only participants can read (matched in backend).
create policy "participants read convos" on public.conversations for select using (true);
create policy "participants read messages" on public.messages for select using (true);

-- ============================================================================
-- Helpful updated_at counters trigger (optional)
-- ============================================================================
create or replace function public.bump_post_counters() returns trigger as $$
begin
  if (tg_op = 'INSERT') then
    update public.posts set likes_count = likes_count + 1 where id = new.post_id;
  elsif (tg_op = 'DELETE') then
    update public.posts set likes_count = greatest(0, likes_count - 1) where id = old.post_id;
  end if;
  return null;
end;
$$ language plpgsql;

drop trigger if exists trg_post_likes on public.post_likes;
create trigger trg_post_likes after insert or delete on public.post_likes
for each row execute function public.bump_post_counters();


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

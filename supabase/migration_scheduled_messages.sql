-- NightGram 2.15.0 — server-side scheduled messages
create table if not exists public.scheduled_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.users(id) on delete cascade,
  text text,
  type text not null default 'text',
  attachment_url text,
  attachment_thumbnail_url text,
  media_width integer,
  media_height integer,
  media_duration_sec integer,
  reply_to uuid references public.messages(id) on delete set null,
  scheduled_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','processing','sent','failed','cancelled')),
  sent_at timestamptz,
  sent_message_id uuid references public.messages(id) on delete set null,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_scheduled_messages_due
  on public.scheduled_messages(status, scheduled_at)
  where status = 'pending';

create index if not exists idx_scheduled_messages_conversation_sender
  on public.scheduled_messages(conversation_id, sender_id, scheduled_at desc);

alter table public.scheduled_messages enable row level security;

-- The backend uses the service role. These policies also keep direct Supabase
-- access safe if it is introduced in a future mobile client.
drop policy if exists scheduled_messages_select_own on public.scheduled_messages;
create policy scheduled_messages_select_own on public.scheduled_messages
for select using (auth.uid() = sender_id);

drop policy if exists scheduled_messages_insert_own on public.scheduled_messages;
create policy scheduled_messages_insert_own on public.scheduled_messages
for insert with check (auth.uid() = sender_id);

drop policy if exists scheduled_messages_update_own on public.scheduled_messages;
create policy scheduled_messages_update_own on public.scheduled_messages
for update using (auth.uid() = sender_id) with check (auth.uid() = sender_id);

drop policy if exists scheduled_messages_delete_own on public.scheduled_messages;
create policy scheduled_messages_delete_own on public.scheduled_messages
for delete using (auth.uid() = sender_id);

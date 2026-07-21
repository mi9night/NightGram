-- NightGram 2.16.0 — per-user chat archive and organization folders.
-- Safe to run more than once.

alter table public.conversation_participants
  add column if not exists archived boolean not null default false;

alter table public.conversation_participants
  add column if not exists folder text not null default 'all';

update public.conversation_participants
set folder = 'all'
where folder is null or folder not in ('all', 'work', 'friends', 'family');

create index if not exists idx_conversation_participants_user_archived
  on public.conversation_participants (user_id, archived);

create index if not exists idx_conversation_participants_user_folder
  on public.conversation_participants (user_id, folder);

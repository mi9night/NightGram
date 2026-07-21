-- NightGram 2.13.0 — group management
-- Safe to run repeatedly.

alter table public.conversations
  add column if not exists description text;

update public.conversations
set description = ''
where description is null;

-- Keep role values predictable for group permissions while preserving old data.
update public.conversation_participants
set role = 'member'
where role is null or role = '';

create index if not exists idx_conversation_participants_conversation_role
  on public.conversation_participants (conversation_id, role);

-- NightGram 2.20.0 — privacy and personal safety
alter table public.users add column if not exists privacy_profile text not null default 'everyone';
alter table public.users add column if not exists privacy_messages text not null default 'everyone';
alter table public.users add column if not exists privacy_groups text not null default 'everyone';
alter table public.users add column if not exists privacy_last_seen text not null default 'everyone';
alter table public.users add column if not exists hide_read_receipts boolean not null default false;
alter table public.users add column if not exists filter_unknown_messages boolean not null default true;

alter table public.users drop constraint if exists users_privacy_profile_check;
alter table public.users add constraint users_privacy_profile_check check (privacy_profile in ('everyone','following','friends','nobody'));
alter table public.users drop constraint if exists users_privacy_messages_check;
alter table public.users add constraint users_privacy_messages_check check (privacy_messages in ('everyone','following','friends','nobody'));
alter table public.users drop constraint if exists users_privacy_groups_check;
alter table public.users add constraint users_privacy_groups_check check (privacy_groups in ('everyone','following','friends','nobody'));
alter table public.users drop constraint if exists users_privacy_last_seen_check;
alter table public.users add constraint users_privacy_last_seen_check check (privacy_last_seen in ('everyone','following','friends','nobody'));

create unique index if not exists idx_user_blocks_pair on public.user_blocks(user_id, blocked_id);
create index if not exists idx_user_blocks_reverse on public.user_blocks(blocked_id, user_id);

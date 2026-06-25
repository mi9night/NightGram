-- =============================================================================
-- NightGram — FULL CURRENT Supabase schema
-- Use this when a fresh/partial Supabase project fails with errors like:
--   relation "public.comments" does not exist
-- Run this FIRST, then run migration_stage2_social_payments.sql only if you need
-- to re-apply the latest additive changes. This file is idempotent.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users ----------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS users_ng_id_seq START 10000001;

CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  username text UNIQUE NOT NULL CHECK (char_length(username) BETWEEN 3 AND 30),
  display_name text NOT NULL DEFAULT '',
  email text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  avatar_url text,
  banner_url text,
  bio text NOT NULL DEFAULT '',
  custom_id text,
  ng_id bigint DEFAULT nextval('users_ng_id_seq'),
  name_color text NOT NULL DEFAULT '#ffffff',
  name_color_id text DEFAULT 'light',
  glow_effect text,
  avatar_frame text,
  is_premium boolean NOT NULL DEFAULT false,
  premium_until timestamptz,
  night_coins integer NOT NULL DEFAULT 0,
  role text NOT NULL DEFAULT 'user',
  followers_count integer NOT NULL DEFAULT 0,
  following_count integer NOT NULL DEFAULT 0,
  posts_count integer NOT NULL DEFAULT 0,
  notification_settings jsonb DEFAULT '{"push":true,"messages":true,"likes":true,"comments":true,"newFollowers":true,"storeDrops":true,"sounds":true}'::jsonb,
  hide_social boolean NOT NULL DEFAULT false,
  banned_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS display_name text NOT NULL DEFAULT '';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS banner_url text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS custom_id text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS ng_id bigint DEFAULT nextval('users_ng_id_seq');
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS name_color_id text DEFAULT 'light';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS notification_settings jsonb DEFAULT '{"push":true,"messages":true,"likes":true,"comments":true,"newFollowers":true,"storeDrops":true,"sounds":true}'::jsonb;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS hide_social boolean NOT NULL DEFAULT false;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS hide_purchases boolean NOT NULL DEFAULT false;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS banned_until timestamptz;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS night_status_text text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS night_status_emoji text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS night_status_expires_at timestamptz;
ALTER TABLE public.users ALTER COLUMN name_color SET DEFAULT '#ffffff';

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN (
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.users'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%role%'
  ) LOOP
    EXECUTE format('ALTER TABLE public.users DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.users ADD CONSTRAINT users_role_check
  CHECK (role IN ('user','creator','moderator','admin','support','co_owner','owner'));

CREATE UNIQUE INDEX IF NOT EXISTS users_custom_id_key ON public.users (custom_id) WHERE custom_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_custom_id ON public.users (custom_id) WHERE custom_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_ng_id ON public.users (ng_id);

-- Channels -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.channels (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  handle text UNIQUE NOT NULL,
  avatar_url text,
  banner_url text,
  description text NOT NULL DEFAULT '',
  tags text[] NOT NULL DEFAULT '{}',
  subscribers_count integer NOT NULL DEFAULT 0,
  verified boolean NOT NULL DEFAULT false,
  owner_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS banner_url text;
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';

-- Posts ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.posts (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  author_user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  author_channel_id uuid REFERENCES public.channels(id) ON DELETE CASCADE,
  text text,
  tags text[] NOT NULL DEFAULT '{}',
  likes_count integer NOT NULL DEFAULT 0,
  comments_count integer NOT NULL DEFAULT 0,
  views_count integer NOT NULL DEFAULT 0,
  shares_count integer NOT NULL DEFAULT 0,
  visibility text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','followers','circle')),
  circle_id uuid,
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('published','draft','scheduled')),
  scheduled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (author_user_id IS NOT NULL OR author_channel_id IS NOT NULL)
);
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'public';
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS circle_id uuid;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'published';
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS scheduled_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON public.posts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_visibility ON public.posts(visibility, circle_id);
CREATE INDEX IF NOT EXISTS idx_posts_status_schedule ON public.posts(status, scheduled_at);

CREATE TABLE IF NOT EXISTS public.post_media (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id uuid REFERENCES public.posts(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('image','video')),
  url text NOT NULL,
  thumbnail_url text,
  width integer,
  height integer,
  duration_sec integer,
  position integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.post_likes (
  post_id uuid REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.post_saves (
  post_id uuid REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.comments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id uuid REFERENCES public.posts(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.comments(id) ON DELETE CASCADE,
  author_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  text text NOT NULL,
  likes_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.comments(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_comments_parent ON public.comments(parent_id);
CREATE INDEX IF NOT EXISTS idx_comments_author_created ON public.comments(author_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.post_views (
  post_id uuid REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

-- Messenger ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.conversations (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  type text NOT NULL CHECK (type IN ('direct','group')),
  title text NOT NULL DEFAULT '',
  avatar_url text,
  folder text NOT NULL DEFAULT 'all',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.conversation_participants (
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('member','admin','owner')),
  pinned boolean NOT NULL DEFAULT false,
  muted boolean NOT NULL DEFAULT false,
  request_status text NOT NULL DEFAULT 'accepted' CHECK (request_status IN ('accepted','pending','hidden','blocked')),
  hidden boolean NOT NULL DEFAULT false,
  last_read_at timestamptz,
  PRIMARY KEY (conversation_id, user_id)
);
ALTER TABLE public.conversation_participants ADD COLUMN IF NOT EXISTS request_status text NOT NULL DEFAULT 'accepted';
ALTER TABLE public.conversation_participants ADD COLUMN IF NOT EXISTS hidden boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  text text,
  type text NOT NULL DEFAULT 'text' CHECK (type IN ('text','image','video','file','sticker','system')),
  attachment_url text,
  reply_to uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sending','sent','delivered','read')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_messages_conv ON public.messages (conversation_id, created_at);

CREATE TABLE IF NOT EXISTS public.message_reactions (
  message_id uuid REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id, emoji)
);

CREATE TABLE IF NOT EXISTS public.message_reads (
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  delivered_at timestamptz,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_message_reads_conversation_user ON public.message_reads(conversation_id, user_id);
CREATE INDEX IF NOT EXISTS idx_message_reads_message ON public.message_reads(message_id);

-- Night Store / payments -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.store_items (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  category text NOT NULL CHECK (category IN ('theme','color_pack','sticker_pack','frame','glow_effect','badge','nft')),
  preview_url text NOT NULL,
  price_coins integer NOT NULL DEFAULT 0,
  stripe_price_id text,
  rarity text NOT NULL DEFAULT 'common' CHECK (rarity IN ('common','rare','epic','legendary')),
  drop_starts_at timestamptz,
  drop_ends_at timestamptz,
  stock_total integer,
  stock_sold integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.store_items ADD COLUMN IF NOT EXISTS drop_starts_at timestamptz;
ALTER TABLE public.store_items ADD COLUMN IF NOT EXISTS drop_ends_at timestamptz;
ALTER TABLE public.store_items ADD COLUMN IF NOT EXISTS stock_total integer;
ALTER TABLE public.store_items ADD COLUMN IF NOT EXISTS stock_sold integer NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_store_items_drop ON public.store_items(drop_ends_at, drop_starts_at);

CREATE TABLE IF NOT EXISTS public.user_items (
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  item_id uuid REFERENCES public.store_items(id) ON DELETE CASCADE,
  purchased_at timestamptz NOT NULL DEFAULT now(),
  applied boolean NOT NULL DEFAULT false,
  applied_at timestamptz,
  PRIMARY KEY (user_id, item_id)
);
ALTER TABLE public.user_items ADD COLUMN IF NOT EXISTS applied boolean NOT NULL DEFAULT false;
ALTER TABLE public.user_items ADD COLUMN IF NOT EXISTS applied_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_user_items_applied ON public.user_items(user_id, applied) WHERE applied = true;

CREATE TABLE IF NOT EXISTS public.coin_transactions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  delta integer NOT NULL,
  reason text NOT NULL,
  reference_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.purchase_requests (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  username text NOT NULL,
  ng_id bigint,
  item_type text NOT NULL,
  item_name text NOT NULL,
  price integer NOT NULL,
  status text DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  payment_code text,
  provider text DEFAULT 'manual',
  expected_amount integer,
  paid_amount integer,
  provider_payment_id text,
  auto_matched_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);
ALTER TABLE public.purchase_requests ADD COLUMN IF NOT EXISTS payment_code text;
ALTER TABLE public.purchase_requests ADD COLUMN IF NOT EXISTS provider text DEFAULT 'manual';
ALTER TABLE public.purchase_requests ADD COLUMN IF NOT EXISTS expected_amount integer;
ALTER TABLE public.purchase_requests ADD COLUMN IF NOT EXISTS paid_amount integer;
ALTER TABLE public.purchase_requests ADD COLUMN IF NOT EXISTS provider_payment_id text;
ALTER TABLE public.purchase_requests ADD COLUMN IF NOT EXISTS auto_matched_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS purchase_requests_payment_code_key ON public.purchase_requests(payment_code) WHERE payment_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_purchase_status ON public.purchase_requests(status);
CREATE INDEX IF NOT EXISTS idx_purchase_payment_code ON public.purchase_requests(payment_code);

CREATE TABLE IF NOT EXISTS public.payment_events (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider text NOT NULL,
  provider_payment_id text NOT NULL,
  amount integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'RUB',
  username text,
  message text,
  raw_payload jsonb,
  matched_purchase_id uuid REFERENCES public.purchase_requests(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'unmatched' CHECK (status IN ('unmatched','matched','ignored','amount_mismatch','suspicious')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS payment_events_provider_payment_key ON public.payment_events(provider, provider_payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_status ON public.payment_events(status, created_at DESC);

-- Presence / notifications / moderation -------------------------------------
CREATE TABLE IF NOT EXISTS public.presence (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  is_online boolean NOT NULL DEFAULT false,
  last_seen timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'system',
  title text NOT NULL,
  body text,
  avatar_url text,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_id);

CREATE TABLE IF NOT EXISTS public.tickets (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  subject text NOT NULL,
  body text DEFAULT '',
  category text DEFAULT 'Вопрос',
  status text DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved','unresolved','closed')),
  priority text DEFAULT 'low' CHECK (priority IN ('low','medium','high')),
  author_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  author_name text,
  assigned_to text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON public.tickets(status);

CREATE TABLE IF NOT EXISTS public.punishments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('ban','mute_dm','mute_posts','warning')),
  reason text,
  duration text,
  issued_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  issued_by_name text,
  active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_punishments_user ON public.punishments(user_id);
CREATE INDEX IF NOT EXISTS idx_punishments_active ON public.punishments(active);

CREATE TABLE IF NOT EXISTS public.reports (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  target_type text NOT NULL,
  target_id text NOT NULL,
  category text NOT NULL,
  reason text,
  reporter_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  reporter_name text,
  status text DEFAULT 'pending' CHECK (status IN ('pending','reviewed','actioned')),
  resolution_note text,
  reviewed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS resolution_note text;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS updated_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_reports_status ON public.reports(status);

CREATE TABLE IF NOT EXISTS public.moderation_notes (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  report_id uuid REFERENCES public.reports(id) ON DELETE CASCADE,
  target_type text,
  target_id text,
  author_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  author_name text,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_moderation_notes_report ON public.moderation_notes(report_id, created_at);

CREATE TABLE IF NOT EXISTS public.moderation_logs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  action text NOT NULL,
  admin_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  admin_name text,
  target_user_id uuid,
  target_user_name text,
  details text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_logs_created ON public.moderation_logs(created_at DESC);

-- Social graph ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.friendships (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  friend_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'accepted' CHECK (status IN ('pending','accepted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, friend_id),
  CHECK (user_id <> friend_id)
);
CREATE INDEX IF NOT EXISTS idx_friendships_friend ON public.friendships(friend_id);

CREATE TABLE IF NOT EXISTS public.favorite_users (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  target_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, target_id),
  CHECK (user_id <> target_id)
);

CREATE TABLE IF NOT EXISTS public.user_blocks (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, blocked_id),
  CHECK (user_id <> blocked_id)
);

CREATE TABLE IF NOT EXISTS public.user_circles (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#a855f7',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_circles_owner ON public.user_circles(owner_id);

CREATE TABLE IF NOT EXISTS public.user_circle_members (
  circle_id uuid NOT NULL REFERENCES public.user_circles(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (circle_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_user_circle_members_user ON public.user_circle_members(user_id);

CREATE TABLE IF NOT EXISTS public.channel_subscriptions (
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (channel_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_channel_subscriptions_user ON public.channel_subscriptions(user_id);

CREATE TABLE IF NOT EXISTS public.follows (
  follower_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  following_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, following_id),
  CHECK (follower_id <> following_id)
);
CREATE INDEX IF NOT EXISTS idx_follows_following ON public.follows(following_id);
CREATE INDEX IF NOT EXISTS idx_follows_follower ON public.follows(follower_id);

-- RLS ------------------------------------------------------------------------
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_saves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coin_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.presence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.punishments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moderation_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moderation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favorite_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_circles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_circle_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

-- Broad permissive policies. Browser writes still go through backend service role.
-- Clean up old policy names from earlier incremental migrations.
DROP POLICY IF EXISTS "read payment events" ON public.payment_events;
DROP POLICY IF EXISTS "insert payment events" ON public.payment_events;
DROP POLICY IF EXISTS "update payment events" ON public.payment_events;
DROP POLICY IF EXISTS "read friendships" ON public.friendships;
DROP POLICY IF EXISTS "insert friendships" ON public.friendships;
DROP POLICY IF EXISTS "delete friendships" ON public.friendships;
DROP POLICY IF EXISTS "read favorites" ON public.favorite_users;
DROP POLICY IF EXISTS "insert favorites" ON public.favorite_users;
DROP POLICY IF EXISTS "delete favorites" ON public.favorite_users;
DROP POLICY IF EXISTS "read blocks" ON public.user_blocks;
DROP POLICY IF EXISTS "insert blocks" ON public.user_blocks;
DROP POLICY IF EXISTS "delete blocks" ON public.user_blocks;
DROP POLICY IF EXISTS "read channel subscriptions" ON public.channel_subscriptions;
DROP POLICY IF EXISTS "insert channel subscriptions" ON public.channel_subscriptions;
DROP POLICY IF EXISTS "delete channel subscriptions" ON public.channel_subscriptions;
DROP POLICY IF EXISTS "read follows" ON public.follows;
DROP POLICY IF EXISTS "insert follows" ON public.follows;
DROP POLICY IF EXISTS "delete follows" ON public.follows;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users','channels','posts','post_media','post_likes','post_saves','comments','post_views',
    'conversations','conversation_participants','messages','message_reactions','message_reads','store_items','user_items',
    'coin_transactions','purchase_requests','payment_events','presence','notifications','tickets','punishments',
    'reports','moderation_notes','moderation_logs','friendships','favorite_users','user_blocks','user_circles','user_circle_members','channel_subscriptions','follows'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "ng_read_%s" ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "ng_insert_%s" ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "ng_update_%s" ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "ng_delete_%s" ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "ng_read_%s" ON public.%I FOR SELECT USING (true)', t, t);
    EXECUTE format('CREATE POLICY "ng_insert_%s" ON public.%I FOR INSERT WITH CHECK (true)', t, t);
    EXECUTE format('CREATE POLICY "ng_update_%s" ON public.%I FOR UPDATE USING (true)', t, t);
    EXECUTE format('CREATE POLICY "ng_delete_%s" ON public.%I FOR DELETE USING (true)', t, t);
  END LOOP;
END $$;

-- Counters -------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bump_post_like_counters() RETURNS trigger AS $$
BEGIN
  IF (tg_op = 'INSERT') THEN
    UPDATE public.posts SET likes_count = likes_count + 1 WHERE id = new.post_id;
  ELSIF (tg_op = 'DELETE') THEN
    UPDATE public.posts SET likes_count = greatest(0, likes_count - 1) WHERE id = old.post_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_post_likes ON public.post_likes;
CREATE TRIGGER trg_post_likes AFTER INSERT OR DELETE ON public.post_likes
FOR EACH ROW EXECUTE FUNCTION public.bump_post_like_counters();

SELECT 'NightGram full current schema installed' AS status;


-- Account deletion grace period ---------------------------------------------
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS deletion_requested_at timestamptz;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS deletion_scheduled_at timestamptz;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Ticket replies -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ticket_messages (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  author_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  author_role text NOT NULL DEFAULT 'user' CHECK (author_role IN ('user','support','admin')),
  text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket ON public.ticket_messages(ticket_id, created_at);
ALTER TABLE public.ticket_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ng_read_ticket_messages" ON public.ticket_messages;
DROP POLICY IF EXISTS "ng_insert_ticket_messages" ON public.ticket_messages;
DROP POLICY IF EXISTS "ng_update_ticket_messages" ON public.ticket_messages;
DROP POLICY IF EXISTS "ng_delete_ticket_messages" ON public.ticket_messages;
CREATE POLICY "ng_read_ticket_messages" ON public.ticket_messages FOR SELECT USING (true);
CREATE POLICY "ng_insert_ticket_messages" ON public.ticket_messages FOR INSERT WITH CHECK (true);
CREATE POLICY "ng_update_ticket_messages" ON public.ticket_messages FOR UPDATE USING (true);
CREATE POLICY "ng_delete_ticket_messages" ON public.ticket_messages FOR DELETE USING (true);

-- Channel roles --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.channel_roles (
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner','co_owner','admin','editor','moderator')),
  assigned_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (channel_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_channel_roles_user ON public.channel_roles(user_id);
ALTER TABLE public.channel_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ng_read_channel_roles" ON public.channel_roles;
DROP POLICY IF EXISTS "ng_insert_channel_roles" ON public.channel_roles;
DROP POLICY IF EXISTS "ng_update_channel_roles" ON public.channel_roles;
DROP POLICY IF EXISTS "ng_delete_channel_roles" ON public.channel_roles;
CREATE POLICY "ng_read_channel_roles" ON public.channel_roles FOR SELECT USING (true);
CREATE POLICY "ng_insert_channel_roles" ON public.channel_roles FOR INSERT WITH CHECK (true);
CREATE POLICY "ng_update_channel_roles" ON public.channel_roles FOR UPDATE USING (true);
CREATE POLICY "ng_delete_channel_roles" ON public.channel_roles FOR DELETE USING (true);

INSERT INTO public.channel_roles(channel_id, user_id, role)
SELECT id, owner_id, 'owner'
FROM public.channels
WHERE owner_id IS NOT NULL
ON CONFLICT (channel_id, user_id) DO UPDATE SET role = 'owner';

-- Profile wall posts ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profile_wall_posts (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  author_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  text text,
  media jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_profile_wall_profile ON public.profile_wall_posts(profile_user_id, created_at DESC);
ALTER TABLE public.profile_wall_posts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ng_read_profile_wall_posts" ON public.profile_wall_posts;
DROP POLICY IF EXISTS "ng_insert_profile_wall_posts" ON public.profile_wall_posts;
DROP POLICY IF EXISTS "ng_update_profile_wall_posts" ON public.profile_wall_posts;
DROP POLICY IF EXISTS "ng_delete_profile_wall_posts" ON public.profile_wall_posts;
CREATE POLICY "ng_read_profile_wall_posts" ON public.profile_wall_posts FOR SELECT USING (true);
CREATE POLICY "ng_insert_profile_wall_posts" ON public.profile_wall_posts FOR INSERT WITH CHECK (true);
CREATE POLICY "ng_update_profile_wall_posts" ON public.profile_wall_posts FOR UPDATE USING (true);
CREATE POLICY "ng_delete_profile_wall_posts" ON public.profile_wall_posts FOR DELETE USING (true);

-- Channel boost fields -------------------------------------------------------
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS boost_color text;
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS boost_glow text;
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS boost_avatar_frame text;
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS boosted_until timestamptz;

CREATE TABLE IF NOT EXISTS public.channel_boosts (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  kind text NOT NULL,
  value text,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.channel_boosts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ng_read_channel_boosts" ON public.channel_boosts;
DROP POLICY IF EXISTS "ng_insert_channel_boosts" ON public.channel_boosts;
CREATE POLICY "ng_read_channel_boosts" ON public.channel_boosts FOR SELECT USING (true);
CREATE POLICY "ng_insert_channel_boosts" ON public.channel_boosts FOR INSERT WITH CHECK (true);

-- Notification actions -------------------------------------------------------
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS actor_id uuid REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS action_type text;

-- Stories --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stories (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  author_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  media_url text NOT NULL,
  media_type text NOT NULL DEFAULT 'image' CHECK (media_type IN ('image','video')),
  text text DEFAULT '',
  visibility text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','followers','circle')),
  circle_id uuid,
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('published','draft','scheduled')),
  scheduled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'public';
ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS circle_id uuid;
CREATE INDEX IF NOT EXISTS idx_stories_active ON public.stories(expires_at, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stories_visibility ON public.stories(visibility, circle_id);
ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ng_read_stories" ON public.stories;
DROP POLICY IF EXISTS "ng_insert_stories" ON public.stories;
DROP POLICY IF EXISTS "ng_update_stories" ON public.stories;
DROP POLICY IF EXISTS "ng_delete_stories" ON public.stories;
CREATE POLICY "ng_read_stories" ON public.stories FOR SELECT USING (true);
CREATE POLICY "ng_insert_stories" ON public.stories FOR INSERT WITH CHECK (true);
CREATE POLICY "ng_update_stories" ON public.stories FOR UPDATE USING (true);
CREATE POLICY "ng_delete_stories" ON public.stories FOR DELETE USING (true);

CREATE TABLE IF NOT EXISTS public.story_views (
  story_id uuid NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (story_id, user_id)
);
ALTER TABLE public.story_views ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ng_read_story_views" ON public.story_views;
DROP POLICY IF EXISTS "ng_insert_story_views" ON public.story_views;
CREATE POLICY "ng_read_story_views" ON public.story_views FOR SELECT USING (true);
CREATE POLICY "ng_insert_story_views" ON public.story_views FOR INSERT WITH CHECK (true);

-- Conversation extras --------------------------------------------------------
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS description text;

-- Account deletion fallback table -------------------------------------------
CREATE TABLE IF NOT EXISTS public.account_deletion_requests (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  requested_at timestamptz NOT NULL DEFAULT now(),
  scheduled_at timestamptz NOT NULL
);
ALTER TABLE public.account_deletion_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ng_read_account_deletion_requests" ON public.account_deletion_requests;
DROP POLICY IF EXISTS "ng_insert_account_deletion_requests" ON public.account_deletion_requests;
DROP POLICY IF EXISTS "ng_update_account_deletion_requests" ON public.account_deletion_requests;
DROP POLICY IF EXISTS "ng_delete_account_deletion_requests" ON public.account_deletion_requests;
CREATE POLICY "ng_read_account_deletion_requests" ON public.account_deletion_requests FOR SELECT USING (true);
CREATE POLICY "ng_insert_account_deletion_requests" ON public.account_deletion_requests FOR INSERT WITH CHECK (true);
CREATE POLICY "ng_update_account_deletion_requests" ON public.account_deletion_requests FOR UPDATE USING (true);
CREATE POLICY "ng_delete_account_deletion_requests" ON public.account_deletion_requests FOR DELETE USING (true);

-- Story likes ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.story_likes (
  story_id uuid NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (story_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_story_likes_story ON public.story_likes(story_id, created_at DESC);
ALTER TABLE public.story_likes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ng_read_story_likes" ON public.story_likes;
DROP POLICY IF EXISTS "ng_insert_story_likes" ON public.story_likes;
DROP POLICY IF EXISTS "ng_delete_story_likes" ON public.story_likes;
CREATE POLICY "ng_read_story_likes" ON public.story_likes FOR SELECT USING (true);
CREATE POLICY "ng_insert_story_likes" ON public.story_likes FOR INSERT WITH CHECK (true);
CREATE POLICY "ng_delete_story_likes" ON public.story_likes FOR DELETE USING (true);

-- User boost balance ---------------------------------------------------------
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS boost_balance integer NOT NULL DEFAULT 0;

-- Channel privacy / chat settings -------------------------------------------
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS hide_subscribers boolean NOT NULL DEFAULT false;
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS is_private boolean NOT NULL DEFAULT false;
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS chat_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS chat_conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL;
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS channel_id uuid REFERENCES public.channels(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS conversations_channel_id_unique ON public.conversations(channel_id) WHERE channel_id IS NOT NULL;

-- Conversation invite links --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.conversation_invites (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  code text UNIQUE NOT NULL,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_conversation_invites_conversation ON public.conversation_invites(conversation_id);
ALTER TABLE public.conversation_invites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ng_read_conversation_invites" ON public.conversation_invites;
DROP POLICY IF EXISTS "ng_insert_conversation_invites" ON public.conversation_invites;
DROP POLICY IF EXISTS "ng_delete_conversation_invites" ON public.conversation_invites;
CREATE POLICY "ng_read_conversation_invites" ON public.conversation_invites FOR SELECT USING (true);
CREATE POLICY "ng_insert_conversation_invites" ON public.conversation_invites FOR INSERT WITH CHECK (true);
CREATE POLICY "ng_delete_conversation_invites" ON public.conversation_invites FOR DELETE USING (true);

-- Channel invite links -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.channel_invites (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  code text UNIQUE NOT NULL,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  expires_at timestamptz,
  uses_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_channel_invites_channel ON public.channel_invites(channel_id);
ALTER TABLE public.channel_invites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ng_read_channel_invites" ON public.channel_invites;
DROP POLICY IF EXISTS "ng_insert_channel_invites" ON public.channel_invites;
DROP POLICY IF EXISTS "ng_update_channel_invites" ON public.channel_invites;
DROP POLICY IF EXISTS "ng_delete_channel_invites" ON public.channel_invites;
CREATE POLICY "ng_read_channel_invites" ON public.channel_invites FOR SELECT USING (true);
CREATE POLICY "ng_insert_channel_invites" ON public.channel_invites FOR INSERT WITH CHECK (true);
CREATE POLICY "ng_update_channel_invites" ON public.channel_invites FOR UPDATE USING (true);
CREATE POLICY "ng_delete_channel_invites" ON public.channel_invites FOR DELETE USING (true);

-- Safety / anti-spam ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rate_limits (
  key text PRIMARY KEY,
  count integer NOT NULL DEFAULT 0,
  window_start timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rate_limits_expires ON public.rate_limits(expires_at);

CREATE TABLE IF NOT EXISTS public.spam_events (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  target_type text,
  target_id text,
  fingerprint text,
  meta jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_spam_events_user ON public.spam_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_spam_events_type ON public.spam_events(event_type, created_at DESC);

CREATE TABLE IF NOT EXISTS public.moderation_flags (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  type text NOT NULL,
  severity integer NOT NULL DEFAULT 1,
  reason text NOT NULL,
  meta jsonb DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','ignored')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES public.users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_moderation_flags_status ON public.moderation_flags(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_moderation_flags_user ON public.moderation_flags(user_id, created_at DESC);

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spam_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moderation_flags ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['rate_limits','spam_events','moderation_flags'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "ng_read_%s" ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "ng_insert_%s" ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "ng_update_%s" ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "ng_delete_%s" ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "ng_read_%s" ON public.%I FOR SELECT USING (true)', t, t);
    EXECUTE format('CREATE POLICY "ng_insert_%s" ON public.%I FOR INSERT WITH CHECK (true)', t, t);
    EXECUTE format('CREATE POLICY "ng_update_%s" ON public.%I FOR UPDATE USING (true)', t, t);
    EXECUTE format('CREATE POLICY "ng_delete_%s" ON public.%I FOR DELETE USING (true)', t, t);
  END LOOP;
END $$;

-- Safety Stage 2/3 extras ---------------------------------------------------
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS safety_trust_override text CHECK (safety_trust_override IN ('trusted','restricted'));
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS safety_restrictions jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS safety_restricted_until timestamptz;
CREATE INDEX IF NOT EXISTS idx_users_safety_restricted ON public.users(safety_restricted_until) WHERE safety_restricted_until IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.safety_domains (
  domain text PRIMARY KEY,
  action text NOT NULL CHECK (action IN ('allow','deny')),
  reason text,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_safety_domains_action ON public.safety_domains(action);
ALTER TABLE public.safety_domains ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ng_read_safety_domains" ON public.safety_domains;
DROP POLICY IF EXISTS "ng_insert_safety_domains" ON public.safety_domains;
DROP POLICY IF EXISTS "ng_update_safety_domains" ON public.safety_domains;
DROP POLICY IF EXISTS "ng_delete_safety_domains" ON public.safety_domains;
CREATE POLICY "ng_read_safety_domains" ON public.safety_domains FOR SELECT USING (true);
CREATE POLICY "ng_insert_safety_domains" ON public.safety_domains FOR INSERT WITH CHECK (true);
CREATE POLICY "ng_update_safety_domains" ON public.safety_domains FOR UPDATE USING (true);
CREATE POLICY "ng_delete_safety_domains" ON public.safety_domains FOR DELETE USING (true);

-- Profile music --------------------------------------------------------------
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS music_artist text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS music_track text;

-- User verification separate from avatar frame -------------------------------
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS verified boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_users_verified ON public.users(verified) WHERE verified = true;

-- Gifts ----------------------------------------------------------------------
ALTER TABLE public.purchase_requests ADD COLUMN IF NOT EXISTS recipient_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.purchase_requests ADD COLUMN IF NOT EXISTS recipient_username text;
ALTER TABLE public.purchase_requests ADD COLUMN IF NOT EXISTS recipient_ng_id bigint;
CREATE INDEX IF NOT EXISTS idx_purchase_requests_recipient ON public.purchase_requests(recipient_user_id) WHERE recipient_user_id IS NOT NULL;

-- Store effects / NFT upgrades ----------------------------------------------
ALTER TABLE public.store_items ADD COLUMN IF NOT EXISTS effect_type text;
ALTER TABLE public.store_items ADD COLUMN IF NOT EXISTS effect_value text;
ALTER TABLE public.store_items ADD COLUMN IF NOT EXISTS effect_payload jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.store_items ADD COLUMN IF NOT EXISTS upgradeable boolean NOT NULL DEFAULT false;
ALTER TABLE public.store_items ADD COLUMN IF NOT EXISTS max_level integer NOT NULL DEFAULT 1;
ALTER TABLE public.store_items ADD COLUMN IF NOT EXISTS nft_collection text;
ALTER TABLE public.user_items ADD COLUMN IF NOT EXISTS level integer NOT NULL DEFAULT 1;
ALTER TABLE public.user_items ADD COLUMN IF NOT EXISTS serial_number bigint;
ALTER TABLE public.user_items ADD COLUMN IF NOT EXISTS nft_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.user_items ADD COLUMN IF NOT EXISTS upgraded_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_store_items_effect_type ON public.store_items(effect_type);
CREATE INDEX IF NOT EXISTS idx_store_items_nft_collection ON public.store_items(nft_collection) WHERE nft_collection IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_items_upgraded_at ON public.user_items(upgraded_at) WHERE upgraded_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_items_nft_metadata ON public.user_items USING gin(nft_metadata);
CREATE UNIQUE INDEX IF NOT EXISTS user_items_item_serial_unique ON public.user_items(item_id, serial_number) WHERE serial_number IS NOT NULL;

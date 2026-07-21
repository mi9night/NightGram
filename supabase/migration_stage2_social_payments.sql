-- =============================================================================
-- NightGram — Stage 2 feature migration
-- Comments replies, owned-items/profile fixes, social graph, store admin,
-- and donation payment automation.
-- Run in Supabase SQL Editor before enabling automatic donation webhooks.
-- =============================================================================

-- Comment replies ------------------------------------------------------------
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.comments(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_comments_parent ON public.comments(parent_id);
CREATE INDEX IF NOT EXISTS idx_comments_author_created ON public.comments(author_id, created_at DESC);

-- Purchase automation fields ------------------------------------------------
ALTER TABLE public.purchase_requests ADD COLUMN IF NOT EXISTS payment_code text;
ALTER TABLE public.purchase_requests ADD COLUMN IF NOT EXISTS provider text DEFAULT 'manual';
ALTER TABLE public.purchase_requests ADD COLUMN IF NOT EXISTS expected_amount integer;
ALTER TABLE public.purchase_requests ADD COLUMN IF NOT EXISTS paid_amount integer;
ALTER TABLE public.purchase_requests ADD COLUMN IF NOT EXISTS provider_payment_id text;
ALTER TABLE public.purchase_requests ADD COLUMN IF NOT EXISTS auto_matched_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS purchase_requests_payment_code_key ON public.purchase_requests(payment_code) WHERE payment_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_purchase_payment_code ON public.purchase_requests(payment_code);
CREATE INDEX IF NOT EXISTS idx_purchase_provider_payment ON public.purchase_requests(provider, provider_payment_id);

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
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read payment events" ON public.payment_events;
DROP POLICY IF EXISTS "ng_read_payment_events" ON public.payment_events;
CREATE POLICY "ng_read_payment_events" ON public.payment_events FOR SELECT USING (true);
DROP POLICY IF EXISTS "insert payment events" ON public.payment_events;
DROP POLICY IF EXISTS "ng_insert_payment_events" ON public.payment_events;
CREATE POLICY "ng_insert_payment_events" ON public.payment_events FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "update payment events" ON public.payment_events;
DROP POLICY IF EXISTS "ng_update_payment_events" ON public.payment_events;
CREATE POLICY "ng_update_payment_events" ON public.payment_events FOR UPDATE USING (true);

-- Social graph ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.friendships (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  friend_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'accepted' CHECK (status IN ('pending','accepted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, friend_id),
  CHECK (user_id <> friend_id)
);
CREATE INDEX IF NOT EXISTS idx_friendships_friend ON public.friendships(friend_id);
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read friendships" ON public.friendships;
DROP POLICY IF EXISTS "ng_read_friendships" ON public.friendships;
CREATE POLICY "ng_read_friendships" ON public.friendships FOR SELECT USING (true);
DROP POLICY IF EXISTS "insert friendships" ON public.friendships;
DROP POLICY IF EXISTS "ng_insert_friendships" ON public.friendships;
CREATE POLICY "ng_insert_friendships" ON public.friendships FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "delete friendships" ON public.friendships;
DROP POLICY IF EXISTS "ng_delete_friendships" ON public.friendships;
CREATE POLICY "ng_delete_friendships" ON public.friendships FOR DELETE USING (true);

CREATE TABLE IF NOT EXISTS public.favorite_users (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  target_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, target_id),
  CHECK (user_id <> target_id)
);
ALTER TABLE public.favorite_users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read favorites" ON public.favorite_users;
DROP POLICY IF EXISTS "ng_read_favorite_users" ON public.favorite_users;
CREATE POLICY "ng_read_favorite_users" ON public.favorite_users FOR SELECT USING (true);
DROP POLICY IF EXISTS "insert favorites" ON public.favorite_users;
DROP POLICY IF EXISTS "ng_insert_favorite_users" ON public.favorite_users;
CREATE POLICY "ng_insert_favorite_users" ON public.favorite_users FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "delete favorites" ON public.favorite_users;
DROP POLICY IF EXISTS "ng_delete_favorite_users" ON public.favorite_users;
CREATE POLICY "ng_delete_favorite_users" ON public.favorite_users FOR DELETE USING (true);

CREATE TABLE IF NOT EXISTS public.user_blocks (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, blocked_id),
  CHECK (user_id <> blocked_id)
);
ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read blocks" ON public.user_blocks;
DROP POLICY IF EXISTS "ng_read_user_blocks" ON public.user_blocks;
CREATE POLICY "ng_read_user_blocks" ON public.user_blocks FOR SELECT USING (true);
DROP POLICY IF EXISTS "insert blocks" ON public.user_blocks;
DROP POLICY IF EXISTS "ng_insert_user_blocks" ON public.user_blocks;
CREATE POLICY "ng_insert_user_blocks" ON public.user_blocks FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "delete blocks" ON public.user_blocks;
DROP POLICY IF EXISTS "ng_delete_user_blocks" ON public.user_blocks;
CREATE POLICY "ng_delete_user_blocks" ON public.user_blocks FOR DELETE USING (true);

-- New users should start with white display/name color.
ALTER TABLE public.users ALTER COLUMN name_color SET DEFAULT '#ffffff';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS name_color_id text DEFAULT 'light';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS banner_url text;

SELECT 'NightGram stage2 migration complete' AS status;

-- Channel subscriptions ------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.channel_subscriptions (
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (channel_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_channel_subscriptions_user ON public.channel_subscriptions(user_id);
ALTER TABLE public.channel_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read channel subscriptions" ON public.channel_subscriptions;
DROP POLICY IF EXISTS "ng_read_channel_subscriptions" ON public.channel_subscriptions;
CREATE POLICY "ng_read_channel_subscriptions" ON public.channel_subscriptions FOR SELECT USING (true);
DROP POLICY IF EXISTS "insert channel subscriptions" ON public.channel_subscriptions;
DROP POLICY IF EXISTS "ng_insert_channel_subscriptions" ON public.channel_subscriptions;
CREATE POLICY "ng_insert_channel_subscriptions" ON public.channel_subscriptions FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "delete channel subscriptions" ON public.channel_subscriptions;
DROP POLICY IF EXISTS "ng_delete_channel_subscriptions" ON public.channel_subscriptions;
CREATE POLICY "ng_delete_channel_subscriptions" ON public.channel_subscriptions FOR DELETE USING (true);

-- Profile social privacy -----------------------------------------------------
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS hide_social boolean NOT NULL DEFAULT false;

-- Followers / following ------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.follows (
  follower_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  following_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, following_id),
  CHECK (follower_id <> following_id)
);
CREATE INDEX IF NOT EXISTS idx_follows_following ON public.follows(following_id);
CREATE INDEX IF NOT EXISTS idx_follows_follower ON public.follows(follower_id);
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read follows" ON public.follows;
DROP POLICY IF EXISTS "ng_read_follows" ON public.follows;
CREATE POLICY "ng_read_follows" ON public.follows FOR SELECT USING (true);
DROP POLICY IF EXISTS "insert follows" ON public.follows;
DROP POLICY IF EXISTS "ng_insert_follows" ON public.follows;
CREATE POLICY "ng_insert_follows" ON public.follows FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "delete follows" ON public.follows;
DROP POLICY IF EXISTS "ng_delete_follows" ON public.follows;
CREATE POLICY "ng_delete_follows" ON public.follows FOR DELETE USING (true);

-- Channel editor fields ------------------------------------------------------
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS banner_url text;
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';


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
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_stories_active ON public.stories(expires_at, created_at DESC);
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

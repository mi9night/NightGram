-- NightGram 2.18.0 — channel moderation controls
-- Safe to run more than once.

ALTER TABLE public.channels
  ADD COLUMN IF NOT EXISTS comments_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS comment_slow_mode_seconds integer NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'channels_comment_slow_mode_seconds_check'
  ) THEN
    ALTER TABLE public.channels
      ADD CONSTRAINT channels_comment_slow_mode_seconds_check
      CHECK (comment_slow_mode_seconds >= 0 AND comment_slow_mode_seconds <= 3600);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.channel_bans (
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  banned_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  reason text,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (channel_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_channel_bans_user ON public.channel_bans(user_id);
CREATE INDEX IF NOT EXISTS idx_channel_bans_active ON public.channel_bans(channel_id, expires_at);

CREATE TABLE IF NOT EXISTS public.channel_moderation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  target_post_id uuid REFERENCES public.posts(id) ON DELETE SET NULL,
  target_comment_id uuid REFERENCES public.comments(id) ON DELETE SET NULL,
  reason text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_channel_moderation_log_channel_created
  ON public.channel_moderation_log(channel_id, created_at DESC);

ALTER TABLE public.channel_bans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_moderation_log ENABLE ROW LEVEL SECURITY;

-- Backend uses the service-role key. These policies keep direct client access closed.
DROP POLICY IF EXISTS channel_bans_no_direct_access ON public.channel_bans;
CREATE POLICY channel_bans_no_direct_access ON public.channel_bans
  FOR ALL USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS channel_moderation_log_no_direct_access ON public.channel_moderation_log;
CREATE POLICY channel_moderation_log_no_direct_access ON public.channel_moderation_log
  FOR ALL USING (false) WITH CHECK (false);

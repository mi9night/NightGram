-- NightGram: profile wall likes/comments and post comment likes
-- Safe to run multiple times.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Profile wall post counters
ALTER TABLE public.profile_wall_posts ADD COLUMN IF NOT EXISTS likes_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.profile_wall_posts ADD COLUMN IF NOT EXISTS comments_count integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.profile_wall_likes (
  wall_post_id uuid NOT NULL REFERENCES public.profile_wall_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (wall_post_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_profile_wall_likes_user ON public.profile_wall_likes(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.profile_wall_comments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  wall_post_id uuid NOT NULL REFERENCES public.profile_wall_posts(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.profile_wall_comments(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  text text NOT NULL,
  likes_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_profile_wall_comments_post_created ON public.profile_wall_comments(wall_post_id, created_at);
CREATE INDEX IF NOT EXISTS idx_profile_wall_comments_parent ON public.profile_wall_comments(parent_id);
CREATE INDEX IF NOT EXISTS idx_profile_wall_comments_author ON public.profile_wall_comments(author_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.profile_wall_comment_likes (
  comment_id uuid NOT NULL REFERENCES public.profile_wall_comments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_profile_wall_comment_likes_user ON public.profile_wall_comment_likes(user_id, created_at DESC);

-- Feed post comment likes
CREATE TABLE IF NOT EXISTS public.comment_likes (
  comment_id uuid NOT NULL REFERENCES public.comments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_comment_likes_user ON public.comment_likes(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comment_likes_comment ON public.comment_likes(comment_id, created_at DESC);

ALTER TABLE public.profile_wall_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_wall_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_wall_comment_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comment_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ng_profile_wall_likes_all ON public.profile_wall_likes;
CREATE POLICY ng_profile_wall_likes_all ON public.profile_wall_likes FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS ng_profile_wall_comments_all ON public.profile_wall_comments;
CREATE POLICY ng_profile_wall_comments_all ON public.profile_wall_comments FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS ng_profile_wall_comment_likes_all ON public.profile_wall_comment_likes;
CREATE POLICY ng_profile_wall_comment_likes_all ON public.profile_wall_comment_likes FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS ng_comment_likes_all ON public.comment_likes;
CREATE POLICY ng_comment_likes_all ON public.comment_likes FOR ALL USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
SELECT 'NightGram wall comments and comment likes migration installed' AS status;

-- =============================================================================
-- NightGram — Stories migration
-- Run this if stories are saved locally and backend says: Run stories migration.
-- Safe to run multiple times.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

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

SELECT 'NightGram stories migration complete' AS status;

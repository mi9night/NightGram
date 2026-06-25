-- NightGram: profile pins for user posts, feed comments, profile wall posts and wall comments
-- Safe to run multiple times.
-- For wall comment pins, run supabase/migration_wall_comments_comment_likes.sql first.

DO $$
BEGIN
  IF to_regclass('public.posts') IS NOT NULL THEN
    ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS pinned_on_profile boolean NOT NULL DEFAULT false;
    ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS pinned_at timestamptz;
    CREATE INDEX IF NOT EXISTS idx_posts_profile_pinned ON public.posts(author_user_id, pinned_on_profile, pinned_at DESC, created_at DESC) WHERE author_user_id IS NOT NULL;
  END IF;

  IF to_regclass('public.comments') IS NOT NULL THEN
    ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false;
    ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS pinned_at timestamptz;
    CREATE INDEX IF NOT EXISTS idx_comments_post_pinned ON public.comments(post_id, pinned, pinned_at DESC, created_at);
  END IF;

  IF to_regclass('public.profile_wall_posts') IS NOT NULL THEN
    ALTER TABLE public.profile_wall_posts ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false;
    ALTER TABLE public.profile_wall_posts ADD COLUMN IF NOT EXISTS pinned_at timestamptz;
    CREATE INDEX IF NOT EXISTS idx_profile_wall_posts_pinned ON public.profile_wall_posts(profile_user_id, pinned, pinned_at DESC, created_at DESC);
  END IF;

  IF to_regclass('public.profile_wall_comments') IS NOT NULL THEN
    ALTER TABLE public.profile_wall_comments ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false;
    ALTER TABLE public.profile_wall_comments ADD COLUMN IF NOT EXISTS pinned_at timestamptz;
    CREATE INDEX IF NOT EXISTS idx_profile_wall_comments_pinned ON public.profile_wall_comments(wall_post_id, pinned, pinned_at DESC, created_at);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
SELECT 'NightGram profile pin migration installed' AS status;

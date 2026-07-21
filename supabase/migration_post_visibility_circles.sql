-- NightGram: post visibility by Private Circles
-- Run after migration_private_circles.sql.

ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'public';
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS circle_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'posts_visibility_check'
  ) THEN
    ALTER TABLE public.posts ADD CONSTRAINT posts_visibility_check CHECK (visibility IN ('public','followers','circle'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_posts_visibility ON public.posts(visibility, circle_id);

SELECT 'NightGram post visibility migration installed' AS status;

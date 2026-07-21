-- NightGram: story visibility by followers / Private Circles
-- Run after migration_private_circles.sql and migration_stories.sql.

ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'public';
ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS circle_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'stories_visibility_check'
  ) THEN
    ALTER TABLE public.stories ADD CONSTRAINT stories_visibility_check CHECK (visibility IN ('public','followers','circle'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_stories_visibility ON public.stories(visibility, circle_id);

SELECT 'NightGram story visibility migration installed' AS status;

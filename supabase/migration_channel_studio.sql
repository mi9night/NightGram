-- NightGram Channels 2.0: drafts, scheduled posts and analytics support

ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'published';
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS scheduled_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'posts_status_check'
  ) THEN
    ALTER TABLE public.posts ADD CONSTRAINT posts_status_check CHECK (status IN ('published','draft','scheduled'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_posts_status_schedule ON public.posts(status, scheduled_at);

SELECT 'NightGram channel studio migration installed' AS status;

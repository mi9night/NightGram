-- NightGram 2.11 — editable/deletable messages and media metadata.
-- Safe to run more than once.

ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS edited_at timestamptz;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS attachment_thumbnail_url text;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS media_width integer;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS media_height integer;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS media_duration_sec integer;

ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_media_width_check;
ALTER TABLE public.messages ADD CONSTRAINT messages_media_width_check
  CHECK (media_width IS NULL OR (media_width > 0 AND media_width <= 16384));

ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_media_height_check;
ALTER TABLE public.messages ADD CONSTRAINT messages_media_height_check
  CHECK (media_height IS NULL OR (media_height > 0 AND media_height <= 16384));

ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_media_duration_sec_check;
ALTER TABLE public.messages ADD CONSTRAINT messages_media_duration_sec_check
  CHECK (media_duration_sec IS NULL OR (media_duration_sec >= 0 AND media_duration_sec <= 86400));

CREATE INDEX IF NOT EXISTS idx_messages_not_deleted
  ON public.messages (conversation_id, created_at DESC)
  WHERE deleted_at IS NULL;

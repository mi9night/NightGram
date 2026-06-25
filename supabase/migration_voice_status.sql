-- NightGram: voice messages need no DB type migration (stored as file), Night Status profile fields

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS night_status_text text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS night_status_emoji text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS night_status_expires_at timestamptz;

SELECT 'NightGram voice/status migration installed' AS status;

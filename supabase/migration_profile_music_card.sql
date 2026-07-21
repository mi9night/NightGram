-- NightGram Profile: manual profile music fields for Profile Room / Share Card

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS music_artist text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS music_track text;

SELECT 'NightGram profile music migration installed' AS status;

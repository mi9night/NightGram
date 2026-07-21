-- NightGram release features: username system, Profile Room scene, Gift Wall

-- Username hardening: case-insensitive uniqueness and allowed characters.
CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_unique ON public.users (lower(username));
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_username_format_check;
ALTER TABLE public.users ADD CONSTRAINT users_username_format_check CHECK (username ~ '^[a-z0-9_]{3,24}$');

-- Profile Room scene selection.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS room_scene text DEFAULT 'midnight';
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_room_scene_check;
ALTER TABLE public.users ADD CONSTRAINT users_room_scene_check CHECK (room_scene IS NULL OR room_scene IN ('midnight','cyber','gold','rain','void'));

-- Gift Wall. Store item gifts are written here and shown in profile.
CREATE TABLE IF NOT EXISTS public.user_gifts (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  sender_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  recipient_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  item_id uuid REFERENCES public.store_items(id) ON DELETE SET NULL,
  gift_type text NOT NULL DEFAULT 'store_item',
  title text NOT NULL DEFAULT 'Подарок NightGram',
  message text,
  hidden boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_gifts_recipient_created ON public.user_gifts(recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_gifts_sender ON public.user_gifts(sender_id) WHERE sender_id IS NOT NULL;

ALTER TABLE public.user_gifts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ng_read_user_gifts ON public.user_gifts;
CREATE POLICY ng_read_user_gifts ON public.user_gifts FOR SELECT USING (hidden = false OR recipient_id = auth.uid() OR sender_id = auth.uid());

NOTIFY pgrst, 'reload schema';
SELECT 'NightGram room scene, gift wall and username system migration installed' AS status;

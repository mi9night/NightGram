-- Run in Supabase SQL Editor

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS banner_url text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS custom_id text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS name_color_id text DEFAULT 'light';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS notification_settings jsonb DEFAULT '{"push":true,"messages":true,"likes":true,"comments":true,"newFollowers":true,"storeDrops":true,"sounds":true}'::jsonb;

-- ng_id sequence
CREATE SEQUENCE IF NOT EXISTS users_ng_id_seq START 10000001;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS ng_id bigint DEFAULT nextval('users_ng_id_seq');

-- Backfill
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.users WHERE ng_id IS NULL LOOP
    UPDATE public.users SET ng_id = nextval('users_ng_id_seq') WHERE id = r.id;
  END LOOP;
END $$;

-- Update default color
UPDATE public.users SET name_color = '#ffffff' WHERE name_color = '#a855f7' OR name_color IS NULL;

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS users_custom_id_key ON public.users (custom_id) WHERE custom_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_custom_id ON public.users (custom_id) WHERE custom_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_ng_id ON public.users (ng_id);

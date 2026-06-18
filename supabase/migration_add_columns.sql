-- =============================================================================
--  NightGram — Migration: add new columns to users table
--  Run this in Supabase SQL Editor after the initial schema.
-- =============================================================================

-- Add missing columns (IF NOT EXISTS for safe re-runs)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS banner_url text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS custom_id text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS name_color_id text DEFAULT 'night';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS notification_settings jsonb DEFAULT '{"push":true,"messages":true,"likes":true,"comments":true,"newFollowers":true,"storeDrops":true,"sounds":true}'::jsonb;

-- Make custom_id unique (nullable, so multiple NULLs are fine)
CREATE UNIQUE INDEX IF NOT EXISTS users_custom_id_key ON public.users (custom_id) WHERE custom_id IS NOT NULL;

-- Auto-increment ngId: set starting value so first user gets 10000001
-- (Only run once — creates the sequence if it doesn't exist)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.sequences WHERE sequence_name = 'users_ng_id_seq') THEN
    CREATE SEQUENCE users_ng_id_seq START 10000001;
  END IF;
END $$;

-- Add ng_id column if not exists, populated from sequence
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS ng_id bigint DEFAULT nextval('users_ng_id_seq');

-- Backfill existing users that have NULL ng_id
UPDATE public.users SET ng_id = 10000000 + (row_number() OVER ()) WHERE ng_id IS NULL;

-- Add index for faster lookups by custom_id
CREATE INDEX IF NOT EXISTS idx_users_custom_id ON public.users (custom_id) WHERE custom_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_ng_id ON public.users (ng_id);

-- =============================================================================
--  NightGram — Migration: add new columns to users table
--  Run this in Supabase SQL Editor after the initial schema.
-- =============================================================================

-- Add missing columns (IF NOT EXISTS for safe re-runs)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS banner_url text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS custom_id text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS name_color_id text DEFAULT 'night';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS notification_settings jsonb DEFAULT '{"push":true,"messages":true,"likes":true,"comments":true,"newFollowers":true,"storeDrops":true,"sounds":true}'::jsonb;

-- Auto-increment ngId sequence
CREATE SEQUENCE IF NOT EXISTS users_ng_id_seq START 10000001;

-- Add ng_id column if not exists
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS ng_id bigint DEFAULT nextval('users_ng_id_seq');

-- Backfill existing users that have NULL ng_id (using CTE — window functions
-- are not allowed directly in UPDATE, so we compute first then join).
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) AS rn
  FROM public.users
  WHERE ng_id IS NULL
)
UPDATE public.users u
SET ng_id = 10000000 + numbered.rn
FROM numbered
WHERE u.id = numbered.id;

-- Make custom_id unique (nullable, so multiple NULLs are fine)
CREATE UNIQUE INDEX IF NOT EXISTS users_custom_id_key ON public.users (custom_id) WHERE custom_id IS NOT NULL;

-- Indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_custom_id ON public.users (custom_id) WHERE custom_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_ng_id ON public.users (ng_id);

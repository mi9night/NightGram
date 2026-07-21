-- =============================================================================
-- NightGram repair: duplicate payment policies + missing channel_roles
-- Safe to run multiple times in Supabase SQL Editor.
-- =============================================================================

-- 1) Clean old policy names that may already exist from earlier partial migrations.
DO $$
BEGIN
  IF to_regclass('public.payment_events') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "read payment events" ON public.payment_events';
    EXECUTE 'DROP POLICY IF EXISTS "insert payment events" ON public.payment_events';
    EXECUTE 'DROP POLICY IF EXISTS "update payment events" ON public.payment_events';
    EXECUTE 'DROP POLICY IF EXISTS "ng_read_payment_events" ON public.payment_events';
    EXECUTE 'DROP POLICY IF EXISTS "ng_insert_payment_events" ON public.payment_events';
    EXECUTE 'DROP POLICY IF EXISTS "ng_update_payment_events" ON public.payment_events';
    EXECUTE 'DROP POLICY IF EXISTS "ng_delete_payment_events" ON public.payment_events';
  END IF;
END $$;

-- 2) Make sure payment_events exists and has safe policies.
CREATE TABLE IF NOT EXISTS public.payment_events (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider text NOT NULL,
  provider_payment_id text NOT NULL,
  amount integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'RUB',
  username text,
  message text,
  raw_payload jsonb,
  matched_purchase_id uuid,
  status text NOT NULL DEFAULT 'unmatched' CHECK (status IN ('unmatched','matched','ignored','amount_mismatch','suspicious')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS payment_events_provider_payment_key
  ON public.payment_events(provider, provider_payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_status
  ON public.payment_events(status, created_at DESC);

ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ng_read_payment_events" ON public.payment_events;
DROP POLICY IF EXISTS "ng_insert_payment_events" ON public.payment_events;
DROP POLICY IF EXISTS "ng_update_payment_events" ON public.payment_events;
DROP POLICY IF EXISTS "ng_delete_payment_events" ON public.payment_events;
CREATE POLICY "ng_read_payment_events" ON public.payment_events FOR SELECT USING (true);
CREATE POLICY "ng_insert_payment_events" ON public.payment_events FOR INSERT WITH CHECK (true);
CREATE POLICY "ng_update_payment_events" ON public.payment_events FOR UPDATE USING (true);
CREATE POLICY "ng_delete_payment_events" ON public.payment_events FOR DELETE USING (true);

-- 3) Make sure channel_roles exists.
-- IMPORTANT: if this fails because public.channels or public.users does not exist,
-- run supabase/schema_full_current.sql first.
CREATE TABLE IF NOT EXISTS public.channel_roles (
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner','co_owner','admin','editor','moderator')),
  assigned_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (channel_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_channel_roles_user ON public.channel_roles(user_id);
ALTER TABLE public.channel_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ng_read_channel_roles" ON public.channel_roles;
DROP POLICY IF EXISTS "ng_insert_channel_roles" ON public.channel_roles;
DROP POLICY IF EXISTS "ng_update_channel_roles" ON public.channel_roles;
DROP POLICY IF EXISTS "ng_delete_channel_roles" ON public.channel_roles;
CREATE POLICY "ng_read_channel_roles" ON public.channel_roles FOR SELECT USING (true);
CREATE POLICY "ng_insert_channel_roles" ON public.channel_roles FOR INSERT WITH CHECK (true);
CREATE POLICY "ng_update_channel_roles" ON public.channel_roles FOR UPDATE USING (true);
CREATE POLICY "ng_delete_channel_roles" ON public.channel_roles FOR DELETE USING (true);

-- 4) Backfill owner roles for existing channels.
INSERT INTO public.channel_roles(channel_id, user_id, role)
SELECT id, owner_id, 'owner'
FROM public.channels
WHERE owner_id IS NOT NULL
ON CONFLICT (channel_id, user_id) DO UPDATE SET role = 'owner';

SELECT 'NightGram repair complete' AS status;

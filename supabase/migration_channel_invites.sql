-- NightGram Channels: invite links for public/private channels
-- Run after schema_full_current.sql if your DB was created before channel invites.

CREATE TABLE IF NOT EXISTS public.channel_invites (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  code text UNIQUE NOT NULL,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  expires_at timestamptz,
  uses_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_channel_invites_channel ON public.channel_invites(channel_id);

ALTER TABLE public.channel_invites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ng_read_channel_invites" ON public.channel_invites;
DROP POLICY IF EXISTS "ng_insert_channel_invites" ON public.channel_invites;
DROP POLICY IF EXISTS "ng_update_channel_invites" ON public.channel_invites;
DROP POLICY IF EXISTS "ng_delete_channel_invites" ON public.channel_invites;
CREATE POLICY "ng_read_channel_invites" ON public.channel_invites FOR SELECT USING (true);
CREATE POLICY "ng_insert_channel_invites" ON public.channel_invites FOR INSERT WITH CHECK (true);
CREATE POLICY "ng_update_channel_invites" ON public.channel_invites FOR UPDATE USING (true);
CREATE POLICY "ng_delete_channel_invites" ON public.channel_invites FOR DELETE USING (true);

SELECT 'NightGram channel_invites migration installed' AS status;

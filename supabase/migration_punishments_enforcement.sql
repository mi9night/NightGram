-- NightGram punishments enforcement support
-- Ensures moderation punishments can be stored and checked fast by backend.

CREATE TABLE IF NOT EXISTS public.punishments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('ban','mute_dm','mute_posts','warning')),
  reason text,
  duration text,
  issued_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  issued_by_name text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS banned_until timestamptz;

CREATE INDEX IF NOT EXISTS idx_punishments_user ON public.punishments(user_id);
CREATE INDEX IF NOT EXISTS idx_punishments_active ON public.punishments(active);
CREATE INDEX IF NOT EXISTS idx_punishments_user_type_active ON public.punishments(user_id, type, active, expires_at);

ALTER TABLE public.punishments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ng_read_punishments ON public.punishments;
DROP POLICY IF EXISTS ng_insert_punishments ON public.punishments;
DROP POLICY IF EXISTS ng_update_punishments ON public.punishments;
CREATE POLICY ng_read_punishments ON public.punishments FOR SELECT USING (true);
CREATE POLICY ng_insert_punishments ON public.punishments FOR INSERT WITH CHECK (true);
CREATE POLICY ng_update_punishments ON public.punishments FOR UPDATE USING (true);

NOTIFY pgrst, 'reload schema';
SELECT 'NightGram punishments enforcement migration installed' AS status;

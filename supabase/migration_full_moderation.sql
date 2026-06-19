-- =============================================================================
--  NightGram — FULL moderation tables migration
--  Run this in Supabase SQL Editor.
-- =============================================================================

-- ===== 1. FIX ROLES (drop all old constraints, add new) =====
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN (
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.users'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%role%'
  ) LOOP
    EXECUTE format('ALTER TABLE public.users DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.users ADD CONSTRAINT users_role_check
  CHECK (role IN ('user', 'creator', 'moderator', 'admin', 'support', 'co_owner', 'owner'));

-- Add banned_until column
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS banned_until timestamptz;

-- ===== 2. NOTIFICATIONS TABLE =====
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'system',
  title text NOT NULL,
  body text,
  avatar_url text,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications (user_id);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own notif" ON public.notifications FOR SELECT USING (true);
CREATE POLICY "update own notif" ON public.notifications FOR UPDATE USING (true);
CREATE POLICY "insert notif" ON public.notifications FOR INSERT WITH CHECK (true);

-- ===== 3. TICKETS TABLE =====
CREATE TABLE IF NOT EXISTS public.tickets (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  subject text NOT NULL,
  body text DEFAULT '',
  category text DEFAULT 'Вопрос',
  status text DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved','unresolved','closed')),
  priority text DEFAULT 'low' CHECK (priority IN ('low','medium','high')),
  author_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  author_name text,
  assigned_to text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON public.tickets (status);
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "create ticket" ON public.tickets FOR INSERT WITH CHECK (true);
CREATE POLICY "read tickets" ON public.tickets FOR SELECT USING (true);
CREATE POLICY "update tickets" ON public.tickets FOR UPDATE USING (true);

-- ===== 4. PURCHASE REQUESTS =====
CREATE TABLE IF NOT EXISTS public.purchase_requests (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  username text NOT NULL,
  ng_id bigint,
  item_type text NOT NULL,
  item_name text NOT NULL,
  price integer NOT NULL,
  status text DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_purchase_status ON public.purchase_requests (status);
ALTER TABLE public.purchase_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "create purchase" ON public.purchase_requests FOR INSERT WITH CHECK (true);
CREATE POLICY "read purchase" ON public.purchase_requests FOR SELECT USING (true);
CREATE POLICY "update purchase" ON public.purchase_requests FOR UPDATE USING (true);

-- ===== 5. PUNISHMENTS =====
CREATE TABLE IF NOT EXISTS public.punishments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('ban','mute_dm','mute_posts','warning')),
  reason text,
  duration text,
  issued_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  issued_by_name text,
  active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_punishments_user ON public.punishments (user_id);
CREATE INDEX IF NOT EXISTS idx_punishments_active ON public.punishments (active);
ALTER TABLE public.punishments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read punishments" ON public.punishments FOR SELECT USING (true);
CREATE POLICY "insert punishments" ON public.punishments FOR INSERT WITH CHECK (true);
CREATE POLICY "update punishments" ON public.punishments FOR UPDATE USING (true);

-- ===== 6. REPORTS =====
CREATE TABLE IF NOT EXISTS public.reports (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  target_type text NOT NULL,
  target_id text NOT NULL,
  category text NOT NULL,
  reason text,
  reporter_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  reporter_name text,
  status text DEFAULT 'pending' CHECK (status IN ('pending','reviewed','actioned')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reports_status ON public.reports (status);
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "create report" ON public.reports FOR INSERT WITH CHECK (true);
CREATE POLICY "read reports" ON public.reports FOR SELECT USING (true);
CREATE POLICY "update reports" ON public.reports FOR UPDATE USING (true);

-- ===== 7. MODERATION LOGS =====
CREATE TABLE IF NOT EXISTS public.moderation_logs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  action text NOT NULL,
  admin_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  admin_name text,
  target_user_id uuid,
  target_user_name text,
  details text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_logs_created ON public.moderation_logs (created_at DESC);
ALTER TABLE public.moderation_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read logs" ON public.moderation_logs FOR SELECT USING (true);
CREATE POLICY "insert logs" ON public.moderation_logs FOR INSERT WITH CHECK (true);

-- ===== DONE =====
SELECT 'Migration complete — all moderation tables created' AS status;

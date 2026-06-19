-- =============================================================================
--  NightGram — Migration: purchase requests + moderation tables
--  Run this in Supabase SQL Editor.
-- =============================================================================

-- Purchase requests table
CREATE TABLE IF NOT EXISTS public.purchase_requests (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  username text NOT NULL,
  ng_id bigint,
  item_type text NOT NULL CHECK (item_type IN ('premium', 'coins')),
  item_name text NOT NULL,
  price integer NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_purchase_requests_status ON public.purchase_requests (status);
CREATE INDEX IF NOT EXISTS idx_purchase_requests_user ON public.purchase_requests (user_id);

-- Moderation logs table
CREATE TABLE IF NOT EXISTS public.moderation_logs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  action text NOT NULL,
  admin_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  admin_name text,
  target_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  target_user_name text,
  details text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Reports table
CREATE TABLE IF NOT EXISTS public.reports (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  target_type text NOT NULL CHECK (target_type IN ('post', 'comment', 'user')),
  target_id text NOT NULL,
  category text NOT NULL,
  reason text,
  reporter_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  reporter_name text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'actioned')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Punishments table
CREATE TABLE IF NOT EXISTS public.punishments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('ban', 'mute_dm', 'mute_posts', 'warning')),
  reason text,
  duration text,
  issued_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  issued_by_name text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_punishments_user ON public.punishments (user_id);
CREATE INDEX IF NOT EXISTS idx_punishments_active ON public.punishments (active);

-- RLS
ALTER TABLE public.purchase_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moderation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.punishments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can create own purchase request" ON public.purchase_requests FOR INSERT WITH CHECK (true);
CREATE POLICY "admin can read purchase requests" ON public.purchase_requests FOR SELECT USING (true);
CREATE POLICY "admin can update purchase requests" ON public.purchase_requests FOR UPDATE USING (true);
CREATE POLICY "admin can read moderation logs" ON public.moderation_logs FOR SELECT USING (true);
CREATE POLICY "admin can insert moderation logs" ON public.moderation_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "users can create reports" ON public.reports FOR INSERT WITH CHECK (true);
CREATE POLICY "admin can read reports" ON public.reports FOR SELECT USING (true);
CREATE POLICY "admin can update reports" ON public.reports FOR UPDATE USING (true);
CREATE POLICY "admin can manage punishments" ON public.punishments FOR ALL USING (true);

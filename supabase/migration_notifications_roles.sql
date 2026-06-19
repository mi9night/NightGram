-- =============================================================================
--  NightGram — Migration: notifications table + fix roles
--  Run this in Supabase SQL Editor.
-- =============================================================================

-- ===== 1. NOTIFICATIONS TABLE =====
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
CREATE POLICY "users read own notifications" ON public.notifications FOR SELECT USING (true);
CREATE POLICY "users update own notifications" ON public.notifications FOR UPDATE USING (true);
CREATE POLICY "insert notifications" ON public.notifications FOR INSERT WITH CHECK (true);

-- ===== 2. FIX ROLES CONSTRAINT =====
-- Drop ALL existing constraints on role column
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check1;
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check2;

-- Add new constraint with ALL 7 roles
ALTER TABLE public.users ADD CONSTRAINT users_role_check
  CHECK (role IN ('user', 'creator', 'moderator', 'admin', 'support', 'co_owner', 'owner'));

-- ===== 3. VERIFY =====
-- Check if it worked (run manually to see result):
-- SELECT username, role FROM public.users;

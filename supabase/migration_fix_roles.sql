-- =============================================================================
--  NightGram — Fix: allow new roles in users table
--  The original schema only allowed: user, creator, moderator, admin
--  Now we need: user, creator, moderator, admin, support, co_owner, owner
--  Run this in Supabase SQL Editor.
-- =============================================================================

-- Drop the old constraint and add a new one with all roles
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check1;

-- Add new constraint with all 7 roles
ALTER TABLE public.users ADD CONSTRAINT users_role_check 
  CHECK (role IN ('user', 'creator', 'moderator', 'admin', 'support', 'co_owner', 'owner'));

-- Verify it worked
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'users' AND column_name = 'role';

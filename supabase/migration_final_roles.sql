-- =============================================================================
--  NightGram — FINAL role fix + notifications
--  Copy-paste this ENTIRE block into Supabase SQL Editor and Run.
-- =============================================================================

-- 1. Drop ALL constraints on role (no matter the name)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.users'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%role%'
  ) LOOP
    EXECUTE format('ALTER TABLE public.users DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

-- 2. Add new constraint with ALL 7 roles
ALTER TABLE public.users ADD CONSTRAINT users_role_check
  CHECK (role IN ('user', 'creator', 'moderator', 'admin', 'support', 'co_owner', 'owner'));

-- 3. Verify the constraint is correct
SELECT pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.users'::regclass AND contype = 'c';

-- 4. Set your user to owner (replace 'midnight' with YOUR username)
UPDATE public.users SET role = 'owner' WHERE username = 'midnight';

-- 5. Verify
SELECT username, role FROM public.users;

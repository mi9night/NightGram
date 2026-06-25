-- NightGram repair: users.boost_balance missing
-- Run this in Supabase SQL Editor if premium/boost grant says:
-- Could not find the 'boost_balance' column of 'users' in the schema cache

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS boost_balance integer NOT NULL DEFAULT 0;

UPDATE public.users
SET boost_balance = COALESCE(boost_balance, 0);

COMMENT ON COLUMN public.users.boost_balance IS 'Available channel boosts granted by Premium/manual admin actions.';

-- Optional: force PostgREST/Supabase schema cache reload.
NOTIFY pgrst, 'reload schema';

SELECT 'NightGram users.boost_balance repaired' AS status;

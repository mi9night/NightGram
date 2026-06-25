-- NightGram: separate user verification from avatar frame
-- This prevents verified profile from conflicting with premium/cosmetic avatar frames.

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS verified boolean NOT NULL DEFAULT false;

-- Migrate legacy rows where avatar_frame='verified' into the new flag.
UPDATE public.users
SET verified = true
WHERE avatar_frame = 'verified';

-- Free the avatar frame slot for cosmetic frames. Verified frame can still be selected manually later.
UPDATE public.users
SET avatar_frame = NULL
WHERE avatar_frame = 'verified';

CREATE INDEX IF NOT EXISTS idx_users_verified ON public.users(verified) WHERE verified = true;

SELECT 'NightGram user verified flag separated from avatar frame' AS status;

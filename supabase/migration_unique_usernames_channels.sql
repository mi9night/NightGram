-- NightGram: unique @username namespace across users and channels
-- Prevents user @night and channel @night from existing together.
-- Safe to run multiple times.
-- Existing collisions are fixed by renaming colliding channel handles to handle_chN.

CREATE OR REPLACE FUNCTION public.ng_normalize_handle(value text)
RETURNS text AS $$
  SELECT lower(regexp_replace(regexp_replace(coalesce(value, ''), '^@', ''), '[^a-zA-Z0-9_]', '_', 'g'));
$$ LANGUAGE sql IMMUTABLE;

-- Drop triggers while repairing existing rows, otherwise the repair update is blocked.
DROP TRIGGER IF EXISTS trg_users_channel_username_collision ON public.users;
DROP TRIGGER IF EXISTS trg_channels_user_handle_collision ON public.channels;

-- Normalize current values.
UPDATE public.users
SET username = public.ng_normalize_handle(username)
WHERE username IS DISTINCT FROM public.ng_normalize_handle(username);

UPDATE public.channels
SET handle = public.ng_normalize_handle(handle)
WHERE handle IS DISTINCT FROM public.ng_normalize_handle(handle);

-- If a channel handle collides with a user username, keep the user username and rename channel.
WITH collisions AS (
  SELECT
    c.id,
    c.handle,
    row_number() OVER (PARTITION BY lower(c.handle) ORDER BY c.created_at NULLS LAST, c.id) AS rn
  FROM public.channels c
  WHERE EXISTS (SELECT 1 FROM public.users u WHERE lower(u.username) = lower(c.handle))
)
UPDATE public.channels c
SET handle = left(collisions.handle, 20) || '_ch' || collisions.rn
FROM collisions
WHERE c.id = collisions.id;

CREATE OR REPLACE FUNCTION public.ng_prevent_user_channel_username_collision()
RETURNS trigger AS $$
DECLARE
  normalized text;
BEGIN
  normalized := public.ng_normalize_handle(NEW.username);
  IF normalized !~ '^[a-z0-9_]{3,24}$' THEN
    RAISE EXCEPTION 'Юзернейм: 3–24 символа, латиница, цифры и _';
  END IF;
  NEW.username := normalized;
  IF EXISTS (SELECT 1 FROM public.channels c WHERE lower(c.handle) = normalized) THEN
    RAISE EXCEPTION 'Такой @username уже занят каналом';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.ng_prevent_channel_user_handle_collision()
RETURNS trigger AS $$
DECLARE
  normalized text;
BEGIN
  normalized := public.ng_normalize_handle(NEW.handle);
  IF normalized !~ '^[a-z0-9_]{3,32}$' THEN
    RAISE EXCEPTION 'Юзернейм канала: 3–32 символа, латиница, цифры и _';
  END IF;
  NEW.handle := normalized;
  IF EXISTS (SELECT 1 FROM public.users u WHERE lower(u.username) = normalized) THEN
    RAISE EXCEPTION 'Такой @username уже занят пользователем';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_channel_username_collision
BEFORE INSERT OR UPDATE OF username ON public.users
FOR EACH ROW EXECUTE FUNCTION public.ng_prevent_user_channel_username_collision();

CREATE TRIGGER trg_channels_user_handle_collision
BEFORE INSERT OR UPDATE OF handle ON public.channels
FOR EACH ROW EXECUTE FUNCTION public.ng_prevent_channel_user_handle_collision();

CREATE INDEX IF NOT EXISTS idx_users_username_lower ON public.users(lower(username));
CREATE INDEX IF NOT EXISTS idx_channels_handle_lower ON public.channels(lower(handle));

NOTIFY pgrst, 'reload schema';
SELECT 'NightGram user/channel username namespace protection installed' AS status;

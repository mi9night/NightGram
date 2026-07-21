-- NightGram Channel Chat: one reusable conversation per channel
-- Prevents creating a new group chat each time a new user opens channel chat.

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS channel_id uuid REFERENCES public.channels(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS conversations_channel_id_unique
  ON public.conversations(channel_id)
  WHERE channel_id IS NOT NULL;

-- Link existing channel chats by channels.chat_conversation_id when available.
UPDATE public.conversations c
SET channel_id = ch.id
FROM public.channels ch
WHERE ch.chat_conversation_id = c.id
  AND c.channel_id IS NULL;

-- Fallback: link by standard title when chat_conversation_id is empty.
WITH candidates AS (
  SELECT
    ch.id AS channel_id,
    c.id AS conversation_id,
    row_number() OVER (
      PARTITION BY ch.id
      ORDER BY (SELECT count(*) FROM public.conversation_participants cp WHERE cp.conversation_id = c.id) DESC, c.created_at ASC
    ) AS rn
  FROM public.channels ch
  JOIN public.conversations c
    ON c.type = 'group'
   AND c.title = ch.name || ' · чат'
  WHERE ch.chat_conversation_id IS NULL
)
UPDATE public.channels ch
SET chat_conversation_id = candidates.conversation_id
FROM candidates
WHERE candidates.channel_id = ch.id
  AND candidates.rn = 1
  AND ch.chat_conversation_id IS NULL;

UPDATE public.conversations c
SET channel_id = ch.id
FROM public.channels ch
WHERE ch.chat_conversation_id = c.id
  AND c.channel_id IS NULL;

-- Channel chats should not display group-owner badges: participants are regular members.
UPDATE public.conversation_participants cp
SET role = 'member'
FROM public.conversations c
WHERE cp.conversation_id = c.id
  AND c.channel_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';

SELECT 'NightGram channel chat single conversation migration installed' AS status;

-- NightGram 2.17.0 — polls and @mentions
-- Safe to run repeatedly.

ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_type_check;
ALTER TABLE public.messages
  ADD CONSTRAINT messages_type_check
  CHECK (type IN ('text','image','video','audio','file','sticker','poll','system'));

CREATE TABLE IF NOT EXISTS public.message_polls (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id uuid NOT NULL UNIQUE REFERENCES public.messages(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  question text NOT NULL CHECK (char_length(question) BETWEEN 3 AND 300),
  allow_multiple boolean NOT NULL DEFAULT false,
  anonymous boolean NOT NULL DEFAULT true,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.message_poll_options (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  poll_id uuid NOT NULL REFERENCES public.message_polls(id) ON DELETE CASCADE,
  text text NOT NULL CHECK (char_length(text) BETWEEN 1 AND 120),
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (poll_id, position)
);

CREATE TABLE IF NOT EXISTS public.message_poll_votes (
  poll_id uuid NOT NULL REFERENCES public.message_polls(id) ON DELETE CASCADE,
  option_id uuid NOT NULL REFERENCES public.message_poll_options(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (option_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_message_polls_conversation ON public.message_polls(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_poll_options_poll ON public.message_poll_options(poll_id, position);
CREATE INDEX IF NOT EXISTS idx_poll_votes_poll ON public.message_poll_votes(poll_id);
CREATE INDEX IF NOT EXISTS idx_poll_votes_user ON public.message_poll_votes(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.message_mentions (
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_message_mentions_user_unread
  ON public.message_mentions(user_id, created_at DESC)
  WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_message_mentions_conversation
  ON public.message_mentions(conversation_id, user_id, created_at DESC);

ALTER TABLE public.message_polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_poll_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_mentions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "polls_participants_read" ON public.message_polls;
CREATE POLICY "polls_participants_read" ON public.message_polls FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.conversation_participants cp
  WHERE cp.conversation_id = message_polls.conversation_id AND cp.user_id = auth.uid()
));

DROP POLICY IF EXISTS "poll_options_participants_read" ON public.message_poll_options;
CREATE POLICY "poll_options_participants_read" ON public.message_poll_options FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.message_polls mp
  JOIN public.conversation_participants cp ON cp.conversation_id = mp.conversation_id
  WHERE mp.id = message_poll_options.poll_id AND cp.user_id = auth.uid()
));

DROP POLICY IF EXISTS "poll_votes_participants_read" ON public.message_poll_votes;
CREATE POLICY "poll_votes_participants_read" ON public.message_poll_votes FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.message_polls mp
  JOIN public.conversation_participants cp ON cp.conversation_id = mp.conversation_id
  WHERE mp.id = message_poll_votes.poll_id AND cp.user_id = auth.uid()
));

DROP POLICY IF EXISTS "mentions_owner_read" ON public.message_mentions;
CREATE POLICY "mentions_owner_read" ON public.message_mentions FOR SELECT
USING (user_id = auth.uid());

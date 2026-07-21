-- NightGram 2.12 — pinned messages in conversations.
-- Safe to run more than once.

ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS pinned_at timestamptz;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS pinned_by uuid REFERENCES public.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_messages_pinned
  ON public.messages (conversation_id, pinned_at DESC)
  WHERE pinned_at IS NOT NULL;

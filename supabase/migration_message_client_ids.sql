-- NightGram 2.1: idempotent optimistic message sends.
-- A client-generated id prevents duplicate rows when a socket ACK is lost and
-- the user retries the same message.

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS client_id text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_messages_sender_client_id
  ON public.messages (sender_id, client_id)
  WHERE client_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_messages_client_id
  ON public.messages (client_id)
  WHERE client_id IS NOT NULL;

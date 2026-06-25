-- NightGram Messenger: persistent message requests

ALTER TABLE public.conversation_participants ADD COLUMN IF NOT EXISTS request_status text NOT NULL DEFAULT 'accepted';
ALTER TABLE public.conversation_participants ADD COLUMN IF NOT EXISTS hidden boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'conversation_participants_request_status_check'
  ) THEN
    ALTER TABLE public.conversation_participants
      ADD CONSTRAINT conversation_participants_request_status_check
      CHECK (request_status IN ('accepted','pending','hidden','blocked'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_conversation_participants_requests
  ON public.conversation_participants(user_id, request_status, hidden);

SELECT 'NightGram message requests migration installed' AS status;

-- NightGram Messenger: per-recipient delivered/read receipts
-- Run after schema_full_current.sql if your database was created before this migration.

CREATE TABLE IF NOT EXISTS public.message_reads (
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  delivered_at timestamptz,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_message_reads_conversation_user
  ON public.message_reads(conversation_id, user_id);
CREATE INDEX IF NOT EXISTS idx_message_reads_message
  ON public.message_reads(message_id);

ALTER TABLE public.message_reads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ng_read_message_reads" ON public.message_reads;
DROP POLICY IF EXISTS "ng_insert_message_reads" ON public.message_reads;
DROP POLICY IF EXISTS "ng_update_message_reads" ON public.message_reads;
DROP POLICY IF EXISTS "ng_delete_message_reads" ON public.message_reads;
CREATE POLICY "ng_read_message_reads" ON public.message_reads FOR SELECT USING (true);
CREATE POLICY "ng_insert_message_reads" ON public.message_reads FOR INSERT WITH CHECK (true);
CREATE POLICY "ng_update_message_reads" ON public.message_reads FOR UPDATE USING (true);
CREATE POLICY "ng_delete_message_reads" ON public.message_reads FOR DELETE USING (true);

SELECT 'NightGram message_reads migration installed' AS status;

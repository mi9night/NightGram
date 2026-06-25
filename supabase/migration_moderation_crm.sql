-- NightGram Moderation CRM: report notes, resolution fields, inline audit support
-- Run after schema_full_current.sql if your DB was created before this change.

ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS resolution_note text;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS updated_at timestamptz;

CREATE TABLE IF NOT EXISTS public.moderation_notes (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  report_id uuid REFERENCES public.reports(id) ON DELETE CASCADE,
  target_type text,
  target_id text,
  author_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  author_name text,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_moderation_notes_report ON public.moderation_notes(report_id, created_at);

ALTER TABLE public.moderation_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ng_read_moderation_notes" ON public.moderation_notes;
DROP POLICY IF EXISTS "ng_insert_moderation_notes" ON public.moderation_notes;
DROP POLICY IF EXISTS "ng_update_moderation_notes" ON public.moderation_notes;
DROP POLICY IF EXISTS "ng_delete_moderation_notes" ON public.moderation_notes;
CREATE POLICY "ng_read_moderation_notes" ON public.moderation_notes FOR SELECT USING (true);
CREATE POLICY "ng_insert_moderation_notes" ON public.moderation_notes FOR INSERT WITH CHECK (true);
CREATE POLICY "ng_update_moderation_notes" ON public.moderation_notes FOR UPDATE USING (true);
CREATE POLICY "ng_delete_moderation_notes" ON public.moderation_notes FOR DELETE USING (true);

SELECT 'NightGram moderation CRM migration installed' AS status;

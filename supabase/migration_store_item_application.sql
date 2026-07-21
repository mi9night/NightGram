-- NightGram Store: applied cosmetics + transaction ledger polish
-- Run after schema_full_current.sql if your DB was created before this change.

ALTER TABLE public.user_items ADD COLUMN IF NOT EXISTS applied boolean NOT NULL DEFAULT false;
ALTER TABLE public.user_items ADD COLUMN IF NOT EXISTS applied_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_user_items_applied ON public.user_items(user_id, applied) WHERE applied = true;

-- Keep policies idempotent for existing projects.
ALTER TABLE public.user_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ng_read_user_items" ON public.user_items;
DROP POLICY IF EXISTS "ng_insert_user_items" ON public.user_items;
DROP POLICY IF EXISTS "ng_update_user_items" ON public.user_items;
DROP POLICY IF EXISTS "ng_delete_user_items" ON public.user_items;
CREATE POLICY "ng_read_user_items" ON public.user_items FOR SELECT USING (true);
CREATE POLICY "ng_insert_user_items" ON public.user_items FOR INSERT WITH CHECK (true);
CREATE POLICY "ng_update_user_items" ON public.user_items FOR UPDATE USING (true);
CREATE POLICY "ng_delete_user_items" ON public.user_items FOR DELETE USING (true);

SELECT 'NightGram store item application migration installed' AS status;

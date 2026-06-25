-- NightGram Store: limited Night Drops

ALTER TABLE public.store_items ADD COLUMN IF NOT EXISTS drop_starts_at timestamptz;
ALTER TABLE public.store_items ADD COLUMN IF NOT EXISTS drop_ends_at timestamptz;
ALTER TABLE public.store_items ADD COLUMN IF NOT EXISTS stock_total integer;
ALTER TABLE public.store_items ADD COLUMN IF NOT EXISTS stock_sold integer NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_store_items_drop ON public.store_items(drop_ends_at, drop_starts_at);

SELECT 'NightGram night drops migration installed' AS status;

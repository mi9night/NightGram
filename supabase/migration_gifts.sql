-- NightGram Gifts: premium/coins purchase gifts + store item gift support

ALTER TABLE public.purchase_requests ADD COLUMN IF NOT EXISTS recipient_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.purchase_requests ADD COLUMN IF NOT EXISTS recipient_username text;
ALTER TABLE public.purchase_requests ADD COLUMN IF NOT EXISTS recipient_ng_id bigint;
CREATE INDEX IF NOT EXISTS idx_purchase_requests_recipient ON public.purchase_requests(recipient_user_id) WHERE recipient_user_id IS NOT NULL;

-- user_items.applied was added by migration_store_item_application, kept here for gift routes compatibility.
ALTER TABLE public.user_items ADD COLUMN IF NOT EXISTS applied boolean NOT NULL DEFAULT false;
ALTER TABLE public.user_items ADD COLUMN IF NOT EXISTS applied_at timestamptz;

SELECT 'NightGram gifts migration installed' AS status;

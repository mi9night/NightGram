-- NightGram Store Effects: explicit item usage pipeline + upgradeable NFTs
-- This lets admins create profile backgrounds, badges, frames, name colors, glow effects, themes, sticker packs and NFTs.

ALTER TABLE public.store_items ADD COLUMN IF NOT EXISTS effect_type text;
ALTER TABLE public.store_items ADD COLUMN IF NOT EXISTS effect_value text;
ALTER TABLE public.store_items ADD COLUMN IF NOT EXISTS effect_payload jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.store_items ADD COLUMN IF NOT EXISTS upgradeable boolean NOT NULL DEFAULT false;
ALTER TABLE public.store_items ADD COLUMN IF NOT EXISTS max_level integer NOT NULL DEFAULT 1;
ALTER TABLE public.store_items ADD COLUMN IF NOT EXISTS nft_collection text;

ALTER TABLE public.user_items ADD COLUMN IF NOT EXISTS level integer NOT NULL DEFAULT 1;
ALTER TABLE public.user_items ADD COLUMN IF NOT EXISTS serial_number bigint;

CREATE INDEX IF NOT EXISTS idx_store_items_effect_type ON public.store_items(effect_type);
CREATE INDEX IF NOT EXISTS idx_store_items_nft_collection ON public.store_items(nft_collection) WHERE nft_collection IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS user_items_item_serial_unique ON public.user_items(item_id, serial_number) WHERE serial_number IS NOT NULL;

SELECT 'NightGram store effects and NFT upgrade migration installed' AS status;

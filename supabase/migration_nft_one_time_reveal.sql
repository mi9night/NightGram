-- NightGram NFT One-Time Reveal Upgrade
-- Base NFT is bought without serial/background/model. A single paid upgrade reveals serial #, background and model metadata.

ALTER TABLE public.user_items ADD COLUMN IF NOT EXISTS nft_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.user_items ADD COLUMN IF NOT EXISTS upgraded_at timestamptz;

-- New NFT items are one-step: level 1 = base, level 2 = revealed/unique.
UPDATE public.store_items
SET max_level = 2
WHERE category = 'nft' AND COALESCE(max_level, 1) <> 2;

-- Preserve old already-upgraded NFTs (old system used levels > 1), but compress them to level 2.
UPDATE public.user_items ui
SET
  level = 2,
  upgraded_at = COALESCE(ui.upgraded_at, ui.purchased_at, now()),
  nft_metadata = COALESCE(ui.nft_metadata, '{}'::jsonb) || jsonb_build_object('upgraded', true, 'legacy', true)
FROM public.store_items si
WHERE ui.item_id = si.id
  AND si.category = 'nft'
  AND COALESCE(ui.level, 1) > 1;

-- Base NFTs should not have serial numbers until reveal upgrade.
UPDATE public.user_items ui
SET
  serial_number = NULL,
  nft_metadata = COALESCE(ui.nft_metadata, '{}'::jsonb) - 'serialNumber' - 'upgraded'
FROM public.store_items si
WHERE ui.item_id = si.id
  AND si.category = 'nft'
  AND COALESCE(ui.level, 1) <= 1
  AND ui.upgraded_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_user_items_upgraded_at ON public.user_items(upgraded_at) WHERE upgraded_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_items_nft_metadata ON public.user_items USING gin(nft_metadata);
CREATE UNIQUE INDEX IF NOT EXISTS user_items_item_serial_unique ON public.user_items(item_id, serial_number) WHERE serial_number IS NOT NULL;

SELECT 'NightGram one-time NFT reveal migration installed' AS status;

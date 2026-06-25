-- NightGram Store/Profile: NFT category + hide purchased items from public profile

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS hide_purchases boolean NOT NULL DEFAULT false;

-- Recreate store category check with nft included, regardless of the old generated constraint name.
DO $$
DECLARE r record;
BEGIN
  FOR r IN (
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.store_items'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%category%'
  ) LOOP
    EXECUTE format('ALTER TABLE public.store_items DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.store_items
  ADD CONSTRAINT store_items_category_check
  CHECK (category IN ('theme','color_pack','sticker_pack','frame','glow_effect','badge','nft'));

SELECT 'NightGram store nft + hide purchases migration installed' AS status;

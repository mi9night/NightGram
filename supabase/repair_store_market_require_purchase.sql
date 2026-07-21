-- NightGram repair: market cosmetics must be purchased before use
-- Removes accidental/free ownership of cosmetics that were moved from settings into the Store.
-- Real purchases/gifts are preserved when a matching coin transaction exists.

WITH market_items AS (
  SELECT id, effect_type, effect_value
  FROM public.store_items
  WHERE COALESCE(effect_payload->>'market', '') IN (
    'theme_after_graphite',
    'accent_after_graphite',
    'name_colors_after_graphite',
    'avatar_frames_no_verified_no_gold_nova'
  )
), removed AS (
  DELETE FROM public.user_items ui
  USING market_items mi
  WHERE ui.item_id = mi.id
    AND NOT EXISTS (
      SELECT 1
      FROM public.coin_transactions ct
      WHERE ct.user_id = ui.user_id
        AND ct.reference_id = ui.item_id
        AND ct.reason IN ('purchase', 'gift_item', 'store_purchase', 'admin_grant')
    )
  RETURNING ui.user_id, ui.item_id
)
SELECT count(*) AS removed_free_market_items FROM removed;

-- Reset active profile cosmetics if they point to market-only values that are no longer owned.
WITH market_name_colors AS (
  SELECT effect_value
  FROM public.store_items
  WHERE COALESCE(effect_payload->>'market', '') = 'name_colors_after_graphite'
    AND effect_type = 'name_color'
), users_to_reset AS (
  SELECT u.id
  FROM public.users u
  JOIN market_name_colors c ON lower(u.name_color) = lower(c.effect_value)
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.user_items ui
    JOIN public.store_items si ON si.id = ui.item_id
    WHERE ui.user_id = u.id
      AND si.effect_type = 'name_color'
      AND lower(si.effect_value) = lower(u.name_color)
  )
)
UPDATE public.users u
SET name_color = '#ffffff', name_color_id = 'light'
FROM users_to_reset r
WHERE u.id = r.id;

WITH market_frames AS (
  SELECT effect_value
  FROM public.store_items
  WHERE COALESCE(effect_payload->>'market', '') = 'avatar_frames_no_verified_no_gold_nova'
    AND effect_type = 'avatar_frame'
), users_to_reset AS (
  SELECT u.id
  FROM public.users u
  JOIN market_frames f ON u.avatar_frame = f.effect_value
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.user_items ui
    JOIN public.store_items si ON si.id = ui.item_id
    WHERE ui.user_id = u.id
      AND si.effect_type = 'avatar_frame'
      AND si.effect_value = u.avatar_frame
  )
)
UPDATE public.users u
SET avatar_frame = NULL
FROM users_to_reset r
WHERE u.id = r.id;

NOTIFY pgrst, 'reload schema';

SELECT 'NightGram market cosmetics now require purchase' AS status;

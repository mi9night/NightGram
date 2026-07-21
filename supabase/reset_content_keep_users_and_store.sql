-- NightGram SOFT RESET: очистить контент/чаты/каналы/покупки, но оставить пользователей и каталог магазина.
-- Используй этот вариант, если не хочешь потерять аккаунт owner/admin.
-- Останутся:
--   public.users
--   public.store_items
-- Всё остальное будет очищено.

DO $$
DECLARE
  tables_to_clear text[] := ARRAY[
    'message_reads',
    'message_reactions',
    'messages',
    'conversation_invites',
    'conversation_participants',
    'conversations',
    'post_views',
    'post_likes',
    'post_saves',
    'post_media',
    'comments',
    'posts',
    'story_likes',
    'story_views',
    'stories',
    'profile_wall_posts',
    'channel_boosts',
    'channel_invites',
    'channel_roles',
    'channel_subscriptions',
    'channels',
    'user_gifts',
    'user_items',
    'coin_transactions',
    'purchase_requests',
    'payment_events',
    'notifications',
    'ticket_messages',
    'tickets',
    'punishments',
    'reports',
    'moderation_notes',
    'moderation_logs',
    'moderation_flags',
    'spam_events',
    'rate_limits',
    'safety_domains',
    'friendships',
    'friends',
    'favorite_users',
    'favorites',
    'user_blocks',
    'follows',
    'user_circle_members',
    'user_circles',
    'presence',
    'account_deletion_requests',
    'groups'
  ];
  t text;
BEGIN
  FOREACH t IN ARRAY tables_to_clear LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('TRUNCATE TABLE public.%I RESTART IDENTITY CASCADE', t);
    END IF;
  END LOOP;
END $$;

-- Сбросить косметику пользователей, если владения товарами очищены.
UPDATE public.users
SET
  name_color = '#ffffff',
  name_color_id = 'light',
  glow_effect = NULL,
  avatar_frame = NULL,
  hide_purchases = false,
  room_scene = COALESCE(room_scene, 'midnight')
WHERE true;

ANALYZE public.users;
ANALYZE public.store_items;

NOTIFY pgrst, 'reload schema';

SELECT 'NightGram SOFT RESET done: users and public.store_items were preserved' AS status;

-- NightGram FULL RESET: очистить абсолютно всё, кроме каталога магазина (public.store_items)
-- ВНИМАНИЕ: удалит пользователей, посты, чаты, каналы, покупки, владения товарами, платежные заявки, модерацию и т.д.
-- Останется только таблица public.store_items и её товары.
-- Перед запуском лучше сделать Supabase backup/export.

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
    'groups',
    'users'
  ];
  t text;
BEGIN
  FOREACH t IN ARRAY tables_to_clear LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('TRUNCATE TABLE public.%I RESTART IDENTITY CASCADE', t);
    END IF;
  END LOOP;
END $$;

-- Вернуть публичный NG ID к стартовому значению, если sequence есть.
DO $$
BEGIN
  IF to_regclass('public.users_ng_id_seq') IS NOT NULL THEN
    EXECUTE 'ALTER SEQUENCE public.users_ng_id_seq RESTART WITH 10000001';
  END IF;
END $$;

-- Обновить статистику планировщика для быстрых запросов после очистки.
ANALYZE public.store_items;

NOTIFY pgrst, 'reload schema';

SELECT 'NightGram FULL RESET done: everything except public.store_items was cleared' AS status;

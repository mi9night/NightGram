-- NightGram chat/calls performance indexes + stats refresh.
-- Safe to run multiple times and safe on databases where optional tables/columns are not installed yet.
-- If message_reads is missing but you want read receipts, run supabase/migration_message_reads.sql first.
-- If channels.chat_conversation_id is missing but you want stable channel chats, run supabase/migration_channel_chat_single_conversation.sql first.

DO $$
BEGIN
  -- Core chat indexes --------------------------------------------------------
  IF to_regclass('public.conversation_participants') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'conversation_participants' AND column_name = 'user_id')
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'conversation_participants' AND column_name = 'conversation_id') THEN
      CREATE INDEX IF NOT EXISTS idx_conversation_participants_user_conv ON public.conversation_participants(user_id, conversation_id);
      CREATE INDEX IF NOT EXISTS idx_conversation_participants_conv_user ON public.conversation_participants(conversation_id, user_id);
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'conversation_participants' AND column_name = 'user_id')
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'conversation_participants' AND column_name = 'conversation_id')
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'conversation_participants' AND column_name = 'hidden') THEN
      CREATE INDEX IF NOT EXISTS idx_conversation_participants_user_visible ON public.conversation_participants(user_id, hidden, conversation_id);
    END IF;

    ANALYZE public.conversation_participants;
  END IF;

  IF to_regclass('public.messages') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'conversation_id')
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'created_at') THEN
      CREATE INDEX IF NOT EXISTS idx_messages_conversation_created_desc ON public.messages(conversation_id, created_at DESC);
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'sender_id')
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'created_at') THEN
      CREATE INDEX IF NOT EXISTS idx_messages_sender_created_desc ON public.messages(sender_id, created_at DESC);
    END IF;

    ANALYZE public.messages;
  END IF;

  IF to_regclass('public.message_reactions') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'message_reactions' AND column_name = 'message_id') THEN
      CREATE INDEX IF NOT EXISTS idx_message_reactions_message ON public.message_reactions(message_id);
    END IF;
    ANALYZE public.message_reactions;
  END IF;

  -- Optional read receipts table. Older DBs may not have it yet.
  IF to_regclass('public.message_reads') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'message_reads' AND column_name = 'conversation_id')
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'message_reads' AND column_name = 'user_id')
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'message_reads' AND column_name = 'read_at') THEN
      CREATE INDEX IF NOT EXISTS idx_message_reads_conversation_user_read ON public.message_reads(conversation_id, user_id, read_at);
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'message_reads' AND column_name = 'message_id')
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'message_reads' AND column_name = 'user_id') THEN
      CREATE INDEX IF NOT EXISTS idx_message_reads_message_user ON public.message_reads(message_id, user_id);
    END IF;

    ANALYZE public.message_reads;
  END IF;

  -- Presence / calls / channel chat -----------------------------------------
  IF to_regclass('public.presence') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'presence' AND column_name = 'user_id')
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'presence' AND column_name = 'last_seen') THEN
      CREATE INDEX IF NOT EXISTS idx_presence_user_last_seen ON public.presence(user_id, last_seen DESC);
    END IF;
    ANALYZE public.presence;
  END IF;

  IF to_regclass('public.channel_boosts') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'channel_boosts' AND column_name = 'channel_id')
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'channel_boosts' AND column_name = 'expires_at') THEN
      CREATE INDEX IF NOT EXISTS idx_channel_boosts_channel_expires ON public.channel_boosts(channel_id, expires_at DESC);
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'channel_boosts' AND column_name = 'user_id')
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'channel_boosts' AND column_name = 'expires_at') THEN
      CREATE INDEX IF NOT EXISTS idx_channel_boosts_user_expires ON public.channel_boosts(user_id, expires_at DESC);
    END IF;

    ANALYZE public.channel_boosts;
  END IF;

  IF to_regclass('public.channels') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'channels' AND column_name = 'chat_conversation_id') THEN
      CREATE INDEX IF NOT EXISTS idx_channels_chat_conversation ON public.channels(chat_conversation_id) WHERE chat_conversation_id IS NOT NULL;
    END IF;
    ANALYZE public.channels;
  END IF;

  IF to_regclass('public.conversations') IS NOT NULL THEN
    IF to_regclass('public.channels') IS NOT NULL THEN
      ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS channel_id uuid REFERENCES public.channels(id) ON DELETE SET NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS conversations_channel_id_unique ON public.conversations(channel_id) WHERE channel_id IS NOT NULL;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'conversations' AND column_name = 'type')
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'conversations' AND column_name = 'created_at') THEN
      CREATE INDEX IF NOT EXISTS idx_conversations_type_created ON public.conversations(type, created_at DESC);
    END IF;

    ANALYZE public.conversations;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

SELECT 'NightGram chat/calls optimization installed' AS status;

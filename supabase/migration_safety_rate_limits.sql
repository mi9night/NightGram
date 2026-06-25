-- NightGram Safety: spam events, moderation flags and optional persistent rate-limit table

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS safety_trust_override text CHECK (safety_trust_override IN ('trusted','restricted'));
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS safety_restrictions jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS safety_restricted_until timestamptz;
CREATE INDEX IF NOT EXISTS idx_users_safety_restricted ON public.users(safety_restricted_until) WHERE safety_restricted_until IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.rate_limits (
  key text PRIMARY KEY,
  count integer NOT NULL DEFAULT 0,
  window_start timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rate_limits_expires ON public.rate_limits(expires_at);

CREATE TABLE IF NOT EXISTS public.spam_events (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  target_type text,
  target_id text,
  fingerprint text,
  meta jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_spam_events_user ON public.spam_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_spam_events_type ON public.spam_events(event_type, created_at DESC);

CREATE TABLE IF NOT EXISTS public.moderation_flags (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  type text NOT NULL,
  severity integer NOT NULL DEFAULT 1,
  reason text NOT NULL,
  meta jsonb DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','ignored')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES public.users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_moderation_flags_status ON public.moderation_flags(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_moderation_flags_user ON public.moderation_flags(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.safety_domains (
  domain text PRIMARY KEY,
  action text NOT NULL CHECK (action IN ('allow','deny')),
  reason text,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_safety_domains_action ON public.safety_domains(action);

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spam_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moderation_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.safety_domains ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['rate_limits','spam_events','moderation_flags','safety_domains'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "ng_read_%s" ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "ng_insert_%s" ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "ng_update_%s" ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "ng_delete_%s" ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "ng_read_%s" ON public.%I FOR SELECT USING (true)', t, t);
    EXECUTE format('CREATE POLICY "ng_insert_%s" ON public.%I FOR INSERT WITH CHECK (true)', t, t);
    EXECUTE format('CREATE POLICY "ng_update_%s" ON public.%I FOR UPDATE USING (true)', t, t);
    EXECUTE format('CREATE POLICY "ng_delete_%s" ON public.%I FOR DELETE USING (true)', t, t);
  END LOOP;
END $$;

SELECT 'NightGram safety migration installed' AS status;

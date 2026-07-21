-- NightGram Private Circles: close friends/custom social circles

CREATE TABLE IF NOT EXISTS public.user_circles (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#a855f7',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_circles_owner ON public.user_circles(owner_id);

CREATE TABLE IF NOT EXISTS public.user_circle_members (
  circle_id uuid NOT NULL REFERENCES public.user_circles(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (circle_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_user_circle_members_user ON public.user_circle_members(user_id);

ALTER TABLE public.user_circles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_circle_members ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['user_circles','user_circle_members'] LOOP
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

SELECT 'NightGram private circles migration installed' AS status;

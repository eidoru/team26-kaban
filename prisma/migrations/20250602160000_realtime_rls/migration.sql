-- Scoped read policies for Supabase Realtime (postgres_changes).
-- Prisma / Express uses the postgres role and is unaffected by RLS.
-- user_id columns are TEXT; auth.uid() is uuid — compare via text cast.

ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

ALTER TABLE memberships REPLICA IDENTITY FULL;
ALTER TABLE rounds REPLICA IDENTITY FULL;
ALTER TABLE contributions REPLICA IDENTITY FULL;
ALTER TABLE notifications REPLICA IDENTITY FULL;

CREATE POLICY "realtime_memberships_select"
ON memberships FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM memberships viewer
    WHERE viewer.group_id = memberships.group_id
      AND viewer.user_id = auth.uid()::text
  )
);

CREATE POLICY "realtime_rounds_select"
ON rounds FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM memberships m
    WHERE m.group_id = rounds.group_id
      AND m.user_id = auth.uid()::text
  )
);

CREATE POLICY "realtime_contributions_select"
ON contributions FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM rounds r
    INNER JOIN memberships m ON m.group_id = r.group_id
    WHERE r.id = contributions.round_id
      AND m.user_id = auth.uid()::text
  )
);

CREATE POLICY "realtime_notifications_select"
ON notifications FOR SELECT
TO authenticated
USING (user_id = auth.uid()::text);

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.memberships;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.rounds;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.contributions;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

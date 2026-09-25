-- The original realtime policies checked membership by querying `memberships` from inside the
-- `memberships` policy (and rounds/contributions went through it), which Postgres rejects as
-- infinite recursion, so postgres_changes events were never delivered. A SECURITY DEFINER helper
-- runs as the table owner, bypasses RLS for its lookup, and breaks the cycle.

CREATE OR REPLACE FUNCTION public.is_group_member(p_group_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM memberships
    WHERE group_id = p_group_id
      AND user_id = auth.uid()::text
  );
$$;

REVOKE ALL ON FUNCTION public.is_group_member(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_group_member(text) TO authenticated;

DROP POLICY IF EXISTS "realtime_memberships_select" ON memberships;
CREATE POLICY "realtime_memberships_select"
ON memberships FOR SELECT
TO authenticated
USING (public.is_group_member(group_id));

DROP POLICY IF EXISTS "realtime_rounds_select" ON rounds;
CREATE POLICY "realtime_rounds_select"
ON rounds FOR SELECT
TO authenticated
USING (public.is_group_member(group_id));

DROP POLICY IF EXISTS "realtime_contributions_select" ON contributions;
CREATE POLICY "realtime_contributions_select"
ON contributions FOR SELECT
TO authenticated
USING (
  public.is_group_member((SELECT r.group_id FROM rounds r WHERE r.id = contributions.round_id))
);

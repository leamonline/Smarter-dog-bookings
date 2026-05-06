-- 016a_fix_staff_profiles_rls_recursion.sql
-- BACKFILL — applied to production on 2026-04-13 as version 20260413135120
-- under the name "fix_staff_profiles_rls_recursion". Added retroactively so
-- the repo has a complete record. Re-running is safe (OR REPLACE / IF EXISTS).
--
-- The combined_update_staff_profiles policy was later re-created by
-- 024_performance_advisors.sql to wrap auth.uid() in (select ...) for
-- planner optimisation.

-- Create is_owner() SECURITY DEFINER function to avoid RLS recursion
CREATE OR REPLACE FUNCTION is_owner()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM staff_profiles
    WHERE user_id = auth.uid()
      AND role = 'owner'
  );
$$;

-- Create get_my_role() SECURITY DEFINER function to avoid RLS recursion
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM staff_profiles
  WHERE user_id = auth.uid()
  LIMIT 1;
$$;

-- Drop the broken UPDATE policy
DROP POLICY IF EXISTS "combined_update_staff_profiles" ON staff_profiles;

-- Recreate UPDATE policy using SECURITY DEFINER functions instead of inline subqueries
CREATE POLICY "combined_update_staff_profiles"
ON staff_profiles
FOR UPDATE
TO authenticated
USING (
  (auth.uid() = user_id) OR is_owner()
)
WITH CHECK (
  is_owner() OR (
    (auth.uid() = user_id) AND (role = get_my_role())
  )
);

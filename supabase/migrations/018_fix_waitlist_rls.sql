-- 018_fix_waitlist_rls.sql
-- CRITICAL-2: Fix overly permissive waitlist policies
-- The original policies used USING(true) which lets ANY authenticated user
-- (including customers) read, insert, and delete ALL waitlist entries.

-- Drop the overly permissive "staff" policies that actually allowed everyone
DROP POLICY IF EXISTS "Staff can select all waitlist" ON waitlist_entries;
DROP POLICY IF EXISTS "Staff can insert waitlist" ON waitlist_entries;
DROP POLICY IF EXISTS "Staff can delete waitlist" ON waitlist_entries;

-- Replace with properly scoped staff-only policies
CREATE POLICY "staff_select_waitlist" ON waitlist_entries
  FOR SELECT TO authenticated
  USING ((SELECT is_staff()));

CREATE POLICY "staff_insert_waitlist" ON waitlist_entries
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT is_staff()));

CREATE POLICY "staff_delete_waitlist" ON waitlist_entries
  FOR DELETE TO authenticated
  USING ((SELECT is_staff()));

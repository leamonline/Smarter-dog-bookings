-- 023_secure_salon_todos.sql
-- The salon_todos table was created (via dashboard, not a numbered migration)
-- with `USING (true)` policies for SELECT/INSERT/UPDATE/DELETE on the
-- `authenticated` role. Customers logging into the portal share that role,
-- so they could read and delete the salon's shared to-do list.
--
-- Replace with staff-only policies that reuse the existing is_staff() helper
-- (defined in 004_rls_policies.sql).

DROP POLICY IF EXISTS "Authenticated users can read todos"   ON salon_todos;
DROP POLICY IF EXISTS "Authenticated users can insert todos" ON salon_todos;
DROP POLICY IF EXISTS "Authenticated users can update todos" ON salon_todos;
DROP POLICY IF EXISTS "Authenticated users can delete todos" ON salon_todos;

CREATE POLICY "staff_select_salon_todos" ON salon_todos
  FOR SELECT TO authenticated
  USING ((SELECT is_staff()));

CREATE POLICY "staff_insert_salon_todos" ON salon_todos
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT is_staff()));

CREATE POLICY "staff_update_salon_todos" ON salon_todos
  FOR UPDATE TO authenticated
  USING ((SELECT is_staff()))
  WITH CHECK ((SELECT is_staff()));

CREATE POLICY "staff_delete_salon_todos" ON salon_todos
  FOR DELETE TO authenticated
  USING ((SELECT is_staff()));

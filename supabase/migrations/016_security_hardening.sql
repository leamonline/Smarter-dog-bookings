-- 016_security_hardening.sql
-- Security improvements from codebase review:
--   S2: Restrict staff_profiles visibility to staff only
--   S5: Add audit logging table for staff data access
--   S6: Add customer-scoped RLS on notification_log

-- ============================================================
-- S2: Restrict staff_profiles view to staff only
-- Previously: any authenticated user (including customers) could
-- see all staff profiles. Now only staff can view them.
-- ============================================================
DROP POLICY IF EXISTS "Staff can view all profiles" ON staff_profiles;

CREATE POLICY "Staff can view all profiles"
  ON staff_profiles FOR SELECT
  TO authenticated
  USING ((SELECT is_staff()));


-- ============================================================
-- S5: Audit logging for staff data access
-- Tracks staff queries and modifications to customer data.
-- Only owners can read the audit log.
-- ============================================================
CREATE TABLE IF NOT EXISTS data_access_log (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  staff_user_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action          text NOT NULL CHECK (action IN ('select', 'insert', 'update', 'delete', 'export')),
  table_name      text NOT NULL,
  record_id       uuid,
  detail          text,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX idx_data_access_log_staff ON data_access_log(staff_user_id);
CREATE INDEX idx_data_access_log_created ON data_access_log(created_at);

ALTER TABLE data_access_log ENABLE ROW LEVEL SECURITY;

-- Only owners can view the audit log
CREATE POLICY "owner_select_data_access_log"
  ON data_access_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM staff_profiles
      WHERE user_id = (SELECT auth.uid())
        AND role = 'owner'
    )
  );

-- Staff can insert their own log entries (via Edge Functions or triggers)
CREATE POLICY "staff_insert_data_access_log"
  ON data_access_log FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT is_staff()) AND staff_user_id = (SELECT auth.uid()));


-- ============================================================
-- S6: Restrict notification_log to customer-scoped reads
-- Staff can already read all (migration 008). Add a policy so
-- customers can view notifications for their own bookings.
-- ============================================================
CREATE POLICY "customer_select_own_notifications"
  ON notification_log FOR SELECT
  TO authenticated
  USING (
    human_id IN (
      SELECT id FROM humans
      WHERE customer_user_id = (SELECT auth.uid())
    )
  );

-- 008_notification_log.sql
-- Notification tracking for booking confirmations, reminders, and cancellations

CREATE TABLE IF NOT EXISTS notification_log (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id    uuid REFERENCES bookings(id) ON DELETE SET NULL,
  group_id      uuid,
  human_id      uuid REFERENCES humans(id) ON DELETE SET NULL,
  channel       text NOT NULL CHECK (channel IN ('whatsapp', 'sms', 'email')),
  trigger_type  text NOT NULL CHECK (trigger_type IN ('confirmed', 'reminder', 'cancelled')),
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('sent', 'failed', 'pending')),
  error_message text,
  sent_at       timestamptz,
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX idx_notification_log_booking ON notification_log(booking_id);
CREATE INDEX idx_notification_log_human ON notification_log(human_id);
CREATE INDEX idx_notification_log_status ON notification_log(status);

-- RLS: staff can read all logs
ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_select_notification_log"
  ON notification_log FOR SELECT
  TO authenticated
  USING (is_staff());

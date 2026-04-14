-- Add per-customer reminder preferences
ALTER TABLE humans
  ADD COLUMN IF NOT EXISTS reminder_hours INTEGER DEFAULT 24,
  ADD COLUMN IF NOT EXISTS reminder_channels JSONB DEFAULT '["whatsapp"]'::jsonb;

COMMENT ON COLUMN humans.reminder_hours IS 'Hours before appointment to send reminder (24, 12, or 2)';
COMMENT ON COLUMN humans.reminder_channels IS 'JSON array of channels: whatsapp, sms, email';

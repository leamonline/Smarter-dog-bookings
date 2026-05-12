-- 20260512160000_whatsapp_ai_humans_phone_unique.sql
--
-- Prevent duplicate humans rows when the WhatsApp AI onboarding path
-- retries. createNewCustomerRecords in supabase/functions/whatsapp-agent
-- inserts a humans row then a dogs row. If the dogs insert fails and
-- the best-effort rollback also fails (network partition, RLS, etc.),
-- the humans row is orphaned. The customer's next positive-confirm
-- retry would otherwise create a second humans row for the same phone.
--
-- Scope: only AI-onboarded rows (source='whatsapp_ai'). Manually-created
-- humans rows (source NULL or other) are unaffected — they can legitimately
-- share a phone or have NULL phone.
--
-- The application layer (createNewCustomerRecords) also SELECTs before
-- INSERT for the common-case retry; this constraint is the DB-level
-- backstop that catches concurrent retries between the SELECT and INSERT.

create unique index if not exists idx_humans_phone_unique_whatsapp_ai
  on humans (phone)
  where source = 'whatsapp_ai' and phone is not null;

comment on index idx_humans_phone_unique_whatsapp_ai is
  'Prevents the WhatsApp AI onboarding path from creating duplicate humans rows for the same phone. Scoped to source=whatsapp_ai so manually-entered customers are unaffected.';

-- A Meta failure that Meta then retracts must not leave the log saying 'failed'
-- (migration 20261101120000_notification_log_reconcile_meta_delivery).
--
-- On 1 November 2026 Meta reported 131026 for a reminder and four seconds later
-- delivered it. The log kept 'failed', so the SMS fallback texted the customer
-- and the 19:00 pass sent the WhatsApp again. The trigger under test puts the
-- log row back to 'sent' when its message leaves 'failed' for 'delivered' or
-- 'read', and only then. Synthetic fixtures, rolled back.

begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

-- ── Fixtures (other triggers on these tables POST out or gate; skip them) ──
set local session_replication_role = replica;

insert into public.humans (id, name, surname, phone)
values ('25900000-0000-4000-8000-000000000001', 'Synthetic', 'Customer', '+447700900259');

insert into public.dogs (id, name, breed, size, human_id)
values ('25900000-0000-4000-8000-000000000002', 'Pip', 'Poodle', 'small', '25900000-0000-4000-8000-000000000001');

insert into public.bookings (id, booking_date, slot, dog_id, size, service, status, confirmed, payment)
values
  ('25900000-0000-4000-8000-000000000011', current_date + 2, '09:00', '25900000-0000-4000-8000-000000000002', 'small', 'full-groom', 'Booked', false, 'Due at Pick-up'),
  ('25900000-0000-4000-8000-000000000012', current_date + 3, '09:00', '25900000-0000-4000-8000-000000000002', 'small', 'full-groom', 'Booked', false, 'Due at Pick-up'),
  ('25900000-0000-4000-8000-000000000013', current_date + 4, '09:00', '25900000-0000-4000-8000-000000000002', 'small', 'full-groom', 'Booked', false, 'Due at Pick-up'),
  ('25900000-0000-4000-8000-000000000014', current_date + 5, '09:00', '25900000-0000-4000-8000-000000000002', 'small', 'full-groom', 'Booked', false, 'Due at Pick-up'),
  ('25900000-0000-4000-8000-000000000015', current_date + 6, '09:00', '25900000-0000-4000-8000-000000000002', 'small', 'full-groom', 'Booked', false, 'Due at Pick-up');

insert into public.whatsapp_conversations (id, phone_e164, human_id)
values ('25900000-0000-4000-8000-000000000010', '+447700900259', '25900000-0000-4000-8000-000000000001');

-- Five outbound messages that Meta failed first, plus one still plainly 'sent'.
insert into public.whatsapp_messages (id, conversation_id, direction, role, meta_message_id, content, status, error_message)
select ('25900000-0000-4000-8000-0000000000' || n)::uuid,
       '25900000-0000-4000-8000-000000000010', 'outbound', 'assistant',
       'wamid.test259.' || n, '[template:appointment_reminder_v1] synthetic',
       case when n = '26' then 'sent' else 'failed' end,
       case when n = '26' then null
            else '[{"code":131026,"title":"Message undeliverable","message":"Message undeliverable"}]' end
  from (values ('21'), ('22'), ('23'), ('24'), ('25'), ('26')) as v(n);

-- 21: failed by the Meta reconciliation, then delivered   -> back to sent
-- 22: same, then read                                      -> back to sent
-- 23: failed for some other reason (not Meta's line)       -> stays failed
-- 24: failed, but a resend already holds the slot          -> stays failed
-- 25: failed on another booking, no resend, SMS sibling    -> back to sent, SMS row untouched
-- 26: sent, then delivered                                 -> unchanged
insert into public.notification_log (id, booking_id, human_id, channel, trigger_type, status, provider_message_id, error_message, sent_at)
values
  ('25900000-0000-4000-8000-000000000031', '25900000-0000-4000-8000-000000000011', '25900000-0000-4000-8000-000000000001', 'whatsapp', 'reminder', 'failed', 'wamid.test259.21', 'WhatsApp could not deliver this — the number may not be on WhatsApp (Meta 131026).', now()),
  ('25900000-0000-4000-8000-000000000032', '25900000-0000-4000-8000-000000000012', '25900000-0000-4000-8000-000000000001', 'whatsapp', 'reminder', 'failed', 'wamid.test259.22', 'WhatsApp could not deliver this — the number may not be on WhatsApp (Meta 131026).', now()),
  ('25900000-0000-4000-8000-000000000033', '25900000-0000-4000-8000-000000000013', '25900000-0000-4000-8000-000000000001', 'whatsapp', 'reminder', 'failed', 'wamid.test259.23', 'whatsapp-send returned 500', now()),
  ('25900000-0000-4000-8000-000000000034', '25900000-0000-4000-8000-000000000014', '25900000-0000-4000-8000-000000000001', 'whatsapp', 'reminder', 'failed', 'wamid.test259.24', 'WhatsApp could not deliver this — the number may not be on WhatsApp (Meta 131026).', now()),
  ('25900000-0000-4000-8000-000000000035', '25900000-0000-4000-8000-000000000014', '25900000-0000-4000-8000-000000000001', 'whatsapp', 'reminder', 'sent',   'wamid.test259.resend', null, now()),
  ('25900000-0000-4000-8000-000000000036', '25900000-0000-4000-8000-000000000015', '25900000-0000-4000-8000-000000000001', 'whatsapp', 'reminder', 'failed', 'wamid.test259.25', 'WhatsApp could not deliver this — the number may not be on WhatsApp (Meta 131026).', now()),
  ('25900000-0000-4000-8000-000000000037', '25900000-0000-4000-8000-000000000015', '25900000-0000-4000-8000-000000000001', 'sms',      'reminder_sms_fallback', 'sent', 'SMtest259', null, now()),
  ('25900000-0000-4000-8000-000000000038', '25900000-0000-4000-8000-000000000011', '25900000-0000-4000-8000-000000000001', 'whatsapp', 'confirmed', 'sent', 'wamid.test259.26', null, now());

set local session_replication_role = default;

-- ── 21: failed → delivered ─────────────────────────────────────────
update public.whatsapp_messages set status = 'delivered' where meta_message_id = 'wamid.test259.21';
select is(
  (select status from public.notification_log where id = '25900000-0000-4000-8000-000000000031'),
  'sent',
  'a failed message that Meta then delivers puts its log row back to sent'
);
select is(
  (select error_message from public.notification_log where id = '25900000-0000-4000-8000-000000000031'),
  null,
  'and clears the failure line staff would otherwise see'
);

-- ── 22: failed → delivered → read ──────────────────────────────────
update public.whatsapp_messages set status = 'delivered' where meta_message_id = 'wamid.test259.22';
update public.whatsapp_messages set status = 'read' where meta_message_id = 'wamid.test259.22';
select is(
  (select status from public.notification_log where id = '25900000-0000-4000-8000-000000000032'),
  'sent',
  'the same through delivered then read (Mark''s reminder)'
);

-- ── 23: some other failure ─────────────────────────────────────────
update public.whatsapp_messages set status = 'delivered' where meta_message_id = 'wamid.test259.23';
select is(
  (select status from public.notification_log where id = '25900000-0000-4000-8000-000000000033'),
  'failed',
  'a log row that failed for a reason other than Meta''s own line is left alone'
);

-- ── 24: a resend holds the slot ────────────────────────────────────
select lives_ok(
  $$update public.whatsapp_messages set status = 'read' where meta_message_id = 'wamid.test259.24'$$,
  'the status write still succeeds when a resend already holds the idempotency slot'
);
select is(
  (select status from public.notification_log where id = '25900000-0000-4000-8000-000000000034'),
  'failed',
  'and the failed row stays failed rather than duplicating the resend'
);

-- ── 25: SMS sibling ────────────────────────────────────────────────
update public.whatsapp_messages set status = 'delivered' where meta_message_id = 'wamid.test259.25';
select is(
  (select status from public.notification_log where id = '25900000-0000-4000-8000-000000000037'),
  'sent',
  'the SMS fallback row is untouched'
);

-- ── 26: ordinary sent → delivered ──────────────────────────────────
update public.whatsapp_messages set status = 'delivered' where meta_message_id = 'wamid.test259.26';
select is(
  (select status from public.notification_log where id = '25900000-0000-4000-8000-000000000038'),
  'sent',
  'a normal sent-then-delivered message leaves its log row as it was'
);

-- ── a failed message that stays failed does not revive its row ─────
update public.whatsapp_messages set status = 'failed' where meta_message_id = 'wamid.test259.21';
select is(
  (select status from public.notification_log where id = '25900000-0000-4000-8000-000000000031'),
  'failed',
  'a delivered message later reported failed is failed again (the existing trigger still wins)'
);

select * from finish();
rollback;

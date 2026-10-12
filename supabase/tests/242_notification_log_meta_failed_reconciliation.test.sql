-- notification_log agrees with Meta about WhatsApp delivery
-- (migration 20261012120000_notification_log_meta_failed_reconciliation).
--
-- A notify function logs a WhatsApp send as 'sent' when Meta accepts it;
-- Meta's later "undeliverable" lands on whatsapp_messages. The two triggers
-- under test make the log catch up in either order, with the same readable
-- line the agent writes, and leave every other row alone. Synthetic fixtures,
-- rolled back.

begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

-- ── Fixtures (other triggers on these tables POST out; skip them) ──
set local session_replication_role = replica;

insert into public.humans (id, name, surname, phone)
values ('24200000-0000-4000-8000-000000000001', 'Synthetic', 'Customer', '+447700900242');

insert into public.whatsapp_conversations (id, phone_e164, human_id)
values ('24200000-0000-4000-8000-000000000010', '+447700900242', '24200000-0000-4000-8000-000000000001');

-- (a) the common order: the log row already has its id when Meta fails it
insert into public.whatsapp_messages (id, conversation_id, direction, role, meta_message_id, content, status)
values ('24200000-0000-4000-8000-000000000020', '24200000-0000-4000-8000-000000000010', 'outbound', 'assistant', 'wamid.test242.a', '[template:booking_confirmed_v1] synthetic', 'sent');

insert into public.notification_log (id, human_id, channel, trigger_type, status, provider_message_id, sent_at)
values ('24200000-0000-4000-8000-000000000030', '24200000-0000-4000-8000-000000000001', 'whatsapp', 'confirmed', 'sent', 'wamid.test242.a', now());

-- an SMS fallback row that happens to share nothing but the customer
insert into public.notification_log (id, human_id, channel, trigger_type, status, provider_message_id, sent_at)
values ('24200000-0000-4000-8000-000000000031', '24200000-0000-4000-8000-000000000001', 'sms', 'confirmed_sms_fallback', 'sent', 'SMtest242', now());

-- (b) the race order: Meta has already failed this message before the log row exists
insert into public.whatsapp_messages (id, conversation_id, direction, role, meta_message_id, content, status, error_message)
values ('24200000-0000-4000-8000-000000000021', '24200000-0000-4000-8000-000000000010', 'outbound', 'assistant', 'wamid.test242.b', '[template:appointment_reminder_v1] synthetic', 'failed',
        '[{"code":131026,"title":"Message undeliverable","message":"Message undeliverable","error_data":{"details":"Message Undeliverable."}}]');

-- (c) a message that was delivered, so nothing should ever change for it
insert into public.whatsapp_messages (id, conversation_id, direction, role, meta_message_id, content, status)
values ('24200000-0000-4000-8000-000000000022', '24200000-0000-4000-8000-000000000010', 'outbound', 'assistant', 'wamid.test242.c', '[template:appointment_reminder_v1] synthetic', 'sent');

insert into public.notification_log (id, human_id, channel, trigger_type, status, provider_message_id, sent_at)
values ('24200000-0000-4000-8000-000000000032', '24200000-0000-4000-8000-000000000001', 'whatsapp', 'reminder', 'sent', 'wamid.test242.c', now());

set local session_replication_role = default;

-- ── The readable line ──────────────────────────────────────────────
select is(
  public.whatsapp_meta_failure_summary('[{"code":131026,"title":"Message undeliverable","message":"Message undeliverable"}]'),
  'WhatsApp could not deliver this — the number may not be on WhatsApp (Meta 131026).',
  '131026 reads as "not on WhatsApp", exactly as deliveryStatus.ts writes it'
);

select is(
  public.whatsapp_meta_failure_summary('[{"code":131047,"title":"Re-engagement message"}]'),
  'WhatsApp could not deliver this: Re-engagement message (Meta 131047).',
  'another code keeps Meta''s title and code'
);

select is(
  public.whatsapp_meta_failure_summary('not json at all'),
  'WhatsApp could not deliver this message.',
  'garbage falls back to the generic line rather than raising'
);

select is(
  public.whatsapp_meta_failure_summary(null),
  'WhatsApp could not deliver this message.',
  'null falls back to the generic line'
);

-- ── (a) Verdict after the log row ──────────────────────────────────
update public.whatsapp_messages
   set status = 'failed',
       error_message = '[{"code":131026,"title":"Message undeliverable","message":"Message undeliverable","error_data":{"details":"Message Undeliverable."}}]'
 where id = '24200000-0000-4000-8000-000000000020';

select is(
  (select status from public.notification_log where id = '24200000-0000-4000-8000-000000000030'),
  'failed',
  'a Meta failure flips the still-sent log row to failed'
);

select is(
  (select error_message from public.notification_log where id = '24200000-0000-4000-8000-000000000030'),
  'WhatsApp could not deliver this — the number may not be on WhatsApp (Meta 131026).',
  'with the readable reason staff see on the delivery-failure card'
);

select is(
  (select status from public.notification_log where id = '24200000-0000-4000-8000-000000000031'),
  'sent',
  'the SMS row is untouched'
);

-- a second, repeated failed status write changes nothing further
update public.whatsapp_messages set status = 'failed' where id = '24200000-0000-4000-8000-000000000020';
select is(
  (select count(*)::int from public.notification_log where provider_message_id = 'wamid.test242.a' and status = 'failed'),
  1,
  'repeating the verdict is a no-op'
);

-- ── (b) Log row after the verdict ──────────────────────────────────
insert into public.notification_log (id, human_id, channel, trigger_type, status, provider_message_id, sent_at)
values ('24200000-0000-4000-8000-000000000033', '24200000-0000-4000-8000-000000000001', 'whatsapp', 'reminder', 'sent', 'wamid.test242.b', now());

select is(
  (select status from public.notification_log where id = '24200000-0000-4000-8000-000000000033'),
  'failed',
  'a row written as sent for an already-failed message is stored as failed'
);

select is(
  (select error_message from public.notification_log where id = '24200000-0000-4000-8000-000000000033'),
  'WhatsApp could not deliver this — the number may not be on WhatsApp (Meta 131026).',
  'carrying the same readable reason'
);

-- the notify functions' real shape: a pending row that later gains its id
insert into public.notification_log (id, human_id, channel, trigger_type, status)
values ('24200000-0000-4000-8000-000000000034', '24200000-0000-4000-8000-000000000001', 'whatsapp', 'confirmed', 'pending');

update public.notification_log
   set status = 'sent', sent_at = now(), provider_message_id = 'wamid.test242.b'
 where id = '24200000-0000-4000-8000-000000000034';

select is(
  (select status from public.notification_log where id = '24200000-0000-4000-8000-000000000034'),
  'failed',
  'a pending row that becomes sent with an already-failed id is stored as failed'
);

-- ── (c) Delivered messages are never touched ───────────────────────
update public.whatsapp_messages set status = 'delivered', delivered_at = now()
 where id = '24200000-0000-4000-8000-000000000022';

select is(
  (select status from public.notification_log where id = '24200000-0000-4000-8000-000000000032'),
  'sent',
  'a delivered verdict leaves the sent row as it is'
);

-- ── Grants: internal plumbing, not an API ──────────────────────────
select ok(
  not has_function_privilege('anon', 'public.whatsapp_meta_failure_summary(text)', 'execute'),
  'anon cannot execute the summary function'
);

select ok(
  not has_function_privilege('authenticated', 'public.reconcile_notification_log_on_meta_failure()', 'execute')
  and not has_function_privilege('authenticated', 'public.reconcile_notification_log_row_with_meta()', 'execute'),
  'authenticated cannot execute the trigger functions directly'
);

select * from finish();
rollback;

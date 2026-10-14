-- Cancellation notices join the SMS safety net
-- (migration 20261014100000_cancelled_sms_fallback).
--
-- Two database facts the edge functions now rely on: notification_log accepts
-- a 'cancelled_sms_fallback' trigger_type, and the notification-pending-reaper
-- keeps an error_message the sending function wrote while it flips a stale
-- 'pending' row to 'failed'. Synthetic fixtures, rolled back.

begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

-- ── Fixtures (other triggers on these tables POST out; skip them) ──
set local session_replication_role = replica;

insert into public.humans (id, name, surname, phone)
values ('24300000-0000-4000-8000-000000000001', 'Synthetic', 'Customer', '+447700900243');

-- ── 1. trigger_type CHECK ──────────────────────────────────
select lives_ok(
  $$ insert into public.notification_log (id, human_id, channel, trigger_type, status, message_text)
     values ('24300000-0000-4000-8000-000000000030', '24300000-0000-4000-8000-000000000001', 'sms', 'cancelled_sms_fallback', 'pending', 'synthetic') $$,
  'cancelled_sms_fallback is an allowed trigger_type');

select lives_ok(
  $$ insert into public.notification_log (id, human_id, channel, trigger_type, status)
     values ('24300000-0000-4000-8000-000000000031', '24300000-0000-4000-8000-000000000001', 'whatsapp', 'day_closure', 'sent') $$,
  'every previously allowed value survives (day_closure, the last one added)');

select throws_ok(
  $$ insert into public.notification_log (id, human_id, channel, trigger_type, status)
     values ('24300000-0000-4000-8000-000000000032', '24300000-0000-4000-8000-000000000001', 'sms', 'ready_sms_fallback', 'pending') $$,
  '23514',
  null,
  'an unlisted trigger_type is still refused');

select is(
  (select count(*)::int
     from pg_catalog.pg_constraint c
     join pg_catalog.pg_class t on t.oid = c.conrelid
     join pg_catalog.pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public' and t.relname = 'notification_log'
      and c.contype = 'c' and pg_catalog.pg_get_constraintdef(c.oid) like '%trigger_type%'),
  1, 'exactly one trigger_type CHECK remains, so no leftover can refuse the new value');

-- ── 2. The reaper preserves a message the sender wrote ─────
select is(
  (select count(*)::int from cron.job where jobname = 'notification-pending-reaper' and schedule = '*/15 * * * *'),
  1, 'the pending reaper is scheduled every 15 minutes');

-- A Twilio-accepted cancellation: pending for 20 minutes, with the sender's note.
insert into public.notification_log (id, human_id, channel, trigger_type, status, error_message, created_at)
values ('24300000-0000-4000-8000-000000000040', '24300000-0000-4000-8000-000000000001', 'whatsapp', 'cancelled', 'pending',
        'Delivery unconfirmed: Twilio accepted this WhatsApp but cannot report whether it arrived. If the customer accepts texts, the same message follows by SMS about an hour later.',
        now() - interval '20 minutes');

-- A genuinely interrupted send: pending for 20 minutes with no message.
insert into public.notification_log (id, human_id, channel, trigger_type, status, created_at)
values ('24300000-0000-4000-8000-000000000041', '24300000-0000-4000-8000-000000000001', 'whatsapp', 'confirmed', 'pending',
        now() - interval '20 minutes');

-- A fresh pending row the reaper must leave alone.
insert into public.notification_log (id, human_id, channel, trigger_type, status, created_at)
values ('24300000-0000-4000-8000-000000000042', '24300000-0000-4000-8000-000000000001', 'whatsapp', 'cancelled', 'pending',
        now() - interval '1 minute');

-- Run the job's own command, as pg_cron would.
do $$
declare cmd text;
begin
  select command into cmd from cron.job where jobname = 'notification-pending-reaper';
  execute cmd;
end $$;

select is(
  (select status from public.notification_log where id = '24300000-0000-4000-8000-000000000040'),
  'failed', 'a stale pending Twilio row is failed');
select is(
  (select error_message from public.notification_log where id = '24300000-0000-4000-8000-000000000040'),
  'Delivery unconfirmed: Twilio accepted this WhatsApp but cannot report whether it arrived. If the customer accepts texts, the same message follows by SMS about an hour later.',
  'and keeps the message the sending function wrote');
select is(
  (select error_message from public.notification_log where id = '24300000-0000-4000-8000-000000000041'),
  'reaped: stuck pending >10min (send interrupted before finalise)',
  'a row with no message still gets the reaper''s own text');
select is(
  (select status from public.notification_log where id = '24300000-0000-4000-8000-000000000042'),
  'pending', 'a fresh pending row is left alone');

select * from finish();
rollback;

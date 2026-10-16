-- An untick is refused while a linked conversation is stopped
-- (migration 20261016120000, G2).
--
-- A link never FLAGS a record (links go stale, #1016). It only refuses an
-- ordinary untick; the audited re-enable of that conversation's number is the
-- way back. Synthetic fixtures, rolled back.

begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

set local session_replication_role = replica;
insert into auth.users (id) values ('24800000-0000-4000-8000-000000000041');
insert into public.staff_profiles (id, user_id, role, display_name)
values ('24800000-0000-4000-8000-000000000040', '24800000-0000-4000-8000-000000000041', 'staff', 'Link Guard Test Staff');
set local session_replication_role = default;
select set_config('request.jwt.claims', '{"sub":"24800000-0000-4000-8000-000000000041","role":"authenticated"}', true);

-- 1. Opted out by staff, on a number that never said STOP, linked to a
-- conversation (on another number) that is stopped now.
insert into public.humans (id, name, surname, phone, whatsapp_opted_out, whatsapp_opted_out_reason) values
  ('24800000-0000-4000-8000-000000000011', 'Synthetic', 'Linked', '07700 900 811', true, 'staff_request'),
  ('24800000-0000-4000-8000-000000000012', 'Synthetic', 'NotStopped', '07700 900 812', true, 'staff_request'),
  ('24800000-0000-4000-8000-000000000013', 'Synthetic', 'Sms', '07700 900 813', true, 'staff_request');
insert into public.whatsapp_conversations (id, phone_e164, human_id) values
  ('24800000-0000-4000-8000-000000000001', '+447700900821', '24800000-0000-4000-8000-000000000011'),
  ('24800000-0000-4000-8000-000000000002', '+447700900822', '24800000-0000-4000-8000-000000000012');
insert into public.whatsapp_conversations (id, phone_e164, human_id, channel, whatsapp_opted_out_at) values
  ('24800000-0000-4000-8000-000000000003', '+447700900823', '24800000-0000-4000-8000-000000000013', 'sms', now());
update public.whatsapp_conversations set whatsapp_opted_out_at = now()
 where id = '24800000-0000-4000-8000-000000000001';

select throws_ok(
  $$update public.humans set whatsapp_opted_out = false where id = '24800000-0000-4000-8000-000000000011'$$,
  'P0001', null, 'an untick of a record linked to a stopped conversation is refused'
);
select is(
  (select whatsapp_opted_out from public.humans where id = '24800000-0000-4000-8000-000000000011'),
  true, 'and the record stays opted out'
);

-- 2. A linked conversation that is not stopped, or is not WhatsApp, does not.
select lives_ok(
  $$update public.humans set whatsapp_opted_out = false where id = '24800000-0000-4000-8000-000000000012'$$,
  'a link to a conversation that is not stopped refuses nothing'
);
select lives_ok(
  $$update public.humans set whatsapp_opted_out = false where id = '24800000-0000-4000-8000-000000000013'$$,
  'nor does a link to an SMS conversation'
);

-- 3. A link alone flags nothing.
insert into public.humans (id, name, surname, phone)
values ('24800000-0000-4000-8000-000000000014', 'Synthetic', 'Relinked', '07700 900 814');
insert into public.whatsapp_conversations (id, phone_e164) values ('24800000-0000-4000-8000-000000000004', '+447700900824');
update public.whatsapp_conversations set whatsapp_opted_out_at = now() where id = '24800000-0000-4000-8000-000000000004';
update public.humans set phone = '07700 900 815' where id = '24800000-0000-4000-8000-000000000014';
update public.whatsapp_conversations set human_id = '24800000-0000-4000-8000-000000000014'
 where id = '24800000-0000-4000-8000-000000000004';
select is(
  (select whatsapp_opted_out from public.humans where id = '24800000-0000-4000-8000-000000000014'),
  false, 'linking a record to a stopped conversation does not opt it out'
);

-- 4. The audited re-enable of the conversation's number, then the untick.
select lives_ok(
  $$select public.staff_reenable_whatsapp_number('07700900821', '{}'::uuid[],
      (select whatsapp_last_stop_at from public.whatsapp_conversations where id = '24800000-0000-4000-8000-000000000001'),
      'Customer phoned to ask for reminders again')$$,
  'staff re-enable the stopped conversation''s number'
);
select lives_ok(
  $$update public.humans set whatsapp_opted_out = false where id = '24800000-0000-4000-8000-000000000011'$$,
  'after which the record''s own opt-out can be unticked'
);

select * from finish();
rollback;

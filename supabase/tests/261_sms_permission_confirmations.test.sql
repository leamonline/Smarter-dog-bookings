-- Staff confirmation that texts are fine after a WhatsApp STOP (migration 20261104100000).
--
-- preferred_channel = 'sms' is the proof that staff clarified a STOP. It can be
-- set only by staff_confirm_sms_permission, which records who, when and why;
-- an ordinary update cannot forge it; a new STOP clears it (recorded); an SMS
-- opt-out cannot be confirmed away; and the audit trail is readable by staff
-- only. The guard trigger stays ON for every write below.
-- Synthetic fixtures, rolled back.

begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

set local session_replication_role = replica;
insert into auth.users (id) values ('26100000-0000-4000-8000-000000000041');
insert into public.staff_profiles (id, user_id, role, display_name)
values ('26100000-0000-4000-8000-000000000040', '26100000-0000-4000-8000-000000000041', 'staff', 'Confirm Test Staff');
set local session_replication_role = default;
select set_config('request.jwt.claims', '{"sub":"26100000-0000-4000-8000-000000000041","role":"authenticated"}', true);

-- Customers (the STOP is written the way the agent writes it).
insert into public.humans (id, name, surname, phone) values
  ('26100000-0000-4000-8000-000000000011', 'Stopped', 'Customer', '07700900611'),
  ('26100000-0000-4000-8000-000000000012', 'Fine', 'Customer',    '07700900612'),
  ('26100000-0000-4000-8000-000000000013', 'Optedout', 'Customer','07700900613'),
  ('26100000-0000-4000-8000-000000000014', 'Nophone', 'Customer', null);
update public.humans set whatsapp_opted_out = true, whatsapp_opted_out_at = now(), whatsapp_opted_out_reason = 'asked_on_whatsapp'
 where id in ('26100000-0000-4000-8000-000000000011', '26100000-0000-4000-8000-000000000013', '26100000-0000-4000-8000-000000000014');
update public.humans set sms_opted_out = true where id = '26100000-0000-4000-8000-000000000013';

-- ── An ordinary update cannot forge the proof ──────────────
select throws_ok(
  $$update public.humans set preferred_channel = 'sms' where id = '26100000-0000-4000-8000-000000000011'$$,
  'P0001', null, 'an ordinary update cannot set preferred_channel to sms for a stopped customer'
);
select is((select preferred_channel from public.humans where id = '26100000-0000-4000-8000-000000000011'), null,
  'and nothing was written');
-- ...but it is fine for a customer who has NOT stopped WhatsApp.
update public.humans set preferred_channel = 'sms' where id = '26100000-0000-4000-8000-000000000012';
select is((select preferred_channel from public.humans where id = '26100000-0000-4000-8000-000000000012'), 'sms',
  'a customer who has not stopped can have a preferred channel as before');
update public.humans set preferred_channel = null where id = '26100000-0000-4000-8000-000000000012';
-- ...and other channels are not touched by the guard.
update public.humans set preferred_channel = 'email' where id = '26100000-0000-4000-8000-000000000011';
select is((select preferred_channel from public.humans where id = '26100000-0000-4000-8000-000000000011'), 'email',
  'the guard is only about sms');
update public.humans set preferred_channel = null where id = '26100000-0000-4000-8000-000000000011';

-- ── The reason is required ────────────────────────────────
select throws_ok($$select public.staff_confirm_sms_permission('26100000-0000-4000-8000-000000000011', '')$$,
  'P0001', null, 'an empty reason is refused');
select throws_ok($$select public.staff_confirm_sms_permission('26100000-0000-4000-8000-000000000011', 'ok')$$,
  'P0001', null, 'a too-short reason is refused');
select throws_ok($$select public.staff_confirm_sms_permission('26100000-0000-4000-8000-000000000011', '        ')$$,
  'P0001', null, 'whitespace is not a reason');

-- ── Things that cannot be confirmed ─────────────────────────
select throws_ok($$select public.staff_confirm_sms_permission('26100000-0000-4000-8000-000000000012', 'Rang them and they said texts are fine')$$,
  'P0001', null, 'texts are not paused for a customer who never stopped, so there is nothing to confirm');
select throws_ok($$select public.staff_confirm_sms_permission('26100000-0000-4000-8000-000000000013', 'Rang them and they said texts are fine')$$,
  'P0001', null, 'a customer who opted out of SMS cannot be confirmed');
select throws_ok($$select public.staff_confirm_sms_permission('26100000-0000-4000-8000-000000000014', 'Rang them and they said texts are fine')$$,
  'P0001', null, 'a customer with no number cannot be confirmed');
select throws_ok($$select public.staff_confirm_sms_permission('26100000-0000-4000-8000-0000000000ff', 'Rang them and they said texts are fine')$$,
  'P0001', null, 'an unknown customer is refused');
select is((select count(*)::int from public.sms_permission_confirmations), 0, 'none of those left an audit row');

-- ── Confirming ──────────────────────────────────────────────
select lives_ok(
  $$select public.staff_confirm_sms_permission('26100000-0000-4000-8000-000000000011', '  Rang her on 3 Nov: texts are fine, WhatsApp stays off  ')$$,
  'staff can confirm texts for a stopped customer');
select is((select preferred_channel from public.humans where id = '26100000-0000-4000-8000-000000000011'), 'sms',
  'preferred_channel is now sms: the proof');
select is((select whatsapp_opted_out from public.humans where id = '26100000-0000-4000-8000-000000000011'), true,
  'WhatsApp stays stopped');
select is((select count(*)::int from public.sms_permission_confirmations where human_id = '26100000-0000-4000-8000-000000000011'), 1,
  'one audit row');
select results_eq(
  $$select action, reason, confirmed_by::text, confirmed_by_name, previous_preferred_channel from public.sms_permission_confirmations where human_id = '26100000-0000-4000-8000-000000000011'$$,
  $$values ('confirmed'::text, 'Rang her on 3 Nov: texts are fine, WhatsApp stays off'::text, '26100000-0000-4000-8000-000000000041'::text, 'Confirm Test Staff'::text, null::text)$$,
  'it records what, why (trimmed), who (id and name)');
select isnt((select created_at from public.sms_permission_confirmations where human_id = '26100000-0000-4000-8000-000000000011'), null, 'and when');
select throws_ok($$select public.staff_confirm_sms_permission('26100000-0000-4000-8000-000000000011', 'Rang her again and she said the same')$$,
  'P0001', null, 'confirming twice is refused');

-- ── Withdrawing ─────────────────────────────────────────────
select throws_ok($$select public.staff_withdraw_sms_permission('26100000-0000-4000-8000-000000000011', 'short')$$,
  'P0001', null, 'withdrawing needs a reason too');
select lives_ok($$select public.staff_withdraw_sms_permission('26100000-0000-4000-8000-000000000011', 'She asked us to stop texting her as well')$$,
  'staff can withdraw it');
select is((select preferred_channel from public.humans where id = '26100000-0000-4000-8000-000000000011'), null, 'texts are paused again');
select is((select count(*)::int from public.sms_permission_confirmations where human_id = '26100000-0000-4000-8000-000000000011' and action = 'withdrawn' and confirmed_by is not null), 1,
  'the withdrawal is recorded against a person');
select throws_ok($$select public.staff_withdraw_sms_permission('26100000-0000-4000-8000-000000000011', 'Nothing left to withdraw here')$$,
  'P0001', null, 'there is nothing left to withdraw');

-- ── A new STOP clears an earlier confirmation ───────────────
select public.staff_confirm_sms_permission('26100000-0000-4000-8000-000000000011', 'Rang her again: texts are fine, WhatsApp stays off');
-- Staff re-enable WhatsApp the audited way (modelled by the setting that function sets), then she stops again.
select set_config('smarter_dog.whatsapp_reenable', 'on', true);
update public.humans set whatsapp_opted_out = false, whatsapp_opted_out_at = null, whatsapp_opted_out_reason = null
 where id = '26100000-0000-4000-8000-000000000011';
select set_config('smarter_dog.whatsapp_reenable', 'off', true);
update public.humans set whatsapp_opted_out = true, whatsapp_opted_out_at = now(), whatsapp_opted_out_reason = 'asked_on_whatsapp'
 where id = '26100000-0000-4000-8000-000000000011';
select is((select preferred_channel from public.humans where id = '26100000-0000-4000-8000-000000000011'), null,
  'a new STOP clears the earlier confirmation: staff must clarify again');
select is((select count(*)::int from public.sms_permission_confirmations where human_id = '26100000-0000-4000-8000-000000000011' and action = 'superseded_by_stop' and confirmed_by is null), 1,
  'and that is recorded as the system''s doing, with no actor');

-- ── A customer created already stopped cannot arrive pre-confirmed ──
insert into public.whatsapp_conversations (id, phone_e164) values ('26100000-0000-4000-8000-000000000001', '+447700900699');
update public.whatsapp_conversations set whatsapp_opted_out_at = now() where id = '26100000-0000-4000-8000-000000000001';
insert into public.humans (id, name, surname, phone, preferred_channel)
values ('26100000-0000-4000-8000-000000000015', 'Arrives', 'Stopped', '07700 900 699', 'sms');
select is((select preferred_channel from public.humans where id = '26100000-0000-4000-8000-000000000015'), null,
  'a customer created on a stopped number cannot arrive with an unaudited sms proof');

-- ── Who may read the trail ──────────────────────────────────
select ok((select count(*) from public.sms_permission_confirmations) > 0, 'staff can read the audit trail');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"26100000-0000-4000-8000-0000000000aa","role":"authenticated"}', true);
select is((select count(*)::int from public.sms_permission_confirmations), 0, 'a non-staff user sees none of it');
select throws_ok($$select public.staff_confirm_sms_permission('26100000-0000-4000-8000-000000000011', 'Pretending to be staff here')$$,
  '42501', null, 'a non-staff user cannot confirm');
reset role;

select * from finish();
rollback;

-- A merge keeps a STOP label from either record (migration 20261016120000, G1).
--
-- merge_humans used to keep the winner's opt-out reason when both records
-- were opted out, so merging a record that said STOP into one opted out for
-- another reason lost the label: whatsapp-send then let a staff override
-- reach someone who said STOP, and an ordinary untick could pass. Synthetic
-- fixtures, rolled back.

begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

set local session_replication_role = replica;
insert into auth.users (id) values ('24700000-0000-4000-8000-000000000041');
insert into public.staff_profiles (id, user_id, role, display_name)
values ('24700000-0000-4000-8000-000000000040', '24700000-0000-4000-8000-000000000041', 'staff', 'Merge Test Staff');
set local session_replication_role = default;
select set_config('request.jwt.claims', '{"sub":"24700000-0000-4000-8000-000000000041","role":"authenticated"}', true);

-- 1. Loser said STOP at T1; winner opted out by staff at T2.
insert into public.humans (id, name, surname, phone, whatsapp_opted_out, whatsapp_opted_out_at, whatsapp_opted_out_reason) values
  ('24700000-0000-4000-8000-000000000001', 'Synthetic', 'Winner', '07700 900 701', true, '2026-10-02 09:00:00+00', 'staff_request'),
  ('24700000-0000-4000-8000-000000000002', 'Synthetic', 'Loser', '07700 900 702', true, '2026-10-01 09:00:00+00', 'asked_on_whatsapp');
select public.merge_humans('24700000-0000-4000-8000-000000000001', '24700000-0000-4000-8000-000000000002');
select is(
  (select array[whatsapp_opted_out::text, whatsapp_opted_out_reason, whatsapp_opted_out_at::text]
     from public.humans where id = '24700000-0000-4000-8000-000000000001'),
  array['true', 'asked_on_whatsapp', '2026-10-01 09:00:00+00'],
  'a STOP on the losing record is kept on the winner, with its time'
);

-- 2. The winner keeps its own phone, not the stopped one: the label alone
-- now refuses an ordinary untick.
select is(
  (select phone from public.humans where id = '24700000-0000-4000-8000-000000000001'),
  '07700 900 701', 'the winner keeps its own number'
);
select throws_ok(
  $$update public.humans set whatsapp_opted_out = false where id = '24700000-0000-4000-8000-000000000001'$$,
  'P0001', null, 'and an ordinary untick of the merged record is refused'
);
select is(
  (select whatsapp_opted_out from public.humans where id = '24700000-0000-4000-8000-000000000001'),
  true, 'the merged record stays opted out'
);

-- 3. Both said STOP: the earliest time.
insert into public.humans (id, name, surname, phone, whatsapp_opted_out, whatsapp_opted_out_at, whatsapp_opted_out_reason) values
  ('24700000-0000-4000-8000-000000000003', 'Synthetic', 'BothW', '07700 900 703', true, '2026-10-05 09:00:00+00', 'asked_on_whatsapp'),
  ('24700000-0000-4000-8000-000000000004', 'Synthetic', 'BothL', '07700 900 704', true, '2026-10-03 09:00:00+00', 'asked_on_whatsapp');
select public.merge_humans('24700000-0000-4000-8000-000000000003', '24700000-0000-4000-8000-000000000004');
select is(
  (select whatsapp_opted_out_reason || ' @ ' || whatsapp_opted_out_at::text from public.humans where id = '24700000-0000-4000-8000-000000000003'),
  'asked_on_whatsapp @ 2026-10-03 09:00:00+00', 'both said STOP: the earliest STOP time is kept'
);

-- 4. Winner said STOP, loser opted out for another reason.
insert into public.humans (id, name, surname, phone, whatsapp_opted_out, whatsapp_opted_out_at, whatsapp_opted_out_reason) values
  ('24700000-0000-4000-8000-000000000005', 'Synthetic', 'StopW', '07700 900 705', true, '2026-10-06 09:00:00+00', 'asked_on_whatsapp'),
  ('24700000-0000-4000-8000-000000000006', 'Synthetic', 'StaffL', '07700 900 706', true, '2026-10-01 09:00:00+00', 'staff_request');
select public.merge_humans('24700000-0000-4000-8000-000000000005', '24700000-0000-4000-8000-000000000006');
select is(
  (select whatsapp_opted_out_reason || ' @ ' || whatsapp_opted_out_at::text from public.humans where id = '24700000-0000-4000-8000-000000000005'),
  'asked_on_whatsapp @ 2026-10-06 09:00:00+00', 'a winner''s own STOP is kept'
);

-- 5. Neither said STOP: unchanged behaviour, the winner's own pair.
insert into public.humans (id, name, surname, phone, whatsapp_opted_out, whatsapp_opted_out_at, whatsapp_opted_out_reason) values
  ('24700000-0000-4000-8000-000000000007', 'Synthetic', 'PlainW', '07700 900 707', true, '2026-10-07 09:00:00+00', 'staff_request'),
  ('24700000-0000-4000-8000-000000000008', 'Synthetic', 'PlainL', '07700 900 708', true, '2026-10-01 09:00:00+00', 'told staff by phone');
select public.merge_humans('24700000-0000-4000-8000-000000000007', '24700000-0000-4000-8000-000000000008');
select is(
  (select whatsapp_opted_out_reason || ' @ ' || whatsapp_opted_out_at::text from public.humans where id = '24700000-0000-4000-8000-000000000007'),
  'staff_request @ 2026-10-07 09:00:00+00', 'without a STOP the winner''s own reason and time are kept, as before'
);

-- 6. Loser said STOP, winner not opted out at all.
insert into public.humans (id, name, surname, phone) values
  ('24700000-0000-4000-8000-000000000009', 'Synthetic', 'OnW', '07700 900 709');
insert into public.humans (id, name, surname, phone, whatsapp_opted_out, whatsapp_opted_out_at, whatsapp_opted_out_reason) values
  ('24700000-0000-4000-8000-000000000010', 'Synthetic', 'StopL', '07700 900 710', true, '2026-10-04 09:00:00+00', 'asked_on_whatsapp');
select public.merge_humans('24700000-0000-4000-8000-000000000009', '24700000-0000-4000-8000-000000000010');
select is(
  (select array[whatsapp_opted_out::text, whatsapp_opted_out_reason, whatsapp_opted_out_at::text]
     from public.humans where id = '24700000-0000-4000-8000-000000000009'),
  array['true', 'asked_on_whatsapp', '2026-10-04 09:00:00+00'],
  'a winner that was opted in takes the loser''s STOP'
);

-- 7. The live definition is the follow-up, still carrying the late
-- cancellation history move.
select ok(
  pg_get_functiondef('public.merge_humans(uuid,uuid)'::regprocedure) like '%asked_on_whatsapp%'
  and pg_get_functiondef('public.merge_humans(uuid,uuid)'::regprocedure) like '%late_cancellation_history%',
  'merge_humans keeps the STOP label and the late-cancellation history move'
);

select * from finish();
rollback;

-- retention_marks RLS + get_dog_grooming_intervals median
-- (migrations 20260702182000, 20260702183000).
--
-- Fixtures (one owner, one dog, three completed grooms with 56- and 70-day
-- gaps, one retention mark) are inserted with triggers disabled so the past-
-- dated completed bookings skip the calendar gate. No live insert => no notify
-- => no Vault secrets needed. One txn, rolled back.

begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

set local session_replication_role = replica;

insert into public.staff_profiles (user_id)
  values ('f0000000-0000-4000-8000-00000000006f');

insert into public.humans (id, name, surname)
  values ('aaaaaaaa-0000-4000-8000-00000000006a', 'pgTAP Retention', 'Owner');
insert into public.dogs (id, name, human_id, is_pregnant)
  values ('bbbbbbbb-0000-4000-8000-00000000006b', 'RetPup',
          'aaaaaaaa-0000-4000-8000-00000000006a', false);

-- Three completed grooms: 2026-01-01, 2026-02-26 (+56d), 2026-05-07 (+70d).
-- Median of the two gaps {56, 70} = 63.
insert into public.bookings (id, booking_date, slot, dog_id, size, service, status)
  values
  ('cccccccc-0000-4000-8000-00000000006c', '2026-01-01', '09:00',
   'bbbbbbbb-0000-4000-8000-00000000006b', 'small', 'full-groom', 'Completed'),
  ('dddddddd-0000-4000-8000-00000000006d', '2026-02-26', '09:00',
   'bbbbbbbb-0000-4000-8000-00000000006b', 'small', 'bath-and-brush', 'Completed'),
  ('eeeeeeee-0000-4000-8000-00000000006e', '2026-05-07', '09:00',
   'bbbbbbbb-0000-4000-8000-00000000006b', 'small', 'full-groom', 'Completed');

insert into public.retention_marks (dog_id, kind, reason)
  values ('bbbbbbbb-0000-4000-8000-00000000006b', 'snoozed', 'owner on holiday');

set local session_replication_role = default;

-- Staff can run the aggregation and read retention marks.
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-00000000006f","role":"authenticated"}';
set local role authenticated;

select is(
  (select median_interval_days from public.get_dog_grooming_intervals()
   where dog_id = 'bbbbbbbb-0000-4000-8000-00000000006b'),
  63::numeric, 'median groom interval over three completed visits is 63 days'
);
select is(
  (select visit_count from public.get_dog_grooming_intervals()
   where dog_id = 'bbbbbbbb-0000-4000-8000-00000000006b'),
  3, 'visit_count counts all completed grooms'
);
select is(
  (select last_groomed_date from public.get_dog_grooming_intervals()
   where dog_id = 'bbbbbbbb-0000-4000-8000-00000000006b'),
  '2026-05-07'::date, 'last_groomed_date is the most recent completed groom'
);
select is(
  (select count(*) from public.retention_marks), 1::bigint,
  'staff can read retention marks'
);

-- A non-staff authenticated session is blocked from the staff-locked RPC and
-- sees no retention marks.
reset role;
set local request.jwt.claims = '{"sub":"e0000000-0000-4000-8000-00000000006e","role":"authenticated"}';
set local role authenticated;

select throws_ok(
  $$ select * from public.get_dog_grooming_intervals() $$,
  '42501', null,
  'a non-staff session cannot run the retention interval RPC'
);
select is(
  (select count(*) from public.retention_marks), 0::bigint,
  'a non-staff session cannot read retention marks'
);

reset role;
select * from finish();
rollback;

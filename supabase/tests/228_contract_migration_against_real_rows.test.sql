-- The contract migration's ALTER TABLE, run with rows actually present.
--
-- Production refused 20260919120000 twice. The second refusal was:
--
--   ERROR: cannot ALTER TABLE "bookings" because it has pending trigger events
--
-- ct_booking_visit_consistency is DEFERRABLE INITIALLY DEFERRED, so the
-- conversion UPDATEs queue events that do not fire until COMMIT, and
-- PostgreSQL will not ALTER a table while such events are pending.
--
-- Nothing in the suite could see this. Test 225 converts rows with triggers
-- disabled, and every other run starts from an empty database — with no rows
-- to convert, the UPDATEs queue nothing and the ALTER succeeds. The bug lives
-- exactly where the tests did not: real rows, real triggers, one transaction.
--
-- So this test seeds rows, then performs the migration's own sequence against
-- them. Triggers stay enabled for the conversion, as they are in the migration.

begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

\ir fixtures/ensure_local_vault_secrets.psql

-- Fixture setup only.
set local session_replication_role = replica;

insert into public.humans (id, name, surname, address)
values ('62800000-0000-4000-8000-000000000010', 'pgTAP 628', 'Contract Proof', '628 Synthetic Street');

insert into public.dogs (id, name, breed, human_id, size, is_pregnant)
select
  ('62810000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
  'ContractPup' || i, 'Poodle',
  '62800000-0000-4000-8000-000000000010', 'small', false
from generate_series(1, 4) as i;

-- The old vocabulary, re-created. The constraint is narrow by the time the
-- suite runs, so it comes off to seed and is restored by the migration
-- sequence below — which is the point of the test.
alter table public.bookings drop constraint bookings_status_check;

insert into public.bookings (id, booking_date, slot, dog_id, size, service, status, checked_in_at, cancel_reason)
values
  ('62820001-0000-4000-8000-000000000001', date '2099-05-04', '09:00', '62810000-0000-4000-8000-000000000001', 'small', 'full-groom', 'Checked in', now(), null),
  ('62820002-0000-4000-8000-000000000001', date '2099-05-04', '09:30', '62810000-0000-4000-8000-000000000002', 'small', 'full-groom', 'In bath', now(), null),
  ('62820003-0000-4000-8000-000000000001', date '2099-05-11', '09:00', '62810000-0000-4000-8000-000000000003', 'small', 'full-groom', 'Ready for pick-up', now(), null),
  ('62820004-0000-4000-8000-000000000001', date '2099-05-11', '09:30', '62810000-0000-4000-8000-000000000004', 'small', 'full-groom', 'Cancelled', null, 'No-show');

-- Triggers ON from here, exactly as when the migration runs.
set local session_replication_role = default;

-- ── The migration's own sequence ─────────────────────────────────────
update public.bookings set status = 'Arrived'
  where status in ('Checked in', 'In bath');
update public.bookings set status = 'Ready for collection'
  where status = 'Ready for pick-up';
update public.bookings set status = 'No-show'
  where status = 'Cancelled'
    and lower(btrim(coalesce(cancel_reason, ''))) = 'no-show';

-- This is the line under test. Without it the ALTER below raises 55006.
set constraints all immediate;

select lives_ok(
  $$alter table public.bookings
      add constraint bookings_status_check
      check (status in ('Booked','Reconfirmed','Arrived','Ready for collection','Completed','Cancelled','No-show'))$$,
  'the constraint can be replaced after converting real rows in the same transaction'
);

-- ── And the conversions themselves, on rows that really moved ────────
select is(
  (select count(*)::int from public.bookings where status = 'Arrived'
    and id in ('62820001-0000-4000-8000-000000000001','62820002-0000-4000-8000-000000000001')),
  2, 'Checked in and In bath both became Arrived');

select is(
  (select status from public.bookings where id = '62820003-0000-4000-8000-000000000001'),
  'Ready for collection', 'Ready for pick-up became Ready for collection');

select is(
  (select status from public.bookings where id = '62820004-0000-4000-8000-000000000001'),
  'No-show', 'the old no-show shape became No-show');

select is(
  (select count(*)::int from public.bookings
    where id in ('62820001-0000-4000-8000-000000000001','62820002-0000-4000-8000-000000000001','62820003-0000-4000-8000-000000000001')
      and checked_in_at is not null),
  3, 'and every converted in-salon row kept its arrival timestamp');

select * from finish();
rollback;

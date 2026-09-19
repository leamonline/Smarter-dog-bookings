-- Cancelled -> No-show must not read as reviving a cancelled group.
--
-- This is the case that the rest of the suite could not see. Test 225 runs the
-- status conversions under `session_replication_role = replica`, so its
-- UPDATEs fire no triggers at all. The real migration runs with triggers ON,
-- and production refused it:
--
--   ERROR: SDC03: booking_visit_already_cancelled
--   CONTEXT: PL/pgSQL function validate_booking_capacity() line 59 at RAISE
--
-- Every write below therefore runs with triggers enabled. Synthetic Mondays in
-- 2099, matching test 035's convention.

begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

\ir fixtures/ensure_local_vault_secrets.psql

-- Fixture setup only. Every assertion runs with the real triggers.
set local session_replication_role = replica;

insert into public.humans (id, name, surname, address)
values ('62700000-0000-4000-8000-000000000010', 'pgTAP 627', 'Group Proof', '627 Synthetic Street');

insert into public.dogs (id, name, breed, human_id, size, is_pregnant)
select
  ('62710000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
  'GroupPup' || i, 'Poodle',
  '62700000-0000-4000-8000-000000000010', 'small', false
from generate_series(1, 4) as i;

-- A group of two, both cancelled: one an ordinary cancellation, one the old
-- no-show shape that the contract migration converts. This is precisely the
-- production shape that refused the migration.
insert into public.bookings (id, group_id, booking_date, slot, dog_id, size, service, status, cancel_reason)
values
  ('62720001-0000-4000-8000-000000000001', '62730000-0000-4000-8000-000000000001',
   date '2099-03-02', '09:00', '62710000-0000-4000-8000-000000000001', 'small', 'full-groom', 'Cancelled', 'No-show'),
  ('62720002-0000-4000-8000-000000000001', '62730000-0000-4000-8000-000000000001',
   date '2099-03-02', '09:30', '62710000-0000-4000-8000-000000000002', 'small', 'full-groom', 'Cancelled', 'Rescheduled');

-- A live booking in a group whose sibling is cancelled: marking it a no-show
-- is what the staff app does, and it was failing in production.
insert into public.bookings (id, group_id, booking_date, slot, dog_id, size, service, status, cancel_reason)
values
  ('62720003-0000-4000-8000-000000000001', '62730000-0000-4000-8000-000000000002',
   date '2099-03-09', '09:00', '62710000-0000-4000-8000-000000000003', 'small', 'full-groom', 'Booked', null),
  ('62720004-0000-4000-8000-000000000001', '62730000-0000-4000-8000-000000000002',
   date '2099-03-09', '09:30', '62710000-0000-4000-8000-000000000004', 'small', 'full-groom', 'Cancelled', 'Rescheduled');

set local session_replication_role = default;

-- ── 1. The conversion the contract migration performs ────────────────
select lives_ok(
  $$update public.bookings set status = 'No-show'
     where id = '62720001-0000-4000-8000-000000000001'$$,
  'Cancelled -> No-show is allowed inside a group that has a cancelled sibling'
);

select is(
  (select status from public.bookings where id = '62720001-0000-4000-8000-000000000001'),
  'No-show',
  'and the row actually carries No-show afterwards'
);

select is(
  (select cancel_reason from public.bookings where id = '62720001-0000-4000-8000-000000000001'),
  'No-show',
  'and cancel_reason is preserved as history'
);

-- ── 2. What the staff app does on a grouped booking ──────────────────
select lives_ok(
  $$update public.bookings set status = 'No-show'
     where id = '62720003-0000-4000-8000-000000000001'$$,
  'Booked -> No-show is allowed although a sibling in the group is cancelled'
);

-- ── 3. The guard still guards ────────────────────────────────────────
-- Reviving a cancelled booking into a group somebody cancelled is still
-- refused. This is the behaviour the guard exists for, and the fix must not
-- have widened it away.
select throws_ok(
  $$update public.bookings set status = 'Booked'
     where id = '62720002-0000-4000-8000-000000000001'$$,
  'SDC03',
  'booking_visit_already_cancelled',
  'Cancelled -> Booked is still refused inside a cancelled group'
);

-- ...and so is reviving the row we just converted, which pre-split was a
-- Cancelled row and behaved exactly this way.
select throws_ok(
  $$update public.bookings set status = 'Booked'
     where id = '62720001-0000-4000-8000-000000000001'$$,
  'SDC03',
  'booking_visit_already_cancelled',
  'No-show -> Booked is refused too, as it was pre-split'
);

select * from finish();
rollback;

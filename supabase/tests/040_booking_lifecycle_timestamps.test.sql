-- Behavioural tests for checked_in_at / ready_at stamping
-- (trg_set_booking_lifecycle_timestamps, migration 20260702180000).
--
-- The lifecycle trigger must fire, so — unlike the RLS/gate tests — we keep
-- triggers LIVE for the status UPDATEs. The fixture booking is inserted with
-- triggers disabled (session_replication_role = replica) purely so the insert
-- itself skips the gates/notify; the UPDATEs then run with triggers enabled.
-- Status transitions into/out of Completed fire the completion trigger, which
-- writes a booking_events row whose notify trigger calls get_supabase_url() —
-- so provision throwaway Vault secrets (as in 030). One txn, rolled back.

begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

\ir fixtures/ensure_local_vault_secrets.psql

-- Fixture: one owner, one dog, one Booked booking on the next (open) Monday.
set local session_replication_role = replica;
insert into public.humans (id, name, surname)
  values ('aaaaaaaa-0000-4000-8000-00000000004a', 'pgTAP Lifecycle', 'Owner');
insert into public.dogs (id, name, human_id, is_pregnant)
  values ('bbbbbbbb-0000-4000-8000-00000000004b', 'LifePup',
          'aaaaaaaa-0000-4000-8000-00000000004a', false);
insert into public.bookings (id, booking_date, slot, dog_id, size, service, status)
  values ('cccccccc-0000-4000-8000-00000000004c',
          (date_trunc('week', current_date) + interval '7 days')::date,
          '09:00', 'bbbbbbbb-0000-4000-8000-00000000004b', 'small', 'full-groom', 'Booked');
set local session_replication_role = default;

-- Booked has no arrival/ready marks to begin with.
select is(
  (select checked_in_at is null and ready_at is null from public.bookings
   where id = 'cccccccc-0000-4000-8000-00000000004c'),
  true, 'a Booked booking starts with no lifecycle timestamps'
);

-- Booked -> Reconfirmed: NEITHER mark stamps. Reconfirmed means the customer
-- said they are coming, not that the dog is here — stamping an arrival time
-- here would record a dog as being in the salon while it is still at home.
update public.bookings set status = 'Reconfirmed'
  where id = 'cccccccc-0000-4000-8000-00000000004c';
select is(
  (select checked_in_at is null and ready_at is null from public.bookings
   where id = 'cccccccc-0000-4000-8000-00000000004c'),
  true, 'Reconfirmed stamps neither mark — the dog has not arrived'
);

-- Reconfirmed -> Arrived: checked_in_at stamps, ready_at stays null.
update public.bookings set status = 'Arrived'
  where id = 'cccccccc-0000-4000-8000-00000000004c';
select is(
  (select checked_in_at is not null from public.bookings
   where id = 'cccccccc-0000-4000-8000-00000000004c'),
  true, 'arriving stamps checked_in_at'
);
select is(
  (select ready_at is null from public.bookings
   where id = 'cccccccc-0000-4000-8000-00000000004c'),
  true, 'arriving does not stamp ready_at'
);

-- Capture the stamp so we can prove it is not overwritten later.
create temp table _life as
  select checked_in_at as ci from public.bookings
  where id = 'cccccccc-0000-4000-8000-00000000004c';

-- Re-entering Arrived: checked_in_at persists unchanged (set-once).
update public.bookings set status = 'Booked'
  where id = 'cccccccc-0000-4000-8000-00000000004c';
update public.bookings set status = 'Arrived', checked_in_at = (select ci from _life)
  where id = 'cccccccc-0000-4000-8000-00000000004c';
select is(
  (select checked_in_at from public.bookings where id = 'cccccccc-0000-4000-8000-00000000004c'),
  (select ci from _life),
  'checked_in_at persists unchanged once set'
);
select is(
  (select ready_at is null from public.bookings
   where id = 'cccccccc-0000-4000-8000-00000000004c'),
  true, 'Arrived still has no ready_at'
);

-- Arrived -> Ready for collection: ready_at stamps, checked_in_at still present.
update public.bookings set status = 'Ready for collection'
  where id = 'cccccccc-0000-4000-8000-00000000004c';
select is(
  (select ready_at is not null from public.bookings
   where id = 'cccccccc-0000-4000-8000-00000000004c'),
  true, 'marking Ready stamps ready_at'
);
select is(
  (select checked_in_at is not null from public.bookings
   where id = 'cccccccc-0000-4000-8000-00000000004c'),
  true, 'checked_in_at is still present at Ready'
);

-- Regress Ready for collection -> Arrived: ready_at clears, checked_in_at
-- persists (the new_rank >= 3 false / new_rank >= 2 true branch).
update public.bookings set status = 'Arrived'
  where id = 'cccccccc-0000-4000-8000-00000000004c';
select is(
  (select ready_at is null and checked_in_at is not null from public.bookings
   where id = 'cccccccc-0000-4000-8000-00000000004c'),
  true, 'regressing below Ready clears ready_at but keeps checked_in_at'
);

-- Regress to Booked (from Arrived): both marks clear.
update public.bookings set status = 'Booked'
  where id = 'cccccccc-0000-4000-8000-00000000004c';
select is(
  (select checked_in_at is null and ready_at is null from public.bookings
   where id = 'cccccccc-0000-4000-8000-00000000004c'),
  true, 'regressing to Booked clears both lifecycle timestamps'
);

-- Jump straight Booked -> Completed: reaching "Ready or later" stamps both.
update public.bookings set status = 'Completed'
  where id = 'cccccccc-0000-4000-8000-00000000004c';
select is(
  (select checked_in_at is not null from public.bookings
   where id = 'cccccccc-0000-4000-8000-00000000004c'),
  true, 'jumping to Completed stamps checked_in_at (reached Arrived-or-later)'
);
select is(
  (select ready_at is not null from public.bookings
   where id = 'cccccccc-0000-4000-8000-00000000004c'),
  true, 'jumping to Completed stamps ready_at (reached Ready-or-later)'
);

-- A terminal status preserves whatever history exists. A dog that arrived and
-- was later marked a no-show by mistake still arrived, and the correction must
-- not erase the evidence.
update public.bookings set status = 'No-show'
  where id = 'cccccccc-0000-4000-8000-00000000004c';
select is(
  (select checked_in_at is not null and ready_at is not null from public.bookings
   where id = 'cccccccc-0000-4000-8000-00000000004c'),
  true, 'No-show leaves the lifecycle timestamps untouched'
);

-- Completed -> Cancelled: off-progression, arrival/ready history preserved.
update public.bookings set status = 'Cancelled'
  where id = 'cccccccc-0000-4000-8000-00000000004c';
select is(
  (select checked_in_at is not null and ready_at is not null from public.bookings
   where id = 'cccccccc-0000-4000-8000-00000000004c'),
  true, 'cancelling preserves the arrival/ready history'
);

select * from finish();
rollback;

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
select plan(12);

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

-- Booked -> Checked in: checked_in_at stamps, ready_at stays null.
update public.bookings set status = 'Checked in'
  where id = 'cccccccc-0000-4000-8000-00000000004c';
select is(
  (select checked_in_at is not null from public.bookings
   where id = 'cccccccc-0000-4000-8000-00000000004c'),
  true, 'checking in stamps checked_in_at'
);
select is(
  (select ready_at is null from public.bookings
   where id = 'cccccccc-0000-4000-8000-00000000004c'),
  true, 'checking in does not stamp ready_at'
);

-- Capture the stamp so we can prove it is not overwritten later.
create temp table _life as
  select checked_in_at as ci from public.bookings
  where id = 'cccccccc-0000-4000-8000-00000000004c';

-- Checked in -> In bath: checked_in_at persists unchanged, ready_at still null.
update public.bookings set status = 'In bath'
  where id = 'cccccccc-0000-4000-8000-00000000004c';
select is(
  (select checked_in_at from public.bookings where id = 'cccccccc-0000-4000-8000-00000000004c'),
  (select ci from _life),
  'checked_in_at persists unchanged through In bath (set-once)'
);
select is(
  (select ready_at is null from public.bookings
   where id = 'cccccccc-0000-4000-8000-00000000004c'),
  true, 'In bath still has no ready_at'
);

-- In bath -> Ready for pick-up: ready_at stamps, checked_in_at still present.
update public.bookings set status = 'Ready for pick-up'
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

-- Regress Ready for pick-up -> In bath: ready_at clears, checked_in_at persists
-- (the new_rank >= 3 false / new_rank >= 1 true branch).
update public.bookings set status = 'In bath'
  where id = 'cccccccc-0000-4000-8000-00000000004c';
select is(
  (select ready_at is null and checked_in_at is not null from public.bookings
   where id = 'cccccccc-0000-4000-8000-00000000004c'),
  true, 'regressing below Ready clears ready_at but keeps checked_in_at'
);

-- Regress to Booked (from In bath): both marks clear.
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
  true, 'jumping to Completed stamps checked_in_at (reached Checked-in-or-later)'
);
select is(
  (select ready_at is not null from public.bookings
   where id = 'cccccccc-0000-4000-8000-00000000004c'),
  true, 'jumping to Completed stamps ready_at (reached Ready-or-later)'
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

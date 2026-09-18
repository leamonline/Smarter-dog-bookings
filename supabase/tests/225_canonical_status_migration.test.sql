-- The status migration's conversions, executed rather than asserted.
--
-- 20260919090000 converts four old shapes into the canonical seven. When the
-- suite runs, that migration has already been applied to an empty database, so
-- its UPDATE statements were no-ops and nothing proved they are correct. This
-- test re-creates each old shape and runs the same conversion logic over it.
--
-- The CHECK constraint now forbids the old values, so it is dropped and
-- restored inside the transaction. Everything is rolled back.

begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

\ir fixtures/ensure_local_vault_secrets.psql

set local session_replication_role = replica;

insert into public.humans (id, name, surname)
  values ('aaaaaaaa-0000-4000-8000-0000000000e1', 'pgTAP Migration', 'Owner');
insert into public.dogs (id, name, human_id, is_pregnant)
  values ('bbbbbbbb-0000-4000-8000-0000000000e1', 'MigPup',
          'aaaaaaaa-0000-4000-8000-0000000000e1', false);

-- Old-shape rows. The constraint has to come off to create them at all, which
-- is itself the proof that the new constraint rejects the old vocabulary.
alter table public.bookings drop constraint bookings_status_check;

insert into public.bookings (id, booking_date, slot, dog_id, size, service, status, checked_in_at, cancel_reason)
values
  ('ccc00001-0000-4000-8000-0000000000e1', current_date + 7, '08:30', 'bbbbbbbb-0000-4000-8000-0000000000e1', 'small', 'full-groom', 'Checked in', now(), null),
  ('ccc00002-0000-4000-8000-0000000000e1', current_date + 7, '09:00', 'bbbbbbbb-0000-4000-8000-0000000000e1', 'small', 'full-groom', 'In bath', now(), null),
  ('ccc00003-0000-4000-8000-0000000000e1', current_date + 7, '09:30', 'bbbbbbbb-0000-4000-8000-0000000000e1', 'small', 'full-groom', 'Ready for pick-up', now(), null),
  ('ccc00004-0000-4000-8000-0000000000e1', current_date + 7, '10:00', 'bbbbbbbb-0000-4000-8000-0000000000e1', 'small', 'full-groom', 'Cancelled', null, 'No-show'),
  -- Trimmed / differently-cased, as free text really arrives.
  ('ccc00005-0000-4000-8000-0000000000e1', current_date + 7, '10:30', 'bbbbbbbb-0000-4000-8000-0000000000e1', 'small', 'full-groom', 'Cancelled', null, '  no-show '),
  -- An ordinary cancellation, which must NOT be converted.
  ('ccc00006-0000-4000-8000-0000000000e1', current_date + 7, '11:00', 'bbbbbbbb-0000-4000-8000-0000000000e1', 'small', 'full-groom', 'Cancelled', null, 'Rescheduled via WhatsApp');

-- ── The migration's conversion statements, verbatim ──────────────────
update public.bookings set status = 'Arrived'
  where status in ('Checked in', 'In bath');
update public.bookings set status = 'Ready for collection'
  where status = 'Ready for pick-up';
update public.bookings set status = 'No-show'
  where status = 'Cancelled'
    and lower(btrim(coalesce(cancel_reason, ''))) = 'no-show';

alter table public.bookings add constraint bookings_status_check
  check (status in ('Booked','Reconfirmed','Arrived','Ready for collection','Completed','Cancelled','No-show'));

set local session_replication_role = default;

select is((select status from public.bookings where id = 'ccc00001-0000-4000-8000-0000000000e1'),
  'Arrived', 'Checked in becomes Arrived');

select is((select status from public.bookings where id = 'ccc00002-0000-4000-8000-0000000000e1'),
  'Arrived', 'In bath becomes Arrived — arrived, but not finished');

select is((select status from public.bookings where id = 'ccc00003-0000-4000-8000-0000000000e1'),
  'Ready for collection', 'Ready for pick-up becomes Ready for collection');

select is((select status from public.bookings where id = 'ccc00004-0000-4000-8000-0000000000e1'),
  'No-show', 'Cancelled + No-show reason becomes the No-show status');

select is((select status from public.bookings where id = 'ccc00005-0000-4000-8000-0000000000e1'),
  'No-show', 'a padded, lower-cased no-show reason converts too');

select is((select status from public.bookings where id = 'ccc00006-0000-4000-8000-0000000000e1'),
  'Cancelled', 'an ordinary cancellation is left alone');

-- The reason text is history worth keeping.
select is((select cancel_reason from public.bookings where id = 'ccc00004-0000-4000-8000-0000000000e1'),
  'No-show', 'cancel_reason is preserved on a converted row');

-- No lifecycle timestamp was lost by the conversion.
select is(
  (select checked_in_at is not null from public.bookings where id = 'ccc00002-0000-4000-8000-0000000000e1'),
  true, 'the converted In bath row keeps its arrival timestamp');

-- And the new constraint rejects the vocabulary it replaced.
select throws_ok(
  $$update public.bookings set status = 'In bath' where id = 'ccc00001-0000-4000-8000-0000000000e1'$$,
  '23514',
  null,
  'the new constraint rejects a retired status'
);

select * from finish();
rollback;

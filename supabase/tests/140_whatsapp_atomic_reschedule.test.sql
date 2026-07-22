-- Atomic WhatsApp reschedule: the replacement and the cancellation happen in
-- one transaction, so no failure can leave two active appointments.
-- Synthetic fixtures are rolled back.

begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

insert into auth.users (id) values ('14000000-0000-4000-8000-0000000000a1');
insert into public.staff_profiles (user_id, role, display_name) values
  ('14000000-0000-4000-8000-0000000000a1', 'owner', 'Reschedule Fixture');

insert into public.humans (id, name, surname) values
  ('14000000-0000-4000-8000-0000000000b1', 'RescheduleFixture', 'Owner'),
  ('14000000-0000-4000-8000-0000000000b2', 'RescheduleFixture', 'Stranger');

insert into public.dogs (id, name, breed, size, human_id) values
  ('14000000-0000-4000-8000-0000000000c1', 'Milo', 'Cockapoo', 'small',
   '14000000-0000-4000-8000-0000000000b1'),
  ('14000000-0000-4000-8000-0000000000c2', 'Nala', 'Beagle', 'small',
   '14000000-0000-4000-8000-0000000000b1'),
  ('14000000-0000-4000-8000-0000000000c3', 'Otto', 'Collie', 'small',
   '14000000-0000-4000-8000-0000000000b2');

-- Two open salon days (Mon/Tue/Wed) far enough out to avoid the same-day rule.
create or replace function pg_temp.open_day(p_offset int)
returns date language plpgsql as $$
declare d date := current_date + p_offset;
begin
  while extract(isodow from d) > 3 loop d := d + 1; end loop;
  return d;
end;
$$;

-- Act as staff so the calendar gate bypasses for the fixture rows, exactly as
-- it does for staff in the app. The RPC under test runs as service role.
select set_config('request.jwt.claims',
  '{"sub":"14000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);

-- The original two-dog visit.
insert into public.bookings
  (id, booking_date, slot, dog_id, size, service, status, group_id, source)
values
  ('14000000-0000-4000-8000-0000000000d1', pg_temp.open_day(30), '09:00',
   '14000000-0000-4000-8000-0000000000c1', 'small', 'full-groom', 'Booked',
   '14000000-0000-4000-8000-0000000000e1', 'whatsapp_flow'),
  ('14000000-0000-4000-8000-0000000000d2', pg_temp.open_day(30), '09:00',
   '14000000-0000-4000-8000-0000000000c2', 'small', 'bath-and-brush', 'Booked',
   '14000000-0000-4000-8000-0000000000e1', 'whatsapp_flow');

-- ── 1-2: the function exists and is locked to the service role ─────

select has_function('public', 'reschedule_whatsapp_booking_group',
  'the atomic reschedule RPC exists');

select is(
  (select count(*)::int from information_schema.role_routine_grants
    where routine_name = 'reschedule_whatsapp_booking_group'
      and grantee in ('anon','authenticated','public')),
  0, 'no application role may execute the reschedule RPC');

-- ── 3-8: the happy path moves the whole visit atomically ───────────

select lives_ok(
  format($f$
    select public.reschedule_whatsapp_booking_group(
      jsonb_build_array(
        jsonb_build_object('dog_id','14000000-0000-4000-8000-0000000000c1',
                           'slot','10:00','service','full-groom'),
        jsonb_build_object('dog_id','14000000-0000-4000-8000-0000000000c2',
                           'slot','10:00','service','bath-and-brush')),
      %L::date, '14000000-0000-4000-8000-0000000000b1',
      '14000000-0000-4000-8000-0000000000e1', null,
      array['14000000-0000-4000-8000-0000000000d1',
            '14000000-0000-4000-8000-0000000000d2']::uuid[])
  $f$, pg_temp.open_day(37)),
  'a well-formed reschedule commits');

select is(
  (select count(*)::int from public.bookings
    where id in ('14000000-0000-4000-8000-0000000000d1',
                 '14000000-0000-4000-8000-0000000000d2')
      and status = 'Cancelled'),
  2, 'every dog on the old visit is cancelled');

select is(
  (select count(*)::int from public.bookings b
    join public.dogs d on d.id = b.dog_id
   where d.human_id = '14000000-0000-4000-8000-0000000000b1'
     and b.status = 'Booked'),
  2, 'exactly one live visit remains — never two');

select is(
  (select count(distinct booking_date)::int from public.bookings b
    join public.dogs d on d.id = b.dog_id
   where d.human_id = '14000000-0000-4000-8000-0000000000b1'
     and b.status = 'Booked'),
  1, 'the surviving rows are all on the new date');

select is(
  (select cancel_reason from public.bookings
    where id = '14000000-0000-4000-8000-0000000000d1'),
  'Rescheduled via WhatsApp', 'the cancellation records why');

select is(
  (select count(distinct group_id)::int from public.bookings b
    join public.dogs d on d.id = b.dog_id
   where d.human_id = '14000000-0000-4000-8000-0000000000b1'
     and b.status = 'Booked'),
  1, 'the replacement rows share one new group');

-- ── 9-12: THE REGRESSION — a failed create must cancel nothing ─────
--
-- The old implementation created first and cancelled second, so a failure
-- left both visits live. Here the create is made to fail (a dog belonging to
-- another customer) and the old visit must survive completely intact.

insert into public.bookings
  (id, booking_date, slot, dog_id, size, service, status, group_id, source)
values
  ('14000000-0000-4000-8000-0000000000d3', pg_temp.open_day(44), '09:00',
   '14000000-0000-4000-8000-0000000000c1', 'small', 'full-groom', 'Booked',
   '14000000-0000-4000-8000-0000000000e2', 'whatsapp_flow');

select throws_ok(
  format($f$
    select public.reschedule_whatsapp_booking_group(
      jsonb_build_array(
        jsonb_build_object('dog_id','14000000-0000-4000-8000-0000000000c3',
                           'slot','10:00','service','full-groom')),
      %L::date, '14000000-0000-4000-8000-0000000000b1',
      '14000000-0000-4000-8000-0000000000e2', null, null)
  $f$, pg_temp.open_day(51)),
  '42704', null,
  'a replacement naming another customer''s dog is rejected');

select is(
  (select status from public.bookings
    where id = '14000000-0000-4000-8000-0000000000d3'),
  'Booked',
  'REGRESSION: a failed replacement leaves the original booked, not cancelled');

select is(
  (select count(*)::int from public.bookings
    where booking_date = pg_temp.open_day(51)),
  0, 'REGRESSION: a failed replacement creates no new rows');

-- Capacity rejection must roll back identically.
select throws_ok(
  format($f$
    select public.reschedule_whatsapp_booking_group(
      jsonb_build_array(
        jsonb_build_object('dog_id','14000000-0000-4000-8000-0000000000c1',
                           'slot','99:99','service','full-groom')),
      %L::date, '14000000-0000-4000-8000-0000000000b1',
      '14000000-0000-4000-8000-0000000000e2', null, null)
  $f$, pg_temp.open_day(51)),
  null, 'an invalid destination slot is rejected');

select is(
  (select status from public.bookings
    where id = '14000000-0000-4000-8000-0000000000d3'),
  'Booked', 'REGRESSION: the original survives a destination rejection too');

-- ── 13-15: the reviewed-snapshot guard ─────────────────────────────

select throws_ok(
  format($f$
    select public.reschedule_whatsapp_booking_group(
      jsonb_build_array(
        jsonb_build_object('dog_id','14000000-0000-4000-8000-0000000000c1',
                           'slot','10:00','service','full-groom')),
      %L::date, '14000000-0000-4000-8000-0000000000b1',
      '14000000-0000-4000-8000-0000000000e2', null,
      array['14000000-0000-4000-8000-0000000000d3',
            '14000000-0000-4000-8000-000000000fff']::uuid[])
  $f$, pg_temp.open_day(51)),
  'P0002', 'reschedule_old_visit_changed',
  'a visit that no longer matches the reviewed snapshot is refused');

select is(
  (select status from public.bookings
    where id = '14000000-0000-4000-8000-0000000000d3'),
  'Booked', 'the snapshot guard cancels nothing');

select throws_ok(
  format($f$
    select public.reschedule_whatsapp_booking_group(
      jsonb_build_array(
        jsonb_build_object('dog_id','14000000-0000-4000-8000-0000000000c1',
                           'slot','10:00','service','full-groom')),
      %L::date, '14000000-0000-4000-8000-0000000000b1',
      '14000000-0000-4000-8000-000000000eee', null, null)
  $f$, pg_temp.open_day(51)),
  'P0002', 'reschedule_old_visit_unavailable',
  'an unknown old visit is refused rather than silently creating a booking');

-- ── 16-18: ownership and required arguments ────────────────────────

-- Another customer cannot move this visit, even naming the right group.
select throws_ok(
  format($f$
    select public.reschedule_whatsapp_booking_group(
      jsonb_build_array(
        jsonb_build_object('dog_id','14000000-0000-4000-8000-0000000000c3',
                           'slot','10:00','service','full-groom')),
      %L::date, '14000000-0000-4000-8000-0000000000b2',
      '14000000-0000-4000-8000-0000000000e2', null, null)
  $f$, pg_temp.open_day(51)),
  'P0002', 'reschedule_old_visit_unavailable',
  'a different customer cannot move someone else''s visit');

select is(
  (select status from public.bookings
    where id = '14000000-0000-4000-8000-0000000000d3'),
  'Booked', 'the cross-customer attempt cancelled nothing');

select throws_ok(
  $$ select public.reschedule_whatsapp_booking_group(
       '[]'::jsonb, current_date + 30, '14000000-0000-4000-8000-0000000000b1',
       null, null, null) $$,
  '22023', null, 'the old visit must be identified');

select * from finish();
rollback;

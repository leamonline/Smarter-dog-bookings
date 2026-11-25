-- Two no-shows in 12 months require a deposit from that customer.
--
-- The staff app (and any later writer, including the iOS app) records a
-- no-show as bookings.status = 'No-show'. Since 20261124200000 (ADR 015) the
-- trigger turns the owner's deposit tag on at the SECOND no-show appointment
-- in 12 months, counted from the policy start, and writes a short reason. An
-- owner's dogs missing the same date count once. It does not turn the tag off when a
-- no-show is undone, and a cancellation never sets it.
--
-- Dates are future Mondays so the real booking gates accept the rows.

begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

\ir fixtures/ensure_local_vault_secrets.psql

insert into auth.users (id) values
  ('26600000-0000-4000-8000-000000000001');

insert into public.staff_profiles (user_id, role, display_name) values
  ('26600000-0000-4000-8000-000000000001', 'owner', 'Deposit Owner');

insert into public.humans (id, name, surname) values
  ('26600000-0000-4000-8000-000000000010', 'Pepper', 'Owner'),
  ('26600000-0000-4000-8000-000000000020', 'Cancel', 'Owner'),
  ('26600000-0000-4000-8000-000000000030', 'Already', 'Tagged'),
  ('26600000-0000-4000-8000-000000000040', 'Forgiven', 'Owner'),
  ('26600000-0000-4000-8000-000000000050', 'Arrived', 'Owner'),
  ('26600000-0000-4000-8000-000000000060', 'Imported', 'Owner'),
  ('26600000-0000-4000-8000-000000000070', 'Group', 'Owner'),
  ('26600000-0000-4000-8000-000000000080', 'Before', 'Policy');

insert into public.dogs (id, name, breed, size, human_id) values
  ('26600000-0000-4000-8000-000000000011', 'Pepper', 'Dachshund', 'small',
   '26600000-0000-4000-8000-000000000010'),
  ('26600000-0000-4000-8000-000000000012', 'Salt', 'Poodle', 'small',
   '26600000-0000-4000-8000-000000000010'),
  ('26600000-0000-4000-8000-000000000021', 'Cinder', 'Spaniel', 'small',
   '26600000-0000-4000-8000-000000000020'),
  ('26600000-0000-4000-8000-000000000031', 'Already', 'Terrier', 'small',
   '26600000-0000-4000-8000-000000000030'),
  ('26600000-0000-4000-8000-000000000041', 'First', 'Whippet', 'small',
   '26600000-0000-4000-8000-000000000040'),
  ('26600000-0000-4000-8000-000000000042', 'Second', 'Whippet', 'small',
   '26600000-0000-4000-8000-000000000040'),
  ('26600000-0000-4000-8000-000000000051', 'Present', 'Collie', 'small',
   '26600000-0000-4000-8000-000000000050'),
  ('26600000-0000-4000-8000-000000000061', 'Historic', 'Beagle', 'small',
   '26600000-0000-4000-8000-000000000060'),
  ('26600000-0000-4000-8000-000000000071', 'Pair one', 'Pug', 'small',
   '26600000-0000-4000-8000-000000000070'),
  ('26600000-0000-4000-8000-000000000072', 'Pair two', 'Pug', 'small',
   '26600000-0000-4000-8000-000000000070'),
  ('26600000-0000-4000-8000-000000000081', 'Earlier', 'Corgi', 'small',
   '26600000-0000-4000-8000-000000000080');

-- Staff asked for a deposit before any no-show. The note must survive.
update public.humans
   set deposit_required = true,
       deposit_required_reason = 'Asked at the desk',
       deposit_required_set_at = timestamptz '2026-01-15 09:00:00+00'
 where id = '26600000-0000-4000-8000-000000000030';

select set_config(
  'request.jwt.claims',
  '{"sub":"26600000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

create or replace function pg_temp.monday(p_offset integer)
returns date
language sql
stable
as $$
  select d::date
    from generate_series(current_date + 70, current_date + 400, interval '1 day') as d
   where extract(isodow from d) = 1
   offset p_offset
   limit 1;
$$;

-- Same sentence as flag_deposit_after_no_show. Change both together.
create or replace function pg_temp.expected_reason(p_dog text, p_date date)
returns text
language sql
immutable
as $$
  select 'Deposit required after 2 no-shows in 12 months: ' || btrim(p_dog) || ' on '
    || to_char(p_date, 'FMDD') || ' '
    || (array['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'])[extract(month from p_date)::integer]
    || ' ' || to_char(p_date, 'YYYY');
$$;

select public.create_staff_booking_group(
  '[{"id":"26600000-0000-4000-8000-000000000101","dog_id":"26600000-0000-4000-8000-000000000011","slot":"09:00","size":"small","service":"Full Groom","status":"Booked","confirmed":true}]'::jsonb,
  pg_temp.monday(0)
);
select public.create_staff_booking_group(
  '[{"id":"26600000-0000-4000-8000-000000000102","dog_id":"26600000-0000-4000-8000-000000000012","slot":"09:00","size":"small","service":"Full Groom","status":"Booked","confirmed":true}]'::jsonb,
  pg_temp.monday(1)
);
select public.create_staff_booking_group(
  '[{"id":"26600000-0000-4000-8000-000000000201","dog_id":"26600000-0000-4000-8000-000000000021","slot":"09:00","size":"small","service":"Full Groom","status":"Booked","confirmed":true}]'::jsonb,
  pg_temp.monday(2)
);
select public.create_staff_booking_group(
  '[{"id":"26600000-0000-4000-8000-000000000301","dog_id":"26600000-0000-4000-8000-000000000031","slot":"09:00","size":"small","service":"Full Groom","status":"Booked","confirmed":true}]'::jsonb,
  pg_temp.monday(3)
);
select public.create_staff_booking_group(
  '[{"id":"26600000-0000-4000-8000-000000000401","dog_id":"26600000-0000-4000-8000-000000000041","slot":"09:00","size":"small","service":"Full Groom","status":"Booked","confirmed":true}]'::jsonb,
  pg_temp.monday(4)
);
select public.create_staff_booking_group(
  '[{"id":"26600000-0000-4000-8000-000000000402","dog_id":"26600000-0000-4000-8000-000000000042","slot":"09:00","size":"small","service":"Full Groom","status":"Booked","confirmed":true}]'::jsonb,
  pg_temp.monday(5)
);
select public.create_staff_booking_group(
  '[{"id":"26600000-0000-4000-8000-000000000501","dog_id":"26600000-0000-4000-8000-000000000051","slot":"09:00","size":"small","service":"Full Groom","status":"Booked","confirmed":true}]'::jsonb,
  pg_temp.monday(6)
);
-- A row created already marked No-show is history, not a new mark.
select public.create_staff_booking_group(
  '[{"id":"26600000-0000-4000-8000-000000000601","dog_id":"26600000-0000-4000-8000-000000000061","slot":"09:00","size":"small","service":"Full Groom","status":"No-show","confirmed":true}]'::jsonb,
  pg_temp.monday(7)
);
-- A third Pepper appointment, a second Already appointment and a third
-- Forgiven appointment, for the count of two.
select public.create_staff_booking_group(
  '[{"id":"26600000-0000-4000-8000-000000000103","dog_id":"26600000-0000-4000-8000-000000000011","slot":"09:00","size":"small","service":"Full Groom","status":"Booked","confirmed":true}]'::jsonb,
  pg_temp.monday(8)
);
select public.create_staff_booking_group(
  '[{"id":"26600000-0000-4000-8000-000000000302","dog_id":"26600000-0000-4000-8000-000000000031","slot":"09:00","size":"small","service":"Full Groom","status":"Booked","confirmed":true}]'::jsonb,
  pg_temp.monday(9)
);
select public.create_staff_booking_group(
  '[{"id":"26600000-0000-4000-8000-000000000403","dog_id":"26600000-0000-4000-8000-000000000041","slot":"09:00","size":"small","service":"Full Groom","status":"Booked","confirmed":true}]'::jsonb,
  pg_temp.monday(10)
);
-- Two dogs in one appointment.
select public.create_staff_booking_group(
  '[{"id":"26600000-0000-4000-8000-000000000701","dog_id":"26600000-0000-4000-8000-000000000071","slot":"09:00","size":"small","service":"Full Groom","status":"Booked","confirmed":true},
    {"id":"26600000-0000-4000-8000-000000000702","dog_id":"26600000-0000-4000-8000-000000000072","slot":"09:00","size":"small","service":"Full Groom","status":"Booked","confirmed":true}]'::jsonb,
  pg_temp.monday(11)
);
select public.create_staff_booking_group(
  '[{"id":"26600000-0000-4000-8000-000000000801","dog_id":"26600000-0000-4000-8000-000000000081","slot":"09:00","size":"small","service":"Full Groom","status":"Booked","confirmed":true}]'::jsonb,
  pg_temp.monday(12)
);
-- An appointment dated before the policy started. Inserted directly: it is
-- history, and the booking gates would refuse a past date.
set local session_replication_role = replica;
insert into public.bookings (id, dog_id, booking_date, slot, status, service, size) values
  ('26600000-0000-4000-8000-000000000802', '26600000-0000-4000-8000-000000000081',
   (now() at time zone 'Europe/London')::date - 7, '09:00', 'Booked', 'full-groom', 'small');
set local session_replication_role = origin;

-- ── The trigger itself cannot be called over the API ────────────────
select ok(
  not has_function_privilege('anon', 'public.flag_deposit_after_no_show()', 'EXECUTE'),
  'anonymous callers cannot execute the no-show deposit trigger'
);
select ok(
  not has_function_privilege('authenticated', 'public.flag_deposit_after_no_show()', 'EXECUTE'),
  'signed-in callers cannot execute the no-show deposit trigger'
);

-- ── One no-show is not enough ───────────────────────────────────────
update public.bookings
   set status = 'No-show', cancel_reason = 'No-show'
 where id = '26600000-0000-4000-8000-000000000101';

select is(
  (select deposit_required from public.humans where id = '26600000-0000-4000-8000-000000000010'),
  false,
  'a first no-show does not require a deposit'
);

-- ── The second no-show turns the deposit on and names it ────────────
update public.bookings
   set status = 'No-show', cancel_reason = 'No-show'
 where id = '26600000-0000-4000-8000-000000000102';

select is(
  (select deposit_required from public.humans where id = '26600000-0000-4000-8000-000000000010'),
  true,
  'a second no-show in 12 months requires a deposit from that customer'
);
select is(
  (select deposit_required_reason from public.humans where id = '26600000-0000-4000-8000-000000000010'),
  pg_temp.expected_reason('Salt', pg_temp.monday(1)),
  'the customer record names the dog and date of the second no-show'
);
select ok(
  (select deposit_required_set_at is not null
     from public.humans where id = '26600000-0000-4000-8000-000000000010'),
  'the customer record stores when the deposit was turned on'
);

create temp table first_mark (set_at timestamptz);
insert into first_mark
select deposit_required_set_at
  from public.humans
 where id = '26600000-0000-4000-8000-000000000010';

-- ── A third no-show does not rewrite the explanation ────────────────
update public.bookings
   set status = 'No-show', cancel_reason = 'No-show'
 where id = '26600000-0000-4000-8000-000000000103';

select is(
  (select deposit_required_reason from public.humans where id = '26600000-0000-4000-8000-000000000010'),
  pg_temp.expected_reason('Salt', pg_temp.monday(1)),
  'a later no-show leaves the original explanation in place'
);
select is(
  (select deposit_required_set_at from public.humans where id = '26600000-0000-4000-8000-000000000010'),
  (select set_at from first_mark),
  'a later no-show leaves the original time in place'
);

-- ── Undoing a no-show does not clear the deposit ────────────────────
select lives_ok(
  $$update public.bookings
       set status = 'Booked', cancel_reason = null
     where id = '26600000-0000-4000-8000-000000000101'$$,
  'staff can put a mistaken no-show back on the day'
);
select is(
  (select deposit_required from public.humans where id = '26600000-0000-4000-8000-000000000010'),
  true,
  'putting the dog back on the day does not remove the deposit'
);
select is(
  (select deposit_required_reason from public.humans where id = '26600000-0000-4000-8000-000000000010'),
  pg_temp.expected_reason('Salt', pg_temp.monday(1)),
  'putting the dog back on the day leaves the explanation'
);

-- ── A cancellation is not a no-show ─────────────────────────────────
update public.bookings
   set status = 'Cancelled', cancel_reason = 'Customer request'
 where id = '26600000-0000-4000-8000-000000000201';

select is(
  (select deposit_required from public.humans where id = '26600000-0000-4000-8000-000000000020'),
  false,
  'cancelling a booking does not require a deposit'
);

-- ── A deposit staff already required is left alone ──────────────────
update public.bookings
   set status = 'No-show', cancel_reason = 'No-show'
 where id in ('26600000-0000-4000-8000-000000000301', '26600000-0000-4000-8000-000000000302');

select is(
  (select deposit_required_reason from public.humans where id = '26600000-0000-4000-8000-000000000030'),
  'Asked at the desk',
  'two no-shows do not replace a reason staff already recorded'
);
select is(
  (select deposit_required_set_at from public.humans where id = '26600000-0000-4000-8000-000000000030'),
  timestamptz '2026-01-15 09:00:00+00',
  'two no-shows do not replace the time staff already recorded'
);

-- ── Staff can switch it off; the next no-show turns it on again ─────
update public.bookings
   set status = 'No-show', cancel_reason = 'No-show'
 where id in ('26600000-0000-4000-8000-000000000401', '26600000-0000-4000-8000-000000000402');

update public.humans
   set deposit_required = false
 where id = '26600000-0000-4000-8000-000000000040';

select is(
  (select deposit_required from public.humans where id = '26600000-0000-4000-8000-000000000040'),
  false,
  'staff can switch the deposit off after two no-shows'
);

update public.bookings
   set status = 'No-show', cancel_reason = 'No-show'
 where id = '26600000-0000-4000-8000-000000000403';

select is(
  (select deposit_required from public.humans where id = '26600000-0000-4000-8000-000000000040'),
  true,
  'another no-show inside 12 months turns the deposit back on after staff switched it off'
);
select is(
  (select deposit_required_reason from public.humans where id = '26600000-0000-4000-8000-000000000040'),
  pg_temp.expected_reason('First', pg_temp.monday(10)),
  'the new no-show replaces the explanation, because it is what turned the deposit back on'
);

-- ── Two dogs in one appointment count once ──────────────────────────
update public.bookings
   set status = 'No-show', cancel_reason = 'No-show'
 where id in ('26600000-0000-4000-8000-000000000701', '26600000-0000-4000-8000-000000000702');

select is(
  (select deposit_required from public.humans where id = '26600000-0000-4000-8000-000000000070'),
  false,
  'two dogs missing the same day is one no-show, not two'
);

-- ── No-shows before the policy started do not count ─────────────────
update public.bookings
   set status = 'No-show', cancel_reason = 'No-show'
 where id in ('26600000-0000-4000-8000-000000000802', '26600000-0000-4000-8000-000000000801');

select is(
  (select deposit_required from public.humans where id = '26600000-0000-4000-8000-000000000080'),
  false,
  'a no-show from before the new rule started does not count towards the two'
);

-- ── Checking a dog in is not a no-show ──────────────────────────────
update public.bookings
   set status = 'Arrived'
 where id = '26600000-0000-4000-8000-000000000501';

select is(
  (select deposit_required from public.humans where id = '26600000-0000-4000-8000-000000000050'),
  false,
  'checking a dog in does not require a deposit'
);

-- ── A row inserted already as a no-show is not a new mark ───────────
select is(
  (select status from public.bookings where id = '26600000-0000-4000-8000-000000000601'),
  'No-show',
  'a booking can be created already marked as a no-show'
);
select is(
  (select deposit_required from public.humans where id = '26600000-0000-4000-8000-000000000060'),
  false,
  'creating a booking that is already a no-show does not require a deposit'
);

select * from finish();
rollback;

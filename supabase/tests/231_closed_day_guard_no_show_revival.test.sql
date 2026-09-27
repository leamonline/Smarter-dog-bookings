-- Reviving a no-show ("They turned up") onto a closed day must pass the
-- closed-day guard, exactly as reviving a cancellation does. Before
-- 20260927204500 the guard's revival test knew only Cancelled and Completed,
-- so No-show -> Booked slipped past it.

begin;
create extension if not exists pgtap with schema extensions;
select plan(4);
\ir fixtures/ensure_local_vault_secrets.psql

insert into auth.users (id) values
  ('23100000-0000-4000-8000-000000000001'); -- staff

insert into public.staff_profiles (user_id, role, display_name) values
  ('23100000-0000-4000-8000-000000000001', 'owner', 'Revival Owner');

insert into public.humans (id, name, surname) values
  ('23100000-0000-4000-8000-000000000010', 'Revival', 'Customer');

insert into public.dogs (id, name, breed, size, human_id) values
  ('23100000-0000-4000-8000-000000000011', 'Alpha Revival', 'Poodle', 'small',
   '23100000-0000-4000-8000-000000000010'),
  ('23100000-0000-4000-8000-000000000012', 'Bravo Revival', 'Spaniel', 'small',
   '23100000-0000-4000-8000-000000000010'),
  ('23100000-0000-4000-8000-000000000013', 'Charlie Revival', 'Terrier', 'small',
   '23100000-0000-4000-8000-000000000010');

select set_config(
  'request.jwt.claims',
  '{"sub":"23100000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

create or replace function pg_temp.revival_date(p_offset integer)
returns date language sql as $$
  select current_date + p_offset;
$$;

-- Three singleton visits through the real staff write path, so each row is an
-- included member of a real visit: Alpha and Charlie on a date that will be
-- closed, Bravo on a date that stays open.
select public.create_staff_booking_group(
  '[{"id":"23100000-0000-4000-8000-000000000101","dog_id":"23100000-0000-4000-8000-000000000011","slot":"09:00","size":"small","service":"Full Groom","status":"Booked","confirmed":true}]'::jsonb,
  pg_temp.revival_date(50)
);
select public.create_staff_booking_group(
  '[{"id":"23100000-0000-4000-8000-000000000103","dog_id":"23100000-0000-4000-8000-000000000013","slot":"10:00","size":"small","service":"Full Groom","status":"Booked","confirmed":true}]'::jsonb,
  pg_temp.revival_date(50)
);
select public.create_staff_booking_group(
  '[{"id":"23100000-0000-4000-8000-000000000102","dog_id":"23100000-0000-4000-8000-000000000012","slot":"09:00","size":"small","service":"Full Groom","status":"Booked","confirmed":true}]'::jsonb,
  pg_temp.revival_date(51)
);

-- Staff mark Alpha and Bravo as no-shows and cancel Charlie, with every
-- trigger live.
update public.bookings set status = 'No-show', cancel_reason = 'No-show'
 where id in ('23100000-0000-4000-8000-000000000101',
              '23100000-0000-4000-8000-000000000102');
update public.bookings set status = 'Cancelled', cancel_reason = 'Customer request'
 where id = '23100000-0000-4000-8000-000000000103';

-- Fixture only: close the first date directly, with no rearrangement task,
-- so nothing but the guard stands between a revival and the closed day.
set local session_replication_role = replica;
insert into public.day_settings (setting_date, is_open)
values (pg_temp.revival_date(50), false)
on conflict (setting_date) do update set is_open = false;
set local session_replication_role = default;

select throws_ok(
  $$update public.bookings set status = 'Booked', cancel_reason = null
     where id = '23100000-0000-4000-8000-000000000101'$$,
  'SCL03',
  'active_booking_requires_open_day_or_closure_task',
  'No-show -> Booked on a closed day without a closure task is refused'
);

select is(
  (select status from public.bookings
    where id = '23100000-0000-4000-8000-000000000101'),
  'No-show',
  'the refused revival leaves the no-show untouched'
);

select throws_ok(
  $$update public.bookings set status = 'Booked', cancel_reason = null
     where id = '23100000-0000-4000-8000-000000000103'$$,
  'SCL03',
  'active_booking_requires_open_day_or_closure_task',
  'Cancelled -> Booked on a closed day is still refused, as before'
);

select lives_ok(
  $$update public.bookings set status = 'Booked', cancel_reason = null
     where id = '23100000-0000-4000-8000-000000000102'$$,
  'No-show -> Booked on an open day is still allowed'
);

select * from finish();
rollback;

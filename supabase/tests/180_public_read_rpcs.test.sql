-- Public (anon) read RPCs for the marketing website: get_public_salon_facts()
-- and get_public_open_days(). Both must return a curated, narrow shape and
-- must never surface the sensitive fields living alongside them --
-- salon_config.settings.depositBank (real bank details), customer/booking
-- details, or day_settings.overrides/extra_slots (operational seat internals).
-- The existing authenticated-only get_open_days() must keep its separate,
-- unwidened grant.

begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

insert into public.salon_config (settings, daily_dog_cap) values (
  jsonb_build_object(
    'businessName', 'Test Salon',
    'businessPhone', '+447700900000',
    'businessEmail', 'hello@testsalon.example',
    'businessAddress', '1 Test Street, Testville',
    'businessHours', jsonb_build_object(
      'Monday', jsonb_build_object('open', '08:30', 'close', '15:00', 'closed', false)
    ),
    'closures', jsonb_build_array(
      jsonb_build_object('date', '2026-12-25', 'label', 'Christmas Day')
    ),
    'depositBank', jsonb_build_object(
      'accountName', 'Secret Co', 'sortCode', '12-34-56', 'accountNumber', '12345678'
    )
  ),
  1
);

-- Seed a closed day on the NEXT WEDNESDAY. Anchored to the same start-of-week
-- as the booking fixtures below so the three dates can never coincide.
-- A plain `today + 5` collided with them depending on the weekday the suite
-- happened to run: on a Wednesday it landed on the live booking's Monday and
-- made "an open day at the configured daily dog cap is fully booked" fail,
-- and on a Thursday it landed on the Cancelled booking's Tuesday, where a
-- closed day also reports is_fully_booked = false and the assertion passed for
-- the wrong reason. Keep every fixture date week-anchored.
insert into public.day_settings (setting_date, is_open, overrides, extra_slots) values
  ((date_trunc('week', (statement_timestamp() at time zone 'Europe/London')::date)
     + interval '9 days')::date,
   false, '{"09:00":{"1":"blocked"}}'::jsonb, array['14:00']);

-- Seed one live booking on the next Monday and one Cancelled booking on the
-- following Tuesday. Fixture inserts bypass triggers so this read-contract
-- test does not exercise notifications or capacity writes.
set local session_replication_role = replica;
insert into public.humans (id, name, surname) values
  ('aaaaaaaa-0000-4000-8000-000000000180', 'Public RPC', 'Owner');
insert into public.dogs (id, name, breed, human_id, is_pregnant) values
  ('bbbbbbbb-0000-4000-8000-000000000180', 'PublicPupLive', 'Test breed',
   'aaaaaaaa-0000-4000-8000-000000000180', false),
  ('bbbbbbbb-0000-4000-8000-000000000181', 'PublicPupCancelled', 'Test breed',
   'aaaaaaaa-0000-4000-8000-000000000180', false);
insert into public.bookings (id, booking_date, slot, dog_id, size, service, status) values
  ('cccccccc-0000-4000-8000-000000000180',
   (date_trunc('week', (statement_timestamp() at time zone 'Europe/London')::date)
     + interval '7 days')::date,
   '09:00', 'bbbbbbbb-0000-4000-8000-000000000180', 'small', 'full-groom', 'Booked'),
  ('cccccccc-0000-4000-8000-000000000181',
   (date_trunc('week', (statement_timestamp() at time zone 'Europe/London')::date)
     + interval '8 days')::date,
   '09:00', 'bbbbbbbb-0000-4000-8000-000000000181', 'small', 'full-groom', 'Cancelled');
set local session_replication_role = default;

-- 1-2: anon can execute both new public functions.
select ok(
  has_function_privilege('anon', 'public.get_public_salon_facts()', 'EXECUTE'),
  'anon can execute get_public_salon_facts()'
);
select ok(
  has_function_privilege('anon', 'public.get_public_open_days()', 'EXECUTE'),
  'anon can execute get_public_open_days()'
);

-- 3: get_open_days (the authenticated customer-portal RPC) keeps its separate,
--    unwidened lock -- adding the public sibling must never loosen it.
select ok(
  not has_function_privilege('anon', 'public.get_open_days(date, date)', 'EXECUTE'),
  'get_open_days(date, date) stays authenticated-only, not widened for the website'
);

-- 4-15: as anon (no JWT), matching exactly what the website's anon key sees.
set local request.jwt.claims = '';
set local role anon;

select is(
  (select count(*) from public.salon_config), 0::bigint,
  'anon cannot read salon_config directly (RLS)'
);
select is(
  (select count(*) from public.day_settings), 0::bigint,
  'anon cannot read day_settings directly (RLS)'
);
select is(
  (select count(*) from public.bookings), 0::bigint,
  'anon cannot read bookings directly (RLS)'
);
select is(
  (select business_name from public.get_public_salon_facts()),
  'Test Salon', 'anon calling get_public_salon_facts() gets the seeded business name'
);
select ok(
  (select row_to_json(f)::text !~ 'Secret Co' and row_to_json(f)::text !~ 'accountNumber'
     from public.get_public_salon_facts() f),
  'get_public_salon_facts never surfaces depositBank fields'
);
select is(
  (select is_open from public.get_public_open_days()
   where setting_date = (date_trunc('week', (statement_timestamp() at time zone 'Europe/London')::date)
     + interval '9 days')::date),
  false, 'anon calling get_public_open_days() sees the seeded closure'
);
select is(
  (select count(*) from public.get_public_open_days()),
  181::bigint,
  'public availability includes today and every date through 180 days ahead'
);
select is(
  (select max(setting_date) - min(setting_date) from public.get_public_open_days()),
  180,
  'public availability horizon spans exactly 180 days'
);
select is(
  (select is_fully_booked from public.get_public_open_days()
   where setting_date =
     (date_trunc('week', (statement_timestamp() at time zone 'Europe/London')::date)
       + interval '7 days')::date),
  true,
  'an open day at the configured daily dog cap is fully booked'
);
select is(
  (select is_fully_booked from public.get_public_open_days()
   where setting_date =
     (date_trunc('week', (statement_timestamp() at time zone 'Europe/London')::date)
       + interval '8 days')::date),
  false,
  'Cancelled bookings do not make an open day fully booked'
);
select is(
  (select is_fully_booked from public.get_public_open_days()
   where setting_date = (date_trunc('week', (statement_timestamp() at time zone 'Europe/London')::date)
     + interval '9 days')::date),
  false,
  'a closed day never reports itself as fully booked'
);
select ok(
  (select row_to_json(d)::text !~ 'blocked'
          and row_to_json(d)::text !~ '14:00'
          and row_to_json(d)::text !~ 'booking_count'
     from public.get_public_open_days() d
     where setting_date = (date_trunc('week', (statement_timestamp() at time zone 'Europe/London')::date)
     + interval '9 days')::date),
  'get_public_open_days never surfaces counts or day_settings internals'
);

reset role;
select * from finish();
rollback;

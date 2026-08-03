-- Public (anon) read RPCs for the marketing website: get_public_salon_facts()
-- and get_public_open_days(). Both must return a curated, narrow shape and
-- must never surface the sensitive fields living alongside them --
-- salon_config.settings.depositBank (real bank details) and
-- day_settings.overrides/extra_slots (operational seat internals). The
-- existing authenticated-only get_open_days() must keep its separate,
-- unwidened grant.

begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into public.salon_config (settings) values (
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
  )
);

insert into public.day_settings (setting_date, is_open, overrides, extra_slots) values
  (current_date + 5, false, '{"09:00":{"1":"blocked"}}'::jsonb, array['14:00']);

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

-- 4-9: as anon (no JWT), matching exactly what the website's anon key sees.
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
  (select business_name from public.get_public_salon_facts()),
  'Test Salon', 'anon calling get_public_salon_facts() gets the seeded business name'
);
select ok(
  (select row_to_json(f)::text !~ 'Secret Co' and row_to_json(f)::text !~ 'accountNumber'
     from public.get_public_salon_facts() f),
  'get_public_salon_facts never surfaces depositBank fields'
);
select is(
  (select is_open from public.get_public_open_days() where setting_date = current_date + 5),
  false, 'anon calling get_public_open_days() sees the seeded closure'
);
select ok(
  (select row_to_json(d)::text !~ 'blocked' and row_to_json(d)::text !~ '14:00'
     from public.get_public_open_days() d where setting_date = current_date + 5),
  'get_public_open_days never surfaces overrides/extra_slots internals'
);

reset role;
select * from finish();
rollback;

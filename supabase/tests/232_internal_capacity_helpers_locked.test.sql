-- Internal capacity helpers stay internal.
--
-- 20260615180000 revoked EXECUTE from anon and authenticated on five helpers
-- that only other SECURITY DEFINER functions call. 20260919090100 re-issued
-- two of them and re-granted authenticated by copying the customer-RPC grant
-- pattern; 20260929170000 restores the lock. This test pins the end state so
-- the next re-issue cannot repeat the mistake, and checks the two customer
-- RPCs that ARE meant to be callable were not caught in the net.

begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

-- The five June helpers: nobody but service_role (and the definer of the
-- functions that call them) may execute them directly.
select ok(
  not has_function_privilege('anon', 'public.get_seats_used(date, text, uuid)', 'EXECUTE'),
  'anon cannot execute get_seats_used'
);
select ok(
  not has_function_privilege('authenticated', 'public.get_seats_used(date, text, uuid)', 'EXECUTE'),
  'authenticated cannot execute get_seats_used (re-locked by 20260929170000)'
);
select ok(
  has_function_privilege('service_role', 'public.get_seats_used(date, text, uuid)', 'EXECUTE'),
  'service_role keeps get_seats_used'
);

select ok(
  not has_function_privilege('anon', 'public.has_large_dog(date, text, uuid)', 'EXECUTE'),
  'anon cannot execute has_large_dog'
);
select ok(
  not has_function_privilege('authenticated', 'public.has_large_dog(date, text, uuid)', 'EXECUTE'),
  'authenticated cannot execute has_large_dog (re-locked by 20260929170000)'
);
select ok(
  has_function_privilege('service_role', 'public.has_large_dog(date, text, uuid)', 'EXECUTE'),
  'service_role keeps has_large_dog'
);

select ok(
  not has_function_privilege('anon', 'public.large_dog_can_fit_on_day(date)', 'EXECUTE'),
  'anon cannot execute large_dog_can_fit_on_day'
);
select ok(
  not has_function_privilege('authenticated', 'public.large_dog_can_fit_on_day(date)', 'EXECUTE'),
  'authenticated cannot execute large_dog_can_fit_on_day'
);

select ok(
  not has_function_privilege('anon', 'public.get_small_medium_availability(date, date)', 'EXECUTE'),
  'anon cannot execute get_small_medium_availability'
);
select ok(
  not has_function_privilege('authenticated', 'public.get_small_medium_availability(date, date)', 'EXECUTE'),
  'authenticated cannot execute get_small_medium_availability'
);
select ok(
  has_function_privilege('service_role', 'public.get_small_medium_availability(date, date)', 'EXECUTE'),
  'service_role keeps get_small_medium_availability (the WhatsApp agent calls it)'
);

select ok(
  not has_function_privilege('anon', 'public.get_large_dog_day_availability(date, date)', 'EXECUTE'),
  'anon cannot execute get_large_dog_day_availability'
);
select ok(
  not has_function_privilege('authenticated', 'public.get_large_dog_day_availability(date, date)', 'EXECUTE'),
  'authenticated cannot execute get_large_dog_day_availability'
);
select ok(
  has_function_privilege('service_role', 'public.get_large_dog_day_availability(date, date)', 'EXECUTE'),
  'service_role keeps get_large_dog_day_availability (the WhatsApp Flow calls it)'
);

-- The customer-facing capacity reads are a different contract (ADR 007): a
-- logged-in customer must still be able to call them, and anon never can.
select ok(
  has_function_privilege('authenticated', 'public.get_slot_occupancy(date)', 'EXECUTE'),
  'authenticated can still execute get_slot_occupancy — the booking wizard depends on it'
);
select ok(
  has_function_privilege('authenticated', 'public.get_occupancy_range(date, date)', 'EXECUTE'),
  'authenticated can still execute get_occupancy_range'
);
select ok(
  not has_function_privilege('anon', 'public.get_slot_occupancy(date)', 'EXECUTE'),
  'anon still cannot execute get_slot_occupancy'
);

select * from finish();
rollback;

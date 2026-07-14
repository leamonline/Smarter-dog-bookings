-- The humans slot-shape CHECK helper must be callable by roles that write
-- humans rows, while remaining unavailable to anonymous callers.

begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

select ok(
  has_function_privilege('authenticated', 'public.slots_are_hhmm(text[])', 'EXECUTE'),
  'authenticated staff writes can evaluate the humans slot-shape checks'
);

select ok(
  has_function_privilege('service_role', 'public.slots_are_hhmm(text[])', 'EXECUTE'),
  'service-role writes can evaluate the humans slot-shape checks'
);

select ok(
  not has_function_privilege('anon', 'public.slots_are_hhmm(text[])', 'EXECUTE'),
  'anonymous callers cannot execute the internal slot-shape helper'
);

select * from finish();
rollback;

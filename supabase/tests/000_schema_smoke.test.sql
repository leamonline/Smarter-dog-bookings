-- Structural smoke test for complete local migration replay.
--
-- This is the foundation of the DB-test harness: it runs after the local stack
-- has rebuilt every committed migration (see db-tests.yml), so a PASS confirms
-- the history applied cleanly AND the booking write-path objects exist as
-- expected. Deterministic (no fixtures, dates, or role/JWT setup), so a failure
-- here points at schema replay, not test plumbing. Behavioural tests build on
-- top of this once it is green.

begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

-- Core tables rebuilt from the migration history
select has_table('public', 'bookings', 'bookings table rebuilt');
select has_table('public', 'dogs', 'dogs table rebuilt');
select has_table('public', 'humans', 'humans table rebuilt');
select has_table('public', 'salon_config', 'salon_config table rebuilt');
select has_table('public', 'whatsapp_events', 'whatsapp_events table rebuilt');

-- RLS is enabled on the customer-data tables
select ok(
  (select bool_and(c.relrowsecurity)
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname in ('bookings', 'dogs', 'humans')),
  'RLS enabled on bookings, dogs, humans'
);

-- The customer write-path RPCs exist, and create_customer_dog is SECURITY DEFINER.
-- NB: the 1-arg has_function form is used deliberately — the 2-arg
-- has_function('public','fn') is ambiguous in pgTAP (it reads the first arg as
-- the function name and the second as a description), so it must be either the
-- bare name or the full (schema, name, args[]) form.
select has_function('create_customer_dog');
select is_definer('create_customer_dog', 'create_customer_dog is SECURITY DEFINER');
select has_function('create_customer_booking_group');

-- The three BEFORE INSERT booking gates are attached to bookings
select has_trigger('public', 'bookings', 'trg_enforce_booking_calendar', 'calendar gate present');
select has_trigger('public', 'bookings', 'trg_enforce_dog_not_pregnant', 'pregnancy gate present');
select has_trigger('public', 'bookings', 'trg_validate_booking_capacity', 'capacity gate present');

select * from finish();
rollback;

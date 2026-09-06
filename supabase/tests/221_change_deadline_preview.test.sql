-- customer_change_deadline_preview: does the warning agree with the gate?
--
-- The point of this function is that a customer is told, at the moment of
-- booking, what cancel_customer_booking will decide later. So the property
-- worth proving is not "it computes 24 hours" — it is that it reads the same
-- settings and applies the same comparison as the enforcing function, edge
-- cases included.
--
-- Deliberately not covered here: the refusal itself. 110 already proves
-- cancel_customer_booking raises SDC02 past the deadline; this file proves the
-- preview agrees with it rather than re-testing it.

begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

\ir fixtures/ensure_local_vault_secrets.psql

set local session_replication_role = replica;

-- --------------------------------------------------------------------------
-- Shape and grants
-- --------------------------------------------------------------------------

select has_function(
  'public', 'customer_change_deadline_preview', array['date', 'text'],
  'the preview function exists'
);

select is(
  (select prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'customer_change_deadline_preview'),
  true,
  'runs as definer, like every other customer-facing read'
);

select is(
  has_function_privilege('anon', 'public.customer_change_deadline_preview(date, text)', 'execute'),
  false,
  'anon cannot call it'
);

select is(
  has_function_privilege('authenticated', 'public.customer_change_deadline_preview(date, text)', 'execute'),
  true,
  'authenticated customers can'
);

-- --------------------------------------------------------------------------
-- With no salon_config row at all
--
-- Asserted before anything is inserted, and asserted deliberately: an empty
-- table is what a fresh local stack actually has, so without this the
-- fallback tests further down would pass on the defaults while looking like
-- they were exercising the settings.
-- --------------------------------------------------------------------------

select is(
  public.customer_change_deadline_preview(date '2026-12-15', '08:30') ->> 'deadline',
  '2026-12-14T08:30:00',
  'no settings row falls back to 24 hours, as the gate does'
);

-- --------------------------------------------------------------------------
-- The comparison itself, against London wall time
-- --------------------------------------------------------------------------

insert into public.salon_config (settings)
values (jsonb_build_object(
  'minCancellationHours', 24,
  'customerPortal', jsonb_build_object('allowCancellations', true)
));

select is(
  (public.customer_change_deadline_preview(
     ((now() at time zone 'Europe/London')::date + 30), '08:30') ->> 'passed')::boolean,
  false,
  'a slot 30 days out has not passed the deadline'
);

-- Today's 08:30 is inside a 24-hour window whatever the hour, so this holds
-- at any time of day the suite happens to run.
select is(
  (public.customer_change_deadline_preview(
     (now() at time zone 'Europe/London')::date, '08:30') ->> 'passed')::boolean,
  true,
  'a slot today has already passed it'
);

select is(
  public.customer_change_deadline_preview(date '2026-12-15', '08:30') ->> 'deadline',
  '2026-12-14T08:30:00',
  'deadline is the slot minus the configured hours, in London wall time'
);

-- The boundary, bracketed to a minute either side. Exact equality is not
-- reachable from a test: a slot is HH:MI, now() has microseconds, so no
-- argument makes deadline land exactly on now. These two catch an inverted
-- comparison or a wrong offset; strict-vs-inclusive at the exact instant is
-- covered by the gate's own tests plus the frame guard below.
select is(
  (select (public.customer_change_deadline_preview(w::date, to_char(w, 'HH24:MI')) ->> 'passed')::boolean
     from (select (now() at time zone 'Europe/London') + interval '24 hours 2 minutes' as w) t),
  false,
  'two minutes clear of the deadline has not passed it'
);

select is(
  (select (public.customer_change_deadline_preview(w::date, to_char(w, 'HH24:MI')) ->> 'passed')::boolean
     from (select (now() at time zone 'Europe/London') + interval '23 hours 58 minutes' as w) t),
  true,
  'two minutes the wrong side of the deadline has passed it'
);

-- Drift guard: if either function moves out of London wall time, the warning
-- and the refusal stop agreeing, and this fails rather than the customer
-- finding out.
select is(
  (select count(*)::int
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('cancel_customer_booking', 'customer_change_deadline_preview')
      and p.prosrc like '%now() at time zone ''Europe/London''%'),
  2,
  'gate and preview both compare in the Europe/London wall clock'
);

-- --------------------------------------------------------------------------
-- Settings are read from the enforcing source, with its fallbacks
-- --------------------------------------------------------------------------

update public.salon_config
   set settings = settings || jsonb_build_object('minCancellationHours', 48);

select is(
  public.customer_change_deadline_preview(date '2026-12-15', '08:30') ->> 'deadline',
  '2026-12-13T08:30:00',
  'a changed minCancellationHours moves the deadline'
);

-- The gate clamps an absurd value back to 24 rather than refusing every
-- cancellation for a century.
update public.salon_config
   set settings = settings || jsonb_build_object('minCancellationHours', 900000);

select is(
  public.customer_change_deadline_preview(date '2026-12-15', '08:30') ->> 'deadline',
  '2026-12-14T08:30:00',
  'an out-of-range value falls back to 24 hours, as the gate does'
);

update public.salon_config
   set settings = settings || jsonb_build_object('minCancellationHours', 'not a number');

select is(
  public.customer_change_deadline_preview(date '2026-12-15', '08:30') ->> 'deadline',
  '2026-12-14T08:30:00',
  'a non-numeric value falls back to 24 hours, as the gate does'
);

update public.salon_config
   set settings = settings
                  || jsonb_build_object('minCancellationHours', 24)
                  || jsonb_build_object(
                       'customerPortal',
                       jsonb_build_object('allowCancellations', false));

select is(
  (public.customer_change_deadline_preview(date '2026-12-15', '08:30')
     ->> 'allowCancellations')::boolean,
  false,
  'the switch being off is reported, not hidden behind the deadline'
);

-- A second row makes the singleton ambiguous. cancel_customer_booking treats
-- that as online cancellation being off (SDC01); so must the preview, or the
-- portal would promise a change the gate will refuse.
--
-- BOTH rows say cancellations are ON, deliberately: the function picks the
-- lowest id when it reads settings, and the ids are random, so a test where
-- only one row said "off" would pass or fail on whichever row sorted first.
-- With both on, "off" can only come from the ambiguity guard itself.
update public.salon_config
   set settings = settings
                  || jsonb_build_object(
                       'customerPortal',
                       jsonb_build_object('allowCancellations', true));

insert into public.salon_config (settings)
values (jsonb_build_object(
  'customerPortal', jsonb_build_object('allowCancellations', true)
));

select is(
  (public.customer_change_deadline_preview(date '2026-12-15', '08:30')
     ->> 'allowCancellations')::boolean,
  false,
  'a non-singleton salon_config reads as cancellations off, as the gate does'
);

-- --------------------------------------------------------------------------
-- Unusable input is null, never a reassuring answer
-- --------------------------------------------------------------------------

select is(
  public.customer_change_deadline_preview(date '2026-12-15', 'half past eight'),
  null,
  'an unparseable slot returns null rather than a guess'
);

select finish();
rollback;

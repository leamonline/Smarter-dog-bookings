-- Outbound notification triggers must never roll back the write that fired
-- them (migration 20260916120000).
--
-- The property is easy to state and easy to lose: an AFTER trigger still runs
-- inside the originating transaction, so an unguarded PERFORM net.http_post()
-- turns "the confirmation email failed" into "the customer could not book".
--
-- The test sabotages get_supabase_url() so every outbound call raises, then
-- writes for real. DDL is transactional, so the sabotage rolls back with the
-- rest of the fixture and nothing leaks into the next test file.

begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

\ir fixtures/ensure_local_vault_secrets.psql

-- ── Fixture: an owner and a dog. Triggers off for these two rows only;
--    the booking insert below runs with triggers LIVE, which is the point.
set local session_replication_role = replica;
insert into public.humans (id, name, surname)
  values ('aaaaaaaa-0000-4000-8000-0000000000a1'::uuid, 'pgTAP Guard', 'Owner');
insert into public.dogs (id, name, breed, human_id, is_pregnant)
  values ('bbbbbbbb-0000-4000-8000-0000000000b2'::uuid, 'GuardPup', 'Terrier',
          'aaaaaaaa-0000-4000-8000-0000000000a1'::uuid, false);
set local session_replication_role = default;

-- ── Every outbound trigger function is guarded ────────────────
-- The CTE is MATERIALIZED and filters prokind deliberately.
-- pg_get_functiondef() raises "array_agg is an aggregate function" on an
-- aggregate, and PostgreSQL does not guarantee predicate evaluation order --
-- so without the barrier the planner is free to call it before the
-- nspname/prokind filters have excluded pg_catalog's aggregates, and the
-- whole test errors instead of asserting anything.
select is_empty(
  $$
    with trigger_fns as materialized (
      select p.oid, p.proname
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.prokind = 'f'
         and pg_get_function_result(p.oid) = 'trigger'
    )
    select proname
      from trigger_fns
     where pg_get_functiondef(oid) ilike '%net.http_post%'
       and position('exception' in lower(pg_get_functiondef(oid))) = 0
  $$,
  'no public trigger function POSTs over pg_net without an exception handler'
);

-- ── SABOTAGE: make every outbound call raise ──────────────────
alter function public.get_supabase_url() rename to get_supabase_url_pgtap_real;
create or replace function public.get_supabase_url()
returns text language plpgsql as $sabotage$
begin
  raise exception 'pgTAP: simulated outbound notification failure';
end;
$sabotage$;

-- ── The write must still succeed ──────────────────────────────
select lives_ok(
  $$
    insert into public.bookings (id, booking_date, slot, dog_id, size, service, status)
    values ('cccccccc-0000-4000-8000-0000000000c3'::uuid,
            (date_trunc('week', current_date) + interval '7 days')::date,
            '09:00', 'bbbbbbbb-0000-4000-8000-0000000000b2'::uuid,
            'small', 'full-groom', 'Booked')
  $$,
  'a booking inserts even when every outbound notification raises'
);

select is(
  (select count(*)::int from public.bookings
    where id = 'cccccccc-0000-4000-8000-0000000000c3'::uuid),
  1, 'the booking row is really there, not rolled back'
);

-- The booking_events feed (and its two guarded notify triggers) survived too.
select is(
  (select count(*)::int from public.booking_events
    where booking_id = 'cccccccc-0000-4000-8000-0000000000c3'::uuid
      and event_type = 'created'),
  1, 'the booking_events row was still written'
);

-- ── Cancelling must survive it as well ────────────────────────
select lives_ok(
  $$
    update public.bookings set status = 'Cancelled'
     where id = 'cccccccc-0000-4000-8000-0000000000c3'::uuid
  $$,
  'a cancellation succeeds even when every outbound notification raises'
);

select is(
  (select status from public.bookings
    where id = 'cccccccc-0000-4000-8000-0000000000c3'::uuid),
  'Cancelled', 'the cancellation actually persisted'
);

-- ── The WhatsApp forensic log must survive an unreachable agent ──
select lives_ok(
  $$
    insert into public.whatsapp_events (signature_valid, event_type, payload)
    values (true, 'messages', '{"pgtap":"guard"}'::jsonb)
  $$,
  'a whatsapp_events row is written even when the agent dispatch raises'
);

-- ── Waitlist writes too ───────────────────────────────────────
select lives_ok(
  $$
    insert into public.waitlist_entries (human_id, target_date)
    values ('aaaaaaaa-0000-4000-8000-0000000000a1'::uuid,
            (date_trunc('week', current_date) + interval '14 days')::date)
  $$,
  'a waitlist entry is written even when its notification raises'
);

-- ── RESTORE, and prove the sabotage was real ──────────────────
drop function public.get_supabase_url();
alter function public.get_supabase_url_pgtap_real() rename to get_supabase_url;

select isnt(
  (select public.get_supabase_url()), null,
  'get_supabase_url is restored, so the sabotage above was genuinely in force'
);

select * from finish();
rollback;

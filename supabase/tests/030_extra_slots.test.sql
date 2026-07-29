-- Behavioural tests for per-date extra slots (active_slots_for, migration
-- 20260702170000). Runs as the default (postgres) role with no JWT, so
-- auth.uid() is NULL and is_staff() returns false → the non-staff gate paths
-- fire. The whole file is one transaction, rolled back at the end; pgTAP
-- rolls each throwing statement back to a savepoint so fixtures survive
-- between assertions.
--
-- Dates are relative: D1 = next Monday, D2 = next Tuesday (both open by the
-- Mon-Wed default, both in the future so the same-day rule never fires).

begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

-- Unlike the gate tests (010), several assertions here let an insert SUCCEED
-- — which fires the AFTER-INSERT notify triggers. Those call
-- get_supabase_url(), which RAISES unless the 'supabase_url' Vault secret
-- exists. Use the idempotent local fixture so the test works both when the
-- clean-replay bootstrap already supplied it and when the database is empty.
\ir fixtures/ensure_local_vault_secrets.psql

-- Fixtures: one owner and six non-pregnant dogs.
insert into public.humans (id, name, surname)
  values ('aaaaaaaa-0000-4000-8000-000000000002', 'pgTAP Extra', 'Owner');
insert into public.dogs (id, name, human_id, is_pregnant)
  select ('bbbbbbbb-0000-4000-8000-00000000001' || i)::uuid,
         'ExtraPup' || i,
         'aaaaaaaa-0000-4000-8000-000000000002',
         false
    from generate_series(1, 6) as g(i);

-- 1. Without any extra_slots configured, an off-grid slot is still invalid.
select throws_ok(
  $$ insert into public.bookings (booking_date, slot, dog_id, size, service)
     values ((date_trunc('week', current_date) + interval '7 days')::date,
             '14:00', 'bbbbbbbb-0000-4000-8000-000000000011', 'small', 'full-groom') $$,
  'P0001', 'Invalid slot: 14:00',
  'an extra slot is invalid until the day actually configures it'
);

-- Configure D1: two real extra slots and one malformed value (the staff UI
-- could historically generate out-of-range times; the sanitiser must drop it).
insert into public.day_settings (setting_date, is_open, extra_slots)
  values ((date_trunc('week', current_date) + interval '7 days')::date,
          true, array['13:30', '14:00', '25:00']);

-- 2 + 3. A configured extra slot accepts bookings up to its 2 seats.
select lives_ok(
  $$ insert into public.bookings (booking_date, slot, dog_id, size, service)
     values ((date_trunc('week', current_date) + interval '7 days')::date,
             '14:00', 'bbbbbbbb-0000-4000-8000-000000000011', 'small', 'full-groom') $$,
  'a configured extra slot accepts a first booking'
);
select lives_ok(
  $$ insert into public.bookings (booking_date, slot, dog_id, size, service)
     values ((date_trunc('week', current_date) + interval '7 days')::date,
             '14:00', 'bbbbbbbb-0000-4000-8000-000000000012', 'small', 'full-groom') $$,
  'a configured extra slot accepts a second booking (2 seats)'
);

-- 4. The third dog is over the slot's capacity — the seat rules run inside
--    extra slots exactly as they do on the canonical grid.
select throws_ok(
  $$ insert into public.bookings (booking_date, slot, dog_id, size, service)
     values ((date_trunc('week', current_date) + interval '7 days')::date,
             '14:00', 'bbbbbbbb-0000-4000-8000-000000000013', 'small', 'full-groom') $$,
  'P0001', 'Slot is full',
  'extra slots enforce the 2-seat capacity'
);

-- 5. A malformed extra_slots value never becomes bookable.
select throws_ok(
  $$ insert into public.bookings (booking_date, slot, dog_id, size, service)
     values ((date_trunc('week', current_date) + interval '7 days')::date,
             '25:00', 'bbbbbbbb-0000-4000-8000-000000000014', 'small', 'full-groom') $$,
  'P0001', 'Invalid slot: 25:00',
  'malformed extra_slots values are sanitised out of the grid'
);

-- 6. Large dogs are never eligible for extra slots (not in the approved five).
select throws_ok(
  $$ insert into public.bookings (booking_date, slot, dog_id, size, service)
     values ((date_trunc('week', current_date) + interval '7 days')::date,
             '13:30', 'bbbbbbbb-0000-4000-8000-000000000015', 'large', 'full-groom') $$,
  'P0001', 'Large dogs need approval for this slot (13:30)',
  'large dogs cannot book extra slots without staff approval'
);

-- 7 + 8. The 2-2-1 rule runs ACROSS the canonical/extra boundary. On D2:
--    12:30 and 13:00 each hold 2 dogs, so 13:30 (an extra slot, third
--    consecutive) is capped at 1 — the first dog fits, the second does not.
insert into public.day_settings (setting_date, is_open, extra_slots)
  values ((date_trunc('week', current_date) + interval '8 days')::date,
          true, array['13:30']);
insert into public.bookings (booking_date, slot, dog_id, size, service)
  select (date_trunc('week', current_date) + interval '8 days')::date,
         s.slot, s.dog::uuid, 'small', 'full-groom'
    from (values
      ('12:30', 'bbbbbbbb-0000-4000-8000-000000000011'),
      ('12:30', 'bbbbbbbb-0000-4000-8000-000000000012'),
      ('13:00', 'bbbbbbbb-0000-4000-8000-000000000013'),
      ('13:00', 'bbbbbbbb-0000-4000-8000-000000000014')
    ) as s(slot, dog);

select lives_ok(
  $$ insert into public.bookings (booking_date, slot, dog_id, size, service)
     values ((date_trunc('week', current_date) + interval '8 days')::date,
             '13:30', 'bbbbbbbb-0000-4000-8000-000000000015', 'small', 'full-groom') $$,
  'the capped extra slot still takes its single seat'
);
select throws_ok(
  $$ insert into public.bookings (booking_date, slot, dog_id, size, service)
     values ((date_trunc('week', current_date) + interval '8 days')::date,
             '13:30', 'bbbbbbbb-0000-4000-8000-000000000016', 'small', 'full-groom') $$,
  'P0001', 'Capped at 1 (2-2-1 rule)',
  'the 2-2-1 window spans the 13:00 → 13:30 boundary'
);

select * from finish();
rollback;

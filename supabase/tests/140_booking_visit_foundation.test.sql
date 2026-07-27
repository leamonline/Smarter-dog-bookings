-- Booking visit foundation: aggregate schema, inactive policy, legacy
-- dual-write, lineage edges, axis matrix and the audited backfill
-- reconciliation commands. Synthetic fixtures are rolled back.

begin;
create extension if not exists pgtap with schema extensions;
select plan(53);
\ir fixtures/ensure_local_vault_secrets.psql

-- ── Fixtures ────────────────────────────────────────────────────────

insert into auth.users (id) values
  ('14000000-0000-4000-8000-000000000001'), -- staff
  ('14000000-0000-4000-8000-000000000002'); -- customer (not staff)

insert into public.staff_profiles (user_id, role, display_name) values
  ('14000000-0000-4000-8000-000000000001', 'owner', 'Fixture Owner');

insert into public.humans (id, name, surname) values
  ('14000000-0000-4000-8000-000000000010', 'VisitFixture140', 'One'),
  ('14000000-0000-4000-8000-000000000020', 'VisitFixture140', 'Two');

insert into public.dogs (id, name, breed, size, human_id) values
  ('14000000-0000-4000-8000-000000000011', 'Alpha', 'Poodle', 'small',
   '14000000-0000-4000-8000-000000000010'),
  ('14000000-0000-4000-8000-000000000012', 'Bravo', 'Beagle', 'small',
   '14000000-0000-4000-8000-000000000010'),
  ('14000000-0000-4000-8000-000000000021', 'Charlie', 'Collie', 'small',
   '14000000-0000-4000-8000-000000000020');

-- Act as staff so the calendar/capacity gates bypass exactly as in the app.
select set_config(
  'request.jwt.claims',
  '{"sub":"14000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

-- ── 1-7: structure and the inactive policy ─────────────────────────

select has_table('public', 'booking_visits', 'booking_visits exists');
select has_table('public', 'booking_lineages', 'booking_lineages exists');
select has_column(
  'public', 'booking_visits', 'row_revision',
  'booking_visits has a separate optimistic row revision'
);
select has_table('public', 'booking_policy_versions', 'booking_policy_versions exists');
select has_column('public', 'bookings', 'visit_id', 'bookings.visit_id exists');
select has_column('public', 'bookings', 'visit_membership_state', 'bookings.visit_membership_state exists');
select is(
  (select effective_at from public.booking_policy_versions
    where code = 'previous_day_1500_v1'),
  null::timestamptz,
  'the new policy is seeded inactive');
select is(
  (select effective_at from public.booking_policy_versions where code = 'legacy_24h'),
  '-infinity'::timestamptz,
  'the legacy policy has always been effective');

-- ── 8-10: policy registry immutability + the table CHECK itself ────

select throws_ok(
  $$ update public.booking_policy_versions
        set effective_at = now() where code = 'legacy_24h' $$,
  'P0001', 'a booking policy effective instant cannot be changed once set',
  'a set effective instant is immutable');

select throws_ok(
  $$ update public.booking_policy_versions
        set effective_at = now() where code = 'previous_day_1500_v1' $$,
  'P0001', 'the booking policy effective instant may only be set by the activation latch',
  'the v1 instant cannot be set without the activation latch');

-- Exercise the malformed-legacy CHECK constraint directly (trigger disabled
-- so the CHECK, not the guard, is what rejects the row).
alter table public.booking_policy_versions
  disable trigger trg_guard_booking_policy_versions;
delete from public.booking_policy_versions where code = 'legacy_24h';
select throws_ok(
  $$ insert into public.booking_policy_versions (code, change_rule, effective_at)
     values ('legacy_24h', 'rolling_24h', null) $$,
  '23514', null,
  'a malformed legacy_24h row is rejected by the table constraint');
insert into public.booking_policy_versions (code, change_rule, effective_at)
values ('legacy_24h', 'rolling_24h', '-infinity'::timestamptz);
alter table public.booking_policy_versions
  enable trigger trg_guard_booking_policy_versions;

-- ── 11-17: legacy dual-write on insert ─────────────────────────────

insert into public.bookings (id, booking_date, slot, dog_id, size, service, status) values
  ('14000000-0000-4000-8000-000000000101', date '2026-09-07', '08:30',
   '14000000-0000-4000-8000-000000000011', 'small', 'Full Groom', 'Booked'),
  ('14000000-0000-4000-8000-000000000102', date '2026-09-07', '09:00',
   '14000000-0000-4000-8000-000000000012', 'small', 'Full Groom', 'Booked');

select isnt(
  (select visit_id from public.bookings
    where id = '14000000-0000-4000-8000-000000000101'),
  null::uuid, 'an untouched legacy insert is assigned a visit');

select isnt(
  (select visit_id from public.bookings where id = '14000000-0000-4000-8000-000000000101'),
  (select visit_id from public.bookings where id = '14000000-0000-4000-8000-000000000102'),
  'unrelated null-group inserts stay separate singleton visits');

insert into public.bookings (id, booking_date, slot, dog_id, size, service, status, group_id) values
  ('14000000-0000-4000-8000-000000000103', date '2026-09-08', '08:30',
   '14000000-0000-4000-8000-000000000011', 'small', 'Full Groom', 'Booked',
   '14000000-0000-4000-8000-000000000900'),
  ('14000000-0000-4000-8000-000000000104', date '2026-09-08', '09:00',
   '14000000-0000-4000-8000-000000000012', 'small', 'Bath & Brush', 'Booked',
   '14000000-0000-4000-8000-000000000900'),
  ('14000000-0000-4000-8000-000000000105', date '2026-09-21', '08:30',
   '14000000-0000-4000-8000-000000000011', 'small', 'Full Groom', 'Booked',
   '14000000-0000-4000-8000-000000000900');

select is(
  (select visit_id from public.bookings where id = '14000000-0000-4000-8000-000000000103'),
  (select visit_id from public.bookings where id = '14000000-0000-4000-8000-000000000104'),
  'one dated group shares one visit');

select isnt(
  (select visit_id from public.bookings where id = '14000000-0000-4000-8000-000000000103'),
  (select visit_id from public.bookings where id = '14000000-0000-4000-8000-000000000105'),
  'a recurring chain splits into one visit per date');

select is(
  (select v.policy_code from public.booking_visits v
    where v.id = (select visit_id from public.bookings
                   where id = '14000000-0000-4000-8000-000000000103')),
  'legacy_24h',
  'an ordinary legacy visit is commercially confirmed under legacy_24h');

select ok(
  (select count(*) = 0 from public.bookings where visit_id is null),
  'no booking row is left without a visit');

select is(
  (select count(*)::int from public.visit_rows(
     (select visit_id from public.bookings
       where id = '14000000-0000-4000-8000-000000000103'))),
  2, 'visit_rows returns the visit''s included rows');

select is(
  public.visit_start_at(
    (select visit_id from public.bookings
      where id = '14000000-0000-4000-8000-000000000103')),
  timestamptz '2026-09-08 08:30:00 Europe/London',
  'visit_start_at is the earliest slot in London time');

-- ── 18: the staff group command creates exactly one visit ──────────

select ok(
  (select count(*) = 2 and count(distinct visit_id) = 1
     from public.create_staff_booking_group(
       jsonb_build_array(
         jsonb_build_object('dog_id', '14000000-0000-4000-8000-000000000011',
                            'slot', '08:30', 'service', 'Full Groom'),
         jsonb_build_object('dog_id', '14000000-0000-4000-8000-000000000012',
                            'slot', '09:00', 'service', 'Full Groom')
       ),
       date '2026-09-14')),
  'a two-dog staff command creates exactly one visit');

-- ── 19-23: the visit axis matrix rejects impossible direct writes ──

set constraints all immediate;

insert into public.booking_lineages (id, human_id) values
  ('14000000-0000-4000-8000-000000000301', '14000000-0000-4000-8000-000000000010'),
  ('14000000-0000-4000-8000-000000000302', '14000000-0000-4000-8000-000000000010'),
  ('14000000-0000-4000-8000-000000000303', '14000000-0000-4000-8000-000000000020'),
  ('14000000-0000-4000-8000-000000000304', '14000000-0000-4000-8000-000000000020'),
  ('14000000-0000-4000-8000-000000000305', '14000000-0000-4000-8000-000000000020'),
  ('14000000-0000-4000-8000-000000000306', '14000000-0000-4000-8000-000000000020'),
  ('14000000-0000-4000-8000-000000000307', '14000000-0000-4000-8000-000000000020');

select throws_ok(
  $$ insert into public.booking_visits
       (lineage_id, human_id, booking_date, lifecycle_state, approval_state,
        confirmation_state, policy_code, confirmed_at, customer_change_deadline_at,
        runtime_generation, legacy_compat_key)
     values ('14000000-0000-4000-8000-000000000301',
             '14000000-0000-4000-8000-000000000010', date '2026-10-01',
             'active', 'waiting_staff', 'confirmed', 'legacy_24h', now(), now(),
             'legacy_compat', 'test:axis1') $$,
  'P0001', null, 'confirmed + waiting staff is impossible');

select throws_ok(
  $$ insert into public.booking_visits
       (lineage_id, human_id, booking_date, lifecycle_state, approval_state,
        confirmation_state, completed_at, runtime_generation, legacy_compat_key)
     values ('14000000-0000-4000-8000-000000000301',
             '14000000-0000-4000-8000-000000000010', date '2026-10-01',
             'completed', 'not_required', 'unconfirmed', now(),
             'legacy_compat', 'test:axis2') $$,
  'P0001', null, 'completed visits must be confirmed');

select throws_ok(
  $$ insert into public.booking_visits
       (lineage_id, human_id, booking_date, lifecycle_state, approval_state,
        confirmation_state, policy_code, confirmed_at, customer_change_deadline_at,
        runtime_generation, legacy_compat_key)
     values ('14000000-0000-4000-8000-000000000301',
             '14000000-0000-4000-8000-000000000010', date '2026-10-01',
             'withdrawn', 'not_required', 'confirmed', 'legacy_24h', now(), now(),
             'legacy_compat', 'test:axis3') $$,
  'P0001', null, 'withdrawn visits are never confirmed');

select throws_ok(
  $$ insert into public.booking_visits
       (lineage_id, human_id, booking_date, lifecycle_state, approval_state,
        confirmation_state, cancelled_at, runtime_generation, legacy_compat_key)
     values ('14000000-0000-4000-8000-000000000301',
             '14000000-0000-4000-8000-000000000010', date '2026-10-01',
             'active', 'not_required', 'unconfirmed', now(),
             'legacy_compat', 'test:axis4') $$,
  'P0001', null, 'a stray terminal timestamp is rejected');

select lives_ok(
  $$ insert into public.booking_visits
       (id, lineage_id, human_id, booking_date, lifecycle_state, approval_state,
        confirmation_state, runtime_generation, legacy_compat_key)
     values ('14000000-0000-4000-8000-000000000310',
             '14000000-0000-4000-8000-000000000301',
             '14000000-0000-4000-8000-000000000010', date '2026-10-01',
             'active', 'approved', 'unconfirmed',
             'legacy_compat', 'test:deposit-hold') $$,
  'the unconfirmed approved deposit hold remains legitimate');

-- Lineage identity and predecessor edges are fixed at insert time even before
-- any successor exists. The independent row_revision remains mutable.
select throws_ok(
  $$ update public.booking_visits
        set revision = 2
      where id = '14000000-0000-4000-8000-000000000310' $$,
  'P0001', null,
  'a standalone visit cannot rewrite its lineage ordinal');

select throws_ok(
  $$ update public.booking_visits
        set lineage_id = '14000000-0000-4000-8000-000000000302'
      where id = '14000000-0000-4000-8000-000000000310' $$,
  'P0001', null,
  'a standalone visit cannot move to another lineage');

select throws_ok(
  $$ update public.booking_visits
        set supersedes_visit_id = (
          select visit_id from public.bookings
           where id = '14000000-0000-4000-8000-000000000101')
      where id = '14000000-0000-4000-8000-000000000310' $$,
  'P0001', null,
  'a standalone visit cannot acquire a predecessor after insert');

select lives_ok(
  $$ update public.booking_visits
        set row_revision = row_revision + 1
      where id = '14000000-0000-4000-8000-000000000310' $$,
  'a standalone visit may advance its optimistic row revision');

-- ── Lineage edges ───────────────────────────────────────────────────

-- A valid replacement chain: rev1 superseded, rev2 active.
insert into public.booking_visits
  (id, lineage_id, human_id, booking_date, lifecycle_state, approval_state,
   confirmation_state, policy_code, confirmed_at, customer_change_deadline_at,
   runtime_generation, legacy_compat_key, revision)
values
  ('14000000-0000-4000-8000-000000000320',
   '14000000-0000-4000-8000-000000000303',
   '14000000-0000-4000-8000-000000000020', date '2026-10-05',
   'superseded', 'not_required', 'confirmed', 'legacy_24h', now(), now(),
   'legacy_compat', 'test:pred1', 1);

select lives_ok(
  $$ insert into public.booking_visits
       (id, lineage_id, human_id, booking_date, lifecycle_state, approval_state,
        confirmation_state, runtime_generation, legacy_compat_key, revision,
        supersedes_visit_id)
     values ('14000000-0000-4000-8000-000000000321',
             '14000000-0000-4000-8000-000000000303',
             '14000000-0000-4000-8000-000000000020', date '2026-10-06',
             'active', 'not_required', 'unconfirmed',
             'legacy_compat', 'test:succ1', 2,
             '14000000-0000-4000-8000-000000000320') $$,
  'a well-formed replacement commits');

select throws_ok(
  $$ update public.booking_visits set revision = 5
      where id = '14000000-0000-4000-8000-000000000320' $$,
  'P0001', null,
  'a predecessor cannot be rewritten once its successor exists');

select lives_ok(
  $$ update public.booking_visits set source = 'staff-row-version-test'
      where id = '14000000-0000-4000-8000-000000000320' $$,
  'an ordinary predecessor update may advance without rewriting its lineage ordinal');

select is(
  (select revision::text || '|' || row_revision::text
     from public.booking_visits
    where id = '14000000-0000-4000-8000-000000000320'),
  '1|2',
  'optimistic locking is independent of the immutable lineage ordinal');

-- Wrong revision: rev1 superseded predecessor, rev3 successor.
insert into public.booking_visits
  (id, lineage_id, human_id, booking_date, lifecycle_state, approval_state,
   confirmation_state, policy_code, confirmed_at, customer_change_deadline_at,
   runtime_generation, legacy_compat_key, revision)
values
  ('14000000-0000-4000-8000-000000000322',
   '14000000-0000-4000-8000-000000000304',
   '14000000-0000-4000-8000-000000000020', date '2026-10-05',
   'superseded', 'not_required', 'confirmed', 'legacy_24h', now(), now(),
   'legacy_compat', 'test:pred2', 1);

select throws_ok(
  $$ insert into public.booking_visits
       (lineage_id, human_id, booking_date, lifecycle_state, approval_state,
        confirmation_state, runtime_generation, legacy_compat_key, revision,
        supersedes_visit_id)
     values ('14000000-0000-4000-8000-000000000304',
             '14000000-0000-4000-8000-000000000020', date '2026-10-06',
             'active', 'not_required', 'unconfirmed',
             'legacy_compat', 'test:succ2', 3,
             '14000000-0000-4000-8000-000000000322') $$,
  'P0001', null, 'a skipped replacement revision is rejected');

select throws_ok(
  $$ insert into public.booking_visits
       (lineage_id, human_id, booking_date, lifecycle_state, approval_state,
        confirmation_state, runtime_generation, legacy_compat_key, revision,
        supersedes_visit_id, continues_cancelled_visit_id)
     values ('14000000-0000-4000-8000-000000000304',
             '14000000-0000-4000-8000-000000000020', date '2026-10-06',
             'active', 'not_required', 'unconfirmed',
             'legacy_compat', 'test:succ3', 2,
             '14000000-0000-4000-8000-000000000322',
             '14000000-0000-4000-8000-000000000322') $$,
  '23514', null, 'a visit cannot carry both lineage edge kinds');

select throws_ok(
  $$ insert into public.booking_visits
       (lineage_id, human_id, booking_date, lifecycle_state, approval_state,
        confirmation_state, runtime_generation, legacy_compat_key, revision,
        supersedes_visit_id)
     values ('14000000-0000-4000-8000-000000000301',
             '14000000-0000-4000-8000-000000000010', date '2026-10-06',
             'active', 'not_required', 'unconfirmed',
             'legacy_compat', 'test:succ4', 2,
             '14000000-0000-4000-8000-000000000322') $$,
  null, 'a cross-human replacement is rejected');

-- An active predecessor cannot be replaced.
insert into public.booking_visits
  (id, lineage_id, human_id, booking_date, lifecycle_state, approval_state,
   confirmation_state, policy_code, confirmed_at, customer_change_deadline_at,
   runtime_generation, legacy_compat_key, revision)
values
  ('14000000-0000-4000-8000-000000000323',
   '14000000-0000-4000-8000-000000000305',
   '14000000-0000-4000-8000-000000000020', date '2026-10-05',
   'active', 'not_required', 'confirmed', 'legacy_24h', now(), now(),
   'legacy_compat', 'test:pred3', 1);

-- The successor is withdrawn so the one-active-per-lineage index stays out of
-- the way and the lineage-edge rule itself is what rejects the insert.
select throws_ok(
  $$ insert into public.booking_visits
       (lineage_id, human_id, booking_date, lifecycle_state, approval_state,
        confirmation_state, runtime_generation, legacy_compat_key, revision,
        supersedes_visit_id)
     values ('14000000-0000-4000-8000-000000000305',
             '14000000-0000-4000-8000-000000000020', date '2026-10-06',
             'withdrawn', 'not_required', 'unconfirmed',
             'legacy_compat', 'test:succ5', 2,
             '14000000-0000-4000-8000-000000000323') $$,
  'P0001', null, 'replacing a still-active visit is rejected');

select throws_ok(
  $$ insert into public.booking_lineages (human_id, self_service_reschedule_count)
     values ('14000000-0000-4000-8000-000000000020', 4) $$,
  '23514', null, 'the self-service reschedule count is capped at three');

-- ── 31-33: the cancellation rebook window ──────────────────────────

insert into public.booking_visits
  (id, lineage_id, human_id, booking_date, lifecycle_state, approval_state,
   confirmation_state, policy_code, confirmed_at, customer_change_deadline_at,
   runtime_generation, legacy_compat_key, revision, cancelled_at)
values
  ('14000000-0000-4000-8000-000000000324',
   '14000000-0000-4000-8000-000000000306',
   '14000000-0000-4000-8000-000000000020', date '2026-10-08',
   'cancelled', 'not_required', 'confirmed', 'legacy_24h',
   timestamptz '2026-09-01 09:00:00+00', timestamptz '2026-10-07 08:30:00+00',
   'legacy_compat', 'test:pred4', 1,
   timestamptz '2026-09-01 10:00:00+00');

insert into public.bookings
  (id, booking_date, slot, dog_id, size, service, status, visit_id)
values
  ('14000000-0000-4000-8000-000000000401', date '2026-10-08', '08:30',
   '14000000-0000-4000-8000-000000000021', 'small', 'Full Groom', 'Cancelled',
   '14000000-0000-4000-8000-000000000324');

-- The continuation and its child rows must land together, so this block
-- defers the edge check and then forces it, first for the on-time rebook…
set constraints ct_booking_visit_lineage_edges deferred;

insert into public.booking_visits
  (id, lineage_id, human_id, booking_date, lifecycle_state, approval_state,
   confirmation_state, runtime_generation, legacy_compat_key, revision,
   continues_cancelled_visit_id, created_at)
values
  ('14000000-0000-4000-8000-000000000325',
   '14000000-0000-4000-8000-000000000306',
   '14000000-0000-4000-8000-000000000020', date '2026-10-12',
   'active', 'not_required', 'unconfirmed',
   'legacy_compat', 'test:succ6', 2,
   '14000000-0000-4000-8000-000000000324',
   timestamptz '2026-09-02 10:00:00+00'); -- exactly 24 hours later

insert into public.bookings
  (id, booking_date, slot, dog_id, size, service, status, visit_id)
values
  ('14000000-0000-4000-8000-000000000402', date '2026-10-12', '08:30',
   '14000000-0000-4000-8000-000000000021', 'small', 'Full Groom', 'Booked',
   '14000000-0000-4000-8000-000000000325');

select lives_ok(
  $$ set constraints all immediate $$,
  'a rebook at exactly 24 hours with identical dogs and services commits');

-- …then one microsecond too late.
insert into public.booking_visits
  (id, lineage_id, human_id, booking_date, lifecycle_state, approval_state,
   confirmation_state, policy_code, confirmed_at, customer_change_deadline_at,
   runtime_generation, legacy_compat_key, revision, cancelled_at)
values
  ('14000000-0000-4000-8000-000000000326',
   '14000000-0000-4000-8000-000000000307',
   '14000000-0000-4000-8000-000000000020', date '2026-10-09',
   'cancelled', 'not_required', 'confirmed', 'legacy_24h',
   timestamptz '2026-09-01 09:00:00+00', timestamptz '2026-10-08 08:30:00+00',
   'legacy_compat', 'test:pred5', 1,
   timestamptz '2026-09-01 10:00:00+00');

insert into public.bookings
  (id, booking_date, slot, dog_id, size, service, status, visit_id)
values
  ('14000000-0000-4000-8000-000000000403', date '2026-10-09', '08:30',
   '14000000-0000-4000-8000-000000000021', 'small', 'Full Groom', 'Cancelled',
   '14000000-0000-4000-8000-000000000326');

select throws_ok(
  $q$
  do $body$
  begin
    set constraints ct_booking_visit_lineage_edges deferred;
    insert into public.booking_visits
      (id, lineage_id, human_id, booking_date, lifecycle_state, approval_state,
       confirmation_state, runtime_generation, legacy_compat_key, revision,
       continues_cancelled_visit_id, created_at)
    values
      ('14000000-0000-4000-8000-000000000327',
       '14000000-0000-4000-8000-000000000307',
       '14000000-0000-4000-8000-000000000020', date '2026-10-13',
       'active', 'not_required', 'unconfirmed',
       'legacy_compat', 'test:succ7', 2,
       '14000000-0000-4000-8000-000000000326',
       timestamptz '2026-09-02 10:00:00.000001+00');
    insert into public.bookings
      (id, booking_date, slot, dog_id, size, service, status, visit_id)
    values
      ('14000000-0000-4000-8000-000000000404', date '2026-10-13', '08:30',
       '14000000-0000-4000-8000-000000000021', 'small', 'Full Groom', 'Booked',
       '14000000-0000-4000-8000-000000000327');
    set constraints all immediate;
  end
  $body$;
  $q$,
  'P0001', null,
  'a rebook one microsecond past 24 hours loses the lineage');

-- A rebook that changes the service also fails the canonical-pair rule.
select throws_ok(
  $q$
  do $body$
  begin
    set constraints ct_booking_visit_lineage_edges deferred;
    insert into public.booking_visits
      (id, lineage_id, human_id, booking_date, lifecycle_state, approval_state,
       confirmation_state, runtime_generation, legacy_compat_key, revision,
       continues_cancelled_visit_id, created_at)
    values
      ('14000000-0000-4000-8000-000000000328',
       '14000000-0000-4000-8000-000000000307',
       '14000000-0000-4000-8000-000000000020', date '2026-10-14',
       'active', 'not_required', 'unconfirmed',
       'legacy_compat', 'test:succ8', 2,
       '14000000-0000-4000-8000-000000000326',
       timestamptz '2026-09-01 12:00:00+00');
    insert into public.bookings
      (id, booking_date, slot, dog_id, size, service, status, visit_id)
    values
      ('14000000-0000-4000-8000-000000000405', date '2026-10-14', '08:30',
       '14000000-0000-4000-8000-000000000021', 'small', 'Bath & Brush', 'Booked',
       '14000000-0000-4000-8000-000000000328');
    set constraints all immediate;
  end
  $body$;
  $q$,
  'P0001', null,
  'a rebook with different services loses the lineage');

set constraints all immediate;

-- ── 34-44: backfill review and audited reconciliation ──────────────

select ok(
  (select public.get_booking_visit_backfill_review() @>
     jsonb_build_array(jsonb_build_object(
       'reason_code', 'structural_possible_multi_dog'))),
  'near-simultaneous singleton rows surface as a possible multi-dog visit');

-- A non-staff caller cannot read the review list.
select set_config(
  'request.jwt.claims',
  '{"sub":"14000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
select throws_ok(
  $$ select public.get_booking_visit_backfill_review() $$,
  '42501', null, 'the review list is staff-only');
select set_config(
  'request.jwt.claims',
  '{"sub":"14000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

-- Preview is staff-readable and returns the hash apply must echo.
select ok(
  (select length(
     public.preview_booking_visit_backfill_reconciliation(
       (select review_key from public.booking_visit_backfill_review
         where reason_code = 'structural_possible_multi_dog' limit 1),
       'merge_singletons', '{}'::jsonb
     ) ->> 'expectedHash') = 32),
  'preview returns the row-set hash apply must receive');

-- Apply is owner-only: an application role cannot execute it.
set local role authenticated;
select throws_ok(
  $$ select public.apply_booking_visit_backfill_reconciliation(
       'anything', 'hash', 'merge_singletons', '{}'::jsonb, 'reason',
       '14000000-0000-4000-8000-000000000501') $$,
  '42501', null, 'apply is not executable by application roles');
reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"14000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

-- A stale hash is rejected.
select throws_ok(
  format(
    $f$ select public.apply_booking_visit_backfill_reconciliation(
          %L, 'not-the-current-hash', 'merge_singletons',
          jsonb_build_object('targetVisitId',
            (select visit_id from public.bookings
              where id = '14000000-0000-4000-8000-000000000101')::text),
          'stale test', '14000000-0000-4000-8000-000000000502') $f$,
    (select review_key from public.booking_visit_backfill_review
      where reason_code = 'structural_possible_multi_dog' limit 1)),
  'P0001', null, 'a stale row-set hash is rejected');

-- Merge the two singletons into one visit (owner apply).
select lives_ok(
  format(
    $f$ select public.apply_booking_visit_backfill_reconciliation(
          %L, %L, 'merge_singletons',
          jsonb_build_object('targetVisitId',
            (select visit_id from public.bookings
              where id = '14000000-0000-4000-8000-000000000101')::text),
          'confirmed one visit with the customer',
          '14000000-0000-4000-8000-000000000503') $f$,
    (select review_key from public.booking_visit_backfill_review
      where reason_code = 'structural_possible_multi_dog' limit 1),
    (select row_set_hash from public.booking_visit_backfill_review
      where reason_code = 'structural_possible_multi_dog' limit 1)),
  'an owner apply with the current hash succeeds');

select is(
  (select visit_id from public.bookings where id = '14000000-0000-4000-8000-000000000102'),
  (select visit_id from public.bookings where id = '14000000-0000-4000-8000-000000000101'),
  'merge_singletons moves membership onto the target visit');

select ok(
  (select count(*) = 2 from public.bookings
    where id in ('14000000-0000-4000-8000-000000000101',
                 '14000000-0000-4000-8000-000000000102')
      and payment = 'Due at Pick-up'),
  'a structural apply never touches money fields');

-- Replaying the same idempotency key is a no-op replay, not a second apply.
select ok(
  (select (public.apply_booking_visit_backfill_reconciliation(
     (select review_key from public.booking_visit_backfill_reconciliation_audit
       where idempotency_key = '14000000-0000-4000-8000-000000000503'),
     'any-hash', 'merge_singletons', '{}'::jsonb, 'replay',
     '14000000-0000-4000-8000-000000000503') ->> 'replayed')::boolean),
  'a replayed idempotency key returns the recorded result');

select throws_ok(
  $$ update public.booking_visit_backfill_reconciliation_audit
        set reason = 'rewritten'
      where idempotency_key = '14000000-0000-4000-8000-000000000503' $$,
  'P0001', null, 'reconciliation audit rows are immutable');

-- exclude_terminal_children: a mixed-status group keeps its history but the
-- cancelled row leaves the visit aggregate.
update public.bookings set status = 'Cancelled', cancel_reason = 'fixture'
 where id = '14000000-0000-4000-8000-000000000103';

select lives_ok(
  format(
    $f$ select public.apply_booking_visit_backfill_reconciliation(
          %L, %L, 'exclude_terminal_children',
          jsonb_build_object('bookingIds',
            jsonb_build_array('14000000-0000-4000-8000-000000000103')),
          'cancelled dog no longer part of the visit',
          '14000000-0000-4000-8000-000000000504') $f$,
    (select review_key from public.booking_visit_backfill_review
      where review_key like 'mixedstatus:%' limit 1),
    (select row_set_hash from public.booking_visit_backfill_review
      where review_key like 'mixedstatus:%' limit 1)),
  'exclude_terminal_children applies to a mixed-status visit');

select is(
  (select visit_membership_state from public.bookings
    where id = '14000000-0000-4000-8000-000000000103'),
  'removed',
  'the excluded terminal row leaves the aggregate without losing history');

select * from finish();
rollback;

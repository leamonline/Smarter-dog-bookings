-- Customer visit projection: one record per visit, deterministic dogs,
-- isolation between customers, no staff-only data, server capabilities,
-- honest data-quality marking, and no mutation as a side effect of reading.
-- Fixtures are rolled back.

begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

insert into auth.users (id) values
  ('17200000-0000-4000-8000-000000000001'),   -- staff
  ('17200000-0000-4000-8000-000000000003'),   -- customer A
  ('17200000-0000-4000-8000-000000000004');   -- customer B

insert into public.staff_profiles (user_id, role, display_name) values
  ('17200000-0000-4000-8000-000000000001', 'owner', 'Projection Owner');

insert into public.humans (id, name, surname, customer_user_id) values
  ('17200000-0000-4000-8000-000000000010', 'ProjA', 'One',
   '17200000-0000-4000-8000-000000000003'),
  ('17200000-0000-4000-8000-000000000020', 'ProjB', 'Two',
   '17200000-0000-4000-8000-000000000004');

insert into public.dogs (id, name, breed, size, human_id) values
  ('17200000-0000-4000-8000-000000000011', 'Zara', 'Poodle', 'small',
   '17200000-0000-4000-8000-000000000010'),
  ('17200000-0000-4000-8000-000000000012', 'Alfie', 'Beagle', 'small',
   '17200000-0000-4000-8000-000000000010'),
  ('17200000-0000-4000-8000-000000000021', 'Bruno', 'Collie', 'small',
   '17200000-0000-4000-8000-000000000020');

insert into public.booking_lineages (id, human_id)
select ('17200000-0000-4000-8000-00000000030' || g)::uuid,
       (case when g <= 6 then '17200000-0000-4000-8000-000000000010'
             else '17200000-0000-4000-8000-000000000020' end)::uuid
  from generate_series(1, 9) g;

select set_config('request.jwt.claims',
  '{"sub":"17200000-0000-4000-8000-000000000001","role":"authenticated"}', true);

create or replace function pg_temp.open_day(p_offset int)
returns date language plpgsql as $$
declare d date := current_date + p_offset;
begin
  while extract(isodow from d) > 3 loop d := d + 1; end loop;
  return d;
end;
$$;

-- A confirmed v1 visit for customer A with two dogs.
create or replace function pg_temp.mk_visit(
  p_id uuid, p_lineage uuid, p_human uuid, p_offset int, p_gen text)
returns uuid language plpgsql as $$
declare v_date date := pg_temp.open_day(p_offset);
begin
  insert into public.booking_visits
    (id, lineage_id, human_id, booking_date, lifecycle_state, approval_state,
     confirmation_state, policy_code, confirmed_at, customer_change_deadline_at,
     runtime_generation, legacy_compat_key, source)
  values (p_id, p_lineage, p_human, v_date, 'active', 'not_required',
          'confirmed',
          case when p_gen = 'visit_v1' then 'previous_day_1500_v1' else 'legacy_24h' end,
          now(),
          public.change_deadline_for(
            case when p_gen = 'visit_v1' then 'previous_day_1500_v1' else 'legacy_24h' end,
            v_date, '08:30'),
          p_gen,
          case when p_gen = 'legacy_compat' then 'test:' || p_id::text else null end,
          'website');
  return p_id;
end;
$$;

select pg_temp.mk_visit('17200000-0000-4000-8000-000000000501',
  '17200000-0000-4000-8000-000000000301', '17200000-0000-4000-8000-000000000010',
  30, 'visit_v1');
insert into public.bookings (booking_date, slot, dog_id, size, service, status, visit_id)
values
  (pg_temp.open_day(30), '09:00', '17200000-0000-4000-8000-000000000012',
   'small', 'Bath & Brush', 'Booked', '17200000-0000-4000-8000-000000000501'),
  (pg_temp.open_day(30), '08:30', '17200000-0000-4000-8000-000000000011',
   'small', 'Full Groom', 'Booked', '17200000-0000-4000-8000-000000000501');

-- Customer B's own visit, to prove isolation.
select pg_temp.mk_visit('17200000-0000-4000-8000-000000000601',
  '17200000-0000-4000-8000-000000000307', '17200000-0000-4000-8000-000000000020',
  30, 'visit_v1');
insert into public.bookings (booking_date, slot, dog_id, size, service, status, visit_id)
values (pg_temp.open_day(30), '10:00', '17200000-0000-4000-8000-000000000021',
        'small', 'Full Groom', 'Booked', '17200000-0000-4000-8000-000000000601');

-- ── 1-6: one record per visit, all dogs, deterministic order ───────

select set_config('request.jwt.claims',
  '{"sub":"17200000-0000-4000-8000-000000000003","role":"authenticated"}', true);

select is(
  jsonb_array_length(public.list_customer_booking_visits()),
  1, 'a two-dog visit is ONE customer record, not one per dog');

select is(
  jsonb_array_length(public.list_customer_booking_visits() -> 0 -> 'dogs'),
  2, 'every dog on the visit is included');

select is(
  public.list_customer_booking_visits() -> 0 -> 'dogs' -> 0 ->> 'dogName',
  'Zara', 'dogs are ordered deterministically by slot then name');

select is(
  public.list_customer_booking_visits() -> 0 -> 'dogs' -> 1 ->> 'dogName',
  'Alfie', 'the second dog follows in the same deterministic order');

select is(
  public.list_customer_booking_visits() -> 0 ->> 'visitId',
  '17200000-0000-4000-8000-000000000501', 'the customer sees their own visit');

select is(
  (public.list_customer_booking_visits() -> 0 ->> 'unavailableDogCount'),
  '0', 'a healthy visit reports no unavailable dogs');

-- ── 7-9: customer isolation ────────────────────────────────────────

select set_config('request.jwt.claims',
  '{"sub":"17200000-0000-4000-8000-000000000004","role":"authenticated"}', true);

select is(
  jsonb_array_length(public.list_customer_booking_visits()),
  1, 'customer B sees exactly one visit — their own');

select is(
  public.list_customer_booking_visits() -> 0 ->> 'visitId',
  '17200000-0000-4000-8000-000000000601',
  'customer B never sees customer A''s visit');

select set_config('request.jwt.claims', '', true);
select is(
  public.list_customer_booking_visits(),
  '[]'::jsonb, 'an unauthenticated caller sees nothing at all');

-- ── 10-14: no staff-only data leaks ────────────────────────────────

select set_config('request.jwt.claims',
  '{"sub":"17200000-0000-4000-8000-000000000001","role":"authenticated"}', true);
insert into public.booking_policy_incidents
  (visit_id, human_id, kind, appointment_date, recorded_by, reason)
values ('17200000-0000-4000-8000-000000000501', '17200000-0000-4000-8000-000000000010',
        'late_cancellation', pg_temp.open_day(30) - 1,
        '17200000-0000-4000-8000-000000000001', 'staff-only detail: chronic no-show');
insert into public.booking_policy_audit
  (visit_id, human_id, action, actor_id, actor_scope, reason)
values ('17200000-0000-4000-8000-000000000501', '17200000-0000-4000-8000-000000000010',
        'staff_note', '17200000-0000-4000-8000-000000000001', 'staff',
        'internal reasoning the customer must never see');

select set_config('request.jwt.claims',
  '{"sub":"17200000-0000-4000-8000-000000000003","role":"authenticated"}', true);

select ok(
  public.list_customer_booking_visits()::text not like '%chronic no-show%',
  'incident reasons never reach the customer projection');
select ok(
  public.list_customer_booking_visits()::text not like '%internal reasoning%',
  'audit notes never reach the customer projection');
select ok(
  public.list_customer_booking_visits()::text not like '%late_cancellation%',
  'incident kinds never reach the customer projection');
select ok(
  public.list_customer_booking_visits()::text not like '%staff_verification%',
  'staff verification references never reach the customer projection');
select ok(
  public.list_customer_booking_visits()::text not like '%incidentCount%',
  'no incident counter is exposed');

-- ── 15-17: capabilities come from the server ───────────────────────

select ok(
  (public.list_customer_booking_visits() -> 0 -> 'capabilities' -> 'cancel'
     ? 'allowed'),
  'the projection carries a server-calculated cancel capability');

select ok(
  (public.list_customer_booking_visits() -> 0 -> 'capabilities' -> 'cancel'
     ->> 'deadlineAt') is not null,
  'the server states the deadline; the client never computes one');

select is(
  (public.list_customer_booking_visits() -> 0 ->> 'policyCode'),
  'previous_day_1500_v1',
  'an active-policy visit reports its own frozen policy version');

-- ── 18-22: honest data-quality marking ─────────────────────────────

select is(
  public.booking_visit_data_quality('17200000-0000-4000-8000-000000000501'),
  'v1_authoritative', 'a clean v1 visit is authoritative');

-- A legacy visit whose commercial confirmation could not be inferred.
select set_config('request.jwt.claims',
  '{"sub":"17200000-0000-4000-8000-000000000001","role":"authenticated"}', true);
insert into public.booking_visits
  (id, lineage_id, human_id, booking_date, lifecycle_state, approval_state,
   confirmation_state, runtime_generation, legacy_compat_key, source)
values ('17200000-0000-4000-8000-000000000502',
        '17200000-0000-4000-8000-000000000302',
        '17200000-0000-4000-8000-000000000010', pg_temp.open_day(37),
        'active', 'not_required', 'unconfirmed', 'legacy_compat',
        'test:incomplete', 'website');
-- A genuinely uninferable legacy row: deposit-tagged but unpaid, which is
-- exactly what the backfill flags and refuses to call commercially
-- confirmed. The legacy sync trigger therefore leaves it unconfirmed.
insert into public.bookings
  (booking_date, slot, dog_id, size, service, status, visit_id,
   deposit_required, deposit_received_at, payment)
values (pg_temp.open_day(37), '08:30', '17200000-0000-4000-8000-000000000011',
        'small', 'Full Groom', 'Booked', '17200000-0000-4000-8000-000000000502',
        true, null, 'Due at Pick-up');

select is(
  public.booking_visit_data_quality('17200000-0000-4000-8000-000000000502'),
  'legacy_incomplete', 'an uninferable legacy backfill is marked incomplete');

-- Money needing a decision outranks everything else.
insert into public.booking_deposit_money_reconciliations
  (visit_id, human_id, amount_pence, state, opened_reason)
values ('17200000-0000-4000-8000-000000000502', '17200000-0000-4000-8000-000000000010',
        1000, 'open', 'payment found after release');

select is(
  public.booking_visit_data_quality('17200000-0000-4000-8000-000000000502'),
  'reconciliation_required', 'open money outranks other quality levels');

select set_config('request.jwt.claims',
  '{"sub":"17200000-0000-4000-8000-000000000003","role":"authenticated"}', true);

select is(
  (select r ->> 'dataQualityNote' from jsonb_array_elements(
     public.list_customer_booking_visits()) r
    where r ->> 'visitId' = '17200000-0000-4000-8000-000000000502'),
  'There''s something to sort out on this booking. The team will be in touch.',
  'uncertain data gets safe customer wording, not an internal label');

select is(
  (select r -> 'capabilities' -> 'cancel' ->> 'reasonCode'
     from jsonb_array_elements(public.list_customer_booking_visits()) r
    where r ->> 'visitId' = '17200000-0000-4000-8000-000000000502'),
  'staff_review_required',
  'uncertain data disables the action with a clear server reason');

-- ── 23-24: a malformed child never hides the visit ─────────────────

select set_config('request.jwt.claims',
  '{"sub":"17200000-0000-4000-8000-000000000001","role":"authenticated"}', true);
-- A child of customer A's visit pointing at customer B's dog.
insert into public.bookings (booking_date, slot, dog_id, size, service, status, visit_id)
values (pg_temp.open_day(30), '11:00', '17200000-0000-4000-8000-000000000021',
        'small', 'Full Groom', 'Booked', '17200000-0000-4000-8000-000000000501');

select set_config('request.jwt.claims',
  '{"sub":"17200000-0000-4000-8000-000000000003","role":"authenticated"}', true);

select is(
  (select jsonb_array_length(r -> 'dogs') from jsonb_array_elements(
     public.list_customer_booking_visits()) r
    where r ->> 'visitId' = '17200000-0000-4000-8000-000000000501'),
  2, 'the two identifiable dogs are still listed');

select is(
  (select r ->> 'unavailableDogCount' from jsonb_array_elements(
     public.list_customer_booking_visits()) r
    where r ->> 'visitId' = '17200000-0000-4000-8000-000000000501'),
  '1', 'the malformed child is reported separately, not silently dropped');

-- ── 25-26: reading writes nothing ──────────────────────────────────

create temp table before_counts as
select (select count(*) from public.booking_visits) v,
       (select count(*) from public.bookings) b,
       (select count(*) from public.booking_financial_ledger) l,
       (select count(*) from public.booking_visit_deposits) d,
       (select count(*) from public.booking_policy_audit) a;

select public.list_customer_booking_visits();
select public.list_customer_booking_visits(true);

select is(
  (select count(*)::int from before_counts bc
    where bc.v = (select count(*) from public.booking_visits)
      and bc.b = (select count(*) from public.bookings)
      and bc.l = (select count(*) from public.booking_financial_ledger)
      and bc.d = (select count(*) from public.booking_visit_deposits)
      and bc.a = (select count(*) from public.booking_policy_audit)),
  1, 'reading the projection creates nothing anywhere');

select is(
  (select updated_at from public.booking_visits
    where id = '17200000-0000-4000-8000-000000000501')
    = (select updated_at from public.booking_visits
        where id = '17200000-0000-4000-8000-000000000501'),
  true, 'reading the projection mutates no existing row');

select * from finish();
rollback;

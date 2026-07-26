-- Visit-level events and aggregate completion: one outcome per visit,
-- trusted request instants for deadline classification, and completion that
-- only fires when every included dog is finished. Fixtures are rolled back.

begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

insert into auth.users (id) values ('16500000-0000-4000-8000-000000000001');
insert into public.staff_profiles (user_id, role, display_name) values
  ('16500000-0000-4000-8000-000000000001', 'owner', 'Events Owner');

insert into public.humans (id, name, surname) values
  ('16500000-0000-4000-8000-000000000010', 'EventFixture165', 'One');
insert into public.dogs (id, name, breed, size, human_id) values
  ('16500000-0000-4000-8000-000000000011', 'Juliet', 'Poodle', 'small',
   '16500000-0000-4000-8000-000000000010'),
  ('16500000-0000-4000-8000-000000000012', 'Kilo', 'Beagle', 'small',
   '16500000-0000-4000-8000-000000000010');

insert into public.booking_lineages (id, human_id) values
  ('16500000-0000-4000-8000-000000000301', '16500000-0000-4000-8000-000000000010'),
  ('16500000-0000-4000-8000-000000000302', '16500000-0000-4000-8000-000000000010'),
  ('16500000-0000-4000-8000-000000000303', '16500000-0000-4000-8000-000000000010');

select set_config(
  'request.jwt.claims',
  '{"sub":"16500000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

-- A confirmed two-dog v1 visit on a past open day, so completion is realistic.
create or replace function pg_temp.mk_visit(p_id uuid, p_lineage uuid, p_days int, p_dogs int)
returns date language plpgsql as $$
declare v_date date := current_date + p_days;
begin
  while extract(isodow from v_date) > 3 loop v_date := v_date + 1; end loop;
  insert into public.booking_visits
    (id, lineage_id, human_id, booking_date, lifecycle_state, approval_state,
     confirmation_state, policy_code, confirmed_at, customer_change_deadline_at,
     runtime_generation, source)
  values (p_id, p_lineage, '16500000-0000-4000-8000-000000000010', v_date,
          'active', 'not_required', 'confirmed', 'previous_day_1500_v1', now(),
          public.change_deadline_for('previous_day_1500_v1', v_date, '08:30'),
          'visit_v1', 'website');
  insert into public.bookings
    (booking_date, slot, dog_id, size, service, status, visit_id)
  values (v_date, '08:30', '16500000-0000-4000-8000-000000000011',
          'small', 'Full Groom', 'Booked', p_id);
  if p_dogs > 1 then
    insert into public.bookings
      (booking_date, slot, dog_id, size, service, status, visit_id)
    values (v_date, '09:00', '16500000-0000-4000-8000-000000000012',
            'small', 'Bath & Brush', 'Booked', p_id);
  end if;
  return v_date;
end;
$$;

-- ── 1-4: additive schema, historical rows untouched ───────────────

select has_column('public', 'booking_events', 'visit_id', 'booking_events gains visit_id');
select has_column('public', 'booking_events', 'requested_at', 'booking_events gains requested_at');
select has_column('public', 'booking_events', 'committed_at', 'booking_events gains committed_at');
select ok(
  (select count(*) = 0 from public.booking_events
    where event_type not in ('created','rescheduled','cancelled')
      and visit_id is null),
  'no historical row was rewritten into a v1 kind');

-- ── 5-8: one event per visit outcome, not one per dog ─────────────

select pg_temp.mk_visit('16500000-0000-4000-8000-000000000501',
  '16500000-0000-4000-8000-000000000301', 30, 2);

select ok(
  public.emit_booking_visit_event(
    '16500000-0000-4000-8000-000000000501', 'confirmed',
    'visit-confirmed:16500000-0000-4000-8000-000000000501') is not null,
  'a visit outcome emits one event');

select is(
  (select count(*)::int from public.booking_events
    where visit_id = '16500000-0000-4000-8000-000000000501'
      and event_type = 'confirmed'),
  1, 'a two-dog visit emits exactly one confirmed event');

-- The same outcome key is idempotent: a retry adds nothing.
select ok(
  public.emit_booking_visit_event(
    '16500000-0000-4000-8000-000000000501', 'confirmed',
    'visit-confirmed:16500000-0000-4000-8000-000000000501') is null,
  'a repeated outcome key emits nothing');
select is(
  (select count(*)::int from public.booking_events
    where outcome_key = 'visit-confirmed:16500000-0000-4000-8000-000000000501'),
  1, 'the outcome key stays unique');

-- ── 9-12: deadline classification uses the trusted request instant ─

select is(
  (select was_late from public.booking_visit_policy_events
    where outcome_key = 'visit-confirmed:16500000-0000-4000-8000-000000000501'),
  false, 'an on-time request is not late');

-- A delayed but signed on-time webhook: requested before the deadline,
-- committed after it. It must still report as on time. The deadline is moved
-- into the past so "committed after the deadline" is genuinely possible.
update public.booking_visits
   set customer_change_deadline_at = statement_timestamp() - interval '1 hour'
 where id = '16500000-0000-4000-8000-000000000501';

select public.emit_booking_visit_event(
  '16500000-0000-4000-8000-000000000501', 'cancelled',
  'visit-cancelled:16500000-0000-4000-8000-000000000501',
  (select customer_change_deadline_at - interval '2 hours'
     from public.booking_visits where id = '16500000-0000-4000-8000-000000000501'),
  'customer message arrived before the cutoff');

select is(
  (select was_late from public.booking_visit_policy_events
    where outcome_key = 'visit-cancelled:16500000-0000-4000-8000-000000000501'),
  false, 'a delayed but on-time request is not reclassified as late');

select ok(
  (select committed_at > requested_at from public.booking_visit_policy_events
    where outcome_key = 'visit-cancelled:16500000-0000-4000-8000-000000000501'),
  'the commit instant is retained separately from the request instant');

-- Exactly the deadline is on time; one microsecond later is late.
select pg_temp.mk_visit('16500000-0000-4000-8000-000000000502',
  '16500000-0000-4000-8000-000000000302', 40, 1);
select public.emit_booking_visit_event(
  '16500000-0000-4000-8000-000000000502', 'cancelled',
  'exact-deadline:16500000-0000-4000-8000-000000000502',
  (select customer_change_deadline_at from public.booking_visits
    where id = '16500000-0000-4000-8000-000000000502'));
select public.emit_booking_visit_event(
  '16500000-0000-4000-8000-000000000502', 'cancelled',
  'past-deadline:16500000-0000-4000-8000-000000000502',
  (select customer_change_deadline_at + interval '1 microsecond'
     from public.booking_visits where id = '16500000-0000-4000-8000-000000000502'));

select is(
  (select was_late from public.booking_visit_policy_events
    where outcome_key = 'exact-deadline:16500000-0000-4000-8000-000000000502'),
  false, 'exactly the deadline is on time');
select is(
  (select was_late from public.booking_visit_policy_events
    where outcome_key = 'past-deadline:16500000-0000-4000-8000-000000000502'),
  true, 'one microsecond past the deadline is late');

-- ── 13-19: aggregate completion ────────────────────────────────────

select is(
  (select lifecycle_state from public.booking_visits
    where id = '16500000-0000-4000-8000-000000000501'),
  'active', 'a fresh visit is active');

update public.bookings set status = 'Completed'
 where visit_id = '16500000-0000-4000-8000-000000000501' and slot = '08:30';

select is(
  (select lifecycle_state from public.booking_visits
    where id = '16500000-0000-4000-8000-000000000501'),
  'active', 'one completed dog leaves a two-dog visit active');

update public.bookings set status = 'Completed'
 where visit_id = '16500000-0000-4000-8000-000000000501' and slot = '09:00';

select is(
  (select lifecycle_state from public.booking_visits
    where id = '16500000-0000-4000-8000-000000000501'),
  'completed', 'every included dog completed finishes the visit');
select is(
  (select count(*)::int from public.booking_events
    where visit_id = '16500000-0000-4000-8000-000000000501'
      and event_type = 'completed'),
  1, 'completion emits exactly one visit event');

-- Correcting a child back out of Completed reopens without losing history.
update public.bookings set status = 'Booked'
 where visit_id = '16500000-0000-4000-8000-000000000501' and slot = '09:00';

select is(
  (select lifecycle_state from public.booking_visits
    where id = '16500000-0000-4000-8000-000000000501'),
  'active', 'correcting a child out of Completed reopens the visit');
select is(
  (select count(*)::int from public.booking_events
    where visit_id = '16500000-0000-4000-8000-000000000501'
      and event_type = 'completion_reopened'),
  1, 'reopening appends history rather than deleting the completed event');
select is(
  (select count(*)::int from public.booking_events
    where visit_id = '16500000-0000-4000-8000-000000000501'
      and event_type = 'completed'),
  1, 'the original completed event is still there');

-- An audited removed child is excluded from the completion decision.
select pg_temp.mk_visit('16500000-0000-4000-8000-000000000503',
  '16500000-0000-4000-8000-000000000303', 50, 2);
update public.bookings set visit_membership_state = 'removed'
 where visit_id = '16500000-0000-4000-8000-000000000503' and slot = '09:00';
update public.bookings set status = 'Completed'
 where visit_id = '16500000-0000-4000-8000-000000000503' and slot = '08:30';

select is(
  (select lifecycle_state from public.booking_visits
    where id = '16500000-0000-4000-8000-000000000503'),
  'completed',
  'a removed child is excluded, so the remaining dog completes the visit');

-- ── 20: a terminal visit never reopens through a child edit ────────

update public.booking_visits
   set lifecycle_state = 'cancelled', cancelled_at = now(), completed_at = null
 where id = '16500000-0000-4000-8000-000000000503';
update public.bookings set status = 'Booked'
 where visit_id = '16500000-0000-4000-8000-000000000503' and slot = '08:30';

select is(
  (select lifecycle_state from public.booking_visits
    where id = '16500000-0000-4000-8000-000000000503'),
  'cancelled', 'a cancelled visit never reopens through a child edit');

select * from finish();
rollback;

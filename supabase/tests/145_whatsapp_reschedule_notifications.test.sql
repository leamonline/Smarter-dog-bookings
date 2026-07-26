-- Atomic WhatsApp reschedule notification contract.
--
-- The production booking-confirmation and cancellation trigger functions send
-- HTTP requests. Replace them for this transaction with probes that record the
-- same row-level trigger invocations, and disable the separate staff-push
-- trigger, so this test makes no network request. Every test object, function
-- replacement and fixture is restored or removed by the final rollback.

begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

create temporary table notification_probe_events (
  ordinal             bigint not null,
  event_type          text not null,
  booking_id          uuid not null,
  group_id            uuid,
  cancellation_reason text
) on commit drop;

-- nextval() is deliberately not rolled back by the savepoint throws_ok uses.
-- It witnesses attempted trigger calls even when their probe-table rows and
-- the booking statement itself are subsequently rolled back.
create temporary sequence notification_probe_attempt_seq;

create or replace function public.notify_on_booking_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_temp, public
as $$
begin
  insert into pg_temp.notification_probe_events
    (ordinal, event_type, booking_id, group_id, cancellation_reason)
  values
    (nextval('pg_temp.notification_probe_attempt_seq'::regclass),
     'booking_confirmed', new.id, new.group_id, new.cancel_reason);
  return new;
end;
$$;

create or replace function public.notify_on_booking_cancelled()
returns trigger
language plpgsql
security definer
set search_path = pg_temp, public
as $$
begin
  insert into pg_temp.notification_probe_events
    (ordinal, event_type, booking_id, group_id, cancellation_reason)
  values
    (nextval('pg_temp.notification_probe_attempt_seq'::regclass),
     'booking_cancelled', new.id, new.group_id, new.cancel_reason);
  return new;
end;
$$;

-- booking_events has its own staff-push HTTP trigger. Its behaviour is outside
-- this customer-notification gate, so suppress it transaction-locally too.
alter table public.booking_events disable trigger trg_staff_push_booking_event;

insert into auth.users (id)
values ('14500000-0000-4000-8000-0000000000a1');

insert into public.staff_profiles (user_id, role, display_name)
values
  ('14500000-0000-4000-8000-0000000000a1', 'owner',
   'Notification Probe Fixture');

insert into public.humans (id, name, surname)
values
  ('14500000-0000-4000-8000-0000000000b1', 'NotificationProbe', 'Owner'),
  ('14500000-0000-4000-8000-0000000000b2', 'NotificationProbe', 'Stranger');

insert into public.dogs (id, name, breed, size, human_id)
values
  ('14500000-0000-4000-8000-0000000000c1', 'Milo', 'Cockapoo', 'small',
   '14500000-0000-4000-8000-0000000000b1'),
  ('14500000-0000-4000-8000-0000000000c2', 'Nala', 'Beagle', 'small',
   '14500000-0000-4000-8000-0000000000b1'),
  ('14500000-0000-4000-8000-0000000000c3', 'Otto', 'Collie', 'small',
   '14500000-0000-4000-8000-0000000000b2');

insert into public.whatsapp_flow_sessions
  (flow_token, phone_e164, human_id, flow_type, status)
values
  ('notification-probe-success', '+447700902001',
   '14500000-0000-4000-8000-0000000000b1', 'cancel_reschedule', 'active'),
  ('notification-probe-failure', '+447700902002',
   '14500000-0000-4000-8000-0000000000b1', 'cancel_reschedule', 'active'),
  ('notification-probe-stale', '+447700902003',
   '14500000-0000-4000-8000-0000000000b1', 'cancel_reschedule', 'active');

create or replace function pg_temp.open_day(p_offset int)
returns date
language plpgsql
as $$
declare
  d date := current_date + p_offset;
begin
  while extract(isodow from d) > 3 loop
    d := d + 1;
  end loop;
  return d;
end;
$$;

-- Act as staff while inserting deterministic source fixtures. The RPC remains
-- the real SECURITY DEFINER implementation and still validates dog ownership.
select set_config(
  'request.jwt.claims',
  '{"sub":"14500000-0000-4000-8000-0000000000a1","role":"authenticated"}',
  true
);

insert into public.bookings
  (id, booking_date, slot, dog_id, size, service, status, group_id, source)
values
  ('14500000-0000-4000-8000-0000000000d1', pg_temp.open_day(30), '09:00',
   '14500000-0000-4000-8000-0000000000c1', 'small', 'full-groom', 'Booked',
   '14500000-0000-4000-8000-0000000000e1', 'whatsapp_flow'),
  ('14500000-0000-4000-8000-0000000000d2', pg_temp.open_day(30), '09:00',
   '14500000-0000-4000-8000-0000000000c2', 'small', 'bath-and-brush', 'Booked',
   '14500000-0000-4000-8000-0000000000e1', 'whatsapp_flow'),
  ('14500000-0000-4000-8000-0000000000d3', pg_temp.open_day(51), '09:00',
   '14500000-0000-4000-8000-0000000000c1', 'small', 'full-groom', 'Booked',
   '14500000-0000-4000-8000-0000000000e2', 'whatsapp_flow'),
  ('14500000-0000-4000-8000-0000000000d4', pg_temp.open_day(51), '09:00',
   '14500000-0000-4000-8000-0000000000c2', 'small', 'bath-and-brush', 'Booked',
   '14500000-0000-4000-8000-0000000000e2', 'whatsapp_flow'),
  ('14500000-0000-4000-8000-0000000000d5', pg_temp.open_day(79), '09:00',
   '14500000-0000-4000-8000-0000000000c1', 'small', 'full-groom', 'Booked',
   '14500000-0000-4000-8000-0000000000e3', 'whatsapp_flow'),
  ('14500000-0000-4000-8000-0000000000d6', pg_temp.open_day(79), '09:00',
   '14500000-0000-4000-8000-0000000000c2', 'small', 'bath-and-brush', 'Booked',
   '14500000-0000-4000-8000-0000000000e3', 'whatsapp_flow');

create or replace function pg_temp.reviewed_snapshot(p_ids uuid[])
returns jsonb
language sql
stable
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'booking_id', b.id,
        'dog_id', b.dog_id,
        'booking_date', b.booking_date,
        'slot', b.slot,
        'service', b.service
      )
      order by b.id
    ),
    '[]'::jsonb
  )
  from public.bookings b
  where b.id = any(p_ids);
$$;

truncate pg_temp.notification_probe_events;

-- ── 1-8: one confirmation and one cancellation trigger per dog ───

select is(
  (select replayed
     from public.reschedule_whatsapp_booking_group(
       jsonb_build_array(
         jsonb_build_object(
           'dog_id', '14500000-0000-4000-8000-0000000000c1',
           'slot', '10:00', 'service', 'full-groom'),
         jsonb_build_object(
           'dog_id', '14500000-0000-4000-8000-0000000000c2',
           'slot', '10:00', 'service', 'bath-and-brush')),
       pg_temp.open_day(37),
       '14500000-0000-4000-8000-0000000000b1',
       '14500000-0000-4000-8000-0000000000e1',
       null,
       array[
         '14500000-0000-4000-8000-0000000000d1',
         '14500000-0000-4000-8000-0000000000d2'
       ]::uuid[],
       'Rescheduled via WhatsApp',
       'notification-probe-success',
       null,
       null,
       null,
       pg_temp.reviewed_snapshot(array[
         '14500000-0000-4000-8000-0000000000d1',
         '14500000-0000-4000-8000-0000000000d2'
       ]::uuid[]))),
  false,
  'the first two-dog notification fixture performs the reschedule');

select is(
  (select count(*)::int
     from pg_temp.notification_probe_events
    where event_type = 'booking_confirmed'),
  2,
  'the replacement fires one booking-confirmation trigger per dog');

select is(
  (select count(distinct booking_id)::int
     from pg_temp.notification_probe_events
    where event_type = 'booking_confirmed'),
  2,
  'the two confirmation events identify two distinct replacement bookings');

select is(
  (select count(distinct group_id)::int
     from pg_temp.notification_probe_events
    where event_type = 'booking_confirmed'
   having count(group_id) = 2),
  1,
  'the confirmation probes record the shared replacement group');

select is(
  (select count(*)::int
     from pg_temp.notification_probe_events
    where event_type = 'booking_cancelled'),
  2,
  'the old visit fires one booking-cancellation trigger per dog');

select is(
  (select array_agg(booking_id order by booking_id)
     from pg_temp.notification_probe_events
    where event_type = 'booking_cancelled'),
  array[
    '14500000-0000-4000-8000-0000000000d1',
    '14500000-0000-4000-8000-0000000000d2'
  ]::uuid[],
  'the cancellation probes identify exactly the two old bookings');

select is(
  (select count(*)::int
     from pg_temp.notification_probe_events
    where event_type = 'booking_cancelled'
      and group_id = '14500000-0000-4000-8000-0000000000e1'),
  2,
  'the cancellation probes retain the old visit group id');

select is(
  (select count(*)::int
     from pg_temp.notification_probe_events
    where event_type = 'booking_cancelled'
      and cancellation_reason = 'Rescheduled via WhatsApp'),
  2,
  'every old-row cancellation notification is marked as a WhatsApp reschedule');

select is(
  (select array_agg(event_type order by ordinal)
     from pg_temp.notification_probe_events),
  array[
    'booking_confirmed',
    'booking_confirmed',
    'booking_cancelled',
    'booking_cancelled'
  ]::text[],
  'customer notification enqueue attempts confirm replacements before cancelling old rows');

-- ── 10-11: replay returns the receipt without firing triggers ─────

select is(
  (select replayed
     from public.reschedule_whatsapp_booking_group(
       jsonb_build_array(
         jsonb_build_object(
           'dog_id', '14500000-0000-4000-8000-0000000000c1',
           'slot', '10:00', 'service', 'full-groom'),
         jsonb_build_object(
           'dog_id', '14500000-0000-4000-8000-0000000000c2',
           'slot', '10:00', 'service', 'bath-and-brush')),
       pg_temp.open_day(37),
       '14500000-0000-4000-8000-0000000000b1',
       '14500000-0000-4000-8000-0000000000e1',
       null,
       array[
         '14500000-0000-4000-8000-0000000000d1',
         '14500000-0000-4000-8000-0000000000d2'
       ]::uuid[],
       'Rescheduled via WhatsApp',
       'notification-probe-success',
       null,
       null,
       null,
       pg_temp.reviewed_snapshot(array[
         '14500000-0000-4000-8000-0000000000d1',
         '14500000-0000-4000-8000-0000000000d2'
       ]::uuid[]))),
  true,
  'an identical submission is replayed from the durable receipt');

select is(
  (select count(*)::int from pg_temp.notification_probe_events),
  4,
  'the replay creates no additional notification probe events');

-- ── 12-16: a late replacement failure rolls all effects back ─────

truncate pg_temp.notification_probe_events;
select setval('pg_temp.notification_probe_attempt_seq'::regclass, 1, false);

-- Both destination dogs exactly match the source set. The first replacement
-- is valid and reaches its INSERT trigger; the second has an invalid slot and
-- fails afterward. With cancellation notifications deferred, only the first
-- confirmation is attempted before the statement rolls back.
select throws_ok(
  format($f$
    select public.reschedule_whatsapp_booking_group(
      jsonb_build_array(
        jsonb_build_object(
          'dog_id', '14500000-0000-4000-8000-0000000000c1',
          'slot', '10:00', 'service', 'full-groom'),
        jsonb_build_object(
          'dog_id', '14500000-0000-4000-8000-0000000000c2',
          'slot', '99:99', 'service', 'bath-and-brush')),
      %L::date,
      '14500000-0000-4000-8000-0000000000b1',
      '14500000-0000-4000-8000-0000000000e2',
      null,
      array[
        '14500000-0000-4000-8000-0000000000d3',
        '14500000-0000-4000-8000-0000000000d4'
      ]::uuid[],
      'Rescheduled via WhatsApp',
      'notification-probe-failure',
      null,
      null,
      null,
      pg_temp.reviewed_snapshot(array[
        '14500000-0000-4000-8000-0000000000d3',
        '14500000-0000-4000-8000-0000000000d4'
      ]::uuid[]))
  $f$, pg_temp.open_day(58)),
  null,
  'a replacement failure after the first insert is rejected');

select is(
  (select case when is_called then last_value::int else 0 end
     from pg_temp.notification_probe_attempt_seq),
  1,
  'the late failure attempts one confirmation while deferred cancellations stay unqueued');

select is(
  (select count(*)::int from pg_temp.notification_probe_events),
  0,
  'the failed replacement rolls back all notification probe events');

select is(
  (select count(*)::int
     from public.bookings
    where id in (
      '14500000-0000-4000-8000-0000000000d3',
      '14500000-0000-4000-8000-0000000000d4')
      and status = 'Booked'),
  2,
  'the failed replacement rolls back both old-row cancellations');

select is(
  (select count(*)::int
     from public.bookings b
     join public.dogs d on d.id = b.dog_id
    where b.booking_date = pg_temp.open_day(58)
      and b.slot = '10:00'
      and b.dog_id = '14500000-0000-4000-8000-0000000000c1'
      and d.human_id = '14500000-0000-4000-8000-0000000000b1'
      and b.source = 'whatsapp_flow'),
  0,
  'the failed replacement rolls back the first replacement insert');

-- ── 17-20: stale-source refusal does no notification work ─────────

select setval('pg_temp.notification_probe_attempt_seq'::regclass, 1, false);

select throws_ok(
  format($f$
    select public.reschedule_whatsapp_booking_group(
      jsonb_build_array(
        jsonb_build_object(
          'dog_id', '14500000-0000-4000-8000-0000000000c1',
          'slot', '10:00', 'service', 'full-groom'),
        jsonb_build_object(
          'dog_id', '14500000-0000-4000-8000-0000000000c2',
          'slot', '10:00', 'service', 'bath-and-brush')),
      %L::date,
      '14500000-0000-4000-8000-0000000000b1',
      '14500000-0000-4000-8000-0000000000e3',
      null,
      array[
        '14500000-0000-4000-8000-0000000000d5',
        '14500000-0000-4000-8000-000000000fff'
      ]::uuid[],
      'Rescheduled via WhatsApp',
      'notification-probe-stale',
      null,
      null,
      null,
      pg_temp.reviewed_snapshot(array[
        '14500000-0000-4000-8000-0000000000d5'
      ]::uuid[])
      || jsonb_build_array(jsonb_build_object(
        'booking_id','14500000-0000-4000-8000-000000000fff',
        'dog_id','14500000-0000-4000-8000-0000000000c2',
        'booking_date',pg_temp.open_day(79),
        'slot','09:00','service','bath-and-brush')))
  $f$, pg_temp.open_day(86)),
  'P0002',
  'reschedule_old_visit_changed',
  'a stale reviewed source is refused');

select is(
  (select case when is_called then last_value::int else 0 end
     from pg_temp.notification_probe_attempt_seq),
  0,
  'the stale-source refusal attempts no notification trigger calls');

select is(
  (select count(*)::int from pg_temp.notification_probe_events),
  0,
  'the stale-source refusal records no notification probe events');

select is(
  (select count(*)::int
     from public.bookings
    where id in (
      '14500000-0000-4000-8000-0000000000d5',
      '14500000-0000-4000-8000-0000000000d6')
      and status = 'Booked'),
  2,
  'the stale-source refusal leaves both source bookings unchanged');

select * from finish();
rollback;

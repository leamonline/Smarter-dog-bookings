-- Atomic WhatsApp reschedule: the replacement and the cancellation happen in
-- one transaction, so no failure can leave two active appointments.
-- Synthetic fixtures are rolled back.

begin;
create extension if not exists pgtap with schema extensions;
select plan(77);

\ir fixtures/ensure_local_vault_secrets.psql

insert into auth.users (id) values ('14000000-0000-4000-8000-0000000000a1');
insert into public.staff_profiles (user_id, role, display_name) values
  ('14000000-0000-4000-8000-0000000000a1', 'owner', 'Reschedule Fixture');

insert into public.humans (id, name, surname) values
  ('14000000-0000-4000-8000-0000000000b1', 'RescheduleFixture', 'Owner'),
  ('14000000-0000-4000-8000-0000000000b2', 'RescheduleFixture', 'Stranger');

insert into public.dogs (id, name, breed, size, human_id) values
  ('14000000-0000-4000-8000-0000000000c1', 'Milo', 'Cockapoo', 'small',
   '14000000-0000-4000-8000-0000000000b1'),
  ('14000000-0000-4000-8000-0000000000c2', 'Nala', 'Beagle', 'small',
   '14000000-0000-4000-8000-0000000000b1'),
  ('14000000-0000-4000-8000-0000000000c3', 'Otto', 'Collie', 'small',
   '14000000-0000-4000-8000-0000000000b2');

-- Two open salon days (Mon/Tue/Wed) far enough out to avoid the same-day rule.
create or replace function pg_temp.open_day(p_offset int)
returns date language plpgsql as $$
declare d date := current_date + p_offset;
begin
  while extract(isodow from d) > 3 loop d := d + 1; end loop;
  return d;
end;
$$;

-- Act as staff so the calendar gate bypasses for the fixture rows, exactly as
-- it does for staff in the app. The RPC under test runs as service role.
select set_config('request.jwt.claims',
  '{"sub":"14000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);

insert into public.whatsapp_flow_sessions
  (flow_token, phone_e164, human_id, flow_type, status)
values
  ('tok-happy-path', '+447700900991',
   '14000000-0000-4000-8000-0000000000b1', 'cancel_reschedule', 'active'),
  ('tok-expected-failure', '+447700900992',
   '14000000-0000-4000-8000-0000000000b1', 'cancel_reschedule', 'active'),
  ('tok-stranger-attempt', '+447700900996',
   '14000000-0000-4000-8000-0000000000b2', 'cancel_reschedule', 'active'),
  ('tok-source-drift', '+447700900993',
   '14000000-0000-4000-8000-0000000000b1', 'cancel_reschedule', 'active'),
  ('tok-side-effects', '+447700900994',
   '14000000-0000-4000-8000-0000000000b1', 'cancel_reschedule', 'active'),
  ('tok-dup-1', '+447700900995',
   '14000000-0000-4000-8000-0000000000b1', 'cancel_reschedule', 'active');

-- The original two-dog visit.
insert into public.bookings
  (id, booking_date, slot, dog_id, size, service, status, group_id, source)
values
  ('14000000-0000-4000-8000-0000000000d1', pg_temp.open_day(30), '09:00',
   '14000000-0000-4000-8000-0000000000c1', 'small', 'full-groom', 'Booked',
   '14000000-0000-4000-8000-0000000000e1', 'whatsapp_flow'),
  ('14000000-0000-4000-8000-0000000000d2', pg_temp.open_day(30), '09:00',
   '14000000-0000-4000-8000-0000000000c2', 'small', 'bath-and-brush', 'Booked',
   '14000000-0000-4000-8000-0000000000e1', 'whatsapp_flow');

-- Fixture helper for tests whose target is not snapshot drift. The dedicated
-- drift cases below keep hand-written pre-edit snapshots.
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

-- ── 1-8: the functions exist and are locked to the service role ─────

select has_function('public', 'reschedule_whatsapp_booking_group',
  'the atomic reschedule RPC exists');

select ok(
  not has_function_privilege(
    'anon',
    'public.reschedule_whatsapp_booking_group(jsonb,date,uuid,uuid,uuid,uuid[],text,text,date,text,jsonb,jsonb)'::regprocedure,
    'EXECUTE'),
  'anon cannot execute the exact reschedule RPC');

select ok(
  not has_function_privilege(
    'authenticated',
    'public.reschedule_whatsapp_booking_group(jsonb,date,uuid,uuid,uuid,uuid[],text,text,date,text,jsonb,jsonb)'::regprocedure,
    'EXECUTE'),
  'authenticated cannot execute the exact reschedule RPC');

select is(
  (select count(*)::int
     from pg_proc p
     cross join lateral aclexplode(
       coalesce(p.proacl, acldefault('f', p.proowner))
     ) acl
    where p.oid =
      'public.reschedule_whatsapp_booking_group(jsonb,date,uuid,uuid,uuid,uuid[],text,text,date,text,jsonb,jsonb)'::regprocedure
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'),
  0,
  'PUBLIC has no effective EXECUTE ACL on the exact reschedule RPC');

select ok(
  has_function_privilege(
    'service_role',
    'public.reschedule_whatsapp_booking_group(jsonb,date,uuid,uuid,uuid,uuid[],text,text,date,text,jsonb,jsonb)'::regprocedure,
    'EXECUTE'),
  'service_role can execute the exact reschedule RPC');

select ok(
  not has_function_privilege(
    'anon',
    'public.replay_whatsapp_reschedule_receipt(text,uuid)'::regprocedure,
    'EXECUTE'),
  'anon cannot execute the exact receipt replay RPC');

select ok(
  not has_function_privilege(
    'authenticated',
    'public.replay_whatsapp_reschedule_receipt(text,uuid)'::regprocedure,
    'EXECUTE'),
  'authenticated cannot execute the exact receipt replay RPC');

select is(
  (select count(*)::int
     from pg_proc p
     cross join lateral aclexplode(
       coalesce(p.proacl, acldefault('f', p.proowner))
     ) acl
    where p.oid =
      'public.replay_whatsapp_reschedule_receipt(text,uuid)'::regprocedure
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'),
  0,
  'PUBLIC has no effective EXECUTE ACL on the exact receipt replay RPC');

select ok(
  has_function_privilege(
    'service_role',
    'public.replay_whatsapp_reschedule_receipt(text,uuid)'::regprocedure,
    'EXECUTE'),
  'service_role can execute the exact receipt replay RPC');

-- ── 9-14: the happy path moves the whole visit atomically ──────────

select lives_ok(
  format($f$
    select public.reschedule_whatsapp_booking_group(
      jsonb_build_array(
        jsonb_build_object('dog_id','14000000-0000-4000-8000-0000000000c1',
                           'slot','10:00','service','full-groom'),
        jsonb_build_object('dog_id','14000000-0000-4000-8000-0000000000c2',
                           'slot','10:00','service','bath-and-brush')),
      %L::date, '14000000-0000-4000-8000-0000000000b1',
      '14000000-0000-4000-8000-0000000000e1', null,
      array['14000000-0000-4000-8000-0000000000d1',
            '14000000-0000-4000-8000-0000000000d2']::uuid[],
      'Rescheduled via WhatsApp', 'tok-happy-path',
      null, null, null,
      pg_temp.reviewed_snapshot(array[
        '14000000-0000-4000-8000-0000000000d1',
        '14000000-0000-4000-8000-0000000000d2']::uuid[]))
  $f$, pg_temp.open_day(37)),
  'a well-formed reschedule commits');

select is(
  (select count(*)::int from public.bookings
    where id in ('14000000-0000-4000-8000-0000000000d1',
                 '14000000-0000-4000-8000-0000000000d2')
      and status = 'Cancelled'),
  2, 'every dog on the old visit is cancelled');

select is(
  (select count(*)::int from public.bookings b
    join public.dogs d on d.id = b.dog_id
   where d.human_id = '14000000-0000-4000-8000-0000000000b1'
     and b.status = 'Booked'),
  2, 'exactly one live visit remains — never two');

select is(
  (select count(distinct booking_date)::int from public.bookings b
    join public.dogs d on d.id = b.dog_id
   where d.human_id = '14000000-0000-4000-8000-0000000000b1'
     and b.status = 'Booked'),
  1, 'the surviving rows are all on the new date');

select is(
  (select cancel_reason from public.bookings
    where id = '14000000-0000-4000-8000-0000000000d1'),
  'Rescheduled via WhatsApp', 'the cancellation records why');

select is(
  (select count(distinct group_id)::int from public.bookings b
    join public.dogs d on d.id = b.dog_id
   where d.human_id = '14000000-0000-4000-8000-0000000000b1'
     and b.status = 'Booked'),
  1, 'the replacement rows share one new group');

-- ── 15-18: THE REGRESSION — a failed create must cancel nothing ────
--
-- The old implementation created first and cancelled second, so a failure
-- left both visits live. Here the create is made to fail (a dog belonging to
-- another customer) and the old visit must survive completely intact.

insert into public.bookings
  (id, booking_date, slot, dog_id, size, service, status, group_id, source)
values
  ('14000000-0000-4000-8000-0000000000d3', pg_temp.open_day(44), '09:00',
   '14000000-0000-4000-8000-0000000000c1', 'small', 'full-groom', 'Booked',
   '14000000-0000-4000-8000-0000000000e2', 'whatsapp_flow');

select throws_ok(
  format($f$
    select public.reschedule_whatsapp_booking_group(
      jsonb_build_array(
        jsonb_build_object('dog_id','14000000-0000-4000-8000-0000000000c3',
                           'slot','10:00','service','full-groom')),
      %L::date, '14000000-0000-4000-8000-0000000000b1',
      '14000000-0000-4000-8000-0000000000e2', null,
      array['14000000-0000-4000-8000-0000000000d3']::uuid[],
      'Rescheduled via WhatsApp', 'tok-expected-failure',
      null, null, null,
      pg_temp.reviewed_snapshot(array[
        '14000000-0000-4000-8000-0000000000d3']::uuid[]))
  $f$, pg_temp.open_day(51)),
  'P0002', 'reschedule_replacement_dog_mismatch',
  'a replacement naming a different dog set is rejected before cancellation');

select is(
  (select status from public.bookings
    where id = '14000000-0000-4000-8000-0000000000d3'),
  'Booked',
  'REGRESSION: a failed replacement leaves the original booked, not cancelled');

select is(
  (select count(*)::int from public.bookings
    where booking_date = pg_temp.open_day(51)),
  0, 'REGRESSION: a failed replacement creates no new rows');

-- Capacity rejection must roll back identically.
select throws_ok(
  format($f$
    select public.reschedule_whatsapp_booking_group(
      jsonb_build_array(
        jsonb_build_object('dog_id','14000000-0000-4000-8000-0000000000c1',
                           'slot','99:99','service','full-groom')),
      %L::date, '14000000-0000-4000-8000-0000000000b1',
      '14000000-0000-4000-8000-0000000000e2', null,
      array['14000000-0000-4000-8000-0000000000d3']::uuid[],
      'Rescheduled via WhatsApp', 'tok-expected-failure',
      null, null, null,
      pg_temp.reviewed_snapshot(array[
        '14000000-0000-4000-8000-0000000000d3']::uuid[]))
  $f$, pg_temp.open_day(51)),
  null, 'an invalid destination slot is rejected');

select is(
  (select status from public.bookings
    where id = '14000000-0000-4000-8000-0000000000d3'),
  'Booked', 'REGRESSION: the original survives a destination rejection too');

-- ── 13-15: the reviewed-snapshot guard ─────────────────────────────

select throws_ok(
  format($f$
    select public.reschedule_whatsapp_booking_group(
      jsonb_build_array(
        jsonb_build_object('dog_id','14000000-0000-4000-8000-0000000000c1',
                           'slot','10:00','service','full-groom')),
      %L::date, '14000000-0000-4000-8000-0000000000b1',
      '14000000-0000-4000-8000-0000000000e2', null,
      array['14000000-0000-4000-8000-0000000000d3',
            '14000000-0000-4000-8000-000000000fff']::uuid[],
      'Rescheduled via WhatsApp', 'tok-expected-failure',
      null, null, null,
      jsonb_build_array(
        jsonb_build_object(
          'booking_id','14000000-0000-4000-8000-0000000000d3',
          'dog_id','14000000-0000-4000-8000-0000000000c1',
          'booking_date',pg_temp.open_day(44),
          'slot','09:00','service','full-groom'),
        jsonb_build_object(
          'booking_id','14000000-0000-4000-8000-000000000fff',
          'dog_id','14000000-0000-4000-8000-0000000000c2',
          'booking_date',pg_temp.open_day(44),
          'slot','09:00','service','bath-and-brush')))
  $f$, pg_temp.open_day(51)),
  'P0002', 'reschedule_old_visit_changed',
  'a visit that no longer matches the reviewed snapshot is refused');

select is(
  (select status from public.bookings
    where id = '14000000-0000-4000-8000-0000000000d3'),
  'Booked', 'the snapshot guard cancels nothing');

select throws_ok(
  format($f$
    select public.reschedule_whatsapp_booking_group(
      jsonb_build_array(
        jsonb_build_object('dog_id','14000000-0000-4000-8000-0000000000c1',
                           'slot','10:00','service','full-groom')),
      %L::date, '14000000-0000-4000-8000-0000000000b1',
      '14000000-0000-4000-8000-000000000eee', null,
      array['14000000-0000-4000-8000-000000000eee']::uuid[],
      'Rescheduled via WhatsApp', 'tok-expected-failure',
      null, null, null,
      jsonb_build_array(jsonb_build_object(
        'booking_id','14000000-0000-4000-8000-000000000eee',
        'dog_id','14000000-0000-4000-8000-0000000000c1',
        'booking_date',pg_temp.open_day(44),
        'slot','09:00','service','full-groom')))
  $f$, pg_temp.open_day(51)),
  'P0002', 'reschedule_old_visit_unavailable',
  'an unknown old visit is refused rather than silently creating a booking');

-- ── 16-18: ownership and required arguments ────────────────────────

-- Another customer cannot move this visit, even naming the right group.
select throws_ok(
  format($f$
    select public.reschedule_whatsapp_booking_group(
      jsonb_build_array(
        jsonb_build_object('dog_id','14000000-0000-4000-8000-0000000000c3',
                           'slot','10:00','service','full-groom')),
      %L::date, '14000000-0000-4000-8000-0000000000b2',
      '14000000-0000-4000-8000-0000000000e2', null,
      array['14000000-0000-4000-8000-0000000000d3']::uuid[],
      'Rescheduled via WhatsApp', 'tok-stranger-attempt',
      null, null, null,
      pg_temp.reviewed_snapshot(array[
        '14000000-0000-4000-8000-0000000000d3']::uuid[]))
  $f$, pg_temp.open_day(51)),
  'P0002', 'reschedule_old_visit_unavailable',
  'a different customer cannot move someone else''s visit');

select is(
  (select status from public.bookings
    where id = '14000000-0000-4000-8000-0000000000d3'),
  'Booked', 'the cross-customer attempt cancelled nothing');

select throws_ok(
  $$ select public.reschedule_whatsapp_booking_group(
       '[]'::jsonb, current_date + 30, '14000000-0000-4000-8000-0000000000b1',
       null, null,
       array['14000000-0000-4000-8000-0000000000d3']::uuid[],
       'Rescheduled via WhatsApp', 'tok-expected-failure',
       null, null, null,
       pg_temp.reviewed_snapshot(array[
         '14000000-0000-4000-8000-0000000000d3']::uuid[])) $$,
  '22023', null, 'the old visit must be identified');

-- Missing exact-review facts are invalid even though the trailing defaults
-- remain in the function signature for API compatibility.
select throws_ok(
  format($f$
    select public.reschedule_whatsapp_booking_group(
      p_bookings => jsonb_build_array(jsonb_build_object(
        'dog_id','14000000-0000-4000-8000-0000000000c3',
        'slot','10:00','service','full-groom')),
      p_booking_date => %L::date,
      p_human_id => '14000000-0000-4000-8000-0000000000b1',
      p_old_group_id => '14000000-0000-4000-8000-0000000000e2',
      p_expected_old_ids => null,
      p_flow_token => 'tok-expected-failure',
      p_expected_old_snapshot => pg_temp.reviewed_snapshot(array[
        '14000000-0000-4000-8000-0000000000d3']::uuid[]))
  $f$, pg_temp.open_day(51)),
  '22023', 'expected_old_ids is required',
  'EXACT REVIEW: null expected booking ids are rejected at the boundary');

select throws_ok(
  format($f$
    select public.reschedule_whatsapp_booking_group(
      p_bookings => jsonb_build_array(jsonb_build_object(
        'dog_id','14000000-0000-4000-8000-0000000000c3',
        'slot','10:00','service','full-groom')),
      p_booking_date => %L::date,
      p_human_id => '14000000-0000-4000-8000-0000000000b1',
      p_old_group_id => '14000000-0000-4000-8000-0000000000e2',
      p_expected_old_ids => '{}'::uuid[],
      p_flow_token => 'tok-expected-failure',
      p_expected_old_snapshot => pg_temp.reviewed_snapshot(array[
        '14000000-0000-4000-8000-0000000000d3']::uuid[]))
  $f$, pg_temp.open_day(51)),
  '22023', 'expected_old_ids must not be empty',
  'EXACT REVIEW: empty expected booking ids are rejected at the boundary');

select throws_ok(
  format($f$
    select public.reschedule_whatsapp_booking_group(
      p_bookings => jsonb_build_array(jsonb_build_object(
        'dog_id','14000000-0000-4000-8000-0000000000c3',
        'slot','10:00','service','full-groom')),
      p_booking_date => %L::date,
      p_human_id => '14000000-0000-4000-8000-0000000000b1',
      p_old_group_id => '14000000-0000-4000-8000-0000000000e2',
      p_expected_old_ids => array[
        '14000000-0000-4000-8000-0000000000d3']::uuid[],
      p_flow_token => 'tok-expected-failure',
      p_expected_old_snapshot => null)
  $f$, pg_temp.open_day(51)),
  '22023', 'expected_old_snapshot is required',
  'EXACT REVIEW: null expected row snapshot is rejected at the boundary');

select throws_ok(
  format($f$
    select public.reschedule_whatsapp_booking_group(
      p_bookings => jsonb_build_array(jsonb_build_object(
        'dog_id','14000000-0000-4000-8000-0000000000c3',
        'slot','10:00','service','full-groom')),
      p_booking_date => %L::date,
      p_human_id => '14000000-0000-4000-8000-0000000000b1',
      p_old_group_id => '14000000-0000-4000-8000-0000000000e2',
      p_expected_old_ids => array[
        '14000000-0000-4000-8000-0000000000d3']::uuid[],
      p_flow_token => 'tok-expected-failure',
      p_expected_old_snapshot => '[]'::jsonb)
  $f$, pg_temp.open_day(51)),
  '22023', 'expected_old_snapshot must not be empty',
  'EXACT REVIEW: empty expected row snapshot is rejected at the boundary');

-- ── RPC security ───────────────────────────────────────────────────

select ok(
  (select p.proconfig @> array['search_path=public, pg_temp']
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where p.proname = 'reschedule_whatsapp_booking_group' and n.nspname = 'public'),
  'SECURITY DEFINER runs with an explicitly safe search_path');

select ok(
  (select p.prosecdef from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where p.proname = 'reschedule_whatsapp_booking_group' and n.nspname = 'public'),
  'the function is SECURITY DEFINER as intended');

-- A customer session must not be able to reach the RPC at all, which is what
-- stops it being used to bypass the Edge Function's validation.
set local role authenticated;
select throws_ok(
  $$ select public.reschedule_whatsapp_booking_group(
       '[]'::jsonb, current_date + 30, '14000000-0000-4000-8000-0000000000b1',
       '14000000-0000-4000-8000-0000000000e2', null,
       array['14000000-0000-4000-8000-0000000000d3']::uuid[],
       'Rescheduled via WhatsApp', 'tok-expected-failure',
       null, null, null,
       pg_temp.reviewed_snapshot(array[
         '14000000-0000-4000-8000-0000000000d3']::uuid[])) $$,
  '42501', null, 'an authenticated customer cannot execute the RPC');
reset role;

-- ── 24-28: idempotency and duplicate submission ────────────────────

insert into public.bookings
  (id, booking_date, slot, dog_id, size, service, status, group_id, source)
values
  ('14000000-0000-4000-8000-0000000000d4', pg_temp.open_day(58), '09:00',
   '14000000-0000-4000-8000-0000000000c1', 'small', 'full-groom', 'Booked',
   '14000000-0000-4000-8000-0000000000e3', 'whatsapp_flow');

create or replace function pg_temp.do_reschedule(p_token text, p_offset int)
returns table (new_ids uuid[], cancelled_ids uuid[], replayed boolean)
language plpgsql as $$
begin
  return query
  select r.new_booking_ids, r.cancelled_booking_ids, r.replayed
    from public.reschedule_whatsapp_booking_group(
      jsonb_build_array(
        jsonb_build_object('dog_id','14000000-0000-4000-8000-0000000000c1',
                           'slot','10:00','service','full-groom')),
      pg_temp.open_day(p_offset), '14000000-0000-4000-8000-0000000000b1',
      '14000000-0000-4000-8000-0000000000e3', null,
      array['14000000-0000-4000-8000-0000000000d4']::uuid[],
      'Rescheduled via WhatsApp', p_token,
      null, null, null,
      pg_temp.reviewed_snapshot(array[
        '14000000-0000-4000-8000-0000000000d4']::uuid[])) r;
end;
$$;

select is(
  (select replayed from pg_temp.do_reschedule('tok-dup-1', 65)),
  false, 'the first submission performs the reschedule');

select is(
  (select replayed from pg_temp.do_reschedule('tok-dup-1', 65)),
  true, 'an identical resubmission is answered from the stored receipt');

select is(
  (select count(*)::int from public.bookings b
    join public.dogs d on d.id = b.dog_id
   where d.human_id = '14000000-0000-4000-8000-0000000000b1'
     and b.status = 'Booked'
     and b.booking_date = pg_temp.open_day(65)),
  1, 'DUPLICATE: a resubmission creates no second replacement');

select is(
  (select new_ids from pg_temp.do_reschedule('tok-dup-1', 65)),
  (select new_booking_ids from public.whatsapp_reschedule_receipts
    where flow_token = 'tok-dup-1'),
  'the replay returns the original booking ids, not a failure');

select is(
  (select count(*)::int from public.bookings b
    where b.status = 'Booked'
      and b.id = any (
        (select r.new_booking_ids
           from public.whatsapp_reschedule_receipts r
          where r.flow_token = 'tok-dup-1')::uuid[])),
  1, 'DUPLICATE: the replay never cancels the replacement it already made');

-- A retry carrying different details is refused rather than answered with
-- the earlier result.
select throws_ok(
  format($f$
    select public.reschedule_whatsapp_booking_group(
      jsonb_build_array(
        jsonb_build_object('dog_id','14000000-0000-4000-8000-0000000000c1',
                           'slot','11:00','service','full-groom')),
      %L::date, '14000000-0000-4000-8000-0000000000b1',
      '14000000-0000-4000-8000-0000000000e3', null,
      array['14000000-0000-4000-8000-0000000000d4']::uuid[],
      'Rescheduled via WhatsApp', 'tok-dup-1',
      null, null, null,
      pg_temp.reviewed_snapshot(array[
        '14000000-0000-4000-8000-0000000000d4']::uuid[]))
  $f$, pg_temp.open_day(72)),
  'P0002', 'reschedule_idempotency_conflict',
  'a retry with different details is refused, not silently answered');

-- ── 30-33: source drift and partial-group protection ───────────────

-- A two-dog group named by ONE booking id must resolve to the whole group,
-- never cancel just that dog.
insert into public.bookings
  (id, booking_date, slot, dog_id, size, service, status, group_id, source)
values
  ('14000000-0000-4000-8000-0000000000d5', pg_temp.open_day(79), '09:00',
   '14000000-0000-4000-8000-0000000000c1', 'small', 'full-groom', 'Booked',
   '14000000-0000-4000-8000-0000000000e4', 'whatsapp_flow'),
  ('14000000-0000-4000-8000-0000000000d6', pg_temp.open_day(79), '09:00',
   '14000000-0000-4000-8000-0000000000c2', 'small', 'bath-and-brush', 'Booked',
   '14000000-0000-4000-8000-0000000000e4', 'whatsapp_flow');

select throws_ok(
  format($f$
    select public.reschedule_whatsapp_booking_group(
      jsonb_build_array(
        jsonb_build_object('dog_id','14000000-0000-4000-8000-0000000000c1',
                           'slot','10:00','service','full-groom')),
      %L::date, '14000000-0000-4000-8000-0000000000b1',
      null, '14000000-0000-4000-8000-0000000000d5',
      array['14000000-0000-4000-8000-0000000000d5']::uuid[],
      'Rescheduled via WhatsApp', 'tok-source-drift',
      null, null, null,
      pg_temp.reviewed_snapshot(array[
        '14000000-0000-4000-8000-0000000000d5']::uuid[]))
  $f$, pg_temp.open_day(86)),
  'P0002', 'reschedule_old_visit_changed',
  'PARTIAL GROUP: naming one dog of a two-dog group is refused');

select is(
  (select count(*)::int from public.bookings
    where group_id = '14000000-0000-4000-8000-0000000000e4'
      and status = 'Booked'),
  2, 'PARTIAL GROUP: both dogs remain booked after the refusal');

-- Expected ids drawn from two different groups.
select throws_ok(
  format($f$
    select public.reschedule_whatsapp_booking_group(
      jsonb_build_array(
        jsonb_build_object('dog_id','14000000-0000-4000-8000-0000000000c1',
                           'slot','10:00','service','full-groom')),
      %L::date, '14000000-0000-4000-8000-0000000000b1',
      '14000000-0000-4000-8000-0000000000e4', null,
      array['14000000-0000-4000-8000-0000000000d5',
            '14000000-0000-4000-8000-0000000000d6',
            '14000000-0000-4000-8000-0000000000d3']::uuid[],
      'Rescheduled via WhatsApp', 'tok-source-drift',
      null, null, null,
      pg_temp.reviewed_snapshot(array[
        '14000000-0000-4000-8000-0000000000d5',
        '14000000-0000-4000-8000-0000000000d6',
        '14000000-0000-4000-8000-0000000000d3']::uuid[]))
  $f$, pg_temp.open_day(86)),
  'P0002', 'reschedule_old_visit_changed',
  'ids spanning different groups are refused');

-- Staff add a dog after the Flow opened: the reviewed snapshot no longer
-- matches the live group.
select throws_ok(
  format($f$
    select public.reschedule_whatsapp_booking_group(
      jsonb_build_array(
        jsonb_build_object('dog_id','14000000-0000-4000-8000-0000000000c1',
                           'slot','10:00','service','full-groom')),
      %L::date, '14000000-0000-4000-8000-0000000000b1',
      '14000000-0000-4000-8000-0000000000e4', null,
      array['14000000-0000-4000-8000-0000000000d5',
            '14000000-0000-4000-8000-0000000000d6',
            '14000000-0000-4000-8000-000000000aaa']::uuid[],
      'Rescheduled via WhatsApp', 'tok-source-drift',
      null, null, null,
      pg_temp.reviewed_snapshot(array[
        '14000000-0000-4000-8000-0000000000d5',
        '14000000-0000-4000-8000-0000000000d6']::uuid[])
      || jsonb_build_array(jsonb_build_object(
        'booking_id','14000000-0000-4000-8000-000000000aaa',
        'dog_id','14000000-0000-4000-8000-0000000000c3',
        'booking_date',pg_temp.open_day(79),
        'slot','09:00','service','full-groom')))
  $f$, pg_temp.open_day(86)),
  'P0002', 'reschedule_old_visit_changed',
  'a staff edit after the Flow opened is refused');

-- ── 34-36: in-place staff edit (same booking IDs) ──────────────────
--
-- Set equality of ids cannot see an edit that keeps the same rows. These
-- prove the material facts are revalidated inside the locked transaction.

insert into public.bookings
  (id, booking_date, slot, dog_id, size, service, status, group_id, source)
values
  ('14000000-0000-4000-8000-0000000000d7', pg_temp.open_day(93), '09:00',
   '14000000-0000-4000-8000-0000000000c1', 'small', 'full-groom', 'Booked',
   '14000000-0000-4000-8000-0000000000e5', 'whatsapp_flow');

-- Staff move the SAME booking row to a later slot while the Flow is open.
update public.bookings set slot = '11:00'
 where id = '14000000-0000-4000-8000-0000000000d7';

select throws_ok(
  format($f$
    select public.reschedule_whatsapp_booking_group(
      jsonb_build_array(
        jsonb_build_object('dog_id','14000000-0000-4000-8000-0000000000c1',
                           'slot','10:00','service','full-groom')),
      %L::date, '14000000-0000-4000-8000-0000000000b1',
      '14000000-0000-4000-8000-0000000000e5', null,
      array['14000000-0000-4000-8000-0000000000d7']::uuid[],
      'Rescheduled via WhatsApp', 'tok-source-drift',
      %L::date, '09:00', null,
      jsonb_build_array(jsonb_build_object(
        'booking_id','14000000-0000-4000-8000-0000000000d7',
        'dog_id','14000000-0000-4000-8000-0000000000c1',
        'booking_date',%L::date,
        'slot','09:00','service','full-groom')))
  $f$, pg_temp.open_day(100), pg_temp.open_day(93), pg_temp.open_day(93)),
  'P0002', 'reschedule_old_visit_changed',
  'IN-PLACE EDIT: a staff move of the same booking id is refused');

select is(
  (select status from public.bookings
    where id = '14000000-0000-4000-8000-0000000000d7'),
  'Booked', 'IN-PLACE EDIT: the edited booking is not moved again');

-- A staff service change on the same row is refused too.
select throws_ok(
  format($f$
    select public.reschedule_whatsapp_booking_group(
      jsonb_build_array(
        jsonb_build_object('dog_id','14000000-0000-4000-8000-0000000000c1',
                           'slot','10:00','service','full-groom')),
      %L::date, '14000000-0000-4000-8000-0000000000b1',
      '14000000-0000-4000-8000-0000000000e5', null,
      array['14000000-0000-4000-8000-0000000000d7']::uuid[],
      'Rescheduled via WhatsApp', 'tok-source-drift',
      %L::date, '11:00',
      jsonb_build_object('14000000-0000-4000-8000-0000000000c1','bath-and-brush'),
      jsonb_build_array(jsonb_build_object(
        'booking_id','14000000-0000-4000-8000-0000000000d7',
        'dog_id','14000000-0000-4000-8000-0000000000c1',
        'booking_date',%L::date,
        'slot','11:00','service','bath-and-brush')))
  $f$, pg_temp.open_day(100), pg_temp.open_day(93), pg_temp.open_day(93)),
  'P0002', 'reschedule_old_visit_changed',
  'IN-PLACE EDIT: a staff service change is refused');

-- ── 37-41: observable side effects of the internal cancellation ────
--
-- The reschedule reaches the same triggers the previous create-then-cancel
-- implementation reached. These pin what is observable in the database.

insert into public.bookings
  (id, booking_date, slot, dog_id, size, service, status, group_id, source)
values
  ('14000000-0000-4000-8000-0000000000d8', pg_temp.open_day(107), '09:00',
   '14000000-0000-4000-8000-0000000000c1', 'small', 'full-groom', 'Booked',
   '14000000-0000-4000-8000-0000000000e6', 'whatsapp_flow');

select lives_ok(
  format($f$
    select public.reschedule_whatsapp_booking_group(
      jsonb_build_array(
        jsonb_build_object('dog_id','14000000-0000-4000-8000-0000000000c1',
                           'slot','10:00','service','full-groom')),
      %L::date, '14000000-0000-4000-8000-0000000000b1',
      '14000000-0000-4000-8000-0000000000e6', null,
      array['14000000-0000-4000-8000-0000000000d8']::uuid[],
      'Rescheduled via WhatsApp', 'tok-side-effects',
      null, null, null,
      pg_temp.reviewed_snapshot(array[
        '14000000-0000-4000-8000-0000000000d8']::uuid[]))
  $f$, pg_temp.open_day(114)),
  'the side-effect fixture reschedule commits');

-- The cancellation carries the distinguishing reason. Nothing consumes it
-- today, but it is the hook a future suppression would key on, and it is what
-- separates this row from an ordinary customer cancellation in the record.
select is(
  (select cancel_reason from public.bookings
    where id = '14000000-0000-4000-8000-0000000000d8'),
  'Rescheduled via WhatsApp',
  'the internal cancellation is marked as a reschedule, not a plain cancel');

-- Capacity: released only as part of this transaction, and exactly once.
select is(
  (select count(*)::int from public.bookings b
    join public.dogs d on d.id = b.dog_id
   where d.human_id = '14000000-0000-4000-8000-0000000000b1'
     and b.status = 'Booked'
     and b.booking_date in (pg_temp.open_day(107), pg_temp.open_day(114))),
  1, 'capacity moves atomically: one live row across old and new dates');

-- booking_events: the old row records a cancellation and the new row a
-- creation. There is no in-place date change, so no 'rescheduled' event is
-- emitted. This matches the previous implementation exactly.
select is(
  (select count(*)::int from public.booking_events
    where booking_id = '14000000-0000-4000-8000-0000000000d8'
      and event_type = 'cancelled'),
  1, 'exactly one cancellation event for the old row, never one per retry');

select is(
  (select count(*)::int from public.booking_events
    where booking_id = '14000000-0000-4000-8000-0000000000d8'
      and event_type = 'rescheduled'),
  0,
  'no in-place rescheduled event: the move is a cancel plus a create, as before');

-- ── 42-45: durable receipt hardening ──────────────────────────────

select is(
  (select count(*)::int from information_schema.table_privileges
    where table_schema = 'public'
      and table_name = 'whatsapp_reschedule_receipts'
      and grantee in ('anon','authenticated','service_role','public')),
  0, 'no application or service role has any access to the receipt table');

-- One receipt per flow_token (the primary key).
select col_is_pk('public', 'whatsapp_reschedule_receipts', 'flow_token',
  'flow_token is the unique durable receipt key');

-- The committed result is immutable: an accidental update is a loud error.
select throws_ok(
  $$ update public.whatsapp_reschedule_receipts
        set new_booking_ids = '{}'::uuid[] where flow_token = 'tok-dup-1' $$,
  'P0001', 'whatsapp_reschedule_receipts rows are immutable (update not allowed)',
  'a committed receipt cannot be altered');

-- DELETE is permitted so retention pruning can run: a receipt older than the
-- 24h session lifetime can never be replayed against, so removing it is safe.
select lives_ok(
  $$ delete from public.whatsapp_reschedule_receipts where flow_token = 'tok-dup-1' $$,
  'a committed receipt can be pruned for retention but not altered');

-- ── 46-48: retention pruning must not weaken idempotency ───────────
--
-- 1. complete a reschedule; 2. expire the session; 3. prune the receipt;
-- 4. resubmit the original token; 5. prove no second reschedule occurs.
-- After pruning, the authoritative protection is the completed Flow session,
-- not the continued existence of the receipt.

insert into public.bookings
  (id, booking_date, slot, dog_id, size, service, status, group_id, source)
values
  ('14000000-0000-4000-8000-0000000000d9', pg_temp.open_day(121), '09:00',
   '14000000-0000-4000-8000-0000000000c1', 'small', 'full-groom', 'Booked',
   '14000000-0000-4000-8000-0000000000e7', 'whatsapp_flow');

insert into public.whatsapp_flow_sessions
  (flow_token, phone_e164, human_id, flow_type, status)
values ('tok-retention', '+447700900999', '14000000-0000-4000-8000-0000000000b1',
        'cancel_reschedule', 'active');

select lives_ok(
  format($f$
    select public.reschedule_whatsapp_booking_group(
      jsonb_build_array(
        jsonb_build_object('dog_id','14000000-0000-4000-8000-0000000000c1',
                           'slot','10:00','service','full-groom')),
      %L::date, '14000000-0000-4000-8000-0000000000b1',
      '14000000-0000-4000-8000-0000000000e7', null,
      array['14000000-0000-4000-8000-0000000000d9']::uuid[],
      'Rescheduled via WhatsApp', 'tok-retention',
      null, null, null,
      pg_temp.reviewed_snapshot(array[
        '14000000-0000-4000-8000-0000000000d9']::uuid[]))
  $f$, pg_temp.open_day(128)),
  'step 1: the reschedule completes and writes a receipt');

select is(
  (select status from public.whatsapp_flow_sessions
    where flow_token = 'tok-retention'),
  'completed',
  'step 1: the receipt transaction also durably completes the matching Flow session');

-- Steps 2 and 3: the session is completed and expired, then retention prunes
-- the receipt.
update public.whatsapp_flow_sessions
   set status = 'completed', expires_at = now() - interval '2 days',
       booking_id = null
 where flow_token = 'tok-retention';
delete from public.whatsapp_reschedule_receipts where flow_token = 'tok-retention';

-- Step 4 and 5: the original token is resubmitted with the receipt gone.
select throws_ok(
  format($f$
    select public.reschedule_whatsapp_booking_group(
      jsonb_build_array(
        jsonb_build_object('dog_id','14000000-0000-4000-8000-0000000000c1',
                           'slot','10:00','service','full-groom')),
      %L::date, '14000000-0000-4000-8000-0000000000b1',
      '14000000-0000-4000-8000-0000000000e7', null,
      array['14000000-0000-4000-8000-0000000000d9']::uuid[],
      'Rescheduled via WhatsApp', 'tok-retention',
      null, null, null,
      pg_temp.reviewed_snapshot(array[
        '14000000-0000-4000-8000-0000000000d9']::uuid[]))
  $f$, pg_temp.open_day(135)),
  'P0002', 'reschedule_already_completed',
  'RETENTION: completed status blocks replay even when booking_id was nulled');

select is(
  (select count(*)::int from public.bookings b
    join public.dogs d on d.id = b.dog_id
   where d.human_id = '14000000-0000-4000-8000-0000000000b1'
     and b.status = 'Booked'
     and b.booking_date in (pg_temp.open_day(121), pg_temp.open_day(128),
                            pg_temp.open_day(135))),
  1, 'RETENTION: still exactly one live booking after the replay attempt');

-- ── 50-66: final-review regressions ────────────────────────────────

-- Recurring staff bookings can deliberately reuse one group id on multiple
-- dates. Moving one occurrence must scope the source by group AND anchored date.
insert into public.bookings
  (id, booking_date, slot, dog_id, size, service, status, group_id, source)
values
  ('14000000-0000-4000-8000-000000000101', pg_temp.open_day(142), '09:00',
   '14000000-0000-4000-8000-0000000000c1', 'small', 'full-groom', 'Booked',
   '14000000-0000-4000-8000-0000000000f1', 'whatsapp_flow'),
  ('14000000-0000-4000-8000-000000000102', pg_temp.open_day(142), '09:30',
   '14000000-0000-4000-8000-0000000000c2', 'small', 'bath-and-brush', 'Booked',
   '14000000-0000-4000-8000-0000000000f1', 'whatsapp_flow'),
  ('14000000-0000-4000-8000-000000000103', pg_temp.open_day(149), '09:00',
   '14000000-0000-4000-8000-0000000000c1', 'small', 'full-groom', 'Booked',
   '14000000-0000-4000-8000-0000000000f1', 'whatsapp_flow'),
  ('14000000-0000-4000-8000-000000000104', pg_temp.open_day(149), '09:30',
   '14000000-0000-4000-8000-0000000000c2', 'small', 'bath-and-brush', 'Booked',
   '14000000-0000-4000-8000-0000000000f1', 'whatsapp_flow');

insert into public.whatsapp_flow_sessions
  (flow_token, phone_e164, human_id, flow_type, status)
values
  ('tok-recurring-date', '+447700901001',
   '14000000-0000-4000-8000-0000000000b1', 'cancel_reschedule', 'active');

select lives_ok(
  format($f$
    select public.reschedule_whatsapp_booking_group(
      jsonb_build_array(
        jsonb_build_object('dog_id','14000000-0000-4000-8000-0000000000c1',
                           'slot','10:00','service','full-groom'),
        jsonb_build_object('dog_id','14000000-0000-4000-8000-0000000000c2',
                           'slot','10:00','service','bath-and-brush')),
      %L::date, '14000000-0000-4000-8000-0000000000b1',
      '14000000-0000-4000-8000-0000000000f1', null,
      array['14000000-0000-4000-8000-000000000101',
            '14000000-0000-4000-8000-000000000102']::uuid[],
      'Rescheduled via WhatsApp', 'tok-recurring-date',
      %L::date, '09:00',
      jsonb_build_object(
        '14000000-0000-4000-8000-0000000000c1','full-groom',
        '14000000-0000-4000-8000-0000000000c2','bath-and-brush'),
      pg_temp.reviewed_snapshot(array[
        '14000000-0000-4000-8000-000000000101',
        '14000000-0000-4000-8000-000000000102']::uuid[]))
  $f$, pg_temp.open_day(156), pg_temp.open_day(142)),
  'RECURRING GROUP: one occurrence can be rescheduled independently');

select is(
  (select count(*)::int from public.bookings
    where id in ('14000000-0000-4000-8000-000000000101',
                 '14000000-0000-4000-8000-000000000102')
      and status = 'Cancelled'),
  2, 'RECURRING GROUP: exactly the anchored source date is cancelled');

select is(
  (select count(*)::int from public.bookings
    where id in ('14000000-0000-4000-8000-000000000103',
                 '14000000-0000-4000-8000-000000000104')
      and status = 'Booked'),
  2, 'RECURRING GROUP: the later occurrence sharing the group id remains booked');

-- An aggregate minimum only checks the earliest row. Freeze every reviewed row
-- so changing only the second dog's slot is still rejected.
insert into public.bookings
  (id, booking_date, slot, dog_id, size, service, status, group_id, source)
values
  ('14000000-0000-4000-8000-000000000111', pg_temp.open_day(163), '09:00',
   '14000000-0000-4000-8000-0000000000c1', 'small', 'full-groom', 'Booked',
   '14000000-0000-4000-8000-0000000000f2', 'whatsapp_flow'),
  ('14000000-0000-4000-8000-000000000112', pg_temp.open_day(163), '09:30',
   '14000000-0000-4000-8000-0000000000c2', 'small', 'bath-and-brush', 'Booked',
   '14000000-0000-4000-8000-0000000000f2', 'whatsapp_flow');

insert into public.whatsapp_flow_sessions
  (flow_token, phone_e164, human_id, flow_type, status)
values
  ('tok-non-earliest-drift', '+447700901002',
   '14000000-0000-4000-8000-0000000000b1', 'cancel_reschedule', 'active');

update public.bookings
   set slot = '11:00'
 where id = '14000000-0000-4000-8000-000000000112';

select throws_ok(
  format($f$
    select public.reschedule_whatsapp_booking_group(
      p_bookings => jsonb_build_array(
        jsonb_build_object('dog_id','14000000-0000-4000-8000-0000000000c1',
                           'slot','10:00','service','full-groom'),
        jsonb_build_object('dog_id','14000000-0000-4000-8000-0000000000c2',
                           'slot','10:00','service','bath-and-brush')),
      p_booking_date => %L::date,
      p_human_id => '14000000-0000-4000-8000-0000000000b1',
      p_old_group_id => '14000000-0000-4000-8000-0000000000f2',
      p_expected_old_ids => array[
        '14000000-0000-4000-8000-000000000111',
        '14000000-0000-4000-8000-000000000112']::uuid[],
      p_reason => 'Rescheduled via WhatsApp',
      p_flow_token => 'tok-non-earliest-drift',
      p_expected_old_snapshot => jsonb_build_array(
        jsonb_build_object(
          'booking_id','14000000-0000-4000-8000-000000000111',
          'dog_id','14000000-0000-4000-8000-0000000000c1',
          'booking_date',%L::date,'slot','09:00','service','full-groom'),
        jsonb_build_object(
          'booking_id','14000000-0000-4000-8000-000000000112',
          'dog_id','14000000-0000-4000-8000-0000000000c2',
          'booking_date',%L::date,'slot','09:30','service','bath-and-brush')))
  $f$, pg_temp.open_day(170), pg_temp.open_day(163), pg_temp.open_day(163)),
  'P0002', 'reschedule_old_visit_changed',
  'EXACT SNAPSHOT: changing only the non-earliest dog slot is refused');

select is(
  (select count(*)::int from public.bookings
    where id in ('14000000-0000-4000-8000-000000000111',
                 '14000000-0000-4000-8000-000000000112')
      and status = 'Booked'),
  2, 'EXACT SNAPSHOT: both old rows remain after non-earliest drift');

-- A move is a complete replacement, never a partial move of one dog.
insert into public.bookings
  (id, booking_date, slot, dog_id, size, service, status, group_id, source)
values
  ('14000000-0000-4000-8000-000000000121', pg_temp.open_day(177), '09:00',
   '14000000-0000-4000-8000-0000000000c1', 'small', 'full-groom', 'Booked',
   '14000000-0000-4000-8000-0000000000f3', 'whatsapp_flow'),
  ('14000000-0000-4000-8000-000000000122', pg_temp.open_day(177), '09:30',
   '14000000-0000-4000-8000-0000000000c2', 'small', 'bath-and-brush', 'Booked',
   '14000000-0000-4000-8000-0000000000f3', 'whatsapp_flow');

insert into public.whatsapp_flow_sessions
  (flow_token, phone_e164, human_id, flow_type, status)
values
  ('tok-incomplete-destination', '+447700901003',
   '14000000-0000-4000-8000-0000000000b1', 'cancel_reschedule', 'active');

select throws_ok(
  format($f$
    select public.reschedule_whatsapp_booking_group(
      jsonb_build_array(
        jsonb_build_object('dog_id','14000000-0000-4000-8000-0000000000c1',
                           'slot','10:00','service','full-groom')),
      %L::date, '14000000-0000-4000-8000-0000000000b1',
      '14000000-0000-4000-8000-0000000000f3', null,
      array['14000000-0000-4000-8000-000000000121',
            '14000000-0000-4000-8000-000000000122']::uuid[],
      'Rescheduled via WhatsApp', 'tok-incomplete-destination',
      null, null, null,
      pg_temp.reviewed_snapshot(array[
        '14000000-0000-4000-8000-000000000121',
        '14000000-0000-4000-8000-000000000122']::uuid[]))
  $f$, pg_temp.open_day(184)),
  'P0002', 'reschedule_replacement_dog_mismatch',
  'COMPLETE REPLACEMENT: a two-dog source cannot become a one-dog destination');

select is(
  (select count(*)::int from public.bookings
    where id in ('14000000-0000-4000-8000-000000000121',
                 '14000000-0000-4000-8000-000000000122')
      and status = 'Booked'),
  2, 'COMPLETE REPLACEMENT: both old rows remain after partial destination refusal');

-- A Flow token is mandatory and belongs to exactly one matching Flow session.
insert into public.bookings
  (id, booking_date, slot, dog_id, size, service, status, group_id, source)
values
  ('14000000-0000-4000-8000-000000000131', pg_temp.open_day(191), '09:00',
   '14000000-0000-4000-8000-0000000000c1', 'small', 'full-groom', 'Booked',
   '14000000-0000-4000-8000-0000000000f4', 'whatsapp_flow'),
  ('14000000-0000-4000-8000-000000000132', pg_temp.open_day(205), '09:00',
   '14000000-0000-4000-8000-0000000000c1', 'small', 'full-groom', 'Booked',
   '14000000-0000-4000-8000-0000000000f5', 'whatsapp_flow');

insert into public.whatsapp_flow_sessions
  (flow_token, phone_e164, human_id, flow_type, status)
values
  ('tok-bound-to-stranger', '+447700901004',
   '14000000-0000-4000-8000-0000000000b2', 'cancel_reschedule', 'active');

select throws_ok(
  format($f$
    select public.reschedule_whatsapp_booking_group(
      jsonb_build_array(
        jsonb_build_object('dog_id','14000000-0000-4000-8000-0000000000c1',
                           'slot','10:00','service','full-groom')),
      %L::date, '14000000-0000-4000-8000-0000000000b1',
      '14000000-0000-4000-8000-0000000000f4', null,
      array['14000000-0000-4000-8000-000000000131']::uuid[],
      'Rescheduled via WhatsApp', null,
      null, null, null,
      pg_temp.reviewed_snapshot(array[
        '14000000-0000-4000-8000-000000000131']::uuid[]))
  $f$, pg_temp.open_day(198)),
  '22023', 'flow_token is required',
  'FLOW TOKEN: an absent token is rejected before source mutation');

select throws_ok(
  format($f$
    select public.reschedule_whatsapp_booking_group(
      jsonb_build_array(
        jsonb_build_object('dog_id','14000000-0000-4000-8000-0000000000c1',
                           'slot','10:00','service','full-groom')),
      %L::date, '14000000-0000-4000-8000-0000000000b1',
      '14000000-0000-4000-8000-0000000000f4', null,
      array['14000000-0000-4000-8000-000000000131']::uuid[],
      'Rescheduled via WhatsApp', '   ',
      null, null, null,
      pg_temp.reviewed_snapshot(array[
        '14000000-0000-4000-8000-000000000131']::uuid[]))
  $f$, pg_temp.open_day(198)),
  '22023', 'flow_token is required',
  'FLOW TOKEN: a blank token is rejected before source mutation');

select throws_ok(
  format($f$
    select public.reschedule_whatsapp_booking_group(
      jsonb_build_array(
        jsonb_build_object('dog_id','14000000-0000-4000-8000-0000000000c1',
                           'slot','10:00','service','full-groom')),
      %L::date, '14000000-0000-4000-8000-0000000000b1',
      '14000000-0000-4000-8000-0000000000f5', null,
      array['14000000-0000-4000-8000-000000000132']::uuid[],
      'Rescheduled via WhatsApp', 'tok-bound-to-stranger',
      null, null, null,
      pg_temp.reviewed_snapshot(array[
        '14000000-0000-4000-8000-000000000132']::uuid[]))
  $f$, pg_temp.open_day(212)),
  'P0002', 'reschedule_flow_session_mismatch',
  'FLOW TOKEN: a token bound to another human is rejected');

select is(
  (select count(*)::int from public.bookings
    where id in ('14000000-0000-4000-8000-000000000131',
                 '14000000-0000-4000-8000-000000000132')
      and status = 'Booked'),
  2, 'FLOW TOKEN: rejected tokens leave both source fixtures unchanged');

-- The receipt hash binds every semantic input. Reusing the committed token
-- with changed reviewed IDs, reason, or exact row snapshot is a conflict.
insert into public.bookings
  (id, booking_date, slot, dog_id, size, service, status, group_id, source)
values
  ('14000000-0000-4000-8000-000000000141', pg_temp.open_day(219), '09:00',
   '14000000-0000-4000-8000-0000000000c1', 'small', 'full-groom', 'Booked',
   '14000000-0000-4000-8000-0000000000f6', 'whatsapp_flow'),
  ('14000000-0000-4000-8000-000000000142', pg_temp.open_day(219), '09:30',
   '14000000-0000-4000-8000-0000000000c2', 'small', 'bath-and-brush', 'Booked',
   '14000000-0000-4000-8000-0000000000f6', 'whatsapp_flow');

insert into public.whatsapp_flow_sessions
  (flow_token, phone_e164, human_id, flow_type, status)
values
  ('tok-semantic-hash', '+447700901005',
   '14000000-0000-4000-8000-0000000000b1', 'cancel_reschedule', 'active');

create or replace function pg_temp.semantic_hash_reschedule(
  p_expected_ids uuid[],
  p_cancel_reason text,
  p_second_slot text
)
returns boolean
language plpgsql
as $$
begin
  return (
    select r.replayed
      from public.reschedule_whatsapp_booking_group(
        p_bookings => jsonb_build_array(
          jsonb_build_object('dog_id','14000000-0000-4000-8000-0000000000c1',
                             'slot','10:00','service','full-groom'),
          jsonb_build_object('dog_id','14000000-0000-4000-8000-0000000000c2',
                             'slot','10:00','service','bath-and-brush')),
        p_booking_date => pg_temp.open_day(226),
        p_human_id => '14000000-0000-4000-8000-0000000000b1',
        p_old_group_id => '14000000-0000-4000-8000-0000000000f6',
        p_expected_old_ids => p_expected_ids,
        p_reason => p_cancel_reason,
        p_flow_token => 'tok-semantic-hash',
        p_expected_old_snapshot => jsonb_build_array(
          jsonb_build_object(
            'booking_id','14000000-0000-4000-8000-000000000141',
            'dog_id','14000000-0000-4000-8000-0000000000c1',
            'booking_date',pg_temp.open_day(219),
            'slot','09:00','service','full-groom'),
          jsonb_build_object(
            'booking_id','14000000-0000-4000-8000-000000000142',
            'dog_id','14000000-0000-4000-8000-0000000000c2',
            'booking_date',pg_temp.open_day(219),
            'slot',p_second_slot,'service','bath-and-brush'))) r
  );
end;
$$;

select lives_ok(
  $$ select pg_temp.semantic_hash_reschedule(
       array['14000000-0000-4000-8000-000000000141',
             '14000000-0000-4000-8000-000000000142']::uuid[],
       'Rescheduled via WhatsApp', '09:30') $$,
  'SEMANTIC HASH: the baseline request commits once');

select throws_ok(
  $$ select pg_temp.semantic_hash_reschedule(
       array['14000000-0000-4000-8000-000000000141',
             '14000000-0000-4000-8000-000000000fff']::uuid[],
       'Rescheduled via WhatsApp', '09:30') $$,
  'P0002', 'reschedule_idempotency_conflict',
  'SEMANTIC HASH: changed reviewed booking IDs conflict');

select throws_ok(
  $$ select pg_temp.semantic_hash_reschedule(
       array['14000000-0000-4000-8000-000000000141',
             '14000000-0000-4000-8000-000000000142']::uuid[],
       'Customer asked to move', '09:30') $$,
  'P0002', 'reschedule_idempotency_conflict',
  'SEMANTIC HASH: changed cancellation reason conflicts');

select throws_ok(
  $$ select pg_temp.semantic_hash_reschedule(
       array['14000000-0000-4000-8000-000000000141',
             '14000000-0000-4000-8000-000000000142']::uuid[],
       'Rescheduled via WhatsApp', '11:00') $$,
  'P0002', 'reschedule_idempotency_conflict',
  'SEMANTIC HASH: changed exact reviewed-row snapshot conflicts');

select hasnt_column(
  'public', 'whatsapp_reschedule_receipts', 'human_id',
  'DATA MINIMISATION: receipts do not store the raw human id');

select is(
  (select count(*)::int
     from pg_constraint c
    where c.conrelid = 'public.whatsapp_reschedule_receipts'::regclass
      and c.contype = 'f'
      and c.confrelid = 'public.humans'::regclass),
  0, 'DATA MINIMISATION: receipt retention cannot block human deletion');

-- Flow tokens are opaque identities. Surrounding whitespace is invalid only
-- when the entire token is blank; a nonblank token must otherwise be matched
-- and locked verbatim by both writer and replay paths.
insert into public.whatsapp_flow_sessions
  (flow_token, phone_e164, human_id, flow_type, status)
values
  ('  tok-opaque-whitespace  ', '+447700901006',
   '14000000-0000-4000-8000-0000000000b1', 'cancel_reschedule', 'completed');

insert into public.whatsapp_reschedule_receipts
  (flow_token, request_hash, new_booking_ids, cancelled_booking_ids)
values
  ('  tok-opaque-whitespace  ', md5('opaque-token-fixture'),
   array['14000000-0000-4000-8000-000000000151']::uuid[],
   array['14000000-0000-4000-8000-000000000152']::uuid[]);

select results_eq(
  $$ select new_booking_ids, cancelled_booking_ids
       from public.replay_whatsapp_reschedule_receipt(
         '  tok-opaque-whitespace  ',
         '14000000-0000-4000-8000-0000000000b1') $$,
  $$ values (
       array['14000000-0000-4000-8000-000000000151']::uuid[],
       array['14000000-0000-4000-8000-000000000152']::uuid[]) $$,
  'OPAQUE TOKEN: replay preserves surrounding whitespace and returns the exact receipt');

select * from finish();
rollback;

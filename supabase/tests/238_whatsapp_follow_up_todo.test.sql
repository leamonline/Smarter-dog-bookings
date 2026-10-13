-- WhatsApp dead-end follow-up to-dos (supabase/functions/_shared/staffFollowUp.ts).
--
-- raiseFollowUpTodo writes through the service-role client. This asserts the
-- ROW the database keeps for that exact write — not the arguments handed to
-- it (CONTRIBUTING.md, "A test on a write path asserts the row that was
-- written"): the closure-link CHECK, the humans FK and the defaults all have
-- to accept it, staff must be able to read and tick it off, and the helper's
-- duplicate check must find it. Synthetic fixtures are rolled back.

begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

set local session_replication_role = replica;

insert into auth.users (id) values ('23800000-0000-4000-8000-000000000041');
insert into public.staff_profiles (id, user_id, role, display_name)
values ('23800000-0000-4000-8000-000000000040', '23800000-0000-4000-8000-000000000041', 'staff', 'Follow-up Staff');
insert into public.humans (id, name, surname, phone)
values ('23800000-0000-4000-8000-000000000001', 'Synthetic', 'Customer', '+447700900238');

set local session_replication_role = default;

-- ── The write, exactly as raiseFollowUpTodo sends it ───────────
set local role service_role;

select lives_ok(
  $$ insert into public.salon_todos (id, text, done, sort_order, human_id, kind)
     values ('23800000-0000-4000-8000-000000000021',
             'WhatsApp follow-up: Synthetic Customer wants to move a groom that is within 24 hours. We replied that the team will sort it — follow up in the WhatsApp inbox.',
             false, 4, '23800000-0000-4000-8000-000000000001', 'general') $$,
  'the follow-up row passes every constraint on salon_todos'
);

reset role;

-- ── The row that was written ───────────────────────────────────
select is(
  (select kind from public.salon_todos where id = '23800000-0000-4000-8000-000000000021'),
  'general',
  'it is an ordinary task, so staff can tick it off'
);

select is(
  (select human_id from public.salon_todos where id = '23800000-0000-4000-8000-000000000021'),
  '23800000-0000-4000-8000-000000000001'::uuid,
  'it stays linked to the customer'
);

select ok(
  (select done = false and booking_visit_id is null and closure_date is null and booking_change_request_id is null
     from public.salon_todos where id = '23800000-0000-4000-8000-000000000021'),
  'it is open and carries no workflow links'
);

-- The helper's duplicate check, run as the helper runs it.
select is(
  (select count(*)::int from public.salon_todos
    where human_id = '23800000-0000-4000-8000-000000000001'
      and done = false
      and text like 'WhatsApp follow-up:%'
      and created_at >= now() - interval '12 hours'),
  1,
  'the duplicate check finds the open follow-up'
);

-- ── Staff can see it and tick it off ───────────────────────────
select set_config('request.jwt.claims', '{"sub":"23800000-0000-4000-8000-000000000041","role":"authenticated"}', true);
set local role authenticated;

select is(
  (select count(*)::int from public.salon_todos where id = '23800000-0000-4000-8000-000000000021'),
  1,
  'staff can read the follow-up'
);

select lives_ok(
  $$ update public.salon_todos set done = true where id = '23800000-0000-4000-8000-000000000021' $$,
  'staff can tick it off'
);

reset role;

select is(
  (select count(*)::int from public.salon_todos
    where human_id = '23800000-0000-4000-8000-000000000001'
      and done = false
      and text like 'WhatsApp follow-up:%'),
  0,
  'a ticked-off follow-up no longer blocks a new one'
);

select * from finish();
rollback;

-- create_customer_booking_group states WHY it refused an account (#1006).
--
-- Migration 20261019120000 adds a DETAIL reason code to the RPC's four
-- account-state refusals, per the 20260826120000 contract. For each one this
-- file proves three things: DETAIL carries the code, the SQLSTATE is unchanged,
-- and the message is byte-identical, because the wizard and older clients still
-- recognise these refusals by their prose.

begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

\ir fixtures/ensure_local_vault_secrets.psql

set local session_replication_role = replica;

insert into auth.users (id) values
  ('62510000-0000-4000-8000-000000000001'),  -- not yet approved
  ('62510000-0000-4000-8000-000000000002'),  -- approved, no address
  ('62510000-0000-4000-8000-000000000003'),  -- approved, complete
  ('62510000-0000-4000-8000-000000000004');  -- owns the other dog

insert into public.humans (
  id, name, surname, address, customer_user_id, source,
  approved_at, policies_accepted_at, policies_version
) values
  ('62510000-0000-4000-8000-000000000011', 'Waiting', 'Approval', '1 Queue Lane',
   '62510000-0000-4000-8000-000000000001', 'existing', null, now(), '2099-refusal'),
  ('62510000-0000-4000-8000-000000000012', 'Missing', 'Address', '',
   '62510000-0000-4000-8000-000000000002', 'existing', now(), now(), '2099-refusal'),
  ('62510000-0000-4000-8000-000000000013', 'Complete', 'Profile', '3 Done Road',
   '62510000-0000-4000-8000-000000000003', 'existing', now(), now(), '2099-refusal'),
  ('62510000-0000-4000-8000-000000000014', 'Other', 'Owner', '4 Elsewhere',
   '62510000-0000-4000-8000-000000000004', 'existing', now(), now(), '2099-refusal');

insert into public.dogs (id, name, breed, human_id, size, is_pregnant) values
  ('62520000-0000-4000-8000-000000000001', 'Unsized', 'Poodle',
   '62510000-0000-4000-8000-000000000013', null, false),
  ('62520000-0000-4000-8000-000000000002', 'NotYours', 'Poodle',
   '62510000-0000-4000-8000-000000000014', 'small', false);

set local session_replication_role = default;

-- Call the RPC as one customer and report what it raised. Catching the
-- exception rolls back the subtransaction, so the cases stay isolated.
create or replace function pg_temp.refusal_of(p_user uuid, p_dog uuid)
returns table (detail text, state text, message text)
language plpgsql as $fn$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  begin
    perform public.create_customer_booking_group(
      jsonb_build_array(jsonb_build_object(
        'dog_id', p_dog, 'slot', '09:00', 'service', 'full-groom')),
      date '2099-01-05'
    );
    detail := '(no exception)';
  exception when others then
    get stacked diagnostics
      detail = pg_exception_detail,
      state = returned_sqlstate,
      message = message_text;
  end;
  reset role;
  return next;
end;
$fn$;

create temp table r as
select 'awaiting'::text as k, * from pg_temp.refusal_of(
  '62510000-0000-4000-8000-000000000001', '62520000-0000-4000-8000-000000000001')
union all
select 'profile', * from pg_temp.refusal_of(
  '62510000-0000-4000-8000-000000000002', '62520000-0000-4000-8000-000000000001')
union all
select 'unsized', * from pg_temp.refusal_of(
  '62510000-0000-4000-8000-000000000003', '62520000-0000-4000-8000-000000000001')
union all
select 'not_owned', * from pg_temp.refusal_of(
  '62510000-0000-4000-8000-000000000003', '62520000-0000-4000-8000-000000000002');

-- ── Awaiting approval ───────────────────────────────────────
select is((select detail from r where k = 'awaiting'), 'awaiting_approval',
  'an unapproved account emits awaiting_approval');
select is((select state from r where k = 'awaiting'), 'P0001',
  'awaiting approval keeps SQLSTATE P0001');
select is((select message from r where k = 'awaiting'),
  'Your account is awaiting approval. We''ll be in touch as soon as you''re set up.',
  'awaiting approval keeps its message');

-- ── Profile incomplete ──────────────────────────────────────
select is((select detail from r where k = 'profile'), 'profile_incomplete',
  'an incomplete profile emits profile_incomplete');
select is((select state from r where k = 'profile'), 'P0001',
  'profile incomplete keeps SQLSTATE P0001');
select is((select message from r where k = 'profile'),
  'Please complete your profile (name, address and policy agreement) before booking',
  'profile incomplete keeps its message');

-- ── Dog size unconfirmed ────────────────────────────────────
select is((select detail from r where k = 'unsized'), 'dog_size_unconfirmed',
  'a dog with no confirmed size emits dog_size_unconfirmed');
select is((select state from r where k = 'unsized'), '22023',
  'dog size unconfirmed keeps SQLSTATE 22023');
select is((select message from r where k = 'unsized'), 'dog_size_unconfirmed',
  'dog size unconfirmed keeps its message');

-- ── Dog not on this account ─────────────────────────────────
select is((select detail from r where k = 'not_owned'), 'dog_not_owned',
  'another customer''s dog emits dog_not_owned');
select is((select state from r where k = 'not_owned'), '42704',
  'dog not owned keeps SQLSTATE 42704');
select is((select message from r where k = 'not_owned'),
  'Row 1: that dog is not on your account',
  'dog not owned keeps its message');

select * from finish();
rollback;

-- A staff merge must never make a customer contactable again by deleting the
-- duplicate record that held their active channel suppression. Synthetic
-- fixtures are rolled back.

begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

set local session_replication_role = replica;

insert into auth.users (id)
values ('12500000-0000-4000-8000-000000000041');

insert into public.staff_profiles (id, user_id, role, display_name)
values (
  '12500000-0000-4000-8000-000000000040',
  '12500000-0000-4000-8000-000000000041',
  'staff',
  'Merge Opt-out Staff'
);

insert into public.humans (
  id, name, surname, sms, whatsapp,
  sms_opted_out, sms_opted_out_at, sms_opted_out_reason,
  whatsapp_opted_out, whatsapp_opted_out_at, whatsapp_opted_out_reason,
  email_opted_out, email_opted_out_at, email_opted_out_reason
)
values
  (
    '12500000-0000-4000-8000-000000000001',
    'Merge', 'Winner', false, false,
    true, timestamptz '2026-01-01 10:00:00+00', null,
    false, timestamptz '2025-01-01 10:00:00+00', 'inactive winner history',
    false, null, null
  ),
  (
    '12500000-0000-4000-8000-000000000002',
    'Merge', 'Loser', true, true,
    true, timestamptz '2026-02-01 10:00:00+00', 'loser SMS suppression',
    true, timestamptz '2026-03-01 10:00:00+00', 'loser WhatsApp suppression',
    true, timestamptz '2026-04-01 10:00:00+00', 'loser email suppression'
  );

set local session_replication_role = default;
select set_config(
  'request.jwt.claims',
  '{"sub":"12500000-0000-4000-8000-000000000041","role":"authenticated"}',
  true
);
set local role authenticated;

select lives_ok(
  $$ select public.merge_humans(
       '12500000-0000-4000-8000-000000000001',
       '12500000-0000-4000-8000-000000000002'
     ) $$,
  'staff can merge the synthetic duplicate humans'
);

set local role postgres;

select results_eq(
  $$
    select
      sms,
      whatsapp,
      sms_opted_out,
      sms_opted_out_at,
      sms_opted_out_reason,
      whatsapp_opted_out,
      whatsapp_opted_out_at,
      whatsapp_opted_out_reason,
      email_opted_out,
      email_opted_out_at,
      email_opted_out_reason
    from public.humans
    where id = '12500000-0000-4000-8000-000000000001'
  $$,
  $$
    values (
      true,
      true,
      true,
      timestamptz '2026-01-01 10:00:00+00',
      null::text,
      true,
      timestamptz '2026-03-01 10:00:00+00',
      'loser WhatsApp suppression'::text,
      true,
      timestamptz '2026-04-01 10:00:00+00',
      'loser email suppression'::text
    )
  $$,
  'merge keeps channel setup and each active opt-out without mixing audit events'
);

select is(
  (
    select count(*)
    from public.humans
    where id = '12500000-0000-4000-8000-000000000002'
  ),
  0::bigint,
  'merge still deletes the loser record'
);

select * from finish();
rollback;

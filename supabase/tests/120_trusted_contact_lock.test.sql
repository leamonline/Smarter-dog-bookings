-- Customer trusted-contact creation is disabled until an approved invitation
-- lifecycle exists. Existing links remain readable, while direct inserts stay
-- blocked by RLS. Synthetic fixtures are rolled back.

begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

set local session_replication_role = replica;

insert into auth.users (id) values
  ('12000000-0000-4000-8000-000000000002');

insert into public.humans (
  id, name, surname, phone, customer_user_id
) values
  (
    '12000000-0000-4000-8000-000000000001',
    'Customer',
    'Owner',
    '+447700900121',
    '12000000-0000-4000-8000-000000000002'
  ),
  (
    '12000000-0000-4000-8000-000000000010',
    'Existing',
    'Contact',
    '+447700900120',
    null
  ),
  (
    '12000000-0000-4000-8000-000000000020',
    'Candidate',
    'Contact',
    '+447700900122',
    null
  );

insert into public.human_trusted_contacts (
  human_id, trusted_id, relationship
) values (
  '12000000-0000-4000-8000-000000000001',
  '12000000-0000-4000-8000-000000000010',
  'Neighbour'
);

set local session_replication_role = default;

select ok(
  to_regprocedure(
    'public.add_customer_trusted_human(text,text,text,text)'
  ) is null,
  'the customer trusted-human creation function is absent'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"12000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
set local role authenticated;

select ok(
  to_regprocedure('public.list_customer_trusted_humans()') is not null,
  'the narrow customer trusted-human read function exists'
);

select is(
  (select name
   from public.list_customer_trusted_humans()
   where id = '12000000-0000-4000-8000-000000000010'),
  'Existing'::text,
  'the read function returns the linked contact name'
);

select is(
  (select surname
   from public.list_customer_trusted_humans()
   where id = '12000000-0000-4000-8000-000000000010'),
  'Contact'::text,
  'the read function returns the linked contact surname'
);

select is(
  (select phone
   from public.list_customer_trusted_humans()
   where id = '12000000-0000-4000-8000-000000000010'),
  '+447700900120'::text,
  'the read function returns the linked contact phone'
);

select is(
  (select relationship
   from public.list_customer_trusted_humans()
   where id = '12000000-0000-4000-8000-000000000010'),
  'Neighbour'::text,
  'the read function returns the trusted-contact relationship'
);

select throws_ok(
  $$ insert into public.human_trusted_contacts (
       human_id, trusted_id, relationship
     ) values (
       '12000000-0000-4000-8000-000000000001',
       '12000000-0000-4000-8000-000000000020',
       'Friend'
     ) $$,
  '42501',
  null,
  'the customer cannot insert a trusted-contact link directly'
);

select is(
  (select count(*)
   from public.human_trusted_contacts
   where human_id = '12000000-0000-4000-8000-000000000001'
     and trusted_id = '12000000-0000-4000-8000-000000000020'),
  0::bigint,
  'the blocked insert creates no new trusted-contact link'
);

reset role;
select set_config('request.jwt.claims', '', true);
set local role anon;

select throws_ok(
  $$ select * from public.list_customer_trusted_humans() $$,
  '42501',
  null,
  'anon cannot execute the customer trusted-human read function'
);

reset role;
select * from finish();
rollback;

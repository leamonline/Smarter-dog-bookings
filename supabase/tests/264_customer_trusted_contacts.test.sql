-- Customer-added trusted contacts (20261115120100): live on save, stored in
-- their own table, never looked up against or created as humans rows, written
-- only through the customer commands, visible to staff, and carried across a
-- staff merge. Synthetic fixtures are rolled back.

begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

set local session_replication_role = replica;

insert into auth.users (id) values
  ('26400000-0000-4000-8000-0000000000a1'),
  ('26400000-0000-4000-8000-0000000000b1'),
  ('26400000-0000-4000-8000-0000000000c1');

insert into public.staff_profiles (id, user_id, role, display_name) values
  ('26400000-0000-4000-8000-0000000000c0', '26400000-0000-4000-8000-0000000000c1', 'staff', 'Trusted Contacts Staff');

insert into public.humans (id, name, surname, phone, customer_user_id) values
  ('26400000-0000-4000-8000-0000000000a0', 'Contact', 'Owner', '+447700900461', '26400000-0000-4000-8000-0000000000a1'),
  ('26400000-0000-4000-8000-0000000000b0', 'Other', 'Owner', '+447700900462', '26400000-0000-4000-8000-0000000000b1'),
  -- An existing customer whose number the first customer will type.
  ('26400000-0000-4000-8000-0000000000d0', 'Existing', 'Customer', '+447700900463', null),
  -- A duplicate of the first customer, for the merge check.
  ('26400000-0000-4000-8000-0000000000e0', 'Contact', 'Duplicate', null, null);

insert into public.customer_trusted_contacts (id, owner_human_id, name, phone) values
  ('26400000-0000-4000-8000-0000000000f1', '26400000-0000-4000-8000-0000000000e0', 'Merged', '+447700900469');

set local session_replication_role = default;

create temporary table counts_before on commit drop as
  select
    (select count(*) from public.humans) as humans,
    (select count(*) from public.human_trusted_contacts) as links;
grant select on counts_before to authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"26400000-0000-4000-8000-0000000000a1","role":"authenticated"}',
  true
);
set local role authenticated;

select is(
  (select phone from public.save_customer_trusted_contact(null, 'Gran', 'Smith', '07700 900 463', 'Mum')),
  '+447700900463'::text,
  'a UK mobile typed with spaces is saved in +44 form'
);

select is(
  (select name || ' ' || surname from public.list_customer_trusted_contacts() where relationship = 'Mum'),
  'Gran Smith'::text,
  'it comes back exactly as the customer typed it, not as the existing customer with that number'
);

select is(
  (select phone from public.save_customer_trusted_contact(null, 'Neighbour', null, '0161 496 0000', null)),
  '0161 496 0000'::text,
  'a landline is kept as typed'
);

select throws_ok(
  $$ select * from public.save_customer_trusted_contact(null, 'Typo', null, '0770090012', null) $$,
  '22023',
  'invalid_mobile',
  'a mobile with a digit missing is refused'
);

select throws_ok(
  $$ select * from public.save_customer_trusted_contact(null, '  ', null, '07700900464', null) $$,
  '22023',
  'name_required',
  'a name is required'
);

select throws_ok(
  $$ select * from public.save_customer_trusted_contact(null, 'Nobody', null, '', null) $$,
  '22023',
  'phone_required',
  'a phone number is required'
);

select is(
  (select relationship from public.save_customer_trusted_contact(
     (select id from public.list_customer_trusted_contacts() where name = 'Neighbour'),
     'Neighbour', null, '0161 496 0000', 'Next door')),
  'Next door'::text,
  'a customer can edit their own contact'
);

select lives_ok(
  $$ select public.save_customer_trusted_contact(null, v.name, null, v.phone, null)
     from (values ('Three', '07700900471'), ('Four', '07700900472'),
                  ('Five', '07700900473'), ('Six', '07700900474')) as v(name, phone) $$,
  'a customer can hold six contacts'
);

select throws_ok(
  $$ select * from public.save_customer_trusted_contact(null, 'Seven', null, '07700900475', null) $$,
  '22023',
  'too_many_contacts',
  'a seventh contact is refused'
);

select is(
  (select count(*)::int from public.customer_trusted_contacts),
  0,
  'a customer cannot read the table directly'
);

select throws_ok(
  $$ insert into public.customer_trusted_contacts (owner_human_id, name, phone)
     values ('26400000-0000-4000-8000-0000000000a0', 'Raw', '07700900476') $$,
  '42501',
  null,
  'a customer cannot insert into the table directly'
);

select ok(
  (select remove_customer_trusted_contact from public.remove_customer_trusted_contact(
     (select id from public.list_customer_trusted_contacts() where name = 'Six'))),
  'a customer can remove their own contact'
);

select is(
  (select count(*)::int from public.list_customer_trusted_contacts()),
  5,
  'the removed contact is gone from their list'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"26400000-0000-4000-8000-0000000000b1","role":"authenticated"}',
  true
);

select is(
  (select count(*)::int from public.list_customer_trusted_contacts()),
  0,
  'another customer sees none of them'
);

set local role postgres;
create temporary table target on commit drop as
  select id from public.customer_trusted_contacts
  where owner_human_id = '26400000-0000-4000-8000-0000000000a0' and name = 'Gran';
grant select on target to authenticated;
set local role authenticated;

select throws_ok(
  format(
    $$ select * from public.save_customer_trusted_contact(%L, 'Hijack', null, '07700900477', null) $$,
    (select id from target)
  ),
  '42704',
  'contact_not_found',
  'another customer cannot edit someone else''s contact'
);

select throws_ok(
  format($$ select public.remove_customer_trusted_contact(%L) $$, (select id from target)),
  '42704',
  'contact_not_found',
  'another customer cannot remove someone else''s contact'
);

set local role postgres;

select is(
  (select owner_human_id from public.customer_trusted_contacts where id = (select id from target)),
  '26400000-0000-4000-8000-0000000000a0'::uuid,
  'the written row belongs to the customer who saved it'
);

select ok(
  (select humans from counts_before) = (select count(*) from public.humans)
    and (select links from counts_before) = (select count(*) from public.human_trusted_contacts),
  'no humans row and no human_trusted_contacts link was created'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"26400000-0000-4000-8000-0000000000c1","role":"authenticated"}',
  true
);
set local role authenticated;

select is(
  (select count(*)::int from public.customer_trusted_contacts
   where owner_human_id = '26400000-0000-4000-8000-0000000000a0'),
  5,
  'staff can see a customer''s contacts'
);

select lives_ok(
  $$ select public.merge_humans(
       '26400000-0000-4000-8000-0000000000a0',
       '26400000-0000-4000-8000-0000000000e0') $$,
  'staff can merge the duplicate into the customer'
);

set local role postgres;

select is(
  (select owner_human_id from public.customer_trusted_contacts where id = '26400000-0000-4000-8000-0000000000f1'),
  '26400000-0000-4000-8000-0000000000a0'::uuid,
  'the merged record''s contact moves to the winner instead of being deleted'
);

select ok(
  to_regprocedure('public.add_customer_trusted_human(text,text,text,text)') is null,
  'the old phone-lookup function stays dropped'
);

select * from finish();
rollback;

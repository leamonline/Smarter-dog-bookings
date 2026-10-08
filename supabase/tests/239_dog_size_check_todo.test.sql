-- Dog size check to-dos (migration 20261008120000_dog_size_check_todo).
--
-- A customer waiting on a dog size gets exactly one open staff to-do; staff
-- setting the size ticks it off; and none of it lets a customer set
-- dogs.size. Asserts the rows that were written, not the calls made.
-- Synthetic fixtures are rolled back.

begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

set local session_replication_role = replica;

insert into auth.users (id) values
  ('23900000-0000-4000-8000-000000000011'),
  ('23900000-0000-4000-8000-000000000021'),
  ('23900000-0000-4000-8000-000000000041');

insert into public.humans (
  id, name, surname, address, customer_user_id, source, approved_at,
  policies_accepted_at, policies_version
) values
  ('23900000-0000-4000-8000-000000000010', 'Approved', 'Owner', '1 Test Street',
   '23900000-0000-4000-8000-000000000011', 'existing', now(), now(), '2026-10-test'),
  ('23900000-0000-4000-8000-000000000020', 'Other', 'Owner', '2 Test Street',
   '23900000-0000-4000-8000-000000000021', 'existing', now(), now(), '2026-10-test');

insert into public.staff_profiles (id, user_id, role, display_name)
values ('23900000-0000-4000-8000-000000000040', '23900000-0000-4000-8000-000000000041', 'staff', 'Size Staff');

-- An older dog with no size that no customer write has touched (the import case).
insert into public.dogs (id, name, breed, size, human_id) values
  ('23900000-0000-4000-8000-000000000101', 'Legacy', 'Mystery Mix', null,
   '23900000-0000-4000-8000-000000000010'),
  ('23900000-0000-4000-8000-000000000201', 'Not Yours', 'Mystery Mix', null,
   '23900000-0000-4000-8000-000000000020');

set local session_replication_role = default;

-- ── A customer adds a dog whose size can't be worked out ────
select set_config('request.jwt.claims',
  '{"sub":"23900000-0000-4000-8000-000000000011","role":"authenticated"}', true);
set local role authenticated;

select lives_ok(
  $$ select * from public.create_customer_dog(
       'Bramble', 'Pug x Labrador', 'medium', '23900000-0000-4000-8000-000000000010') $$,
  'the customer can still add a dog whose size needs confirming'
);

-- A dog whose breed gives a size needs nothing from staff.
select lives_ok(
  $$ select * from public.create_customer_dog(
       'Pip', 'Pug x Shih Tzu', 'large', '23900000-0000-4000-8000-000000000010') $$,
  'a dog with a derivable size is added as before'
);

reset role;

select is(
  (select count(*)::int from public.salon_todos t
     join public.dogs d on d.id = t.dog_id
    where d.name = 'Bramble' and t.done = false),
  1,
  'adding a dog with no size raises one open to-do linked to that dog'
);

select is(
  (select t.text from public.salon_todos t join public.dogs d on d.id = t.dog_id
    where d.name = 'Bramble' and t.done = false),
  'Confirm size: Bramble (Pug x Labrador) — Approved Owner thinks medium. They can''t book online until it''s set.',
  'the to-do names the dog, breed, owner and their estimate'
);

select ok(
  (select t.kind = 'general' and t.human_id = '23900000-0000-4000-8000-000000000010'
     from public.salon_todos t join public.dogs d on d.id = t.dog_id
    where d.name = 'Bramble' and t.done = false),
  'it is an ordinary task linked to the customer, so staff can tick it off'
);

select is(
  (select count(*)::int from public.salon_todos t join public.dogs d on d.id = t.dog_id
    where d.name = 'Pip'),
  0,
  'no to-do for a dog whose size came from its breed'
);

-- ── The customer changes their estimate: same to-do, new text ─
select set_config('request.jwt.claims',
  '{"sub":"23900000-0000-4000-8000-000000000011","role":"authenticated"}', true);
set local role authenticated;

select lives_ok(
  $$ select * from public.update_customer_dog(
       (select id from public.dogs where name = 'Bramble'), 'Bramble', 'Pug x Labrador', 'large', null) $$,
  'the customer can change their estimate'
);

-- ── The wizard asks about an older dog, twice ───────────────
select lives_ok(
  $$ select public.request_dog_size_check('23900000-0000-4000-8000-000000000101') $$,
  'the wizard can ask staff to confirm an older dog''s size'
);
select lives_ok(
  $$ select public.request_dog_size_check('23900000-0000-4000-8000-000000000101') $$,
  'asking again is harmless'
);

select throws_ok(
  $$ select public.request_dog_size_check('23900000-0000-4000-8000-000000000201') $$,
  '42704', null,
  'a customer cannot raise a to-do for someone else''s dog'
);

select throws_ok(
  $$ select public.raise_dog_size_check_todo('23900000-0000-4000-8000-000000000201') $$,
  '42501', null,
  'the internal writer is not callable by customers'
);

select is(
  (select size from public.dogs where name = 'Bramble'),
  null::text,
  'none of this sets dogs.size'
);

reset role;

select ok(
  (select count(*) = 1 and bool_and(t.text like '%thinks large.%')
     from public.salon_todos t join public.dogs d on d.id = t.dog_id
    where d.name = 'Bramble' and t.done = false),
  'a changed estimate refreshes the one open to-do rather than adding another'
);

select ok(
  (select count(*) = 1 and bool_and(t.text like '%Legacy (Mystery Mix) — Approved Owner gave no estimate.%')
     from public.salon_todos t
    where t.dog_id = '23900000-0000-4000-8000-000000000101' and t.done = false),
  'repeated wizard requests leave exactly one open to-do for the older dog'
);

-- ── Staff set the size: the to-do ticks itself off ──────────
select set_config('request.jwt.claims',
  '{"sub":"23900000-0000-4000-8000-000000000041","role":"authenticated"}', true);
set local role authenticated;

update public.dogs set size = 'medium' where name = 'Bramble';

reset role;

select is(
  (select count(*)::int from public.salon_todos t join public.dogs d on d.id = t.dog_id
    where d.name = 'Bramble' and t.done = false),
  0,
  'setting the size closes the open to-do'
);

select is(
  (select count(*)::int from public.salon_todos t
    where t.dog_id = '23900000-0000-4000-8000-000000000101' and t.done = false),
  1,
  'other dogs'' to-dos are untouched'
);

select * from finish();
rollback;

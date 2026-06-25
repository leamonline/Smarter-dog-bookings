-- RLS isolation: a signed-in customer can read ONLY their own humans / dogs /
-- bookings; another customer's rows are invisible; anon sees nothing.
--
-- The SELECT policies are `is_staff() OR <owned-by auth.uid()>`. We act as the
-- `authenticated`/`anon` roles (not the postgres superuser, which bypasses RLS)
-- and set the JWT `sub` claim to drive auth.uid(). `humans.customer_user_id`
-- has no FK to auth.users, so plain UUIDs double as the auth uid — no auth.users
-- seeding needed. The fixtures are inserted with triggers disabled
-- (session_replication_role = replica) so the booking gates / notify triggers
-- don't fire; RLS is unaffected by that setting. One transaction, rolled back.

begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

set local session_replication_role = replica;

insert into public.humans (id, name, customer_user_id) values
  ('11111111-1111-4111-8111-111111111111', 'Cust A', 'a0000000-0000-4000-8000-00000000000a'),
  ('22222222-2222-4222-8222-222222222222', 'Cust B', 'b0000000-0000-4000-8000-00000000000b');

insert into public.dogs (id, name, human_id) values
  ('d1111111-1111-4111-8111-111111111111', 'DogA', '11111111-1111-4111-8111-111111111111'),
  ('d2222222-2222-4222-8222-222222222222', 'DogB', '22222222-2222-4222-8222-222222222222');

insert into public.bookings (id, booking_date, slot, dog_id, size, service, status) values
  ('c1111111-1111-4111-8111-111111111111', current_date + 7, '09:00',
   'd1111111-1111-4111-8111-111111111111', 'small', 'full-groom', 'Booked'),
  ('c2222222-2222-4222-8222-222222222222', current_date + 7, '09:30',
   'd2222222-2222-4222-8222-222222222222', 'small', 'full-groom', 'Booked');

set local session_replication_role = default;

-- Act as Customer A (claim set as superuser first, then drop to authenticated).
set local request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-00000000000a","role":"authenticated"}';
set local role authenticated;

select is((select count(*) from public.humans),   1::bigint, 'A sees exactly their own humans row');
select is((select count(*) from public.dogs),     1::bigint, 'A sees only their own dog');
select is((select count(*) from public.bookings), 1::bigint, 'A sees only their own booking');
select ok(
  exists(select 1 from public.dogs where id = 'd1111111-1111-4111-8111-111111111111')
  and not exists(select 1 from public.dogs where id = 'd2222222-2222-4222-8222-222222222222'),
  'A sees DogA but not DogB'
);

-- Act as Customer B — symmetric isolation.
reset role;
set local request.jwt.claims = '{"sub":"b0000000-0000-4000-8000-00000000000b","role":"authenticated"}';
set local role authenticated;

select is((select count(*) from public.bookings), 1::bigint, 'B sees only their own booking');
select ok(
  exists(select 1 from public.bookings where id = 'c2222222-2222-4222-8222-222222222222')
  and not exists(select 1 from public.bookings where id = 'c1111111-1111-4111-8111-111111111111'),
  'B sees their own booking, not A''s'
);

-- Anon (no JWT) has the table grant but no applicable policy → sees nothing.
reset role;
set local request.jwt.claims = '';
set local role anon;

select is((select count(*) from public.humans), 0::bigint, 'anon sees no humans');

reset role;
select * from finish();
rollback;

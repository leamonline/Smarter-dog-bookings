-- device_tokens: a signed-in person manages only their own APNs token, the
-- role has to match is_staff(), and notification_log accepts channel 'apns'
-- without dropping 'webpush'. One transaction, rolled back.

begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into auth.users (id) values
  ('26600000-0000-4000-8000-0000000000a1'),
  ('26600000-0000-4000-8000-0000000000b1'),
  ('26600000-0000-4000-8000-0000000000c1');

insert into public.staff_profiles (user_id, role, display_name)
values ('26600000-0000-4000-8000-0000000000c1', 'staff', 'Token Staff');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.device_tokens'::regclass),
  'RLS is enabled on device_tokens'
);

set local role anon;
select throws_ok(
  $$ select * from public.device_tokens $$,
  '42501',
  null,
  'anon cannot read device tokens'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"26600000-0000-4000-8000-0000000000a1","role":"authenticated"}',
  true
);
set local role authenticated;

select lives_ok(
  $$ insert into public.device_tokens (user_id, role, apns_token, environment, bundle_id)
     values (
       '26600000-0000-4000-8000-0000000000a1',
       'customer',
       'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
       'sandbox',
       'uk.co.smarterdog.app'
     ) $$,
  'a customer can save their own token as customer'
);

select throws_ok(
  $$ insert into public.device_tokens (user_id, role, apns_token, environment, bundle_id)
     values (
       '26600000-0000-4000-8000-0000000000a1',
       'staff',
       'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
       'sandbox',
       'uk.co.smarterdog.app'
     ) $$,
  '42501',
  null,
  'a customer cannot label their token as staff'
);

select throws_ok(
  $$ insert into public.device_tokens (user_id, role, apns_token, environment, bundle_id)
     values (
       '26600000-0000-4000-8000-0000000000b1',
       'customer',
       'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
       'sandbox',
       'uk.co.smarterdog.app'
     ) $$,
  '42501',
  null,
  'a customer cannot insert a token for someone else'
);

select is(
  (select count(*) from public.device_tokens),
  1::bigint,
  'a customer sees only their own token'
);

select ok(
  (select notifications_enabled and last_seen_at is not null
     from public.device_tokens
    where apns_token = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
  'a new token is enabled and has a last_seen_at'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"26600000-0000-4000-8000-0000000000b1","role":"authenticated"}',
  true
);
set local role authenticated;

select is(
  (select count(*) from public.device_tokens),
  0::bigint,
  'another customer sees no tokens'
);

update public.device_tokens
   set notifications_enabled = false
 where apns_token = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

delete from public.device_tokens
 where apns_token = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

reset role;
select is(
  (select notifications_enabled from public.device_tokens
    where apns_token = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
  true,
  'another customer cannot switch the token off or delete it'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"26600000-0000-4000-8000-0000000000a1","role":"authenticated"}',
  true
);
set local role authenticated;

update public.device_tokens
   set notifications_enabled = false
 where user_id = '26600000-0000-4000-8000-0000000000a1';

select is(
  (select notifications_enabled from public.device_tokens
    where user_id = '26600000-0000-4000-8000-0000000000a1'),
  false,
  'the owner can switch their own notifications off'
);

select throws_ok(
  $$ insert into public.device_tokens (user_id, role, apns_token, environment, bundle_id)
     values (
       '26600000-0000-4000-8000-0000000000a1',
       'customer',
       'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
       'production',
       'uk.co.smarterdog.app'
     ) $$,
  '23505',
  null,
  'the same APNs token cannot be stored twice'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"26600000-0000-4000-8000-0000000000c1","role":"authenticated"}',
  true
);
set local role authenticated;

select lives_ok(
  $$ insert into public.device_tokens (user_id, role, apns_token, environment, bundle_id)
     values (
       '26600000-0000-4000-8000-0000000000c1',
       'staff',
       'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
       'production',
       'uk.co.smarterdog.app'
     ) $$,
  'a member of staff can save their own token as staff'
);

select throws_ok(
  $$ insert into public.device_tokens (user_id, role, apns_token, environment, bundle_id)
     values (
       '26600000-0000-4000-8000-0000000000c1',
       'customer',
       'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
       'production',
       'uk.co.smarterdog.app'
     ) $$,
  '42501',
  null,
  'a member of staff cannot label their token as customer'
);

reset role;
select ok(
  (select pg_get_constraintdef(oid) from pg_constraint where conname = 'notification_log_channel_check')
    like '%apns%'
    and (select pg_get_constraintdef(oid) from pg_constraint where conname = 'notification_log_channel_check')
    like '%webpush%',
  'notification_log still allows webpush and now allows apns'
);

select * from finish();
rollback;

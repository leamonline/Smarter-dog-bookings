-- Staff upload to the dog-photos bucket (20261121120000): staff only, and only
-- an object named <dog uuid>/<uuid>.jpg|webp. Synthetic fixtures are rolled back.

begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

set local session_replication_role = replica;

insert into auth.users (id) values
  ('26500000-0000-4000-8000-0000000000a1'),
  ('26500000-0000-4000-8000-0000000000b1');

insert into public.staff_profiles (user_id, role) values
  ('26500000-0000-4000-8000-0000000000a1', 'staff');

set local session_replication_role = default;

select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'staff_upload_dog_photos' and cmd = 'INSERT'
      and roles = '{authenticated}'
  ),
  'staff_upload_dog_photos is an INSERT policy for authenticated'
);

select is(
  (select count(*)::int from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and policyname = 'staff_upload_dog_photos'
     and coalesce(with_check, '') like '%dog-photos%'
     and coalesce(with_check, '') like '%is_staff%'),
  1,
  'it is limited to the dog-photos bucket and to staff'
);

-- A signed-in staff member.
select set_config(
  'request.jwt.claims',
  '{"sub":"26500000-0000-4000-8000-0000000000a1","role":"authenticated"}',
  true
);
set local role authenticated;

select lives_ok(
  $$ insert into storage.objects (bucket_id, name) values
       ('dog-photos', '26500000-0000-4000-8000-000000000001/26500000-0000-4000-8000-00000000f001.jpg') $$,
  'staff can upload a JPEG into a dog folder'
);

select lives_ok(
  $$ insert into storage.objects (bucket_id, name) values
       ('dog-photos', '26500000-0000-4000-8000-000000000001/26500000-0000-4000-8000-00000000f002.webp') $$,
  'staff can upload a WebP into a dog folder'
);

select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values
       ('dog-photos', 'not-a-uuid/26500000-0000-4000-8000-00000000f003.jpg') $$,
  '42501', null,
  'a folder that is not a dog uuid is refused'
);

select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values
       ('dog-photos', '26500000-0000-4000-8000-000000000001/nested/26500000-0000-4000-8000-00000000f004.jpg') $$,
  '42501', null,
  'a nested path is refused'
);

select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values
       ('dog-photos', '26500000-0000-4000-8000-000000000001/26500000-0000-4000-8000-00000000f005.png') $$,
  '42501', null,
  'any extension but jpg or webp is refused'
);

select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values
       ('dog-photos', '26500000-0000-4000-8000-000000000001/any-name-at-all.jpg') $$,
  '42501', null,
  'a file name that is not a uuid is refused'
);

select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values
       ('dog-photos', 'loose-file.jpg') $$,
  '42501', null,
  'an object outside a dog folder is refused'
);

-- A signed-in user who is not staff and does not own the dog.
select set_config(
  'request.jwt.claims',
  '{"sub":"26500000-0000-4000-8000-0000000000b1","role":"authenticated"}',
  true
);

select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values
       ('dog-photos', '26500000-0000-4000-8000-000000000001/26500000-0000-4000-8000-00000000f006.jpg') $$,
  '42501', null,
  'a signed-in user who is not staff cannot upload into a dog folder they do not own'
);

select set_config('request.jwt.claims', '', true);
set local role anon;

select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values
       ('dog-photos', '26500000-0000-4000-8000-000000000001/26500000-0000-4000-8000-00000000f007.jpg') $$,
  '42501', null,
  'the anonymous role cannot upload'
);

select * from finish();
rollback;

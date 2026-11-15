-- Customer dog photos (20261115120000): a private, constrained bucket; storage
-- access limited to the folder of a non-archived dog on the caller's own
-- account; and one customer command that only points dogs.photo_path at an
-- uploaded object in that dog's folder. Synthetic fixtures are rolled back.

begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

set local session_replication_role = replica;

insert into auth.users (id) values
  ('26300000-0000-4000-8000-0000000000a1'),
  ('26300000-0000-4000-8000-0000000000b1');

insert into public.humans (id, name, surname, phone, customer_user_id) values
  ('26300000-0000-4000-8000-0000000000a0', 'Photo', 'Owner', '+447700900263', '26300000-0000-4000-8000-0000000000a1'),
  ('26300000-0000-4000-8000-0000000000b0', 'Other', 'Owner', '+447700900264', '26300000-0000-4000-8000-0000000000b1');

insert into public.dogs (id, name, breed, human_id, size, archived_at) values
  ('26300000-0000-4000-8000-000000000001', 'Tipi', 'Poodle', '26300000-0000-4000-8000-0000000000a0', 'medium', null),
  ('26300000-0000-4000-8000-000000000002', 'Gone', 'Poodle', '26300000-0000-4000-8000-0000000000a0', 'small', now()),
  ('26300000-0000-4000-8000-000000000003', 'Theirs', 'Poodle', '26300000-0000-4000-8000-0000000000b0', 'small', null);

insert into storage.objects (bucket_id, name) values
  ('dog-photos', '26300000-0000-4000-8000-000000000001/26300000-0000-4000-8000-00000000f001.jpg'),
  ('dog-photos', '26300000-0000-4000-8000-000000000001/26300000-0000-4000-8000-00000000f002.webp');

set local session_replication_role = default;

select ok(
  exists (
    select 1 from storage.buckets
    where id = 'dog-photos'
      and public = false
      and file_size_limit = 2097152
      and allowed_mime_types = array['image/jpeg', 'image/webp']
  ),
  'dog-photos is private, 2 MB per object, JPEG or WebP only'
);

select is(
  (select count(*)::int from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and policyname in (
       'customer_upload_dog_photos', 'customer_read_dog_photos', 'customer_delete_dog_photos',
       'staff_read_dog_photos', 'staff_delete_dog_photos'
     )),
  5,
  'the five dog-photos storage policies exist'
);

select is(
  (select count(*)::int from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and cmd = 'UPDATE' and coalesce(qual, '') || coalesce(with_check, '') like '%dog-photos%'),
  0,
  'no policy lets anyone overwrite a dog photo'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"26300000-0000-4000-8000-0000000000a1","role":"authenticated"}',
  true
);
set local role authenticated;

select ok(
  public.customer_owns_dog_photo_path('26300000-0000-4000-8000-000000000001/any.jpg'),
  'a customer may use the folder of their own dog'
);

select ok(
  not public.customer_owns_dog_photo_path('26300000-0000-4000-8000-000000000003/any.jpg'),
  'a customer may not use another customer''s dog folder'
);

select ok(
  not public.customer_owns_dog_photo_path('26300000-0000-4000-8000-000000000002/any.jpg'),
  'a customer may not use the folder of an archived dog'
);

select ok(
  not public.customer_owns_dog_photo_path('not-a-uuid/any.jpg'),
  'a malformed folder answers false instead of raising'
);

select ok(
  not public.customer_owns_dog_photo_path('26300000-0000-4000-8000-000000000001/nested/any.jpg'),
  'objects must sit directly in the dog''s folder'
);

select throws_ok(
  $$ select * from public.set_customer_dog_photo(
       '26300000-0000-4000-8000-000000000001',
       '26300000-0000-4000-8000-000000000003/26300000-0000-4000-8000-00000000f001.jpg') $$,
  '22023',
  'invalid_photo_path',
  'a path outside the dog''s own folder is refused'
);

select throws_ok(
  $$ select * from public.set_customer_dog_photo(
       '26300000-0000-4000-8000-000000000001',
       '26300000-0000-4000-8000-000000000001/26300000-0000-4000-8000-00000000f999.jpg') $$,
  '22023',
  'photo_not_uploaded',
  'a path with no uploaded object is refused'
);

select throws_ok(
  $$ select * from public.set_customer_dog_photo(
       '26300000-0000-4000-8000-000000000003',
       '26300000-0000-4000-8000-000000000003/26300000-0000-4000-8000-00000000f001.jpg') $$,
  '42704',
  'dog_not_found',
  'another customer''s dog cannot be given a photo'
);

select throws_ok(
  $$ select * from public.set_customer_dog_photo('26300000-0000-4000-8000-000000000002', null) $$,
  '42704',
  'dog_not_found',
  'an archived dog cannot be changed'
);

select is(
  (select previous_photo_path from public.set_customer_dog_photo(
     '26300000-0000-4000-8000-000000000001',
     '26300000-0000-4000-8000-000000000001/26300000-0000-4000-8000-00000000f001.jpg')),
  null::text,
  'setting a first photo reports no previous photo'
);

select is(
  (select previous_photo_path from public.set_customer_dog_photo(
     '26300000-0000-4000-8000-000000000001',
     '26300000-0000-4000-8000-000000000001/26300000-0000-4000-8000-00000000f002.webp')),
  '26300000-0000-4000-8000-000000000001/26300000-0000-4000-8000-00000000f001.jpg'::text,
  'replacing a photo returns the previous path for the portal to delete'
);

set local role postgres;

select is(
  (select photo_path from public.dogs where id = '26300000-0000-4000-8000-000000000001'),
  '26300000-0000-4000-8000-000000000001/26300000-0000-4000-8000-00000000f002.webp'::text,
  'the dog row holds the new photo path'
);

set local role authenticated;

select lives_ok(
  $$ select * from public.set_customer_dog_photo('26300000-0000-4000-8000-000000000001', null) $$,
  'a customer can remove their dog''s photo'
);

set local role postgres;

select is(
  (select photo_path from public.dogs where id = '26300000-0000-4000-8000-000000000001'),
  null::text,
  'removing the photo clears the dog row'
);

select set_config('request.jwt.claims', '', true);
set local role anon;

select throws_ok(
  $$ select * from public.set_customer_dog_photo('26300000-0000-4000-8000-000000000001', null) $$,
  '42501',
  null,
  'the anonymous role cannot call the photo command'
);

select * from finish();
rollback;

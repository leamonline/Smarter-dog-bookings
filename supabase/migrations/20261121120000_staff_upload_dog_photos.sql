-- Staff can add a dog's profile photo on the owner's behalf (some owners are
-- not technically confident). Until now staff could read and delete objects in
-- the private dog-photos bucket but not create them.
--
-- The policy is deliberately as narrow as the customer one: staff only, only
-- the dog-photos bucket, and only a name of the form <dog uuid>/<uuid>.jpg|webp
-- (the shape set_customer_dog_photo and the app both use). The dog's photo_path
-- is then set with an ordinary staff UPDATE on dogs, which RLS already allows.
-- Idempotent.

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'staff_upload_dog_photos'
  ) then
    create policy staff_upload_dog_photos on storage.objects
      for insert to authenticated
      with check (
        bucket_id = 'dog-photos'
        and (select public.is_staff())
        and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|webp)$'
      );
  end if;
end $$;

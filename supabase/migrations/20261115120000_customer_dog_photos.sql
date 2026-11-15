-- 20261115120000_customer_dog_photos.sql
--
-- A customer can add a photo of their dog from the portal.
--
--   1. dogs.photo_path: the dog's current photo, a path in the private
--      'dog-photos' bucket shaped '{dog_id}/{uuid}.jpg' (or .webp). Null = none.
--   2. The 'dog-photos' bucket: private, 2 MB per object, JPEG or WebP only.
--      The portal re-encodes every photo in the browser before upload (which
--      also strips EXIF, including any GPS location), so real uploads are a few
--      hundred KB.
--   3. Storage policies: a signed-in customer may upload, read and delete
--      objects only under the folder of a dog on their own account that is not
--      archived. Staff may read and delete any. Nobody may overwrite (no UPDATE
--      policy); every upload is a new random name.
--   4. set_customer_dog_photo(dog, path): the only way a customer sets or
--      clears dogs.photo_path. It derives the owner from auth.uid(), accepts
--      only a path in that dog's folder whose object already exists, and returns
--      the previous path so the portal can delete the old file through the
--      Storage API (direct deletes from storage tables are not allowed).
--
-- Expand-only and idempotent: no drop, no rewrite of existing rows, safe to
-- apply before the portal change deploys (nothing reads the column yet).

set local lock_timeout = '5s';

-- ── 1. Column ─────────────────────────────────────────────────
alter table public.dogs
  add column if not exists photo_path text;

comment on column public.dogs.photo_path is
  'Path of the dog''s photo in the private dog-photos bucket ({dog_id}/{uuid}.jpg|webp); null = no photo. Customers set it only through set_customer_dog_photo (20261115120000).';

-- ── 2. Private bucket ────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dog-photos', 'dog-photos', false, 2097152, array['image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ── 3. Ownership helper for the storage policies ─────────────
-- True when the object's first folder is the id of a non-archived dog on the
-- signed-in customer's own account, and the object sits directly in it. The
-- uuid cast is guarded by CASE: AND gives no evaluation order, and a malformed
-- name must answer false, never raise.
create or replace function public.customer_owns_dog_photo_path(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.dogs d
    join public.humans h on h.id = d.human_id
    where h.customer_user_id = (select auth.uid())
      and d.archived_at is null
      and d.id = case
        when p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[^/]+$'
          then split_part(p_name, '/', 1)::uuid
      end
  );
$$;

comment on function public.customer_owns_dog_photo_path(text) is
  'Storage-policy helper: is this dog-photos object directly inside the folder of a non-archived dog owned by the signed-in customer? (20261115120000)';

revoke all on function public.customer_owns_dog_photo_path(text) from public;
revoke all on function public.customer_owns_dog_photo_path(text) from anon;
revoke all on function public.customer_owns_dog_photo_path(text) from authenticated;
grant execute on function public.customer_owns_dog_photo_path(text) to authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'customer_upload_dog_photos') then
    create policy customer_upload_dog_photos on storage.objects
      for insert to authenticated
      with check (bucket_id = 'dog-photos' and public.customer_owns_dog_photo_path(name));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'customer_read_dog_photos') then
    create policy customer_read_dog_photos on storage.objects
      for select to authenticated
      using (bucket_id = 'dog-photos' and public.customer_owns_dog_photo_path(name));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'customer_delete_dog_photos') then
    create policy customer_delete_dog_photos on storage.objects
      for delete to authenticated
      using (bucket_id = 'dog-photos' and public.customer_owns_dog_photo_path(name));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'staff_read_dog_photos') then
    create policy staff_read_dog_photos on storage.objects
      for select to authenticated
      using (bucket_id = 'dog-photos' and (select public.is_staff()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'staff_delete_dog_photos') then
    create policy staff_delete_dog_photos on storage.objects
      for delete to authenticated
      using (bucket_id = 'dog-photos' and (select public.is_staff()));
  end if;
end $$;

-- ── 4. Customer command ──────────────────────────────────────
create or replace function public.set_customer_dog_photo(
  p_dog_id uuid,
  p_photo_path text
)
returns table (
  photo_path text,
  previous_photo_path text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := (select auth.uid());
  v_my_id uuid;
  v_dog public.dogs%rowtype;
  v_path text := nullif(btrim(coalesce(p_photo_path, '')), '');
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  -- The owner-row lock customer dog creation/editing already takes.
  select h.id into v_my_id
  from public.humans h
  where h.customer_user_id = v_uid
  limit 1
  for update;

  if v_my_id is null then
    raise exception 'no_linked_human' using errcode = '28000';
  end if;

  select * into v_dog
  from public.dogs d
  where d.id = p_dog_id
    and d.human_id = v_my_id
    and d.archived_at is null
  limit 1
  for update;

  if v_dog.id is null then
    raise exception 'dog_not_found' using errcode = '42704';
  end if;

  if v_path is not null then
    if v_path !~ ('^' || p_dog_id::text
                  || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|webp)$') then
      raise exception 'invalid_photo_path' using errcode = '22023';
    end if;
    if not exists (
      select 1 from storage.objects o
      where o.bucket_id = 'dog-photos' and o.name = v_path
    ) then
      raise exception 'photo_not_uploaded' using errcode = '22023';
    end if;
  end if;

  update public.dogs d
  set photo_path = v_path
  where d.id = v_dog.id;

  return query select v_path, v_dog.photo_path;
end;
$$;

comment on function public.set_customer_dog_photo(uuid, text) is
  'Customer-only. Sets (or, with null, clears) the photo of a non-archived dog on the caller''s own account. The path must be an uploaded object in that dog''s dog-photos folder. Returns the new and previous paths; the caller deletes the previous object through the Storage API (20261115120000).';

revoke all on function public.set_customer_dog_photo(uuid, text) from public;
revoke all on function public.set_customer_dog_photo(uuid, text) from anon;
revoke all on function public.set_customer_dog_photo(uuid, text) from authenticated;
grant execute on function public.set_customer_dog_photo(uuid, text) to authenticated;

-- ============================================================
-- 022_groom_photos.sql
-- Staff-only groom photo records for dogs.
--
-- What this migration does:
--  1. Creates groom_photos table (links photos to dogs + optionally bookings)
--  2. Enables RLS with staff-only policies (reuses is_staff())
--  3. Creates a private Supabase Storage bucket for photo files
--  4. Adds storage policies for staff-only upload/read/delete
--  5. Adds updated_at trigger (reuses update_modified_column())
-- ============================================================

-- ============================================================
-- 1. Table
-- ============================================================
create table groom_photos (
  id            uuid primary key default gen_random_uuid(),
  dog_id        uuid not null references dogs(id) on delete cascade,
  booking_id    uuid references bookings(id) on delete set null,
  storage_path  text not null,
  notes         text default '',
  taken_at      date not null default current_date,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- ============================================================
-- 2. Indexes
-- ============================================================
create index idx_groom_photos_dog_id
  on groom_photos(dog_id);

create index idx_groom_photos_booking_id
  on groom_photos(booking_id)
  where booking_id is not null;

-- ============================================================
-- 3. RLS — staff only
-- ============================================================
alter table groom_photos enable row level security;

create policy staff_select_groom_photos on groom_photos
  for select using ((select is_staff()));

create policy staff_insert_groom_photos on groom_photos
  for insert with check ((select is_staff()));

create policy staff_update_groom_photos on groom_photos
  for update
  using ((select is_staff()))
  with check ((select is_staff()));

create policy staff_delete_groom_photos on groom_photos
  for delete using ((select is_staff()));

-- ============================================================
-- 4. Storage bucket + policies
-- ============================================================
insert into storage.buckets (id, name, public)
  values ('groom-photos', 'groom-photos', false);

create policy staff_upload_groom_photos on storage.objects
  for insert
  with check (bucket_id = 'groom-photos' and (select is_staff()));

create policy staff_read_groom_photos on storage.objects
  for select
  using (bucket_id = 'groom-photos' and (select is_staff()));

create policy staff_delete_groom_photos on storage.objects
  for delete
  using (bucket_id = 'groom-photos' and (select is_staff()));

-- ============================================================
-- 5. Auto-update trigger (reuses existing function)
-- ============================================================
create trigger groom_photos_updated
  before update on groom_photos
  for each row execute function update_modified_column();

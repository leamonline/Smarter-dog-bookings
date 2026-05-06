-- ============================================================
-- 007_phase2_booking.sql
-- Phase 2: multi-dog booking support and customer RLS policies.
--
-- What this migration does:
--  1. Adds group_id to bookings — a nullable UUID used as a
--     correlation ID to link multiple dogs in one booking session
--  2. Adds a partial index on group_id for fast lookup
--  3. Adds customer INSERT policy on bookings
--  4. Adds customer INSERT policy on dogs
--  5. Adds customer SELECT policy on salon_config
--  6. Adds customer SELECT policy on day_settings
-- ============================================================

-- ============================================================
-- 1. Add group_id to bookings
-- Nullable UUID — no foreign key, used only as a correlation ID.
-- ============================================================
alter table bookings
  add column if not exists group_id uuid;

-- ============================================================
-- 2. Partial index on group_id (only index non-null rows)
-- ============================================================
create index if not exists idx_bookings_group_id
  on bookings(group_id)
  where group_id is not null;

-- ============================================================
-- 3. Customer INSERT policy on bookings
-- Authenticated non-staff users may insert a booking only for
-- a dog that belongs to them (via dogs → humans → customer_user_id).
-- ============================================================
create policy "customer_insert_own_bookings"
  on bookings for insert
  to authenticated
  with check (
    not is_staff()
    and exists (
      select 1
      from   dogs
      join   humans on humans.id = dogs.human_id
      where  dogs.id = bookings.dog_id
        and  humans.customer_user_id = auth.uid()
    )
  );

-- ============================================================
-- 4. Customer INSERT policy on dogs
-- Authenticated non-staff users may insert a dog only under
-- their own human record.
-- ============================================================
create policy "customer_insert_own_dogs"
  on dogs for insert
  to authenticated
  with check (
    not is_staff()
    and exists (
      select 1
      from   humans
      where  humans.id = dogs.human_id
        and  humans.customer_user_id = auth.uid()
    )
  );

-- ============================================================
-- 5. Customer SELECT policy on salon_config
-- All authenticated users (staff and customers) may read
-- salon config — customers need it to perform capacity checks
-- during the booking wizard.
-- ============================================================
create policy "customer_select_salon_config"
  on salon_config for select
  to authenticated
  using (not is_staff());

-- ============================================================
-- 6. Customer SELECT policy on day_settings
-- All authenticated users may read day settings — customers
-- need this to know which days are open or closed.
-- ============================================================
create policy "customer_select_day_settings"
  on day_settings for select
  to authenticated
  using (not is_staff());

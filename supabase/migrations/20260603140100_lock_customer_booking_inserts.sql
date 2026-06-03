-- ============================================================
-- Lock down raw customer booking inserts (BREAKING — apply AFTER frontend)
--
-- WHY
-- Companion to 20260603140000_calendar_safe_booking_writes.sql. That
-- migration made every booking insert calendar-safe via a trigger and added
-- create_customer_booking_group(); this one removes the customer's ability to
-- INSERT into bookings directly, so the portal can ONLY book through the
-- validated RPC (ownership + server-authoritative size + atomic group).
--
-- LIVE STATE (verified against the database, which has drifted from the
-- migration files): the insert policy is a single consolidated policy
-- `combined_insert_bookings` with `WITH CHECK (is_staff() OR <owns the dog>)`.
-- The migration-file names (customer_insert_own_bookings, staff_insert_bookings)
-- do NOT exist live. We drop whatever is present (all three names) and recreate
-- a single STAFF-ONLY insert policy. Customers then match no insert policy and
-- are denied raw inserts (RLS default-deny); they use the RPC, which is
-- SECURITY DEFINER and bypasses RLS. Staff inserts (useBookings) keep working.
-- The service-role paths (WhatsApp autonomous, Flow endpoint) bypass RLS and
-- are unaffected.
--
-- ORDERING: apply this ONLY after the frontend calling
-- create_customer_booking_group has shipped. Until then the live site still
-- issues a raw insert, which this policy would reject. (The calendar fix does
-- NOT depend on this migration — it is already live via the trigger in
-- 20260603140000, so there is no rush to apply this one.)
--
-- Idempotent: drop policy if exists + create.
-- ============================================================

drop policy if exists "combined_insert_bookings"     on public.bookings;
drop policy if exists "customer_insert_own_bookings" on public.bookings;
drop policy if exists "staff_insert_bookings"        on public.bookings;

-- Staff-only direct inserts. Customers no longer have an INSERT policy and so
-- cannot write to bookings directly — they must go through
-- create_customer_booking_group().
create policy "staff_insert_bookings"
  on public.bookings
  for insert
  to authenticated
  with check (is_staff());

comment on policy "staff_insert_bookings" on public.bookings is
  'Direct inserts are staff-only. Customers book via the create_customer_booking_group() SECURITY DEFINER RPC (which validates ownership, size and the calendar), not by writing the table directly. Replaces the consolidated combined_insert_bookings policy that also allowed raw customer inserts.';

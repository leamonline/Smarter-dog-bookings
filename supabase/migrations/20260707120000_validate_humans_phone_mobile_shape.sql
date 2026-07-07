-- ============================================================
-- Promote humans_phone_mobile_shape from NOT VALID to validated.
--
-- Background: 20260617130000 added the CHECK constraint NOT VALID so it
-- would enforce every future INSERT/UPDATE immediately without retro-
-- rejecting the handful of legacy mobile-shaped-but-broken rows (a digit
-- short, unrecoverable from the stored value). Those rows have now been
-- corrected in-app by staff:
--   • Graham Dransfield (no dogs/bookings) — phone cleared
--   • Peter Ward        (no dogs/bookings) — phone cleared
--   • Lisa Greaves      (active customer)  — corrected to +447869642779
-- With the column clean (0 rows violate the predicate), VALIDATE promotes
-- the constraint so existing rows are guaranteed to satisfy it too, not
-- just future writes.
--
-- VALIDATE CONSTRAINT takes a SHARE UPDATE EXCLUSIVE lock and scans the
-- table once (humans is small); it does not block reads or writes.
--
-- Guarded so re-running is a no-op (idempotent): only validates when the
-- constraint exists and is not already validated. Apply individually to
-- prod BY HAND. Migrations aren't auto-applied.
-- ============================================================

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'humans_phone_mobile_shape'
      and conrelid = 'public.humans'::regclass
      and not convalidated
  ) then
    alter table public.humans
      validate constraint humans_phone_mobile_shape;
  end if;
end $$;

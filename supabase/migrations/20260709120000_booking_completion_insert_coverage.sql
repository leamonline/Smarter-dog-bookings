-- ============================================================
-- Completion side-effects: INSERT coverage  (review Phase 1)
--
-- 20260629 ("booking_completion", repo file 20260627160000) added the
-- Completed side-effects — stamp bookings.completed_at, recompute
-- dogs.last_groomed_date, emit a 'completed' booking_events row — but both
-- triggers are UPDATE-only. A booking INSERTed already in 'Completed'
-- (e.g. a future "record a historical groom" path; today the app always
-- inserts 'Booked', see bookingsRepo.ts) would silently skip all three.
--
-- Verified on prod before writing this (2026-07-09): the UPDATE path works —
-- every dog with a Completed booking (212/212) has last_groomed_date set.
-- This migration only closes the INSERT gap + re-runs a forward-only
-- backfill as a safety net (a no-op on prod today).
--
-- No new functions: reuses set_booking_completed_at and
-- on_booking_completed_change (grants already locked down in 20260701213000),
-- so no revoke block is needed. completed_at = now() is correct for a
-- historical insert too — it records when staff marked it done; the groom
-- date itself travels in booking_date and flows to last_groomed_date.
--
-- Additive + idempotent.
-- ============================================================

-- BEFORE INSERT: stamp completed_at when a row arrives already Completed.
drop trigger if exists trg_set_booking_completed_at_insert on public.bookings;
create trigger trg_set_booking_completed_at_insert
  before insert on public.bookings
  for each row
  when (new.status = 'Completed')
  execute function public.set_booking_completed_at();

-- AFTER INSERT: recompute the dog's last_groomed_date and emit the
-- 'completed' timeline event, exactly as the UPDATE transition does.
drop trigger if exists trg_on_booking_completed_insert on public.bookings;
create trigger trg_on_booking_completed_insert
  after insert on public.bookings
  for each row
  when (new.status = 'Completed')
  execute function public.on_booking_completed_change();

-- Forward-only backfill: set last_groomed_date where it is missing or older
-- than the dog's newest Completed booking. Never regresses a newer value
-- (a manually entered date survives), never nulls anything. Re-runnable.
update public.dogs d
set last_groomed_date = sub.max_date
from (
  select dog_id, max(booking_date) as max_date
  from public.bookings
  where status = 'Completed'
  group by dog_id
) sub
where sub.dog_id = d.id
  and (d.last_groomed_date is null or d.last_groomed_date < sub.max_date);

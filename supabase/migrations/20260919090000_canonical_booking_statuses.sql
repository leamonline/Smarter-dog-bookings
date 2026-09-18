-- ============================================================
-- Canonical booking statuses: the seven-value lifecycle
--
--   Booked -> Reconfirmed -> Arrived -> Ready for collection -> Completed
--   with two terminal exits: Cancelled and No-show.
--
-- Replaces the old six-value set. Four things change:
--   1. 'Checked in'        -> 'Arrived'
--   2. 'In bath'           -> 'Arrived'   (see note below)
--   3. 'Ready for pick-up' -> 'Ready for collection'
--   4. Cancelled + cancel_reason = 'No-show' -> 'No-show'
-- and 'Reconfirmed' is new, written by staff and by the existing customer
-- reconfirmation path.
--
-- WHY 'In bath' BECOMES 'Arrived', NOT 'Ready for collection':
-- a dog in the bath has arrived but is not finished, so Arrived is the only
-- mapping that does not claim work was done that was not. It is also the
-- least destructive: every such row already carries checked_in_at and a NULL
-- ready_at, which is exactly the shape of an Arrived row, so no timestamp has
-- to be invented or discarded. Where a dog is within the groom is now an
-- operational detail rather than a lifecycle stage.
--
-- ⚠ THE CAPACITY-SAFETY POINT, which is the whole risk of this migration:
-- before this change a no-show WAS a Cancelled row, so every capacity,
-- occupancy and uniqueness rule already treated it as freeing its seat. Those
-- rules are written as `status <> 'Cancelled'`. Splitting No-show out without
-- touching them would make every no-show count as an ACTIVE booking: it would
-- consume a seat, and the partial unique indexes would reject a rebooking of
-- the same dog into the same slot. Every such predicate is therefore widened
-- to `not in ('Cancelled', 'No-show')` below. This preserves today's
-- behaviour exactly; it does not change capacity semantics.
--
-- cancel_reason is PRESERVED on converted rows as history. Nothing reads it to
-- decide no-show-ness any more.
--
-- Idempotent and re-runnable. No data is deleted; no timestamp or payment
-- column is touched.
-- ============================================================

begin;

-- ── 1. Drop the old constraint so the conversions can run ────────────
alter table public.bookings drop constraint if exists bookings_status_check;

-- ── 2. Convert the existing rows ─────────────────────────────────────
-- Ordered so each row is matched by exactly one statement.

update public.bookings set status = 'Arrived'
  where status in ('Checked in', 'In bath');

update public.bookings set status = 'Ready for collection'
  where status = 'Ready for pick-up';

-- The no-show split. Matched case-insensitively and on a trimmed value, the
-- same way isNoShowReason() does in the application, so a reason stored as
-- 'no-show ' converts too. cancel_reason is deliberately left in place.
update public.bookings set status = 'No-show'
  where status = 'Cancelled'
    and lower(btrim(coalesce(cancel_reason, ''))) = 'no-show';

-- ── 3. The new constraint ────────────────────────────────────────────
alter table public.bookings
  add constraint bookings_status_check
  check (status in (
    'Booked',
    'Reconfirmed',
    'Arrived',
    'Ready for collection',
    'Completed',
    'Cancelled',
    'No-show'
  ));

comment on column public.bookings.status is
  'Canonical booking lifecycle. Booked -> Reconfirmed -> Arrived -> Ready for collection -> Completed, with Cancelled and No-show as terminal exits. Both terminal statuses are NON-OCCUPYING: they free the seat. Mirrored by BOOKING_STATUS in src/constants/salon.ts.';

-- ── 4. Lifecycle timestamp ranking ───────────────────────────────────
-- Reconfirmed takes rank 1, so Arrived moves from 1 to 2 and Ready from 3 to
-- 3 (unchanged). The thresholds below are stated against the NEW ranks: a
-- bare `>= 1` here would stamp an arrival time on a booking the customer had
-- merely confirmed by message, recording a dog as being in the salon while it
-- is still at home.
--
-- checked_in_at keeps its name. Renaming it to arrived_at would be a
-- column rename on a live table carrying 281 stamped rows, for no behavioural
-- gain; the application calls it Arrived and reads this column. The comment
-- below is the record of that decision.
create or replace function set_booking_lifecycle_timestamps()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  new_rank int;
begin
  -- Position along the progression. Cancelled, No-show and any unknown status
  -- resolve to NULL => the stamps are left exactly as they are. A dog that
  -- arrived and was later marked a no-show by mistake still arrived, and the
  -- correction must not erase the evidence.
  new_rank := case new.status
    when 'Booked'               then 0
    when 'Reconfirmed'          then 1
    when 'Arrived'              then 2
    when 'Ready for collection' then 3
    when 'Completed'            then 4
    else null
  end;

  if new_rank is null then
    return new;
  end if;

  -- Present once the dog has physically arrived (rank 2) or gone further;
  -- cleared on a regression back to Booked or Reconfirmed.
  if new_rank >= 2 then
    new.checked_in_at := coalesce(new.checked_in_at, now());
  else
    new.checked_in_at := null;
  end if;

  -- Present once ready or beyond; cleared if moved back below Ready.
  if new_rank >= 3 then
    new.ready_at := coalesce(new.ready_at, now());
  else
    new.ready_at := null;
  end if;

  return new;
end;
$$;

revoke execute on function public.set_booking_lifecycle_timestamps() from public, anon, authenticated;

comment on column public.bookings.checked_in_at is
  'When this booking first reached "Arrived" (or a later stage). The column keeps its pre-2026-09 name; the application-facing term is Arrived. Set once on the transition into Arrived-or-later, cleared only if the booking regresses to Booked/Reconfirmed. No historical backfill.';

comment on column public.bookings.ready_at is
  'When this booking first reached "Ready for collection" (or Completed). Set once, cleared if the booking regresses below Ready.';

-- ── 5. Uniqueness: No-show must free the slot, as Cancelled always did ──
-- Without this, rebooking a dog that no-showed into the same slot raises a
-- unique violation.
drop index if exists public.bookings_one_active_per_dog_slot;
create unique index bookings_one_active_per_dog_slot
  on public.bookings (dog_id, booking_date, slot)
  where status <> all (array['Cancelled'::text, 'No-show'::text, 'Completed'::text]);

drop index if exists public.bookings_no_duplicate_dog_per_slot;
create unique index bookings_no_duplicate_dog_per_slot
  on public.bookings (booking_date, slot, dog_id)
  where status <> all (array['Cancelled'::text, 'No-show'::text]);

commit;

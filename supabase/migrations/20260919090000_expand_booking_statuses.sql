-- ============================================================
-- Booking statuses, EXPAND phase: accept both vocabularies
--
-- Part 1 of a three-part expand/contract rollout. The status rename is not
-- backward-compatible in either direction — the old frontend writes
-- 'Checked in' and the new one writes 'Arrived', and whichever constraint is
-- installed rejects the other. Applying the finished constraint and deploying
-- the frontend can therefore never be simultaneous, and either order leaves a
-- window where the live app cannot write a booking status.
--
-- So the rollout is:
--
--   1. EXPAND (this migration)  — the database accepts BOTH vocabularies.
--                                 Nothing else changes. The live old frontend
--                                 carries on exactly as it does today.
--   2. DEPLOY                   — merge and ship the new frontend. Old tabs and
--                                 new tabs both work, because both vocabularies
--                                 are legal. No window.
--   3. CONTRACT (20260919120000) — convert the historical rows and narrow the
--                                 constraint to the canonical seven, once
--                                 nothing is writing the old words any more.
--
-- Deliberately NOT here: the row conversions, the narrowed constraint, and the
-- Reconfirmed wiring in mark_reminder_confirmed. All three would put values on
-- screen that the currently-deployed frontend cannot render, and the point of
-- this phase is that it changes nothing anyone can see.
--
-- Idempotent.
-- ============================================================

begin;

-- ── The widened constraint ───────────────────────────────────────────
-- Both vocabularies. 'In bath' has no counterpart in the new set — it stops
-- being a booking status entirely — so it is simply carried through this phase
-- and converted to 'Arrived' by the contract migration.
alter table public.bookings drop constraint if exists bookings_status_check;

alter table public.bookings
  add constraint bookings_status_check
  check (status in (
    -- Canonical, from the contract migration onward.
    'Booked',
    'Reconfirmed',
    'Arrived',
    'Ready for collection',
    'Completed',
    'Cancelled',
    'No-show',
    -- Transitional: still written by the deployed frontend until step 2.
    'Checked in',
    'In bath',
    'Ready for pick-up'
  ));

comment on column public.bookings.status is
  'Booking lifecycle, mid-rename. Accepts the canonical seven (Booked, Reconfirmed, Arrived, Ready for collection, Completed, Cancelled, No-show) AND the three retired values still written by the deployed frontend. Narrowed to the seven by migration 20260919120000 once the new frontend is live.';

-- ── A lifecycle trigger that speaks both ─────────────────────────────
-- The ranking cannot simply switch to the new words: while the old frontend is
-- live, an unrecognised status resolves to NULL and the function returns
-- early, so checking a dog in would silently stop recording checked_in_at.
-- Both vocabularies are ranked, mapping each old word onto its successor's
-- position, which makes the behaviour identical for old writes and correct for
-- new ones.
--
--   Booked 0 | Reconfirmed 1 | Checked in / In bath / Arrived 2
--            | Ready for pick-up / Ready for collection 3 | Completed 4
--
-- 'Checked in' moves from 1 to 2 and the arrival threshold moves from >= 1 to
-- >= 2 in the same breath, so the pair is unchanged in effect. 'In bath' was
-- already 2.
create or replace function set_booking_lifecycle_timestamps()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  new_rank int;
begin
  new_rank := case new.status
    when 'Booked'               then 0
    when 'Reconfirmed'          then 1
    when 'Checked in'           then 2
    when 'In bath'              then 2
    when 'Arrived'              then 2
    when 'Ready for pick-up'    then 3
    when 'Ready for collection' then 3
    when 'Completed'            then 4
    else null
  end;

  -- Cancelled, No-show and anything unrecognised: preserve the history. A dog
  -- that arrived and was later marked a no-show by mistake still arrived.
  if new_rank is null then
    return new;
  end if;

  if new_rank >= 2 then
    new.checked_in_at := coalesce(new.checked_in_at, now());
  else
    new.checked_in_at := null;
  end if;

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

-- ── Uniqueness: No-show must free the slot, as Cancelled always did ──
-- Safe to install now: no row carries 'No-show' until the contract migration,
-- so these behave exactly as the indexes they replace.
drop index if exists public.bookings_one_active_per_dog_slot;
create unique index bookings_one_active_per_dog_slot
  on public.bookings (dog_id, booking_date, slot)
  where status <> all (array['Cancelled'::text, 'No-show'::text, 'Completed'::text]);

drop index if exists public.bookings_no_duplicate_dog_per_slot;
create unique index bookings_no_duplicate_dog_per_slot
  on public.bookings (booking_date, slot, dog_id)
  where status <> all (array['Cancelled'::text, 'No-show'::text]);

commit;

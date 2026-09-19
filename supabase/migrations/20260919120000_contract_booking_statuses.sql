-- ============================================================
-- Booking statuses, CONTRACT phase: the canonical seven only
--
-- Part 3 of the expand/contract rollout begun in 20260919090000.
--
-- ⚠ APPLY THIS ONLY AFTER THE NEW FRONTEND IS DEPLOYED AND NO CLIENT IS STILL
-- WRITING THE OLD WORDS. Until then the widened constraint from the expand
-- phase is what keeps the live app working. Applying this early reintroduces
-- exactly the breakage the split exists to avoid: the deployed frontend writes
-- 'Checked in', this constraint rejects it, and staff cannot check a dog in.
--
-- The app is a PWA with a precached bundle, so an already-open tab keeps the
-- old code until its service worker updates. Leave a gap after the deploy, or
-- apply this while the salon is closed.
--
-- Three things happen here:
--   1. The historical rows are converted to the canonical vocabulary.
--   2. The constraint narrows to the seven.
--   3. The lifecycle trigger drops the transitional rankings.
--
-- Conversions:
--   'Checked in'        -> 'Arrived'
--   'In bath'           -> 'Arrived'
--   'Ready for pick-up' -> 'Ready for collection'
--   'Cancelled' + cancel_reason 'No-show' -> 'No-show'
--
-- WHY 'In bath' BECOMES 'Arrived', NOT 'Ready for collection': a dog in the
-- bath has arrived but is not finished, so Arrived is the only mapping that
-- does not claim work was done that was not. It is also the least destructive:
-- every such row already carries checked_in_at and a NULL ready_at, which is
-- exactly the shape of an Arrived row, so no timestamp is invented or
-- discarded.
--
-- cancel_reason is PRESERVED on converted rows as history. Nothing reads it to
-- decide no-show-ness any more.
--
-- Idempotent and re-runnable. No data is deleted; no timestamp or payment
-- column is touched.
-- ============================================================

begin;

-- ── 1. Convert the historical rows ───────────────────────────────────
-- The constraint has to come off first: it still permits the old words, and
-- narrowing it before the rows are converted would fail on the rows it is
-- about to reject. Ordered so each row is matched by exactly one statement.
alter table public.bookings drop constraint if exists bookings_status_check;

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

-- ── 2. Narrow the constraint ─────────────────────────────────────────
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

-- ── 3. Drop the transitional rankings ────────────────────────────────
-- Identical to the expand-phase function minus the three retired words, which
-- no row and no client can produce any more.
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
    when 'Arrived'              then 2
    when 'Ready for collection' then 3
    when 'Completed'            then 4
    else null
  end;

  -- Cancelled, No-show and anything unrecognised: preserve the history.
  if new_rank is null then
    return new;
  end if;

  -- Present once the dog has physically arrived (rank 2) or gone further;
  -- cleared on a regression back to Booked or Reconfirmed. Stated against the
  -- NEW ranks: a bare `>= 1` would stamp an arrival time on a booking the
  -- customer had merely confirmed by message, recording a dog as being in the
  -- salon while it is still at home.
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

commit;

-- ============================================================
-- Booking lifecycle timestamps: checked_in_at + ready_at  (Today view, gap G1)
--
-- Only completed_at existed (20260627160000). The Today command centre needs
-- to know WHEN a dog arrived (Checked in) and WHEN it was marked Ready, to show
-- "waiting 25 min to be collected" and "15 min in the salon" style copy.
--
-- Unlike completed_at (a single terminal moment), these two are "reached this
-- stage or beyond" marks along the progression:
--   Booked(0) -> Checked in(1) -> In bath(2) -> Ready for pick-up(3) -> Completed(4)
--   Cancelled = off-progression.
-- A dog that is "In bath" is still checked-in, and a "Completed" dog was still
-- marked Ready — so the stamps must PERSIST once set and only CLEAR if the
-- booking regresses back below the stage (a staff misclick correction). We use
-- coalesce(col, now()) to set-once, and null the column only on a genuine
-- regression. Cancelled never touches the stamps (preserve arrival history).
--
-- BEFORE UPDATE only, mirroring set_booking_completed_at. NO backfill is
-- possible — historical rows have no arrival/ready time — so these accrue only
-- from the moment this migration is applied. A dog already sitting in
-- "Ready for pick-up" at deploy time keeps ready_at = NULL until it next
-- changes status; the Today view degrades gracefully (shows "marked ready"
-- without a duration) when the stamp is absent.
--
-- Additive + idempotent. Adds two columns + one trigger; touches no existing
-- rule, RLS policy, capacity maths or the status CHECK.
-- ============================================================

alter table public.bookings
  add column if not exists checked_in_at timestamptz;
comment on column public.bookings.checked_in_at is
  'When this booking first reached "Checked in" (or a later stage). Set once on the transition into Checked-in-or-later, cleared only if the booking regresses to Booked. NULL until the dog is checked in. No historical backfill — accrues from 2026-07-02.';

alter table public.bookings
  add column if not exists ready_at timestamptz;
comment on column public.bookings.ready_at is
  'When this booking first reached "Ready for pick-up" (or Completed). Set once on the transition into Ready-or-later, cleared if the booking regresses below Ready. Powers the collection queue "waiting N min" copy. NULL until marked ready. No historical backfill — accrues from 2026-07-02.';

-- BEFORE UPDATE: stamp/clear checked_in_at + ready_at from the new status'
-- position along the progression. Only touches NEW, never raises.
create or replace function set_booking_lifecycle_timestamps()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  new_rank int;
begin
  -- Position of the target status along the linear progression. Cancelled and
  -- any future/unknown status resolve to NULL => leave the stamps untouched.
  new_rank := case new.status
    when 'Booked'            then 0
    when 'Checked in'        then 1
    when 'In bath'           then 2
    when 'Ready for pick-up' then 3
    when 'Completed'         then 4
    else null
  end;

  if new_rank is null then
    -- Cancelled (or an unrecognised status): preserve any arrival/ready history.
    return new;
  end if;

  -- checked_in_at: present once the dog reaches Checked-in-or-later; cleared
  -- only on a regression all the way back to Booked.
  if new_rank >= 1 then
    new.checked_in_at := coalesce(new.checked_in_at, now());
  else
    new.checked_in_at := null;
  end if;

  -- ready_at: present once the dog reaches Ready-or-later; cleared if the
  -- booking is moved back below Ready (e.g. Ready -> In bath correction).
  if new_rank >= 3 then
    new.ready_at := coalesce(new.ready_at, now());
  else
    new.ready_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_set_booking_lifecycle_timestamps on public.bookings;
create trigger trg_set_booking_lifecycle_timestamps
  before update on public.bookings
  for each row
  when (old.status is distinct from new.status)
  execute function set_booking_lifecycle_timestamps();

-- Trigger functions fire regardless of EXECUTE privilege, so lock this down to
-- nobody per docs/migrations.md (Supabase default-grants EXECUTE to anon +
-- authenticated on new public functions).
revoke execute on function public.set_booking_lifecycle_timestamps() from public, anon, authenticated;

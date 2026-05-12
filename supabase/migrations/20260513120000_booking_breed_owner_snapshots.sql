-- 20260513120000_booking_breed_owner_snapshots.sql
--
-- Task 1 of the May 2026 review pass.
--
-- Adds breed_snapshot + owner_name_snapshot to bookings so the UI has a
-- stable fallback when the linked dog or owner row has been deleted or
-- renamed in a way that breaks the live join. The display layer still
-- prefers the joined value — these columns are a last-resort fallback,
-- not the source of truth.
--
-- Why now: the live app was showing different breed strings between the
-- grid card and the booking detail modal because each surface used a
-- different fallback path (one keyed dogs by id, the other by name)
-- whenever the join missed. With a snapshot column and one selector
-- (src/engine/bookingRules.ts → resolveBookingDisplay) all surfaces
-- agree.
--
-- Safety:
--   - Columns are nullable + additive; no existing rows or queries break.
--   - Backfill is idempotent (only touches rows where the snapshot is null).
--   - Trigger fires on INSERT only — editing a dog's breed does NOT
--     mutate the snapshot, so the historical record is preserved while
--     the UI tracks the live value via the join.

-- 1. Columns
alter table bookings add column if not exists breed_snapshot text;
alter table bookings add column if not exists owner_name_snapshot text;

comment on column bookings.breed_snapshot is
  'Snapshot of dogs.breed at booking creation. Display layer prefers the live joined value and only falls back to this if the dog row has been deleted. Set automatically by trg_bookings_set_snapshots on insert.';

comment on column bookings.owner_name_snapshot is
  'Snapshot of humans.name || '' '' || surname at booking creation. Same fallback semantics as breed_snapshot.';

-- 2. Backfill — idempotent. Only writes the snapshot when it's null,
--    so re-running this migration after a partial roll is safe.
update bookings b
   set breed_snapshot = d.breed
  from dogs d
 where d.id = b.dog_id
   and b.breed_snapshot is null;

update bookings b
   set owner_name_snapshot = trim(h.name || ' ' || h.surname)
  from dogs d
  join humans h on h.id = d.human_id
 where d.id = b.dog_id
   and b.owner_name_snapshot is null;

-- 3. Trigger — auto-populate on INSERT if the caller didn't set them.
--    The apply_whatsapp_booking_action RPC doesn't set these, so the
--    trigger keeps it working without changing the function signature.
create or replace function set_booking_snapshots()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_breed text;
  v_owner text;
begin
  if new.breed_snapshot is null then
    select breed into v_breed from dogs where id = new.dog_id;
    if v_breed is not null then
      new.breed_snapshot := v_breed;
    end if;
  end if;

  if new.owner_name_snapshot is null then
    select trim(h.name || ' ' || h.surname)
      into v_owner
      from dogs d
      join humans h on h.id = d.human_id
     where d.id = new.dog_id;
    if v_owner is not null then
      new.owner_name_snapshot := v_owner;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_bookings_set_snapshots on bookings;
create trigger trg_bookings_set_snapshots
  before insert on bookings
  for each row execute function set_booking_snapshots();

comment on function set_booking_snapshots() is
  'Auto-fills bookings.breed_snapshot / owner_name_snapshot at insert time from the linked dog and owner. Caller-supplied values win; nulls are populated from the join. INSERT only so historic snapshots are not mutated by later dog/human edits.';

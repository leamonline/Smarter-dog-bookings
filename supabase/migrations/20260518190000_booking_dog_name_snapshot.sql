-- ============================================================
-- Add bookings.dog_name_snapshot, finishing the snapshot trio
-- started by 20260513120000_booking_breed_owner_snapshots.
--
-- Why now: the day-view card currently renders "Unnamed booking"
-- for any booking whose linked dog row sits past the first page
-- of the paginated dogs cache (PAGE_SIZE = 50, ordered by name;
-- ~1k dogs total, so most C-Z names miss the initial cache). The
-- display layer falls back to ensureDogsByIds to hydrate missing
-- rows on demand, but that hydration is brittle — three prior
-- commits (38b3799, c8f4eb5, d530c98) all patched leaks in the
-- same chain. Breed and owner already side-step this entirely
-- by reading their snapshot columns; finishing the trio with a
-- dog_name_snapshot removes the last column that still depends
-- on the live join.
--
-- Backfill is idempotent (only touches rows where the snapshot is
-- still null), so re-running this migration is safe. The trigger
-- is extended (not replaced wholesale) to also set the new column
-- on INSERT — caller-supplied values still win, nulls get filled
-- from the dogs row. INSERT only so historic snapshots survive
-- later dog renames.
--
-- The backfill is bracketed with DISABLE/ENABLE TRIGGER on the
-- capacity validator: that trigger fires on UPDATE too and runs
-- the large-dog approval gate, which raises when service_role
-- (no auth.uid()) touches a row where size='large' on a non-
-- large-dog slot. The disable/enable pair is inside this
-- migration's transaction, so it rolls back together if anything
-- fails. Net behaviour: capacity rules are unchanged before and
-- after.
-- ============================================================

alter table bookings add column if not exists dog_name_snapshot text;

comment on column bookings.dog_name_snapshot is
  'Snapshot of dogs.name at booking creation. Display layer prefers the live joined value and only falls back to this if the dog row has been deleted or sits past the paginated dogs cache. Set automatically by trg_bookings_set_snapshots on insert.';

alter table bookings disable trigger trg_validate_booking_capacity;

update bookings b
   set dog_name_snapshot = d.name
  from dogs d
 where d.id = b.dog_id
   and b.dog_name_snapshot is null
   and d.name is not null;

alter table bookings enable trigger trg_validate_booking_capacity;

-- Extend the existing trigger function to also populate the dog name
-- snapshot. The breed and owner branches are unchanged.
create or replace function set_booking_snapshots()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dog_name text;
  v_breed text;
  v_owner text;
begin
  if new.dog_name_snapshot is null then
    select name into v_dog_name from dogs where id = new.dog_id;
    if v_dog_name is not null then
      new.dog_name_snapshot := v_dog_name;
    end if;
  end if;

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

comment on function set_booking_snapshots() is
  'Auto-fills bookings.dog_name_snapshot / breed_snapshot / owner_name_snapshot at insert time from the linked dog and owner. Caller-supplied values win; nulls are populated from the join. INSERT only so historic snapshots are not mutated by later dog/human edits.';

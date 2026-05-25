-- 20260525120000_fix_partial_owner_name_snapshot.sql
--
-- Fix: the dashboard "Tomorrow's reminders" card shows "Unknown customer"
-- for any customer who has only a first name OR only a surname (not both).
--
-- Root cause: bookings.owner_name_snapshot is populated by
-- set_booking_snapshots() (and was seeded by the original backfill in
-- 20260513120000_booking_breed_owner_snapshots.sql) using
--   trim(h.name || ' ' || h.surname)
-- In Postgres `||` propagates NULL, so when humans.surname is NULL the
-- whole expression is NULL and the snapshot is stored as NULL. humans.surname
-- is nullable (relaxed by 20260430121357_relax_human_uniqueness), and many
-- customers have a first name only. src/hooks/useTomorrowReminders.js then
-- renders `owner_name_snapshot || "Unknown customer"` -> "Unknown customer".
--
-- Fix: use the NULL-safe concatenation already used by booking_event_party()
-- in 20260520250000_booking_events.sql:
--   nullif(trim(coalesce(h.name,'') || ' ' || coalesce(h.surname,'')), '')
-- A partial name degrades to the part we have; a genuinely empty name stays
-- NULL (correctly read as "Unknown customer").
--
-- Both statements are idempotent (safe to re-run / double-apply).

-- 1. Backfill existing rows whose snapshot is NULL but whose linked human has
--    a usable name. Bracket the capacity validator (fires on UPDATE and can
--    RAISE for service_role writes) — same pattern as
--    20260518190000_booking_dog_name_snapshot.sql.
alter table bookings disable trigger trg_validate_booking_capacity;

update bookings b
   set owner_name_snapshot =
         nullif(trim(coalesce(h.name, '') || ' ' || coalesce(h.surname, '')), '')
  from dogs d
  join humans h on h.id = d.human_id
 where d.id = b.dog_id
   and b.owner_name_snapshot is null
   and nullif(trim(coalesce(h.name, '') || ' ' || coalesce(h.surname, '')), '') is not null;

alter table bookings enable trigger trg_validate_booking_capacity;

-- 2. Replace the trigger function. The dog_name and breed branches are
--    unchanged; only the owner branch switches to NULL-safe concatenation.
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
    select nullif(trim(coalesce(h.name, '') || ' ' || coalesce(h.surname, '')), '')
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
  'Auto-fills bookings.dog_name_snapshot / breed_snapshot / owner_name_snapshot at insert time from the linked dog and owner. Owner name uses NULL-safe concatenation so a partial name (only first OR only surname) degrades to the part present instead of NULL. Caller-supplied values win; nulls are populated from the join. INSERT only so historic snapshots are not mutated by later dog/human edits.';

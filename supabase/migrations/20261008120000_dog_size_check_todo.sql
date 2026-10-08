-- ============================================================
-- Dog size check: a staff to-do whenever a customer is waiting on a size
--
-- A dog with no authoritative size (dogs.size is null) cannot be booked
-- online: create_customer_booking_group raises dog_size_unconfirmed, and the
-- portal greys the dog out. That is deliberate — staff are the only authority
-- on size (20260712115759_legal_risk_tranche1), because size decides how many
-- seats a booking takes. What was missing is the other half: nothing told
-- staff a customer was waiting, so the portal said "message us first" and the
-- customer had to chase.
--
-- This migration changes NOTHING about who may set dogs.size, capacity,
-- pricing or the booking gates. It only adds a to-do:
--
--   1. salon_todos.dog_id, with at most one OPEN to-do per dog, so repeated
--      triggers refresh one task instead of stacking duplicates.
--   2. raise_dog_size_check_todo(dog) — internal. Writes or refreshes that
--      to-do for an approved customer's live dog that still has no size.
--   3. An AFTER trigger on dogs:
--        - a signed-in customer adds a dog, or changes its breed or estimate,
--          and the dog ends up with no size  → raise the to-do;
--        - anyone sets a size on a dog that had none → tick the to-do off.
--      Errors are swallowed with a warning, like the staff push triggers: a
--      to-do must never roll back the dog write it follows.
--   4. request_dog_size_check(dog) — customer RPC. The booking wizard calls it
--      when it shows a dog it cannot book, which covers older dogs (mostly the
--      April 2026 import) that no customer write has touched.
--
-- Kind stays 'general' so staff tick it off like any task; the workflow kinds
-- are locked to their own completion flows. Expand-only: rollback is to drop
-- the trigger and functions; the column and index are harmless left behind.
-- ============================================================

-- ── 1. Link a to-do to a dog ────────────────────────────────

alter table public.salon_todos
  add column if not exists dog_id uuid references public.dogs(id) on delete cascade;

comment on column public.salon_todos.dog_id is
  'Optional link to the dog this to-do is about. Used by the dog size check: at most one open to-do per dog.';

create unique index if not exists salon_todos_one_open_per_dog
  on public.salon_todos(dog_id)
  where dog_id is not null and done = false;

-- ── 2. Write or refresh the to-do (internal) ────────────────

create or replace function public.raise_dog_size_check_todo(p_dog_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_dog_name text;
  v_breed text;
  v_size text;
  v_reported text;
  v_archived timestamptz;
  v_human_id uuid;
  v_owner text;
  v_approved timestamptz;
  v_text text;
begin
  select d.name, nullif(btrim(d.breed), ''), d.size, d.reported_size,
         d.archived_at, d.human_id,
         nullif(btrim(concat_ws(' ', btrim(h.name), btrim(h.surname))), ''),
         h.approved_at
  into v_dog_name, v_breed, v_size, v_reported,
       v_archived, v_human_id, v_owner, v_approved
  from public.dogs d
  join public.humans h on h.id = d.human_id
  where d.id = p_dog_id;

  -- Nothing to confirm, or nobody who can book yet: an unapproved signup is
  -- already covered by its signup_review task, which needs every size set.
  if not found or v_size is not null or v_archived is not null or v_approved is null then
    return;
  end if;

  v_text := 'Confirm size: ' || coalesce(nullif(btrim(v_dog_name), ''), 'a dog')
    || coalesce(' (' || v_breed || ')', '')
    || ' — ' || coalesce(v_owner, 'the owner')
    || case
         when v_reported is not null then ' thinks ' || v_reported
         else ' gave no estimate'
       end
    || '. They can''t book online until it''s set.';

  insert into public.salon_todos (text, done, kind, human_id, dog_id, sort_order)
  values (
    v_text, false, 'general', v_human_id, p_dog_id,
    coalesce((select max(t.sort_order) from public.salon_todos t), -1) + 1
  )
  on conflict (dog_id) where dog_id is not null and done = false
  do update set text = excluded.text, updated_at = now();
end;
$$;

comment on function public.raise_dog_size_check_todo(uuid) is
  'Internal. Writes or refreshes the single open "Confirm size" to-do for an approved customer''s live dog with no dogs.size. No-op otherwise.';

revoke all on function public.raise_dog_size_check_todo(uuid) from public;
revoke all on function public.raise_dog_size_check_todo(uuid) from anon;
revoke all on function public.raise_dog_size_check_todo(uuid) from authenticated;

-- ── 3. Raise on customer writes, tick off once a size is set ─

create or replace function public.dogs_size_check_todo()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  begin
    if new.size is not null then
      if tg_op = 'UPDATE' and old.size is null then
        update public.salon_todos
        set done = true, updated_at = now()
        where dog_id = new.id and done = false;
      end if;
      return null;
    end if;

    -- Only a signed-in customer's own write. Staff are setting the size
    -- themselves; service-role scripts and imports have no customer waiting.
    if (select auth.uid()) is null or public.is_staff() then
      return null;
    end if;

    -- An unrelated edit (notes, vet) on a dog already waiting adds nothing.
    if tg_op = 'UPDATE'
       and old.size is null
       and old.reported_size is not distinct from new.reported_size
       and old.breed is not distinct from new.breed then
      return null;
    end if;

    perform public.raise_dog_size_check_todo(new.id);
  exception when others then
    raise warning 'dogs_size_check_todo failed for dog % (non-fatal): %', new.id, sqlerrm;
  end;
  return null;
end;
$$;

revoke all on function public.dogs_size_check_todo() from public;
revoke all on function public.dogs_size_check_todo() from anon;
revoke all on function public.dogs_size_check_todo() from authenticated;

drop trigger if exists trg_dogs_size_check_todo on public.dogs;
create trigger trg_dogs_size_check_todo
  after insert or update of size, reported_size, breed on public.dogs
  for each row execute function public.dogs_size_check_todo();

-- ── 4. Customer asks for a size check from the booking wizard ─

create or replace function public.request_dog_size_check(p_dog_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;

  if not exists (
    select 1
    from public.dogs d
    join public.humans h on h.id = d.human_id
    where d.id = p_dog_id
      and h.customer_user_id = v_uid
  ) then
    raise exception 'That dog is not on your account' using errcode = '42704';
  end if;

  perform public.raise_dog_size_check_todo(p_dog_id);
end;
$$;

comment on function public.request_dog_size_check(uuid) is
  'Customer RPC. Asks staff to confirm the size of one of the caller''s dogs by writing or refreshing its "Confirm size" to-do. Idempotent; never sets dogs.size.';

revoke all on function public.request_dog_size_check(uuid) from public;
revoke all on function public.request_dog_size_check(uuid) from anon;
grant execute on function public.request_dog_size_check(uuid) to authenticated;

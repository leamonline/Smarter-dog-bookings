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
--      to-do for an approved customer's live dog that still has no size, and
--      says whether one is open. It locks the dog row first, so a request that
--      races a staff size edit or archive waits for it and then sees the
--      result, instead of reopening a task the staff write just closed.
--   3. An AFTER trigger on dogs:
--        - a signed-in customer adds a dog, or changes its breed or estimate,
--          and the dog ends up with no size  → raise the to-do;
--        - the dog is renamed while its to-do is open → refresh the wording;
--        - the dog moves to another owner (merge_humans) → the open to-do
--          moves with it, before the old owner's delete can cascade it away;
--        - anyone sets a size, or archives the dog → tick the to-do off.
--      Errors are swallowed with a warning, like the staff push triggers: a
--      to-do must never roll back the dog write it follows.
--   4. request_dog_size_check(dog) — customer RPC. It locks the caller's own
--      human row before the dog (the order merge_humans and the customer dog
--      RPCs use, so the two cannot deadlock), and the writer re-checks under
--      the dog lock that the dog is still theirs. The booking wizard calls it
--      when it shows a dog it cannot book, which covers older dogs (mostly the
--      April 2026 import) that no customer write has touched. It returns true
--      only when a to-do is open afterwards, so the wizard never says "we've
--      asked the team" when nothing was recorded (an archived dog, say).
--   5. An AFTER trigger on humans refreshes open to-dos when the owner's name
--      changes: the to-do list shows only the stored text.
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

create or replace function public.raise_dog_size_check_todo(
  p_dog_id uuid,
  p_expected_human_id uuid default null
)
returns boolean
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
  where d.id = p_dog_id
  for update of d;

  -- Nothing to confirm, or nobody who can book yet: an unapproved signup is
  -- already covered by its signup_review task, which needs every size set.
  -- With an expected owner (the customer RPC), the dog must still be theirs
  -- now that it is locked: staff may have moved it since the caller's check.
  if not found or v_size is not null or v_archived is not null or v_approved is null
     or (p_expected_human_id is not null and v_human_id is distinct from p_expected_human_id) then
    return false;
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
  do update set text = excluded.text, human_id = excluded.human_id, updated_at = now();
  return true;
end;
$$;

comment on function public.raise_dog_size_check_todo(uuid, uuid) is
  'Internal. Writes or refreshes the single open "Confirm size" to-do for an approved customer''s live dog with no dogs.size, under a lock on the dog row; with p_expected_human_id, only while the dog still belongs to that human. Returns true when a to-do is open afterwards, false when there was nothing to raise.';

revoke all on function public.raise_dog_size_check_todo(uuid, uuid) from public;
revoke all on function public.raise_dog_size_check_todo(uuid, uuid) from anon;
revoke all on function public.raise_dog_size_check_todo(uuid, uuid) from authenticated;

-- ── 3. Raise on customer writes, tick off once a size is set ─

create or replace function public.dogs_size_check_todo()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  begin
    -- A size, or archiving, ends the wait: tick off whatever is open.
    if new.size is not null or new.archived_at is not null then
      if tg_op = 'UPDATE'
         and (old.size is null or old.archived_at is null) then
        update public.salon_todos
        set done = true, updated_at = now()
        where dog_id = new.id and done = false;
      end if;
      return null;
    end if;

    -- Still waiting, and nothing that changes the size question: at most the
    -- name or the owner changed. Keep an open to-do with the dog (whoever made
    -- the edit) and never create one. The owner move matters for
    -- merge_humans, which reassigns dogs and then deletes the losing human:
    -- salon_todos.human_id cascades, so a to-do left on the loser would vanish.
    if tg_op = 'UPDATE'
       and old.size is null
       and old.archived_at is null
       and old.reported_size is not distinct from new.reported_size
       and old.breed is not distinct from new.breed then
      if (old.name is distinct from new.name
          or old.human_id is distinct from new.human_id)
         and exists (select 1 from public.salon_todos t
                      where t.dog_id = new.id and t.done = false) then
        update public.salon_todos
        set human_id = new.human_id, updated_at = now()
        where dog_id = new.id and done = false;
        perform public.raise_dog_size_check_todo(new.id);
      end if;
      return null;
    end if;

    -- Only a signed-in customer's own write raises a new one. Staff are
    -- setting the size themselves; service-role scripts and imports have no
    -- customer waiting.
    if (select auth.uid()) is null or public.is_staff() then
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
  after insert or update of size, reported_size, breed, name, archived_at, human_id on public.dogs
  for each row execute function public.dogs_size_check_todo();

-- ── 4. Customer asks for a size check from the booking wizard ─

create or replace function public.request_dog_size_check(p_dog_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := (select auth.uid());
  v_human_id uuid;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;

  -- The caller's own owner row first, then (inside the writer) the dog: the
  -- order merge_humans and the customer dog RPCs take, so they cannot deadlock.
  select h.id into v_human_id
  from public.humans h
  where h.customer_user_id = v_uid
  limit 1
  for update;

  if v_human_id is null or not exists (
    select 1 from public.dogs d
    where d.id = p_dog_id and d.human_id = v_human_id
  ) then
    raise exception 'That dog is not on your account' using errcode = '42704';
  end if;

  -- The writer re-checks ownership under the dog lock.
  return public.raise_dog_size_check_todo(p_dog_id, v_human_id);
end;
$$;

comment on function public.request_dog_size_check(uuid) is
  'Customer RPC. Asks staff to confirm the size of one of the caller''s dogs by writing or refreshing its "Confirm size" to-do. Returns true only when a to-do is open afterwards. Idempotent; never sets dogs.size.';

revoke all on function public.request_dog_size_check(uuid) from public;
revoke all on function public.request_dog_size_check(uuid) from anon;
grant execute on function public.request_dog_size_check(uuid) to authenticated;

-- ── 5. Owner renamed: refresh the wording of their open to-dos ─

create or replace function public.humans_refresh_size_check_todos()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  begin
    -- The owner row is already locked by this update, so taking each dog row
    -- inside the writer keeps the owner-then-dog order.
    perform public.raise_dog_size_check_todo(t.dog_id)
    from public.salon_todos t
    where t.human_id = new.id
      and t.dog_id is not null
      and t.done = false;
  exception when others then
    raise warning 'humans_refresh_size_check_todos failed for human % (non-fatal): %', new.id, sqlerrm;
  end;
  return null;
end;
$$;

revoke all on function public.humans_refresh_size_check_todos() from public;
revoke all on function public.humans_refresh_size_check_todos() from anon;
revoke all on function public.humans_refresh_size_check_todos() from authenticated;

drop trigger if exists trg_humans_refresh_size_check_todos on public.humans;
create trigger trg_humans_refresh_size_check_todos
  after update of name, surname on public.humans
  for each row
  when (old.name is distinct from new.name or old.surname is distinct from new.surname)
  execute function public.humans_refresh_size_check_todos();

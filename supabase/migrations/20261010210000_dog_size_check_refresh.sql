-- ============================================================
-- Dog size check follow-up (#963, review of PR #962)
--
-- 20261008120000_dog_size_check_todo is applied and append-only; this
-- migration corrects two things found after it went live.
--
--   1. A full index on salon_todos(dog_id). The only index was the partial
--      one-open-per-dog unique index, which cannot serve the foreign key's
--      ON DELETE CASCADE lookup across completed rows, and the Supabase
--      advisor reports the foreign key as unindexed.
--
--   2. Refreshing a to-do never recreates one. The "keep the wording current"
--      paths (dog renamed, owner moved or renamed, staff edit) used the
--      insert-capable writer. If staff ticked the to-do off at the same moment,
--      the writer found no open row and inserted a new one, undoing the
--      staff completion. They now update the open row in place and nothing
--      else: a to-do completed meanwhile stays completed. Only the paths that
--      may genuinely raise a request (a customer write, the wizard's RPC) still
--      use raise_dog_size_check_todo.
--
-- The to-do wording moves into one helper so the writer and the refresher
-- cannot drift apart. Expand-only: no table rewrite, no data change.
-- ============================================================

-- ── 1. A full index behind the foreign key ──────────────────

create index if not exists salon_todos_dog_id_idx
  on public.salon_todos(dog_id);

-- ── 2. One place that words the to-do ───────────────────────

create or replace function public.dog_size_check_todo_text(
  p_dog_name text,
  p_breed text,
  p_owner text,
  p_reported text
)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select 'Confirm size: ' || coalesce(nullif(btrim(p_dog_name), ''), 'a dog')
    || coalesce(' (' || nullif(btrim(p_breed), '') || ')', '')
    || ' — ' || coalesce(nullif(btrim(p_owner), ''), 'the owner')
    || case
         when p_reported is not null then ' thinks ' || p_reported
         else ' gave no estimate'
       end
    || '. They can''t book online until it''s set.';
$$;

comment on function public.dog_size_check_todo_text(text, text, text, text) is
  'Internal. The wording of a "Confirm size" to-do, shared by the writer and the refresher.';

revoke all on function public.dog_size_check_todo_text(text, text, text, text) from public;
revoke all on function public.dog_size_check_todo_text(text, text, text, text) from anon;
revoke all on function public.dog_size_check_todo_text(text, text, text, text) from authenticated;

-- The writer, unchanged in behaviour, now worded through the helper.
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
begin
  select d.name, d.breed, d.size, d.reported_size,
         d.archived_at, d.human_id,
         concat_ws(' ', btrim(h.name), btrim(h.surname)),
         h.approved_at
  into v_dog_name, v_breed, v_size, v_reported,
       v_archived, v_human_id, v_owner, v_approved
  from public.dogs d
  join public.humans h on h.id = d.human_id
  where d.id = p_dog_id
  for update of d;

  if not found or v_size is not null or v_archived is not null or v_approved is null
     or (p_expected_human_id is not null and v_human_id is distinct from p_expected_human_id) then
    return false;
  end if;

  insert into public.salon_todos (text, done, kind, human_id, dog_id, sort_order)
  values (
    public.dog_size_check_todo_text(v_dog_name, v_breed, v_owner, v_reported),
    false, 'general', v_human_id, p_dog_id,
    coalesce((select max(t.sort_order) from public.salon_todos t), -1) + 1
  )
  on conflict (dog_id) where dog_id is not null and done = false
  do update set text = excluded.text, human_id = excluded.human_id, updated_at = now();
  return true;
end;
$$;

revoke all on function public.raise_dog_size_check_todo(uuid, uuid) from public;
revoke all on function public.raise_dog_size_check_todo(uuid, uuid) from anon;
revoke all on function public.raise_dog_size_check_todo(uuid, uuid) from authenticated;

-- ── 3. Refresh an open to-do in place, never create one ─────

create or replace function public.refresh_dog_size_check_todo(p_dog_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_dog_name text;
  v_breed text;
  v_reported text;
  v_human_id uuid;
  v_owner text;
begin
  select d.name, d.breed, d.reported_size, d.human_id,
         concat_ws(' ', btrim(h.name), btrim(h.surname))
  into v_dog_name, v_breed, v_reported, v_human_id, v_owner
  from public.dogs d
  join public.humans h on h.id = d.human_id
  where d.id = p_dog_id
  for update of d;
  -- The dog lock (already held when called from the dog trigger; taken after
  -- the owner row when called from the owner-rename trigger) means a
  -- concurrent owner move is waited for, so the human_id written is current.

  if not found then
    return false;
  end if;

  -- An UPDATE, not an upsert: a row ticked off concurrently is re-checked
  -- after its lock is released, no longer matches done = false, and is left
  -- alone. Nothing is ever inserted here.
  update public.salon_todos
  set text = public.dog_size_check_todo_text(v_dog_name, v_breed, v_owner, v_reported),
      human_id = v_human_id,
      updated_at = now()
  where dog_id = p_dog_id and done = false;
  return found;
end;
$$;

comment on function public.refresh_dog_size_check_todo(uuid) is
  'Internal. Rewords and re-links the open "Confirm size" to-do for a dog, if there is one. Never inserts, so it cannot reopen a to-do staff completed.';

revoke all on function public.refresh_dog_size_check_todo(uuid) from public;
revoke all on function public.refresh_dog_size_check_todo(uuid) from anon;
revoke all on function public.refresh_dog_size_check_todo(uuid) from authenticated;

-- ── 4. The dog trigger refreshes rather than re-raises ──────

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
    -- name or the owner changed. Keep an open to-do current (whoever made the
    -- edit) and never create one. The owner move matters for merge_humans,
    -- which reassigns dogs and then deletes the losing human:
    -- salon_todos.human_id cascades, so a to-do left on the loser would vanish.
    if tg_op = 'UPDATE'
       and old.size is null
       and old.archived_at is null
       and old.reported_size is not distinct from new.reported_size
       and old.breed is not distinct from new.breed then
      if old.name is distinct from new.name
         or old.human_id is distinct from new.human_id then
        perform public.refresh_dog_size_check_todo(new.id);
      end if;
      return null;
    end if;

    -- Only a signed-in customer's own write raises a new one. Staff are
    -- setting the size themselves; service-role scripts and imports have no
    -- customer waiting. Their edits (a corrected breed, say) still refresh
    -- an open to-do's wording.
    if (select auth.uid()) is null or public.is_staff() then
      perform public.refresh_dog_size_check_todo(new.id);
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

-- ── 5. The owner-rename trigger refreshes rather than re-raises ─

create or replace function public.humans_refresh_size_check_todos()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  begin
    perform public.refresh_dog_size_check_todo(t.dog_id)
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

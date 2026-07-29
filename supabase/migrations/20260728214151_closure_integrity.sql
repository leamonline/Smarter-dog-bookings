-- ============================================================
-- Closure integrity
--
-- Closing a salon day and recording the visits that need rearranging is one
-- atomic command. Closure tasks carry durable visit/date links and can only
-- complete after the diary no longer contradicts the closure (or the day has
-- been reopened).
--
-- This deliberately stays closure-specific. It does not introduce a generic
-- task framework; the UI convention for unknown typed tasks is handled by the
-- application.
-- ============================================================

-- ── 1. Durable closure-task identity ───────────────────────────────

alter table public.salon_todos
  add column if not exists booking_visit_id uuid
    references public.booking_visits(id),
  add column if not exists closure_date date;

alter table public.salon_todos
  drop constraint if exists salon_todos_closure_link_check;
alter table public.salon_todos
  add constraint salon_todos_closure_link_check check (
    (
      kind = 'closure_rearrangement'
      and booking_visit_id is not null
      and closure_date is not null
      and booking_change_request_id is null
    )
    or
    (
      kind <> 'closure_rearrangement'
      and booking_visit_id is null
      and closure_date is null
    )
  );

create unique index if not exists salon_todos_one_closure_visit_date
  on public.salon_todos(booking_visit_id, closure_date)
  where kind = 'closure_rearrangement';
create index if not exists idx_salon_todos_booking_visit_id
  on public.salon_todos(booking_visit_id);
create index if not exists idx_salon_todos_open_closure_date
  on public.salon_todos(closure_date)
  where kind = 'closure_rearrangement' and not done;

comment on column public.salon_todos.booking_visit_id is
  'For closure_rearrangement tasks, the immutable visit that was still active when the date closed.';
comment on column public.salon_todos.closure_date is
  'For closure_rearrangement tasks, the immutable closed date from which the linked visit must be cleared.';

-- Closure tasks are domain work, not generic checkboxes. Identity cannot be
-- rewritten, direct done changes are refused, and deletion is refused. The
-- two commands below open a short transaction-local mutation latch only for
-- their own guarded update.
create or replace function smarter_dog_private.guard_closure_rearrangement_task()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.kind = 'closure_rearrangement' then
      raise exception 'closure_task_requires_guarded_command'
        using errcode = 'SCL02';
    end if;
    return old;
  end if;

  if old.kind = 'closure_rearrangement'
     or new.kind = 'closure_rearrangement' then
    if new.kind is distinct from old.kind
       or new.booking_visit_id is distinct from old.booking_visit_id
       or new.closure_date is distinct from old.closure_date
       or new.human_id is distinct from old.human_id
       or new.booking_change_request_id is distinct from old.booking_change_request_id then
      raise exception 'closure_task_identity_is_immutable'
        using errcode = 'SCL02';
    end if;

    if new.done is distinct from old.done
       and coalesce(
         current_setting('smarter_dog.closure_task_mutation', true),
         ''
       ) <> 'on' then
      raise exception 'closure_task_requires_guarded_command'
        using errcode = 'SCL02';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function smarter_dog_private.guard_closure_rearrangement_task()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_guard_closure_rearrangement_task
  on public.salon_todos;
create trigger trg_guard_closure_rearrangement_task
  before update or delete on public.salon_todos
  for each row execute function smarter_dog_private.guard_closure_rearrangement_task();

-- ── 2. Database guards around the closure invariant ───────────────

-- A direct first transition to closed is valid only when every active visit
-- on the date already has an open, linked closure task. The atomic command
-- inserts those tasks before it performs this upsert, so the final result is
-- checked without a privileged bypass flag.
create or replace function smarter_dog_private.guard_day_closure_has_tasks()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_open is false
     and (
       tg_op = 'INSERT'
       or old.is_open is distinct from false
       or old.setting_date is distinct from new.setting_date
     ) then
    -- The atomic command already owns this lock. Taking the same lock here
    -- also makes any direct-but-invariant-preserving close serialise against
    -- a booking being introduced onto the date.
    perform pg_advisory_xact_lock(
      hashtextextended('smarter_dog|close_day|' || new.setting_date::text, 0)
    );

    if exists (
      select 1
        from public.bookings b
       where b.booking_date = new.setting_date
         and b.visit_membership_state = 'included'
         and coalesce(b.status, 'Booked') not in ('Cancelled', 'Completed')
         and (
           b.visit_id is null
           or not exists (
             select 1
               from public.salon_todos t
              where t.kind = 'closure_rearrangement'
                and t.booking_visit_id = b.visit_id
                and t.closure_date = new.setting_date
                and not t.done
           )
         )
    ) then
      raise exception 'closure_requires_linked_rearrangement_tasks'
        using errcode = 'SCL03';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function smarter_dog_private.guard_day_closure_has_tasks()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_guard_day_closure_has_tasks
  on public.day_settings;
create trigger trg_guard_day_closure_has_tasks
  before insert or update of is_open, setting_date on public.day_settings
  for each row execute function smarter_dog_private.guard_day_closure_has_tasks();

-- Do not create a fresh contradiction after a date has closed. The guard
-- runs last among BEFORE booking triggers so legacy visit assignment has
-- already populated visit_id. It only checks operations that introduce an
-- active row onto the date, so unrelated edits to pre-existing damaged data
-- remain repairable.
create or replace function smarter_dog_private.guard_active_booking_on_closed_day()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.visit_membership_state = 'included'
     and coalesce(new.status, 'Booked') not in ('Cancelled', 'Completed')
     and (
       tg_op = 'INSERT'
       or old.booking_date is distinct from new.booking_date
       or old.status in ('Cancelled', 'Completed')
       or old.visit_membership_state is distinct from 'included'
       or old.visit_id is distinct from new.visit_id
       or old.dog_id is distinct from new.dog_id
     ) then
    -- Share a date-scoped lock with the close command. Without it, an insert
    -- could check an open day while a concurrent close had already collected
    -- its affected visits, then commit afterwards without a linked task.
    perform pg_advisory_xact_lock(
      hashtextextended('smarter_dog|close_day|' || new.booking_date::text, 0)
    );

    if exists (
      select 1
        from public.day_settings ds
       where ds.setting_date = new.booking_date
         and ds.is_open is false
    )
    and not exists (
      select 1
        from public.salon_todos t
       where t.kind = 'closure_rearrangement'
         and t.booking_visit_id = new.visit_id
         and t.closure_date = new.booking_date
         and not t.done
    ) then
      raise exception 'active_booking_requires_open_day_or_closure_task'
        using errcode = 'SCL03';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function smarter_dog_private.guard_active_booking_on_closed_day()
  from public, anon, authenticated, service_role;

drop trigger if exists zz_guard_active_booking_on_closed_day
  on public.bookings;
create trigger zz_guard_active_booking_on_closed_day
  before insert or update of booking_date, status, visit_membership_state, visit_id, dog_id
  on public.bookings
  for each row execute function smarter_dog_private.guard_active_booking_on_closed_day();

-- ── 3. Staff-only atomic commands ─────────────────────────────────

create or replace function public.close_day_with_rearrangement_tasks(
  p_date date
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_affected_visits integer;
  v_open_tasks integer;
  v_base_sort integer;
begin
  if not public.is_staff() then
    raise exception 'Staff only' using errcode = '42501';
  end if;

  if p_date is null then
    raise exception 'closure_date_is_required' using errcode = '22004';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('smarter_dog|close_day|' || p_date::text, 0)
  );

  -- Compatibility rollout columns remain nullable at schema level. Refuse a
  -- damaged active row rather than silently closing the date without a task.
  if exists (
    select 1
      from public.bookings b
     where b.booking_date = p_date
       and b.visit_membership_state = 'included'
       and coalesce(b.status, 'Booked') not in ('Cancelled', 'Completed')
       and b.visit_id is null
  ) then
    raise exception 'closure_booking_missing_visit'
      using errcode = 'SCL04';
  end if;

  select count(distinct b.visit_id)::integer
    into v_affected_visits
    from public.bookings b
   where b.booking_date = p_date
     and b.visit_membership_state = 'included'
     and coalesce(b.status, 'Booked') not in ('Cancelled', 'Completed');

  select coalesce(max(t.sort_order), -1)
    into v_base_sort
    from public.salon_todos t;

  perform set_config('smarter_dog.closure_task_mutation', 'on', true);

  with affected as (
    select
      b.visit_id,
      d.human_id,
      string_agg(distinct d.name, ', ' order by d.name) as dog_names,
      string_agg(distinct b.slot, ', ' order by b.slot) as slots,
      nullif(trim(concat_ws(' ', h.name, h.surname)), '') as human_name,
      min(b.slot) as first_slot
    from public.bookings b
    join public.dogs d on d.id = b.dog_id
    join public.humans h on h.id = d.human_id
    where b.booking_date = p_date
      and b.visit_membership_state = 'included'
      and coalesce(b.status, 'Booked') not in ('Cancelled', 'Completed')
    group by b.visit_id, d.human_id, h.name, h.surname
  ),
  ordered as (
    select
      a.*,
      row_number() over (
        order by a.first_slot, a.dog_names, a.visit_id
      )::integer as task_offset
    from affected a
  )
  insert into public.salon_todos (
    text,
    done,
    sort_order,
    human_id,
    kind,
    booking_visit_id,
    closure_date
  )
  select
    'Rearrange '
      || coalesce(nullif(o.dog_names, ''), 'appointment')
      || case
           when o.human_name is null then ''
           else ' (' || o.human_name || ')'
         end
      || ' — closed ' || to_char(p_date, 'Dy DD Mon')
      || ' at ' || coalesce(nullif(o.slots, ''), 'time not recorded'),
    false,
    v_base_sort + o.task_offset,
    o.human_id,
    'closure_rearrangement',
    o.visit_id,
    p_date
  from ordered o
  on conflict (booking_visit_id, closure_date)
    where kind = 'closure_rearrangement'
  do update set
    text = excluded.text,
    done = false,
    human_id = excluded.human_id,
    updated_at = statement_timestamp();

  perform set_config('smarter_dog.closure_task_mutation', '', true);

  insert into public.day_settings (setting_date, is_open)
  values (p_date, false)
  on conflict (setting_date)
  do update set is_open = false;

  select count(*)::integer
    into v_open_tasks
    from public.salon_todos t
   where t.kind = 'closure_rearrangement'
     and t.closure_date = p_date
     and not t.done;

  return jsonb_build_object(
    'status', 'closed',
    'closure_date', p_date,
    'affected_visits', coalesce(v_affected_visits, 0),
    'open_tasks', coalesce(v_open_tasks, 0)
  );
end;
$$;

comment on function public.close_day_with_rearrangement_tasks(date) is
  'Staff-only atomic date closure. Creates or reopens one linked task per active visit, then closes day_settings; exact retries do not duplicate tasks.';

revoke all on function public.close_day_with_rearrangement_tasks(date)
  from public, anon, service_role;
grant execute on function public.close_day_with_rearrangement_tasks(date)
  to authenticated;

create or replace function public.complete_closure_rearrangement_task(
  p_task_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_task public.salon_todos%rowtype;
  v_day_is_open boolean;
begin
  if not public.is_staff() then
    raise exception 'Staff only' using errcode = '42501';
  end if;

  select *
    into v_task
    from public.salon_todos t
   where t.id = p_task_id;

  if not found or v_task.kind <> 'closure_rearrangement' then
    raise exception 'unknown_closure_rearrangement_task'
      using errcode = 'SCL05';
  end if;

  -- Serialise the final diary check with active bookings being introduced
  -- onto this date. Otherwise a booking could observe the task as open while
  -- this command simultaneously observed the date as clear, leaving a booked
  -- visit behind a completed task. Take the date lock before the task-row
  -- lock, matching close_day_with_rearrangement_tasks, to avoid a lock-order
  -- cycle when a close retry and completion arrive together.
  perform pg_advisory_xact_lock(
    hashtextextended(
      'smarter_dog|close_day|' || v_task.closure_date::text,
      0
    )
  );

  select *
    into v_task
    from public.salon_todos t
   where t.id = p_task_id
   for update;

  if not found or v_task.kind <> 'closure_rearrangement' then
    raise exception 'unknown_closure_rearrangement_task'
      using errcode = 'SCL05';
  end if;

  if v_task.done then
    return jsonb_build_object(
      'status', 'completed',
      'task_id', v_task.id,
      'replayed', true
    );
  end if;

  select coalesce(
    (
      select ds.is_open
        from public.day_settings ds
       where ds.setting_date = v_task.closure_date
    ),
    extract(isodow from v_task.closure_date) between 1 and 3
  )
  into v_day_is_open;

  if not v_day_is_open
     and exists (
       select 1
         from public.bookings b
        where b.visit_id = v_task.booking_visit_id
          and b.booking_date = v_task.closure_date
          and b.visit_membership_state = 'included'
          and coalesce(b.status, 'Booked') not in ('Cancelled', 'Completed')
     ) then
    raise exception 'closure_visit_still_booked'
      using errcode = 'SCL01';
  end if;

  perform set_config('smarter_dog.closure_task_mutation', 'on', true);
  update public.salon_todos
     set done = true,
         updated_at = statement_timestamp()
   where id = v_task.id;
  perform set_config('smarter_dog.closure_task_mutation', '', true);

  return jsonb_build_object(
    'status', 'completed',
    'task_id', v_task.id,
    'replayed', false
  );
end;
$$;

comment on function public.complete_closure_rearrangement_task(uuid) is
  'Staff-only guarded completion. Refuses while the linked visit still has an active booking on the closed date, unless staff reopened the date.';

revoke all on function public.complete_closure_rearrangement_task(uuid)
  from public, anon, service_role;
grant execute on function public.complete_closure_rearrangement_task(uuid)
  to authenticated;

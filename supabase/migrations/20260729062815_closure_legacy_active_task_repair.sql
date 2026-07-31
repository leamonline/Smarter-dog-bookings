-- ============================================================
-- Repair legacy closure tasks for visits that still contradict the diary
--
-- Before closure-integrity shipped, closing a date created generic free-text
-- tasks. Convert only rows that can still be matched exactly to an active
-- booking on an authoritatively closed date. Historical tasks without a
-- surviving, unambiguous visit are deliberately left unchanged.
--
-- Rollback classification: one-way data reconciliation.
-- This changes no task schema. Recreating unlinked or falsely completed task
-- state would restore the integrity defect, so there is intentionally no
-- automated down-data migration. Application/schema rollback is documented
-- separately; repaired task rows remain valid additive data during rollback.
-- ============================================================

-- Keep the repair as a private, idempotent operator command so the real data
-- transformation can be regression-tested after migrations have loaded. The
-- call at the end of this file is one database statement, so its locks, task
-- inserts and legacy deletes commit or roll back together even when the
-- migration runner does not wrap whole files in a transaction.
create or replace function smarter_dog_private.repair_legacy_active_closure_tasks()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_date date;
  v_repaired integer;
begin
  -- Share the same ordered date locks used by the closure command and booking
  -- guard. A visit cannot move while its legacy task is being linked.
  for v_date in
    select distinct b.booking_date
      from public.bookings b
      join public.day_settings ds
        on ds.setting_date = b.booking_date
       and ds.is_open is false
      join public.dogs d on d.id = b.dog_id
      join public.humans h on h.id = d.human_id
      join public.salon_todos t
        on t.kind = 'general'
       and t.booking_visit_id is null
       and t.closure_date is null
       and t.text =
         'Rearrange: ' || d.name
         || ' (' || trim(concat_ws(' ', h.name, h.surname)) || ')'
         || ' — was ' || to_char(b.booking_date, 'Dy DD Mon')
         || ' ' || b.slot
     where b.visit_id is not null
       and b.visit_membership_state = 'included'
       and coalesce(b.status, 'Booked') not in ('Cancelled', 'Completed')
     order by b.booking_date
  loop
    perform pg_advisory_xact_lock(
      hashtextextended('smarter_dog|close_day|' || v_date::text, 0)
    );
  end loop;

  drop table if exists pg_temp.closure_legacy_active_task_repair_targets;
  create temporary table closure_legacy_active_task_repair_targets
  on commit drop
  as
  with legacy_matches as (
    select distinct
      t.id as legacy_task_id,
      t.done,
      t.sort_order,
      t.created_at,
      b.visit_id as booking_visit_id,
      b.booking_date as closure_date
    from public.bookings b
    join public.day_settings ds
      on ds.setting_date = b.booking_date
     and ds.is_open is false
    join public.dogs d on d.id = b.dog_id
    join public.humans h on h.id = d.human_id
    join public.salon_todos t
      on t.kind = 'general'
     and t.booking_visit_id is null
     and t.closure_date is null
     and t.text =
       'Rearrange: ' || d.name
       || ' (' || trim(concat_ws(' ', h.name, h.surname)) || ')'
       || ' — was ' || to_char(b.booking_date, 'Dy DD Mon')
       || ' ' || b.slot
    where b.visit_id is not null
      and b.visit_membership_state = 'included'
      and coalesce(b.status, 'Booked') not in ('Cancelled', 'Completed')
  ),
  ranked_matches as (
    select
      lm.*,
      row_number() over (
        partition by lm.booking_visit_id, lm.closure_date
        order by (not lm.done) desc, lm.created_at desc, lm.legacy_task_id
      ) as preference_rank
    from legacy_matches lm
  ),
  affected_visits as (
    select
      b.visit_id as booking_visit_id,
      b.booking_date as closure_date,
      d.human_id,
      string_agg(distinct d.name, ', ' order by d.name) as dog_names,
      string_agg(distinct b.slot, ', ' order by b.slot) as slots,
      nullif(trim(concat_ws(' ', h.name, h.surname)), '') as human_name
    from public.bookings b
    join public.dogs d on d.id = b.dog_id
    join public.humans h on h.id = d.human_id
    where b.visit_membership_state = 'included'
      and coalesce(b.status, 'Booked') not in ('Cancelled', 'Completed')
      and exists (
        select 1
          from legacy_matches lm
         where lm.booking_visit_id = b.visit_id
           and lm.closure_date = b.booking_date
      )
    group by b.visit_id, b.booking_date, d.human_id, h.name, h.surname
  ),
  visit_targets as (
    select
      rm.booking_visit_id,
      rm.closure_date,
      rm.sort_order as target_sort_order,
      av.human_id,
      'Rearrange '
        || coalesce(nullif(av.dog_names, ''), 'appointment')
        || case
             when av.human_name is null then ''
             else ' (' || av.human_name || ')'
           end
        || ' — closed ' || to_char(av.closure_date, 'Dy DD Mon')
        || ' at ' || coalesce(nullif(av.slots, ''), 'time not recorded')
        as canonical_text
    from ranked_matches rm
    join affected_visits av
      on av.booking_visit_id = rm.booking_visit_id
     and av.closure_date = rm.closure_date
    where rm.preference_rank = 1
  )
  select
    rm.legacy_task_id,
    vt.booking_visit_id,
    vt.closure_date,
    vt.target_sort_order,
    vt.human_id,
    vt.canonical_text
  from ranked_matches rm
  join visit_targets vt
    on vt.booking_visit_id = rm.booking_visit_id
   and vt.closure_date = rm.closure_date;

  select count(distinct (booking_visit_id, closure_date))::integer
    into v_repaired
    from pg_temp.closure_legacy_active_task_repair_targets;

  -- Insert through the same protected task shape as the live close command,
  -- then remove every matching generic predecessor in this function call.
  perform set_config('smarter_dog.closure_task_mutation', 'on', true);

  insert into public.salon_todos (
    text,
    done,
    sort_order,
    human_id,
    kind,
    booking_visit_id,
    closure_date
  )
  select distinct
    targets.canonical_text,
    false,
    targets.target_sort_order,
    targets.human_id,
    'closure_rearrangement',
    targets.booking_visit_id,
    targets.closure_date
  from pg_temp.closure_legacy_active_task_repair_targets targets
  on conflict (booking_visit_id, closure_date)
    where kind = 'closure_rearrangement'
  do update set
    text = excluded.text,
    done = false,
    updated_at = statement_timestamp();

  delete from public.salon_todos t
  using pg_temp.closure_legacy_active_task_repair_targets targets
  where t.id = targets.legacy_task_id;

  perform set_config('smarter_dog.closure_task_mutation', '', true);

  if exists (
    select 1
      from (
        select distinct booking_visit_id, closure_date
          from pg_temp.closure_legacy_active_task_repair_targets
      ) expected
     where not exists (
       select 1
         from public.salon_todos t
        where t.kind = 'closure_rearrangement'
          and t.booking_visit_id = expected.booking_visit_id
          and t.closure_date = expected.closure_date
          and not t.done
     )
  )
  or exists (
    select 1
      from pg_temp.closure_legacy_active_task_repair_targets leftovers
      join public.salon_todos t
        on t.id = leftovers.legacy_task_id
  ) then
    raise exception 'legacy_closure_task_repair_incomplete';
  end if;

  return coalesce(v_repaired, 0);
end;
$$;

comment on function smarter_dog_private.repair_legacy_active_closure_tasks() is
  'Private idempotent repair: converts exactly matched generic closure tasks for active visits on closed dates into open visit-linked tasks.';

revoke all on function smarter_dog_private.repair_legacy_active_closure_tasks()
  from public, anon, authenticated, service_role;

select smarter_dog_private.repair_legacy_active_closure_tasks();

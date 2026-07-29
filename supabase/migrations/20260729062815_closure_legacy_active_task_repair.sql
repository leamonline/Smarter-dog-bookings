-- ============================================================
-- Repair legacy closure tasks for visits that still contradict the diary
--
-- Before closure-integrity shipped, closing a date created generic free-text
-- tasks. Convert only rows that can still be matched exactly to an active
-- booking on an authoritatively closed date. Historical tasks without a
-- surviving, unambiguous visit are deliberately left unchanged.
--
-- Rollback classification: one-way data reconciliation.
-- This changes no schema. Recreating unlinked or falsely completed task state
-- would restore the integrity defect, so there is intentionally no automated
-- down-data migration. Application/schema rollback is documented separately;
-- the repaired task rows remain valid additive data during that rollback.
-- ============================================================

-- Share the same ordered date locks used by the closure command and booking
-- guard. A visit therefore cannot move while its legacy task is being linked.
select pg_advisory_xact_lock(
  hashtextextended(
    'smarter_dog|close_day|' || repair_dates.closure_date::text,
    0
  )
)
from (
  select distinct b.booking_date as closure_date
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
) repair_dates;

lock table public.salon_todos in share row exclusive mode;

drop table if exists pg_temp.closure_legacy_active_task_repair_targets;
create temporary table closure_legacy_active_task_repair_targets
on commit drop
as
with legacy_matches as (
  select distinct
    t.id as legacy_task_id,
    t.done,
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
    coalesce(existing_typed.id, rm.legacy_task_id) as target_task_id,
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
  left join public.salon_todos existing_typed
    on existing_typed.kind = 'closure_rearrangement'
   and existing_typed.booking_visit_id = rm.booking_visit_id
   and existing_typed.closure_date = rm.closure_date
  where rm.preference_rank = 1
)
select
  rm.legacy_task_id,
  rm.preference_rank,
  vt.booking_visit_id,
  vt.closure_date,
  vt.target_task_id,
  vt.human_id,
  vt.canonical_text
from ranked_matches rm
join visit_targets vt
  on vt.booking_visit_id = rm.booking_visit_id
 and vt.closure_date = rm.closure_date;

-- The integrity trigger correctly refuses generic callers changing task
-- identity. This migration owns an exclusive table write lock and disables
-- that trigger only for the atomic conversion transaction.
alter table public.salon_todos
  disable trigger trg_guard_closure_rearrangement_task;

update public.salon_todos t
   set text = targets.canonical_text,
       done = false,
       human_id = targets.human_id,
       kind = 'closure_rearrangement',
       booking_change_request_id = null,
       booking_visit_id = targets.booking_visit_id,
       closure_date = targets.closure_date,
       updated_at = statement_timestamp()
  from (
    select distinct
      target_task_id,
      booking_visit_id,
      closure_date,
      human_id,
      canonical_text
    from closure_legacy_active_task_repair_targets
  ) targets
 where t.id = targets.target_task_id;

delete from public.salon_todos t
using closure_legacy_active_task_repair_targets targets
where t.id = targets.legacy_task_id
  and t.id <> targets.target_task_id;

alter table public.salon_todos
  enable trigger trg_guard_closure_rearrangement_task;

do $$
begin
  if exists (
    select 1
      from (
        select distinct
          booking_visit_id,
          closure_date,
          target_task_id
        from closure_legacy_active_task_repair_targets
      ) expected
     where not exists (
       select 1
         from public.salon_todos t
        where t.id = expected.target_task_id
          and t.kind = 'closure_rearrangement'
          and t.booking_visit_id = expected.booking_visit_id
          and t.closure_date = expected.closure_date
          and not t.done
     )
  ) then
    raise exception 'legacy_closure_task_repair_incomplete';
  end if;
end;
$$;

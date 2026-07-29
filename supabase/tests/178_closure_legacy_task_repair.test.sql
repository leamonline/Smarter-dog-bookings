-- Legacy closure work that still contradicts the diary is converted in place:
-- one durable task per active visit, reopened and protected by the closure
-- completion command. Historical work without an authoritative visit link is
-- deliberately left alone.

begin;
create extension if not exists pgtap with schema extensions;
select plan(9);
\ir fixtures/ensure_local_vault_secrets.psql

insert into auth.users (id) values
  ('17800000-0000-4000-8000-000000000001'), -- staff
  ('17800000-0000-4000-8000-000000000002'); -- customer

insert into public.staff_profiles (user_id, role, display_name) values
  ('17800000-0000-4000-8000-000000000001', 'owner', 'Legacy Closure Owner');

insert into public.humans (id, name, surname, customer_user_id) values
  (
    '17800000-0000-4000-8000-000000000010',
    'Legacy', 'Customer',
    '17800000-0000-4000-8000-000000000002'
  );

insert into public.dogs (id, name, breed, size, human_id) values
  (
    '17800000-0000-4000-8000-000000000011',
    'Alpha Legacy', 'Poodle', 'small',
    '17800000-0000-4000-8000-000000000010'
  ),
  (
    '17800000-0000-4000-8000-000000000012',
    'Bravo Legacy', 'Spaniel', 'small',
    '17800000-0000-4000-8000-000000000010'
  );

select set_config(
  'request.jwt.claims',
  '{"sub":"17800000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select public.create_staff_booking_group(
  '[
    {"id":"17800000-0000-4000-8000-000000000101","dog_id":"17800000-0000-4000-8000-000000000011","slot":"09:00","size":"small","service":"Full Groom","status":"Booked","confirmed":true}
  ]'::jsonb,
  '2099-01-05'::date
);
select public.create_staff_booking_group(
  '[
    {"id":"17800000-0000-4000-8000-000000000102","dog_id":"17800000-0000-4000-8000-000000000012","slot":"10:00","size":"small","service":"Full Groom","status":"Booked","confirmed":true}
  ]'::jsonb,
  '2099-01-05'::date
);

insert into public.day_settings (setting_date, is_open)
values ('2099-01-05', true);

-- Recreate the pre-guard damage: the day is closed while the only work items
-- are generic free text. The trigger is disabled only inside this rolled-back
-- fixture; production writes cannot create this state after migration 177.
alter table public.day_settings
  disable trigger trg_guard_day_closure_has_tasks;
update public.day_settings
   set is_open = false
 where setting_date = '2099-01-05';
alter table public.day_settings
  enable trigger trg_guard_day_closure_has_tasks;

insert into public.salon_todos (
  id, text, done, sort_order, kind, created_at, updated_at
) values
  (
    '17800000-0000-4000-8000-000000000201',
    'Rearrange: Alpha Legacy (Legacy Customer) — was Mon 05 Jan 09:00',
    true, 1, 'general',
    '2098-12-01 09:00:00+00', '2098-12-02 09:00:00+00'
  ),
  (
    '17800000-0000-4000-8000-000000000202',
    'Rearrange: Alpha Legacy (Legacy Customer) — was Mon 05 Jan 09:00',
    false, 2, 'general',
    '2098-12-03 09:00:00+00', '2098-12-03 09:00:00+00'
  ),
  (
    '17800000-0000-4000-8000-000000000203',
    'Rearrange: Bravo Legacy (Legacy Customer) — was Mon 05 Jan 10:00',
    true, 3, 'general',
    '2098-12-04 09:00:00+00', '2098-12-05 09:00:00+00'
  ),
  (
    '17800000-0000-4000-8000-000000000204',
    'Rearrange: Historical Legacy — was Mon 08 Jun 08:30',
    true, 4, 'general',
    '2098-12-06 09:00:00+00', '2098-12-07 09:00:00+00'
  );

\ir ../migrations/20260729062815_closure_legacy_active_task_repair.sql

select is(
  (
    select count(*)::integer
      from public.salon_todos
     where kind = 'closure_rearrangement'
       and closure_date = '2099-01-05'
  ),
  2,
  'one linked closure task remains per active visit'
);

select ok(
  (
    select bool_and(
      booking_visit_id is not null
      and human_id = '17800000-0000-4000-8000-000000000010'
      and not done
    )
      from public.salon_todos
     where kind = 'closure_rearrangement'
       and closure_date = '2099-01-05'
  ),
  'converted tasks carry authoritative visit and human links and are reopened'
);

select ok(
  exists (
    select 1
      from public.salon_todos
     where id = '17800000-0000-4000-8000-000000000202'
       and kind = 'closure_rearrangement'
       and not done
  ),
  'the existing open duplicate is the task preserved for the visit'
);

select ok(
  exists (
    select 1
      from public.salon_todos
     where id = '17800000-0000-4000-8000-000000000203'
       and kind = 'closure_rearrangement'
       and not done
  ),
  'a falsely completed task is reopened in place'
);

select is(
  (
    select count(*)::integer
      from public.salon_todos
     where id = '17800000-0000-4000-8000-000000000201'
  ),
  0,
  'the older duplicate is removed'
);

select is(
  (
    select count(*)::integer
      from public.salon_todos
     where kind = 'general'
       and text like 'Rearrange:%Legacy Customer%'
  ),
  0,
  'no generic duplicate remains for an active closed-date visit'
);

select ok(
  exists (
    select 1
      from public.salon_todos
     where id = '17800000-0000-4000-8000-000000000204'
       and kind = 'general'
       and done
  ),
  'unlinked historical work is left unchanged rather than guessed'
);

select throws_ok(
  $$
    select public.complete_closure_rearrangement_task(
      '17800000-0000-4000-8000-000000000203'
    )
  $$,
  'SCL01', null,
  'the repaired false completion cannot recur while its visit remains booked'
);

select is(
  (
    select is_open
      from public.day_settings
     where setting_date = '2099-01-05'
  ),
  false,
  'the repair does not reopen the salon date'
);

-- This strict assertion makes a missing/no-op repair fail outside pg_prove as
-- well, so the red/green behaviour can be exercised through a rolled-back
-- hosted SQL transaction.
do $$
begin
  if (
    select count(*)
      from public.salon_todos
     where kind = 'closure_rearrangement'
       and closure_date = '2099-01-05'
       and not done
  ) <> 2 then
    raise exception 'legacy closure repair did not create two open linked tasks';
  end if;
end;
$$;

select * from finish();
rollback;

-- A closure and its rearrangement work are one database transaction. Tasks
-- are linked per visit, cannot be ticked off directly, and cannot complete
-- while an active booking remains on the closed date.

begin;
create extension if not exists pgtap with schema extensions;
select plan(26);
\ir fixtures/ensure_local_vault_secrets.psql

insert into auth.users (id) values
  ('17700000-0000-4000-8000-000000000001'), -- staff
  ('17700000-0000-4000-8000-000000000002'); -- customer

insert into public.staff_profiles (user_id, role, display_name) values
  ('17700000-0000-4000-8000-000000000001', 'owner', 'Closure Owner');

insert into public.humans (id, name, surname, customer_user_id) values
  (
    '17700000-0000-4000-8000-000000000010',
    'Closure', 'Customer',
    '17700000-0000-4000-8000-000000000002'
  );

insert into public.dogs (id, name, breed, size, human_id) values
  (
    '17700000-0000-4000-8000-000000000011',
    'Alpha Closure', 'Poodle', 'small',
    '17700000-0000-4000-8000-000000000010'
  ),
  (
    '17700000-0000-4000-8000-000000000012',
    'Bravo Closure', 'Spaniel', 'small',
    '17700000-0000-4000-8000-000000000010'
  ),
  (
    '17700000-0000-4000-8000-000000000013',
    'Charlie Closure', 'Terrier', 'small',
    '17700000-0000-4000-8000-000000000010'
  );

select set_config(
  'request.jwt.claims',
  '{"sub":"17700000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

create or replace function pg_temp.closure_date(p_offset integer)
returns date language sql as $$
  select current_date + p_offset;
$$;

-- Two dogs share one visit; Charlie is a second singleton visit.
select public.create_staff_booking_group(
  '[
    {"id":"17700000-0000-4000-8000-000000000101","dog_id":"17700000-0000-4000-8000-000000000011","slot":"09:00","size":"small","service":"Full Groom","status":"Booked","confirmed":true},
    {"id":"17700000-0000-4000-8000-000000000102","dog_id":"17700000-0000-4000-8000-000000000012","slot":"09:00","size":"small","service":"Full Groom","status":"Booked","confirmed":true}
  ]'::jsonb,
  pg_temp.closure_date(40)
);
select public.create_staff_booking_group(
  '[
    {"id":"17700000-0000-4000-8000-000000000103","dog_id":"17700000-0000-4000-8000-000000000013","slot":"10:00","size":"small","service":"Full Groom","status":"Booked","confirmed":true}
  ]'::jsonb,
  pg_temp.closure_date(40)
);
-- A separate visit gives the closed-day guard a real foreign-key target when
-- proving that staff cannot rewrite an affected row away from its linked task.
select public.create_staff_booking_group(
  '[
    {"id":"17700000-0000-4000-8000-000000000104","dog_id":"17700000-0000-4000-8000-000000000013","slot":"11:00","size":"small","service":"Full Groom","status":"Booked","confirmed":true}
  ]'::jsonb,
  pg_temp.closure_date(41)
);

insert into public.day_settings (setting_date, is_open)
values (pg_temp.closure_date(40), true);

set local role authenticated;
select is(
  public.close_day_with_rearrangement_tasks(pg_temp.closure_date(40))->>'status',
  'closed',
  'staff can close the day through the atomic command'
);

set local role postgres;
select is(
  (select is_open from public.day_settings
    where setting_date = pg_temp.closure_date(40)),
  false,
  'the authoritative day is closed'
);

select is(
  (select count(*)::integer
     from public.salon_todos
    where kind = 'closure_rearrangement'
      and closure_date = pg_temp.closure_date(40)),
  2,
  'one task is created per affected visit, not per dog'
);

select ok(
  (select bool_and(
            booking_visit_id is not null
            and closure_date = pg_temp.closure_date(40)
            and not done
          )
     from public.salon_todos
    where kind = 'closure_rearrangement'
      and closure_date = pg_temp.closure_date(40)),
  'every closure task has a real visit/date link and starts open'
);

select ok(
  (select bool_and(
            position('Alpha Closure' in text) > 0
            or position('Charlie Closure' in text) > 0
          )
     from public.salon_todos
    where kind = 'closure_rearrangement'
      and closure_date = pg_temp.closure_date(40)),
  'task copy is derived from the linked visit rather than submitted free text'
);

set local role authenticated;
select is(
  public.close_day_with_rearrangement_tasks(pg_temp.closure_date(40))->>'status',
  'closed',
  'an exact retry is successful'
);

set local role postgres;
select is(
  (select count(*)::integer
     from public.salon_todos
    where kind = 'closure_rearrangement'
      and closure_date = pg_temp.closure_date(40)),
  2,
  'an exact retry creates no duplicate tasks'
);

set local role authenticated;
select throws_ok(
  format(
    $$ update public.salon_todos set done = true where id = %L::uuid $$,
    (
      select id
        from public.salon_todos
       where kind = 'closure_rearrangement'
         and closure_date = pg_temp.closure_date(40)
       order by text
       limit 1
    )
  ),
  'SCL02', null,
  'a closure task cannot be checked off through the generic update path'
);

select throws_ok(
  format(
    $$ delete from public.salon_todos where id = %L::uuid $$,
    (
      select id
        from public.salon_todos
       where kind = 'closure_rearrangement'
         and closure_date = pg_temp.closure_date(40)
       order by text
       limit 1
    )
  ),
  'SCL02', null,
  'a closure task cannot be deleted through the generic path'
);

select throws_ok(
  format(
    $$ select public.complete_closure_rearrangement_task(%L::uuid) $$,
    (
      select id
        from public.salon_todos
       where kind = 'closure_rearrangement'
         and closure_date = pg_temp.closure_date(40)
         and text like '%Alpha Closure%'
       limit 1
    )
  ),
  'SCL01', null,
  'completion is refused while the visit is still booked on the closed day'
);

select throws_ok(
  format(
    $$ update public.bookings
          set visit_id = %L::uuid
        where id = '17700000-0000-4000-8000-000000000101' $$,
    (
      select visit_id
        from public.bookings
       where id = '17700000-0000-4000-8000-000000000104'
    )
  ),
  'SCL03', null,
  'staff cannot rewrite a closed-day booking away from its linked closure task'
);

select throws_ok(
  format(
    $$ update public.day_settings
          set setting_date = %L::date
        where setting_date = %L::date $$,
    pg_temp.closure_date(41),
    pg_temp.closure_date(40)
  ),
  'SCL03', null,
  'staff cannot move a closed setting onto active visits without linked tasks'
);

set local role postgres;
select ok(
  not (select done
         from public.salon_todos
        where kind = 'closure_rearrangement'
          and closure_date = pg_temp.closure_date(40)
          and text like '%Alpha Closure%'),
  'a refused completion leaves the task open'
);

-- Moving both rows re-homes them away from the linked source visit.
update public.bookings
   set booking_date = pg_temp.closure_date(47)
 where id in (
   '17700000-0000-4000-8000-000000000101',
   '17700000-0000-4000-8000-000000000102'
 );

set local role authenticated;
select is(
  public.complete_closure_rearrangement_task(
    (
      select id
        from public.salon_todos
       where kind = 'closure_rearrangement'
         and closure_date = pg_temp.closure_date(40)
         and text like '%Alpha Closure%'
       limit 1
    )
  )->>'status',
  'completed',
  'the task completes after every linked booking leaves the closed date'
);

select is(
  public.complete_closure_rearrangement_task(
    (
      select id
        from public.salon_todos
       where kind = 'closure_rearrangement'
         and closure_date = pg_temp.closure_date(40)
         and text like '%Alpha Closure%'
       limit 1
    )
  )->>'replayed',
  'true',
  'completion is idempotent'
);

set local role postgres;
update public.day_settings
   set is_open = true
 where setting_date = pg_temp.closure_date(40);

set local role authenticated;
select is(
  public.complete_closure_rearrangement_task(
    (
      select id
        from public.salon_todos
       where kind = 'closure_rearrangement'
         and closure_date = pg_temp.closure_date(40)
         and text like '%Charlie Closure%'
       limit 1
    )
  )->>'status',
  'completed',
  'reopening the day also allows its remaining task to complete'
);

-- A plain settings write cannot close a newly booked date without linked work.
set local role postgres;
select public.create_staff_booking_group(
  '[
    {"id":"17700000-0000-4000-8000-000000000111","dog_id":"17700000-0000-4000-8000-000000000013","slot":"11:00","size":"small","service":"Full Groom","status":"Booked","confirmed":true}
  ]'::jsonb,
  pg_temp.closure_date(54)
);
insert into public.day_settings (setting_date, is_open)
values (pg_temp.closure_date(54), true);

set local role authenticated;
select throws_ok(
  format(
    $$ update public.day_settings
          set is_open = false
        where setting_date = %L::date $$,
    pg_temp.closure_date(54)
  ),
  'SCL03', null,
  'a direct settings write cannot separate a closure from its linked tasks'
);

set local role postgres;
select is(
  (select is_open from public.day_settings
    where setting_date = pg_temp.closure_date(54)),
  true,
  'the rejected direct write leaves the date open'
);

-- New active bookings cannot be introduced onto an already-closed date.
insert into public.day_settings (setting_date, is_open)
values (pg_temp.closure_date(61), false);

set local role authenticated;
select throws_ok(
  format(
    $$ insert into public.bookings (
         id, booking_date, slot, dog_id, size, service, status
       ) values (
         '17700000-0000-4000-8000-000000000121',
         %L::date,
         '09:00',
         '17700000-0000-4000-8000-000000000011',
         'small',
         'Full Groom',
         'Booked'
       ) $$,
    pg_temp.closure_date(61)
  ),
  'SCL03', null,
  'an active booking cannot be introduced onto a closed day without a task'
);

set local role postgres;
select is(
  (select count(*)::integer
     from public.bookings
    where id = '17700000-0000-4000-8000-000000000121'),
  0,
  'the rejected closed-day booking leaves no partial booking row'
);

-- Simulate one legacy damaged row with no visit link. The command must abort
-- before either the date or any task is persisted.
select public.create_staff_booking_group(
  '[
    {"id":"17700000-0000-4000-8000-000000000131","dog_id":"17700000-0000-4000-8000-000000000011","slot":"12:00","size":"small","service":"Full Groom","status":"Booked","confirmed":true}
  ]'::jsonb,
  pg_temp.closure_date(68)
);
insert into public.day_settings (setting_date, is_open)
values (pg_temp.closure_date(68), true);
set session_replication_role = replica;
update public.bookings
   set visit_id = null
 where id = '17700000-0000-4000-8000-000000000131';
set session_replication_role = origin;

set local role authenticated;
select throws_ok(
  format(
    $$ select public.close_day_with_rearrangement_tasks(%L::date) $$,
    pg_temp.closure_date(68)
  ),
  'SCL04', null,
  'a damaged booking link aborts the whole closure command'
);

set local role postgres;
select ok(
  (select is_open from public.day_settings
    where setting_date = pg_temp.closure_date(68))
  and not exists (
    select 1
      from public.salon_todos
     where kind = 'closure_rearrangement'
       and closure_date = pg_temp.closure_date(68)
  ),
  'a failed closure persists neither the closure nor partial tasks'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"17700000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
set local role authenticated;
select throws_ok(
  format(
    $$ select public.close_day_with_rearrangement_tasks(%L::date) $$,
    pg_temp.closure_date(75)
  ),
  '42501', null,
  'a customer cannot close a salon day'
);

set local role postgres;
select ok(
  has_function_privilege(
    'authenticated',
    'public.close_day_with_rearrangement_tasks(date)',
    'execute'
  )
  and has_function_privilege(
    'authenticated',
    'public.complete_closure_rearrangement_task(uuid)',
    'execute'
  ),
  'authenticated staff can reach both internally staff-gated commands'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.close_day_with_rearrangement_tasks(date)',
    'execute'
  )
  and not has_function_privilege(
    'anon',
    'public.complete_closure_rearrangement_task(uuid)',
    'execute'
  ),
  'anonymous callers cannot execute either closure command'
);

select throws_ok(
  $$ insert into public.salon_todos (
       text, kind, booking_visit_id, closure_date
     ) values (
       'Malformed closure task',
       'closure_rearrangement',
       null,
       null
     ) $$,
  '23514', null,
  'a closure task cannot exist without both durable links'
);

select * from finish();
rollback;

-- Dog size check: a customer's request racing a staff size edit.
--
-- raise_dog_size_check_todo locks the dog row before deciding. Without that
-- lock, a request that read the dog while staff were confirming its size could
-- insert a fresh open to-do just after the staff write had closed the old one,
-- leaving a task for a dog that no longer needs it. Two genuine PostgreSQL
-- backends prove the request waits for the staff write and then sees the size.
-- Fixtures are synthetic, committed only because a dblink backend cannot see
-- the pgTAP controller's transaction, and removed before the test finishes.

\if :{?hosted_dblink_password}
set pgtap.hosted_dblink_password = :'hosted_dblink_password';
\else
set pgtap.hosted_dblink_password = 'postgres';
\endif

begin;
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
select plan(16);

create temp table _dblink_config (connstr text not null);
insert into _dblink_config
values (
  format(
    'hostaddr=%L port=%L dbname=%L user=%L password=%L',
    host(inet_server_addr())::text,
    current_setting('port'),
    current_database(),
    session_user,
    current_setting('pgtap.hosted_dblink_password')
  )
);

select extensions.dblink_connect('setup', (select connstr from _dblink_config));

-- Pre-clean so an interrupted earlier run is harmless, then commit fixtures.
select extensions.dblink_exec('setup', $setup$
  begin;
  set local role postgres;
  set local session_replication_role = replica;

  delete from public.salon_todos where dog_id in (
    '24000000-0000-4000-8000-000000000101',
    '24000000-0000-4000-8000-000000000102',
    '24000000-0000-4000-8000-000000000103',
    '24000000-0000-4000-8000-000000000104'
  );
  delete from public.dogs where id in (
    '24000000-0000-4000-8000-000000000101',
    '24000000-0000-4000-8000-000000000102',
    '24000000-0000-4000-8000-000000000103',
    '24000000-0000-4000-8000-000000000104'
  );
  delete from public.humans where id in (
    '24000000-0000-4000-8000-000000000010',
    '24000000-0000-4000-8000-000000000020'
  );
  delete from public.staff_profiles where id = '24000000-0000-4000-8000-000000000040';
  delete from auth.users where id in (
    '24000000-0000-4000-8000-000000000011',
    '24000000-0000-4000-8000-000000000041'
  );

  insert into auth.users (id) values
    ('24000000-0000-4000-8000-000000000011'),
    ('24000000-0000-4000-8000-000000000041');
  insert into public.humans (
    id, name, surname, address, customer_user_id, source, approved_at,
    policies_accepted_at, policies_version
  ) values (
    '24000000-0000-4000-8000-000000000010', 'Race', 'Owner', '1 Race Street',
    '24000000-0000-4000-8000-000000000011', 'existing', now(), now(), '2026-10-test'
  ), (
    '24000000-0000-4000-8000-000000000020', 'Other', 'Racer', '2 Race Street',
    null, 'existing', now(), now(), '2026-10-test'
  );
  insert into public.staff_profiles (id, user_id, role, display_name)
  values ('24000000-0000-4000-8000-000000000040', '24000000-0000-4000-8000-000000000041', 'staff', 'Race Staff');
  insert into public.dogs (id, name, breed, size, human_id) values
    ('24000000-0000-4000-8000-000000000101', 'Racer', 'Mystery Mix', null,
     '24000000-0000-4000-8000-000000000010'),
    ('24000000-0000-4000-8000-000000000102', 'Second', 'Mystery Mix', null,
     '24000000-0000-4000-8000-000000000010'),
    ('24000000-0000-4000-8000-000000000103', 'Mover', 'Mystery Mix', null,
     '24000000-0000-4000-8000-000000000010'),
    ('24000000-0000-4000-8000-000000000104', 'Reopened', 'Mystery Mix', null,
     '24000000-0000-4000-8000-000000000010');
  -- A size check staff already ticked off, though the dog is still unsized.
  insert into public.salon_todos (text, done, kind, human_id, dog_id, sort_order)
  values ('Confirm size: Reopened', true, 'general',
          '24000000-0000-4000-8000-000000000010',
          '24000000-0000-4000-8000-000000000104', 0);
  commit;
$setup$);

select extensions.dblink_connect('staff', (select connstr from _dblink_config));
select extensions.dblink_connect('customer', (select connstr from _dblink_config));

select extensions.dblink_exec('staff', 'begin isolation level read committed');
select extensions.dblink_exec('staff', 'set local statement_timeout = ''10s''');
select extensions.dblink_exec('staff',
  'set local "request.jwt.claims" = ''{"sub":"24000000-0000-4000-8000-000000000041","role":"authenticated"}''');
select extensions.dblink_exec('staff', 'set local role authenticated');

select extensions.dblink_exec('customer', 'begin isolation level read committed');
select extensions.dblink_exec('customer', 'set local statement_timeout = ''10s''');
select extensions.dblink_exec('customer', 'set local lock_timeout = ''8s''');
select extensions.dblink_exec('customer',
  'set local "request.jwt.claims" = ''{"sub":"24000000-0000-4000-8000-000000000011","role":"authenticated"}''');
select extensions.dblink_exec('customer', 'set local role authenticated');

create temp table _pids (staff_pid int, customer_pid int, customer_blocked boolean default false);
insert into _pids (staff_pid, customer_pid)
select s.pid, c.pid
from extensions.dblink('staff', 'select pg_backend_pid()') as s(pid int),
     extensions.dblink('customer', 'select pg_backend_pid()') as c(pid int);

-- Staff confirm the size but have not committed yet: the dog row is locked.
select extensions.dblink_exec('staff',
  'update public.dogs set size = ''small'' where id = ''24000000-0000-4000-8000-000000000101''');

select is(
  extensions.dblink_send_query('customer',
    'select public.request_dog_size_check(''24000000-0000-4000-8000-000000000101'')::text'),
  1,
  'the customer''s size-check request is dispatched on an independent backend'
);

do $poll$
declare
  v_deadline timestamptz := clock_timestamp() + interval '5 seconds';
begin
  loop
    -- pg_stat_activity is cached per transaction; this controller is one
    -- long transaction, so refresh it on every poll.
    perform pg_stat_clear_snapshot();
    update _pids p
       set customer_blocked = exists (
         select 1 from pg_stat_activity a
          where a.pid = p.customer_pid
            and a.wait_event_type = 'Lock'
            and p.staff_pid = any(pg_blocking_pids(a.pid)));
    exit when (select customer_blocked from _pids);
    exit when clock_timestamp() >= v_deadline;
    perform pg_sleep(0.01);
  end loop;
end;
$poll$;

select ok(
  (select customer_blocked from _pids),
  'the request waits behind the staff size edit instead of reading the old row'
);

select extensions.dblink_exec('staff', 'commit');

do $customer_wait$
declare
  v_deadline timestamptz := clock_timestamp() + interval '5 seconds';
begin
  loop
    exit when extensions.dblink_is_busy('customer') = 0;
    if clock_timestamp() >= v_deadline then
      perform extensions.dblink_cancel_query('customer');
      raise exception 'the size-check request did not finish after the staff edit committed';
    end if;
    perform pg_sleep(0.01);
  end loop;
end;
$customer_wait$;

create temp table _result (recorded text);
insert into _result
select recorded from extensions.dblink_get_result('customer') as r(recorded text);

select is(
  (select recorded from _result),
  'false',
  'once the size is committed, the request sees it and records nothing'
);

-- dblink async mode needs one final empty read before the connection is reusable.
do $drain$
begin
  perform recorded from extensions.dblink_get_result('customer') as r(recorded text);
end;
$drain$;
select extensions.dblink_exec('customer', 'commit');

select is(
  (select n from extensions.dblink('setup',
     'select count(*)::int from public.salon_todos
       where dog_id = ''24000000-0000-4000-8000-000000000101'' and done = false') as t(n int)),
  0,
  'no open to-do is left behind for a dog that now has a size'
);

select is(
  (select size from extensions.dblink('setup',
     'select size from public.dogs where id = ''24000000-0000-4000-8000-000000000101''') as d(size text)),
  'small',
  'the staff size stands'
);

-- ── Lock order: owner row, then dog, the way merge_humans does it ─
-- Staff hold the owner row (merge_humans' first step) while the customer asks
-- about a second dog, then staff update that dog (merge's next step). If the
-- request locked the dog first and then needed the owner row for the to-do's
-- foreign key, each would wait on the other and PostgreSQL would abort one.
select extensions.dblink_connect('merger', (select connstr from _dblink_config));
select extensions.dblink_connect('asker', (select connstr from _dblink_config));
select extensions.dblink_exec('merger', 'begin isolation level read committed');
select extensions.dblink_exec('merger', 'set local statement_timeout = ''10s''');
select extensions.dblink_exec('merger',
  'do $lock$ begin perform 1 from public.humans where id = ''24000000-0000-4000-8000-000000000010'' for update; end $lock$');

select extensions.dblink_exec('asker', 'begin isolation level read committed');
select extensions.dblink_exec('asker', 'set local statement_timeout = ''10s''');
select extensions.dblink_exec('asker',
  'set local "request.jwt.claims" = ''{"sub":"24000000-0000-4000-8000-000000000011","role":"authenticated"}''');
select extensions.dblink_exec('asker', 'set local role authenticated');

create temp table _pids2 (merger_pid int, asker_pid int, asker_blocked boolean default false);
insert into _pids2 (merger_pid, asker_pid)
select m.pid, a.pid
from extensions.dblink('merger', 'select pg_backend_pid()') as m(pid int),
     extensions.dblink('asker', 'select pg_backend_pid()') as a(pid int);

select is(
  extensions.dblink_send_query('asker',
    'select public.request_dog_size_check(''24000000-0000-4000-8000-000000000102'')::text'),
  1,
  'a size check is sent while staff hold the owner row'
);

do $poll2$
declare
  v_deadline timestamptz := clock_timestamp() + interval '5 seconds';
begin
  loop
    -- pg_stat_activity is cached per transaction; this controller is one
    -- long transaction, so refresh it on every poll.
    perform pg_stat_clear_snapshot();
    update _pids2 p
       set asker_blocked = exists (
         select 1 from pg_stat_activity a
          where a.pid = p.asker_pid
            and a.wait_event_type = 'Lock'
            and p.merger_pid = any(pg_blocking_pids(a.pid)));
    exit when (select asker_blocked from _pids2);
    exit when clock_timestamp() >= v_deadline;
    perform pg_sleep(0.01);
  end loop;
end;
$poll2$;

select ok(
  (select asker_blocked from _pids2),
  'the request queues behind the owner row before it touches the dog'
);

select lives_ok(
  $$ select extensions.dblink_exec('merger',
       'update public.dogs set name = ''Second Two'' where id = ''24000000-0000-4000-8000-000000000102''') $$,
  'staff can still lock and update the dog: no deadlock'
);

select extensions.dblink_exec('merger', 'commit');

do $asker_wait$
declare
  v_deadline timestamptz := clock_timestamp() + interval '5 seconds';
begin
  loop
    exit when extensions.dblink_is_busy('asker') = 0;
    if clock_timestamp() >= v_deadline then
      perform extensions.dblink_cancel_query('asker');
      raise exception 'the size-check request did not finish after the owner lock was released';
    end if;
    perform pg_sleep(0.01);
  end loop;
end;
$asker_wait$;

create temp table _result2 (recorded text);
insert into _result2
select recorded from extensions.dblink_get_result('asker') as r(recorded text);
do $drain2$
begin
  perform recorded from extensions.dblink_get_result('asker') as r(recorded text);
end;
$drain2$;
select extensions.dblink_exec('asker', 'commit');

select ok(
  (select recorded from _result2) = 'true'
  and (select n from extensions.dblink('setup',
         'select count(*)::int from public.salon_todos
           where dog_id = ''24000000-0000-4000-8000-000000000102'' and done = false
             and text like ''Confirm size: Second Two %''') as t(n int)) = 1,
  'the request then records one to-do, naming the dog as staff left it'
);

-- ── Ownership re-checked under the dog lock ─────────────────
-- Staff move a dog to another owner but have not committed. The customer's
-- request passes its own ownership check on the committed row, then waits for
-- the dog. Once the move commits, the writer must see the dog is no longer
-- theirs and record nothing, rather than open a task on someone else's dog.
select extensions.dblink_exec('merger', 'begin isolation level read committed');
select extensions.dblink_exec('merger', 'set local statement_timeout = ''10s''');
select extensions.dblink_exec('merger',
  'update public.dogs set human_id = ''24000000-0000-4000-8000-000000000020''
    where id = ''24000000-0000-4000-8000-000000000103''');

select extensions.dblink_exec('asker', 'begin isolation level read committed');
select extensions.dblink_exec('asker', 'set local statement_timeout = ''10s''');
select extensions.dblink_exec('asker',
  'set local "request.jwt.claims" = ''{"sub":"24000000-0000-4000-8000-000000000011","role":"authenticated"}''');
select extensions.dblink_exec('asker', 'set local role authenticated');

update _pids2 set asker_blocked = false;
select is(
  extensions.dblink_send_query('asker',
    'select public.request_dog_size_check(''24000000-0000-4000-8000-000000000103'')::text'),
  1,
  'a size check is sent while staff are moving the dog to another owner'
);

do $poll3$
declare
  v_deadline timestamptz := clock_timestamp() + interval '5 seconds';
begin
  loop
    -- pg_stat_activity is cached per transaction; this controller is one
    -- long transaction, so refresh it on every poll.
    perform pg_stat_clear_snapshot();
    update _pids2 p
       set asker_blocked = exists (
         select 1 from pg_stat_activity a
          where a.pid = p.asker_pid
            and a.wait_event_type = 'Lock'
            and p.merger_pid = any(pg_blocking_pids(a.pid)));
    exit when (select asker_blocked from _pids2);
    exit when clock_timestamp() >= v_deadline;
    perform pg_sleep(0.01);
  end loop;
end;
$poll3$;

select extensions.dblink_exec('merger', 'commit');

do $asker_wait3$
declare
  v_deadline timestamptz := clock_timestamp() + interval '5 seconds';
begin
  loop
    exit when extensions.dblink_is_busy('asker') = 0;
    if clock_timestamp() >= v_deadline then
      perform extensions.dblink_cancel_query('asker');
      raise exception 'the size-check request did not finish after the move committed';
    end if;
    perform pg_sleep(0.01);
  end loop;
end;
$asker_wait3$;

create temp table _result3 (recorded text);
insert into _result3
select recorded from extensions.dblink_get_result('asker') as r(recorded text);
do $drain3$
begin
  perform recorded from extensions.dblink_get_result('asker') as r(recorded text);
end;
$drain3$;
select extensions.dblink_exec('asker', 'commit');

select ok(
  (select asker_blocked from _pids2),
  'the request waited on the dog being moved'
);

select is(
  (select recorded from _result3),
  'false',
  'once the move commits, the request sees the dog is no longer theirs'
);

select is(
  (select n from extensions.dblink('setup',
     'select count(*)::int from public.salon_todos
       where dog_id = ''24000000-0000-4000-8000-000000000103''') as t(n int)),
  0,
  'and no to-do was opened on the other owner''s dog'
);

-- ── Reopening a size check while staff set the size ─────────
-- Staff hold an uncommitted size edit; another staff member reopens the dog's
-- ticked-off size check. The reopen must wait for the size, then stay done:
-- the size edit's own trigger ran before the reopen existed, so nothing else
-- would ever close it again.
select extensions.dblink_exec('merger', 'begin isolation level read committed');
select extensions.dblink_exec('merger', 'set local statement_timeout = ''10s''');
select extensions.dblink_exec('merger',
  'update public.dogs set size = ''small'' where id = ''24000000-0000-4000-8000-000000000104''');

select extensions.dblink_exec('asker', 'begin isolation level read committed');
select extensions.dblink_exec('asker', 'set local statement_timeout = ''10s''');
select extensions.dblink_exec('asker', 'set local role postgres');

update _pids2 set asker_blocked = false;
select is(
  extensions.dblink_send_query('asker',
    'update public.salon_todos set done = false
      where dog_id = ''24000000-0000-4000-8000-000000000104'''),
  1,
  'a reopen is sent while the dog''s size is being set'
);

do $poll4$
declare
  v_deadline timestamptz := clock_timestamp() + interval '5 seconds';
begin
  loop
    perform pg_stat_clear_snapshot();
    update _pids2 p
       set asker_blocked = exists (
         select 1 from pg_stat_activity a
          where a.pid = p.asker_pid
            and a.wait_event_type = 'Lock'
            and p.merger_pid = any(pg_blocking_pids(a.pid)));
    exit when (select asker_blocked from _pids2);
    exit when clock_timestamp() >= v_deadline;
    perform pg_sleep(0.01);
  end loop;
end;
$poll4$;

select ok(
  (select asker_blocked from _pids2),
  'the reopen waits for the size edit instead of reading the old row'
);

select extensions.dblink_exec('merger', 'commit');

do $asker_wait4$
declare
  v_deadline timestamptz := clock_timestamp() + interval '5 seconds';
begin
  loop
    exit when extensions.dblink_is_busy('asker') = 0;
    if clock_timestamp() >= v_deadline then
      perform extensions.dblink_cancel_query('asker');
      raise exception 'the reopen did not finish after the size edit committed';
    end if;
    perform pg_sleep(0.01);
  end loop;
end;
$asker_wait4$;

do $drain4$
begin
  perform status from extensions.dblink_get_result('asker') as r(status text);
  perform status from extensions.dblink_get_result('asker') as r(status text);
end;
$drain4$;
select extensions.dblink_exec('asker', 'commit');

select is(
  (select n from extensions.dblink('setup',
     'select count(*)::int from public.salon_todos
       where dog_id = ''24000000-0000-4000-8000-000000000104'' and done = false') as t(n int)),
  0,
  'the size check stays ticked off once the size is committed'
);

select extensions.dblink_exec('setup', $cleanup$
  begin;
  set local role postgres;
  set local session_replication_role = replica;
  delete from public.salon_todos where dog_id in (
    '24000000-0000-4000-8000-000000000101',
    '24000000-0000-4000-8000-000000000102',
    '24000000-0000-4000-8000-000000000103',
    '24000000-0000-4000-8000-000000000104'
  );
  delete from public.dogs where id in (
    '24000000-0000-4000-8000-000000000101',
    '24000000-0000-4000-8000-000000000102',
    '24000000-0000-4000-8000-000000000103',
    '24000000-0000-4000-8000-000000000104'
  );
  delete from public.humans where id in (
    '24000000-0000-4000-8000-000000000010',
    '24000000-0000-4000-8000-000000000020'
  );
  delete from public.staff_profiles where id = '24000000-0000-4000-8000-000000000040';
  delete from auth.users where id in (
    '24000000-0000-4000-8000-000000000011',
    '24000000-0000-4000-8000-000000000041'
  );
  commit;
$cleanup$);

do $disconnect$
begin
  perform extensions.dblink_disconnect('asker');
  perform extensions.dblink_disconnect('merger');
  perform extensions.dblink_disconnect('customer');
  perform extensions.dblink_disconnect('staff');
  perform extensions.dblink_disconnect('setup');
end;
$disconnect$;

select * from finish();
rollback;

-- Dog size check: refreshing a to-do's wording never undoes a staff completion.
--
-- Renaming a dog, renaming its owner, or a staff edit to an unsized dog
-- refreshes the open "Confirm size" to-do's text. Before migration
-- 20261010210000 that refresh went through the insert-capable writer: if staff
-- ticked the to-do off at the same moment, the refresh waited for the tick,
-- found no open row, and inserted a new one. Two genuine PostgreSQL backends
-- prove each refresh path now waits for the tick and then leaves it done.
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
select plan(13);

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

-- True once p_waiter is waiting on a lock held by p_blocker (up to 5 seconds).
create function pg_temp.blocked_behind(p_waiter int, p_blocker int)
returns boolean
language plpgsql
as $$
declare
  v_deadline timestamptz := clock_timestamp() + interval '5 seconds';
begin
  loop
    -- pg_stat_activity is cached per transaction; this controller is one
    -- long transaction, so refresh it on every poll.
    perform pg_stat_clear_snapshot();
    if exists (
      select 1 from pg_stat_activity a
       where a.pid = p_waiter
         and a.wait_event_type = 'Lock'
         and p_blocker = any(pg_blocking_pids(a.pid))
    ) then
      return true;
    end if;
    if clock_timestamp() >= v_deadline then
      return false;
    end if;
    perform pg_sleep(0.01);
  end loop;
end;
$$;

-- Waits for an async statement on p_conn to finish, then drains its result
-- and the final empty read dblink async mode needs before reuse.
create function pg_temp.finish_async(p_conn text)
returns void
language plpgsql
as $$
declare
  v_deadline timestamptz := clock_timestamp() + interval '5 seconds';
begin
  loop
    exit when extensions.dblink_is_busy(p_conn) = 0;
    if clock_timestamp() >= v_deadline then
      perform extensions.dblink_cancel_query(p_conn);
      raise exception 'the statement on % did not finish after the tick committed', p_conn;
    end if;
    perform pg_sleep(0.01);
  end loop;
  perform status from extensions.dblink_get_result(p_conn) as r(status text);
  perform status from extensions.dblink_get_result(p_conn) as r(status text);
end;
$$;

select extensions.dblink_connect('setup', (select connstr from _dblink_config));

-- Pre-clean so an interrupted earlier run is harmless, then commit fixtures:
-- three unsized dogs, each with an open size check, two of them on one owner
-- and the third on an owner of its own (so renaming that owner touches only it).
select extensions.dblink_exec('setup', $setup$
  begin;
  set local role postgres;
  set local session_replication_role = replica;

  delete from public.salon_todos where dog_id in (
    '24100000-0000-4000-8000-000000000101',
    '24100000-0000-4000-8000-000000000102',
    '24100000-0000-4000-8000-000000000103'
  );
  delete from public.dogs where id in (
    '24100000-0000-4000-8000-000000000101',
    '24100000-0000-4000-8000-000000000102',
    '24100000-0000-4000-8000-000000000103'
  );
  delete from public.humans where id in (
    '24100000-0000-4000-8000-000000000010',
    '24100000-0000-4000-8000-000000000020'
  );

  insert into public.humans (
    id, name, surname, address, source, approved_at,
    policies_accepted_at, policies_version
  ) values (
    '24100000-0000-4000-8000-000000000010', 'Tick', 'Owner', '1 Tick Street',
    'existing', now(), now(), '2026-10-test'
  ), (
    '24100000-0000-4000-8000-000000000020', 'Solo', 'Owner', '2 Tick Street',
    'existing', now(), now(), '2026-10-test'
  );
  insert into public.dogs (id, name, breed, size, reported_size, human_id) values
    ('24100000-0000-4000-8000-000000000101', 'Renamed', 'Mystery Mix', null, 'medium',
     '24100000-0000-4000-8000-000000000010'),
    ('24100000-0000-4000-8000-000000000102', 'Bred', 'Mystery Mix', null, 'medium',
     '24100000-0000-4000-8000-000000000010'),
    ('24100000-0000-4000-8000-000000000103', 'Owned', 'Mystery Mix', null, 'medium',
     '24100000-0000-4000-8000-000000000020');
  insert into public.salon_todos (text, done, kind, human_id, dog_id, sort_order) values
    ('Confirm size: Renamed', false, 'general',
     '24100000-0000-4000-8000-000000000010', '24100000-0000-4000-8000-000000000101', 0),
    ('Confirm size: Bred', false, 'general',
     '24100000-0000-4000-8000-000000000010', '24100000-0000-4000-8000-000000000102', 0),
    ('Confirm size: Owned', false, 'general',
     '24100000-0000-4000-8000-000000000020', '24100000-0000-4000-8000-000000000103', 0);
  commit;
$setup$);

-- ── Non-concurrent contract ─────────────────────────────────

select has_index(
  'public', 'salon_todos', 'salon_todos_dog_id_idx', array['dog_id'],
  'salon_todos.dog_id has a full index behind its foreign key'
);

-- A dog with no size check at all: the refresher reports nothing and inserts
-- nothing. Done on the setup backend in a transaction it rolls back, so this
-- controller holds no lock that the backends below, or the cleanup, could
-- wait on.
select extensions.dblink_exec('setup', 'begin');
select extensions.dblink_exec('setup', $quiet$
  insert into public.dogs (id, name, breed, size, human_id)
  values ('24100000-0000-4000-8000-000000000104', 'Quiet', 'Mystery Mix', null,
          '24100000-0000-4000-8000-000000000010');
$quiet$);

select is(
  (select r from extensions.dblink('setup',
     'select public.refresh_dog_size_check_todo(''24100000-0000-4000-8000-000000000104'')::text') as t(r text)),
  'false',
  'refreshing a dog with no open size check reports nothing to refresh'
);

select is(
  (select n from extensions.dblink('setup',
     'select count(*)::int from public.salon_todos
       where dog_id = ''24100000-0000-4000-8000-000000000104''') as t(n int)),
  0,
  'and inserts no to-do'
);
select extensions.dblink_exec('setup', 'rollback');

-- ── Two backends: a ticker (staff completing the to-do) and an editor ─

select extensions.dblink_connect('ticker', (select connstr from _dblink_config));
select extensions.dblink_connect('editor', (select connstr from _dblink_config));

create temp table _pids (ticker_pid int, editor_pid int);
insert into _pids (ticker_pid, editor_pid)
select t.pid, e.pid
from extensions.dblink('ticker', 'select pg_backend_pid()') as t(pid int),
     extensions.dblink('editor', 'select pg_backend_pid()') as e(pid int);

-- ── 1. The dog is renamed while staff tick its size check off ─

select extensions.dblink_exec('ticker', 'begin isolation level read committed');
select extensions.dblink_exec('ticker', 'set local statement_timeout = ''10s''');
select extensions.dblink_exec('ticker',
  'update public.salon_todos set done = true
    where dog_id = ''24100000-0000-4000-8000-000000000101'' and done = false');

select extensions.dblink_exec('editor', 'begin isolation level read committed');
select extensions.dblink_exec('editor', 'set local statement_timeout = ''10s''');
select is(
  extensions.dblink_send_query('editor',
    'update public.dogs set name = ''Renamed Again''
      where id = ''24100000-0000-4000-8000-000000000101'''),
  1,
  'a dog rename is sent while staff tick its size check off'
);

select ok(
  pg_temp.blocked_behind((select editor_pid from _pids), (select ticker_pid from _pids)),
  'the rename''s refresh waits for the tick'
);

select extensions.dblink_exec('ticker', 'commit');
select pg_temp.finish_async('editor');
select extensions.dblink_exec('editor', 'commit');

select is(
  (select n from extensions.dblink('setup',
     'select count(*)::int from public.salon_todos
       where dog_id = ''24100000-0000-4000-8000-000000000101'' and done = false') as t(n int)),
  0,
  'the rename does not recreate the size check staff just ticked off'
);

select is(
  (select n from extensions.dblink('setup',
     'select count(*)::int from public.salon_todos
       where dog_id = ''24100000-0000-4000-8000-000000000101''') as t(n int)),
  1,
  'the dog still has exactly its one, completed, size check'
);

-- ── 2. Staff correct the breed while another ticks the check off ─
-- The editor runs with no signed-in user, the path staff edits and service
-- scripts take: refresh an open to-do, never raise one.

select extensions.dblink_exec('ticker', 'begin isolation level read committed');
select extensions.dblink_exec('ticker', 'set local statement_timeout = ''10s''');
select extensions.dblink_exec('ticker',
  'update public.salon_todos set done = true
    where dog_id = ''24100000-0000-4000-8000-000000000102'' and done = false');

select extensions.dblink_exec('editor', 'begin isolation level read committed');
select extensions.dblink_exec('editor', 'set local statement_timeout = ''10s''');
select is(
  extensions.dblink_send_query('editor',
    'update public.dogs set breed = ''Labradoodle''
      where id = ''24100000-0000-4000-8000-000000000102'''),
  1,
  'a staff breed edit is sent while the size check is ticked off'
);

select ok(
  pg_temp.blocked_behind((select editor_pid from _pids), (select ticker_pid from _pids)),
  'the breed edit''s refresh waits for the tick'
);

select extensions.dblink_exec('ticker', 'commit');
select pg_temp.finish_async('editor');
select extensions.dblink_exec('editor', 'commit');

select is(
  (select n from extensions.dblink('setup',
     'select count(*)::int from public.salon_todos
       where dog_id = ''24100000-0000-4000-8000-000000000102'' and done = false') as t(n int)),
  0,
  'the staff edit does not recreate the ticked-off size check'
);

-- ── 3. The owner is renamed while staff tick the check off ──

select extensions.dblink_exec('ticker', 'begin isolation level read committed');
select extensions.dblink_exec('ticker', 'set local statement_timeout = ''10s''');
select extensions.dblink_exec('ticker',
  'update public.salon_todos set done = true
    where dog_id = ''24100000-0000-4000-8000-000000000103'' and done = false');

select extensions.dblink_exec('editor', 'begin isolation level read committed');
select extensions.dblink_exec('editor', 'set local statement_timeout = ''10s''');
select is(
  extensions.dblink_send_query('editor',
    'update public.humans set surname = ''Renamed''
      where id = ''24100000-0000-4000-8000-000000000020'''),
  1,
  'an owner rename is sent while their dog''s size check is ticked off'
);

select ok(
  pg_temp.blocked_behind((select editor_pid from _pids), (select ticker_pid from _pids)),
  'the owner rename''s refresh waits for the tick'
);

select extensions.dblink_exec('ticker', 'commit');
select pg_temp.finish_async('editor');
select extensions.dblink_exec('editor', 'commit');

select is(
  (select n from extensions.dblink('setup',
     'select count(*)::int from public.salon_todos
       where dog_id = ''24100000-0000-4000-8000-000000000103'' and done = false') as t(n int)),
  0,
  'the owner rename does not recreate the ticked-off size check'
);

select extensions.dblink_exec('setup', $cleanup$
  begin;
  set local role postgres;
  set local session_replication_role = replica;
  delete from public.salon_todos where dog_id in (
    '24100000-0000-4000-8000-000000000101',
    '24100000-0000-4000-8000-000000000102',
    '24100000-0000-4000-8000-000000000103'
  );
  delete from public.dogs where id in (
    '24100000-0000-4000-8000-000000000101',
    '24100000-0000-4000-8000-000000000102',
    '24100000-0000-4000-8000-000000000103'
  );
  delete from public.humans where id in (
    '24100000-0000-4000-8000-000000000010',
    '24100000-0000-4000-8000-000000000020'
  );
  commit;
$cleanup$);

do $disconnect$
begin
  perform extensions.dblink_disconnect('editor');
  perform extensions.dblink_disconnect('ticker');
  perform extensions.dblink_disconnect('setup');
end;
$disconnect$;

select * from finish();
rollback;

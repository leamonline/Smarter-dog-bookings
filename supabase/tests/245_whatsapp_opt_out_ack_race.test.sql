-- Two STOP acknowledgements racing for one conversation
-- (migration 20261014120000, index whatsapp_drafts_one_pending_opt_out_ack).
--
-- Two STOP events for the same number can be processed at the same time, and
-- each tries to leave staff an acknowledgement draft. The unique index must
-- let exactly one stay pending. Two genuine PostgreSQL backends prove it:
-- the second insert waits for the first transaction, then is refused if the
-- first committed, or goes through if the first rolled back. Fixtures are
-- synthetic, committed only because a dblink backend cannot see the pgTAP
-- controller's transaction, and removed before the test finishes.

\if :{?hosted_dblink_password}
set pgtap.hosted_dblink_password = :'hosted_dblink_password';
\else
set pgtap.hosted_dblink_password = 'postgres';
\endif

begin;
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
select plan(8);

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
  delete from public.whatsapp_drafts where conversation_id in (
    '24500000-0000-4000-8000-000000000001',
    '24500000-0000-4000-8000-000000000002'
  );
  delete from public.whatsapp_conversations where id in (
    '24500000-0000-4000-8000-000000000001',
    '24500000-0000-4000-8000-000000000002'
  );
  insert into public.whatsapp_conversations (id, phone_e164) values
    ('24500000-0000-4000-8000-000000000001', '+447700900451'),
    ('24500000-0000-4000-8000-000000000002', '+447700900452');
  commit;
$setup$);

select extensions.dblink_connect('first', (select connstr from _dblink_config));
select extensions.dblink_connect('second', (select connstr from _dblink_config));

create temp table _pids (first_pid int, second_pid int, second_blocked boolean default false);
insert into _pids (first_pid, second_pid)
select f.pid, s.pid
from extensions.dblink('first', 'select pg_backend_pid()') as f(pid int),
     extensions.dblink('second', 'select pg_backend_pid()') as s(pid int);

create function pg_temp.ack_insert(p_conversation uuid) returns text
language sql as $$
  select format(
    'insert into public.whatsapp_drafts (conversation_id, proposed_text, intent, confidence, state, tool_calls) '
    'values (%L, %L, ''escalate'', 1, ''pending'', ''{"opt_out_acknowledgement": true}'')',
    p_conversation, 'acknowledgement'
  )
$$;

create function pg_temp.wait_until_second_blocked() returns boolean
language plpgsql as $$
declare
  v_deadline timestamptz := clock_timestamp() + interval '5 seconds';
begin
  update _pids set second_blocked = false;
  loop
    -- pg_stat_activity is cached per transaction; refresh it on every poll.
    perform pg_stat_clear_snapshot();
    update _pids p
       set second_blocked = exists (
         select 1 from pg_stat_activity a
          where a.pid = p.second_pid
            and a.wait_event_type = 'Lock'
            and p.first_pid = any(pg_blocking_pids(a.pid)));
    exit when (select second_blocked from _pids);
    exit when clock_timestamp() >= v_deadline;
    perform pg_sleep(0.01);
  end loop;
  return (select second_blocked from _pids);
end;
$$;

create function pg_temp.wait_for_second() returns void
language plpgsql as $$
declare
  v_deadline timestamptz := clock_timestamp() + interval '5 seconds';
begin
  loop
    exit when extensions.dblink_is_busy('second') = 0;
    if clock_timestamp() >= v_deadline then
      perform extensions.dblink_cancel_query('second');
      raise exception 'the second acknowledgement insert did not finish';
    end if;
    perform pg_sleep(0.01);
  end loop;
end;
$$;

-- ── Race 1: the first acknowledgement commits ───────────────────────
select extensions.dblink_exec('first', 'begin isolation level read committed');
select extensions.dblink_exec('first', pg_temp.ack_insert('24500000-0000-4000-8000-000000000001'));

select extensions.dblink_exec('second', 'begin isolation level read committed');
select extensions.dblink_exec('second', 'set local lock_timeout = ''8s''');
select is(
  extensions.dblink_send_query('second', pg_temp.ack_insert('24500000-0000-4000-8000-000000000001')),
  1,
  'a second acknowledgement for the same conversation is dispatched on an independent backend'
);
select ok(pg_temp.wait_until_second_blocked(),
  'the second insert waits for the first, uncommitted acknowledgement');

select extensions.dblink_exec('first', 'commit');
select pg_temp.wait_for_second();

create temp table _second_result (status text);
insert into _second_result
select status from extensions.dblink_get_result('second', false) as r(status text);
select matches(
  extensions.dblink_error_message('second'),
  'whatsapp_drafts_one_pending_opt_out_ack',
  'once the first commits, the second is refused by the one-pending index'
);
do $drain$ begin perform status from extensions.dblink_get_result('second', false) as r(status text); end; $drain$;
-- Commit, not roll back: a refused insert has already aborted the
-- transaction, but an insert the index failed to refuse would persist and
-- the count below would catch it.
select extensions.dblink_exec('second', 'commit');

select is(
  (select n from extensions.dblink('setup',
     'select count(*)::int from public.whatsapp_drafts
       where conversation_id = ''24500000-0000-4000-8000-000000000001'' and state = ''pending''') as t(n int)),
  1,
  'exactly one acknowledgement is left pending'
);

-- ── Race 2: the first acknowledgement rolls back ────────────────────
select extensions.dblink_exec('first', 'begin isolation level read committed');
select extensions.dblink_exec('first', pg_temp.ack_insert('24500000-0000-4000-8000-000000000002'));

select extensions.dblink_exec('second', 'begin isolation level read committed');
select extensions.dblink_exec('second', 'set local lock_timeout = ''8s''');
select is(
  extensions.dblink_send_query('second', pg_temp.ack_insert('24500000-0000-4000-8000-000000000002')),
  1,
  'the second acknowledgement is dispatched again'
);
select ok(pg_temp.wait_until_second_blocked(),
  'it waits for the first, uncommitted acknowledgement');

select extensions.dblink_exec('first', 'rollback');
select pg_temp.wait_for_second();
truncate _second_result;
insert into _second_result
select status from extensions.dblink_get_result('second', false) as r(status text);
select is(
  (select status from _second_result),
  'INSERT 0 1',
  'when the first rolls back, the second goes through'
);
do $drain2$ begin perform status from extensions.dblink_get_result('second', false) as r(status text); end; $drain2$;
select extensions.dblink_exec('second', 'commit');

select is(
  (select n from extensions.dblink('setup',
     'select count(*)::int from public.whatsapp_drafts
       where conversation_id = ''24500000-0000-4000-8000-000000000002'' and state = ''pending''') as t(n int)),
  1,
  'and exactly one acknowledgement is pending'
);

-- ── Clean up the committed fixtures ─────────────────────────────────
select extensions.dblink_exec('setup', $cleanup$
  begin;
  set local role postgres;
  delete from public.whatsapp_drafts where conversation_id in (
    '24500000-0000-4000-8000-000000000001',
    '24500000-0000-4000-8000-000000000002'
  );
  delete from public.whatsapp_conversations where id in (
    '24500000-0000-4000-8000-000000000001',
    '24500000-0000-4000-8000-000000000002'
  );
  commit;
$cleanup$);

do $disconnect$
begin
  perform extensions.dblink_disconnect('first');
  perform extensions.dblink_disconnect('second');
  perform extensions.dblink_disconnect('setup');
end;
$disconnect$;

select * from finish();
rollback;

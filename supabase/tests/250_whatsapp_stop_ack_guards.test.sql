-- The two STOP acknowledgement races left open by #1026's review
-- (migration 20261017120000: trg_whatsapp_drafts_guard_stop_ack and the
-- whatsapp_drafts_one_opt_out_ack_per_stop index).
--
-- R1. The agent decides to queue an acknowledgement from a conversation
--     snapshot read before the STOP was applied. If staff re-enable the number
--     before the draft is saved, the acknowledgement must not be stored: the
--     re-enable's supersede trigger has already fired with nothing to
--     supersede. Two genuine PostgreSQL backends prove both orders, with the
--     real staff_reenable_whatsapp_number:
--       * the re-enable holds the conversation first: the insert waits, then
--         reads the committed re-enable and is refused;
--       * the insert holds it first: the re-enable waits, commits after it,
--         and its supersede trigger then supersedes the committed draft.
--     Either way no pending acknowledgement outlives a re-enable.
-- R2. An acknowledgement is kept once per STOP message in every state, so a
--     retry after a lost response can ask for one without ever queueing a
--     second, even after staff rejected or sent the first.
--
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
select plan(25);

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
--   A  stopped, staff re-enable first   (number 7700900501)
--   B  stopped, acknowledgement first   (number 7700900502)
--   C  never stopped                    (number 7700900503)
--   D  stopped, for the index checks    (number 7700900504)
select extensions.dblink_exec('setup', $setup$
  begin;
  set local role postgres;
  delete from public.whatsapp_drafts where conversation_id in (
    '25000000-0000-4000-8000-000000000001', '25000000-0000-4000-8000-000000000002',
    '25000000-0000-4000-8000-000000000003', '25000000-0000-4000-8000-000000000004');
  delete from public.humans where id in (
    '25000000-0000-4000-8000-000000000011', '25000000-0000-4000-8000-000000000012');
  delete from public.whatsapp_opt_out_reenables where phone_key in ('7700900501', '7700900502');
  delete from public.whatsapp_conversations where id in (
    '25000000-0000-4000-8000-000000000001', '25000000-0000-4000-8000-000000000002',
    '25000000-0000-4000-8000-000000000003', '25000000-0000-4000-8000-000000000004');
  delete from public.staff_profiles where id = '25000000-0000-4000-8000-000000000040';
  delete from auth.users where id = '25000000-0000-4000-8000-000000000041';
  insert into public.whatsapp_conversations (id, phone_e164) values
    ('25000000-0000-4000-8000-000000000001', '+447700900501'),
    ('25000000-0000-4000-8000-000000000002', '+447700900502'),
    ('25000000-0000-4000-8000-000000000003', '+447700900503'),
    ('25000000-0000-4000-8000-000000000004', '+447700900504');
  update public.whatsapp_conversations set whatsapp_opted_out_at = now()
   where id in ('25000000-0000-4000-8000-000000000001', '25000000-0000-4000-8000-000000000002',
                '25000000-0000-4000-8000-000000000004');
  -- Created after the STOP, so the number's opt-out flags them.
  insert into public.humans (id, name, surname, phone) values
    ('25000000-0000-4000-8000-000000000011', 'Ack', 'RaceA', '07700 900 501'),
    ('25000000-0000-4000-8000-000000000012', 'Ack', 'RaceB', '07700 900 502');
  -- The member of staff who re-enables the numbers.
  set local session_replication_role = replica;
  insert into auth.users (id) values ('25000000-0000-4000-8000-000000000041');
  insert into public.staff_profiles (id, user_id, role, display_name)
  values ('25000000-0000-4000-8000-000000000040', '25000000-0000-4000-8000-000000000041', 'staff', 'Ack Race Test Staff');
  commit;
$setup$);

select extensions.dblink_connect('ack', (select connstr from _dblink_config));
select extensions.dblink_connect('reenable', (select connstr from _dblink_config));

-- Backend pids, read while both connections are idle.
create temp table _backend (name text primary key, pid int not null);
insert into _backend
select 'ack', pid from extensions.dblink('ack', 'select pg_backend_pid()') as t(pid int)
union all
select 'reenable', pid from extensions.dblink('reenable', 'select pg_backend_pid()') as t(pid int);

create function pg_temp.wait_until_blocked(p_holder text, p_waiter text) returns boolean
language plpgsql as $$
declare
  v_deadline timestamptz := clock_timestamp() + interval '5 seconds';
  v_holder int := (select pid from _backend where name = p_holder);
  v_waiter int := (select pid from _backend where name = p_waiter);
  v_blocked boolean := false;
begin
  loop
    -- pg_stat_activity is cached per transaction; refresh it on every poll.
    perform pg_stat_clear_snapshot();
    select exists (
      select 1 from pg_stat_activity a
       where a.pid = v_waiter
         and a.wait_event_type = 'Lock'
         and v_holder = any(pg_blocking_pids(a.pid))
    ) into v_blocked;
    exit when v_blocked;
    exit when clock_timestamp() >= v_deadline;
    perform pg_sleep(0.01);
  end loop;
  return v_blocked;
end;
$$;

create function pg_temp.finish(p_conn text) returns void
language plpgsql as $$
declare
  v_deadline timestamptz := clock_timestamp() + interval '5 seconds';
begin
  loop
    exit when extensions.dblink_is_busy(p_conn) = 0;
    if clock_timestamp() >= v_deadline then
      perform extensions.dblink_cancel_query(p_conn);
      raise exception '% did not finish', p_conn;
    end if;
    perform pg_sleep(0.01);
  end loop;
end;
$$;

create function pg_temp.ack_insert(p_conversation uuid, p_stop_id text) returns text
language sql as $$
  select format(
    'insert into public.whatsapp_drafts (conversation_id, proposed_text, intent, confidence, state, tool_calls) '
    'values (%L, %L, ''escalate'', 1, ''pending'', %L::jsonb)',
    p_conversation, 'acknowledgement',
    case when p_stop_id is null
      then '{"opt_out_acknowledgement": true}'
      else jsonb_build_object('opt_out_acknowledgement', true, 'stop_meta_message_id', p_stop_id)::text
    end
  )
$$;

-- ── Metadata: the guard exists, is a definer function, and is not callable ──
select has_trigger('public', 'whatsapp_drafts', 'trg_whatsapp_drafts_guard_stop_ack',
  'the acknowledgement guard is installed on whatsapp_drafts');
select ok(
  coalesce((select prosecdef from pg_proc where oid = to_regprocedure('public.whatsapp_drafts_guard_stop_ack()')), false),
  'the guard is a SECURITY DEFINER function');
select ok(
  to_regprocedure('public.whatsapp_drafts_guard_stop_ack()') is not null
  and not has_function_privilege('anon', to_regprocedure('public.whatsapp_drafts_guard_stop_ack()'), 'execute')
  and not has_function_privilege('authenticated', to_regprocedure('public.whatsapp_drafts_guard_stop_ack()'), 'execute'),
  'neither anon nor authenticated can execute the guard directly');

-- ── The marker-time lookup: service_role only, null when unknown ────
select ok(
  to_regprocedure('public.whatsapp_stop_marker_applied_at(text)') is not null
  and has_function_privilege('service_role', to_regprocedure('public.whatsapp_stop_marker_applied_at(text)'), 'execute')
  and not has_function_privilege('anon', to_regprocedure('public.whatsapp_stop_marker_applied_at(text)'), 'execute')
  and not has_function_privilege('authenticated', to_regprocedure('public.whatsapp_stop_marker_applied_at(text)'), 'execute'),
  'the marker-time lookup is executable by service_role only'
);
select ok(
  to_regprocedure('public.whatsapp_stop_attempt_started_at()') is not null
  and has_function_privilege('service_role', to_regprocedure('public.whatsapp_stop_attempt_started_at()'), 'execute')
  and not has_function_privilege('anon', to_regprocedure('public.whatsapp_stop_attempt_started_at()'), 'execute')
  and not has_function_privilege('authenticated', to_regprocedure('public.whatsapp_stop_attempt_started_at()'), 'execute'),
  'the database-clock bound is executable by service_role only'
);
select ok(
  public.whatsapp_stop_marker_applied_at('wamid.250.never-recorded') is null,
  'an unknown STOP message has no marker time'
);

-- ── R1, order 1: staff re-enable first; the stale acknowledgement is refused ──
select extensions.dblink_exec('reenable', 'begin isolation level read committed');
-- dblink, not dblink_exec: both statements return a row.
select v from extensions.dblink('reenable',
  'select set_config(''request.jwt.claims'', ''{"sub":"25000000-0000-4000-8000-000000000041","role":"authenticated"}'', true)') as t(v text);
select v from extensions.dblink('reenable',
  'select public.staff_reenable_whatsapp_number(''07700900501'',
     array[''25000000-0000-4000-8000-000000000011'']::uuid[],
     (select whatsapp_last_stop_at from public.whatsapp_conversations where id = ''25000000-0000-4000-8000-000000000001''),
     ''Customer phoned to ask for reminders again'')::text') as t(v text);

select extensions.dblink_exec('ack', 'begin isolation level read committed');
select extensions.dblink_exec('ack', 'set local lock_timeout = ''8s''');
select is(
  extensions.dblink_send_query('ack',
    pg_temp.ack_insert('25000000-0000-4000-8000-000000000001', 'wamid.250.A')),
  1,
  'the agent''s acknowledgement is dispatched on an independent backend while the re-enable is in flight'
);
select ok(pg_temp.wait_until_blocked('reenable', 'ack'),
  'the acknowledgement waits for the uncommitted re-enable');

select extensions.dblink_exec('reenable', 'commit');
select pg_temp.finish('ack');

create temp table _ack_result (status text);
insert into _ack_result
select status from extensions.dblink_get_result('ack', false) as r(status text);
select matches(
  extensions.dblink_error_message('ack'),
  'whatsapp_stop_ack_not_stopped',
  'once the re-enable commits, the stale acknowledgement is refused by the guard'
);
do $drain$ begin perform status from extensions.dblink_get_result('ack', false) as r(status text); end; $drain$;
-- Commit, not roll back: a refused insert has already aborted the transaction,
-- but an insert the guard failed to refuse would persist and the count below
-- would catch it.
select extensions.dblink_exec('ack', 'commit');

select is(
  (select n from extensions.dblink('setup',
     'select count(*)::int from public.whatsapp_drafts
       where conversation_id = ''25000000-0000-4000-8000-000000000001''') as t(n int)),
  0,
  'no acknowledgement is stored after the re-enable'
);
select is(
  (select v from extensions.dblink('setup',
     'select whatsapp_opted_out_at is null from public.whatsapp_conversations
       where id = ''25000000-0000-4000-8000-000000000001''') as t(v boolean)),
  true,
  'and the number stays re-enabled: the acknowledgement attempt does not stop it again'
);

-- ── R1, order 2: the acknowledgement first; the re-enable supersedes it ──
select extensions.dblink_exec('ack', 'begin isolation level read committed');
select extensions.dblink_exec('ack',
  pg_temp.ack_insert('25000000-0000-4000-8000-000000000002', 'wamid.250.B'));

select extensions.dblink_exec('reenable', 'begin isolation level read committed');
select extensions.dblink_exec('reenable', 'set local lock_timeout = ''8s''');
select v from extensions.dblink('reenable',
  'select set_config(''request.jwt.claims'', ''{"sub":"25000000-0000-4000-8000-000000000041","role":"authenticated"}'', true)') as t(v text);
select is(
  extensions.dblink_send_query('reenable',
    'select public.staff_reenable_whatsapp_number(''07700900502'',
       array[''25000000-0000-4000-8000-000000000012'']::uuid[],
       (select whatsapp_last_stop_at from public.whatsapp_conversations where id = ''25000000-0000-4000-8000-000000000002''),
       ''Customer phoned to ask for reminders again'')::text'),
  1,
  'the re-enable is dispatched while the acknowledgement is uncommitted'
);
select ok(pg_temp.wait_until_blocked('ack', 'reenable'),
  'the re-enable waits for the uncommitted acknowledgement');

select extensions.dblink_exec('ack', 'commit');
select pg_temp.finish('reenable');

create temp table _reenable_result (v text);
insert into _reenable_result
select v from extensions.dblink_get_result('reenable', false) as r(v text);
select matches(
  (select v from _reenable_result),
  'conversation_ids',
  'once the acknowledgement commits, the re-enable completes'
);
do $drain2$ begin perform v from extensions.dblink_get_result('reenable', false) as r(v text); end; $drain2$;
select extensions.dblink_exec('reenable', 'commit');

select is(
  (select s from extensions.dblink('setup',
     'select state from public.whatsapp_drafts
       where conversation_id = ''25000000-0000-4000-8000-000000000002''') as t(s text)),
  'superseded',
  'the committed acknowledgement is superseded by the re-enable'
);
select is(
  (select n from extensions.dblink('setup',
     'select count(*)::int from public.whatsapp_drafts
       where conversation_id = ''25000000-0000-4000-8000-000000000002'' and state = ''pending''') as t(n int)),
  0,
  'so no pending acknowledgement outlives the re-enable'
);

-- ── The guard in isolation: stopped now, or refused ─────────────────
-- Run through the committing 'setup' backend, never in the controller's own
-- transaction: rows the controller inserted would hold foreign-key locks on the
-- fixture conversations and deadlock the cleanup below against this session.
create function pg_temp.remote(p_sql text) returns text
language sql as $$
  select format('select extensions.dblink_exec(''setup'', %L)', p_sql)
$$;

select throws_like(
  pg_temp.remote(pg_temp.ack_insert('25000000-0000-4000-8000-000000000003', 'wamid.250.C')),
  '%whatsapp_stop_ack_not_stopped%',
  'an acknowledgement for a conversation that is not stopped is refused'
);
select lives_ok(
  pg_temp.remote($$insert into public.whatsapp_drafts (conversation_id, proposed_text, intent, confidence, state, tool_calls)
    values ('25000000-0000-4000-8000-000000000003', 'ordinary reply', 'faq', 0.5, 'pending', '{"reason": "ordinary"}')$$),
  'an ordinary draft for a conversation that is not stopped is unaffected'
);
select lives_ok(
  pg_temp.remote(pg_temp.ack_insert('25000000-0000-4000-8000-000000000004', 'wamid.250.X')),
  'an acknowledgement for a stopped conversation is accepted'
);

-- ── R2: one acknowledgement per STOP message, in any state ──────────
select extensions.dblink_exec('setup', $r$update public.whatsapp_drafts set state = 'rejected', rejected_reason = 'staff declined'
 where conversation_id = '25000000-0000-4000-8000-000000000004'$r$);
select throws_like(
  pg_temp.remote(pg_temp.ack_insert('25000000-0000-4000-8000-000000000004', 'wamid.250.X')),
  '%whatsapp_drafts_one_opt_out_ack_per_stop%',
  'a second acknowledgement for the same STOP is refused even after staff rejected the first'
);
select lives_ok(
  pg_temp.remote(pg_temp.ack_insert('25000000-0000-4000-8000-000000000004', 'wamid.250.Y')),
  'an acknowledgement for a different STOP message is accepted'
);
select extensions.dblink_exec('setup', $r$update public.whatsapp_drafts set state = 'rejected', rejected_reason = 'staff declined'
 where conversation_id = '25000000-0000-4000-8000-000000000004' and state = 'pending'$r$);
select lives_ok(
  pg_temp.remote(pg_temp.ack_insert('25000000-0000-4000-8000-000000000004', null)),
  'an acknowledgement with no STOP id is outside the per-STOP index'
);
select extensions.dblink_exec('setup', $r$update public.whatsapp_drafts set state = 'rejected', rejected_reason = 'staff declined'
 where conversation_id = '25000000-0000-4000-8000-000000000004' and state = 'pending'$r$);
select lives_ok(
  pg_temp.remote(pg_temp.ack_insert('25000000-0000-4000-8000-000000000004', null)),
  'and so is a second one, which only the one-pending index bounds'
);

-- ── A claimed acknowledgement restored to pending after a re-enable ──
-- whatsapp-send claims a draft (pending -> approved) and puts it back to
-- pending when the Meta call fails. If staff re-enabled the number meanwhile,
-- the re-enable skipped it (it was not pending), so the restore must not leave
-- a pending acknowledgement on a number that is no longer stopped.
-- Conversation B was re-enabled above and still holds its superseded ack.
select extensions.dblink_exec('setup', $r$update public.whatsapp_drafts set state = 'approved', rejected_reason = null
 where conversation_id = '25000000-0000-4000-8000-000000000002' and tool_calls ->> 'opt_out_acknowledgement' = 'true'$r$);
select extensions.dblink_exec('setup', $r$update public.whatsapp_drafts set state = 'pending'
 where conversation_id = '25000000-0000-4000-8000-000000000002' and tool_calls ->> 'opt_out_acknowledgement' = 'true'$r$);
select is(
  (select s from extensions.dblink('setup',
     $r$select state from public.whatsapp_drafts where conversation_id = '25000000-0000-4000-8000-000000000002' and tool_calls ->> 'opt_out_acknowledgement' = 'true'$r$) as t(s text)),
  'superseded',
  'an acknowledgement restored to pending on a re-enabled number is superseded, not left in the queue'
);
-- On a number that is still stopped, the same restore is untouched.
select extensions.dblink_exec('setup', $r$update public.whatsapp_drafts set state = 'approved'
 where conversation_id = '25000000-0000-4000-8000-000000000004' and state = 'pending' and tool_calls ->> 'opt_out_acknowledgement' = 'true'$r$);
select extensions.dblink_exec('setup', $r$update public.whatsapp_drafts set state = 'pending'
 where conversation_id = '25000000-0000-4000-8000-000000000004' and state = 'approved' and tool_calls ->> 'opt_out_acknowledgement' = 'true'$r$);
select is(
  (select n from extensions.dblink('setup',
     $r$select count(*)::int from public.whatsapp_drafts where conversation_id = '25000000-0000-4000-8000-000000000004' and state = 'pending' and tool_calls ->> 'opt_out_acknowledgement' = 'true'$r$) as t(n int)),
  1,
  'and on a number that is still stopped the restore leaves it pending'
);

-- ── Clean up the committed fixtures ─────────────────────────────────
select extensions.dblink_exec('setup', $cleanup$
  begin;
  set local role postgres;
  delete from public.whatsapp_drafts where conversation_id in (
    '25000000-0000-4000-8000-000000000001', '25000000-0000-4000-8000-000000000002',
    '25000000-0000-4000-8000-000000000003', '25000000-0000-4000-8000-000000000004');
  delete from public.humans where id in (
    '25000000-0000-4000-8000-000000000011', '25000000-0000-4000-8000-000000000012');
  delete from public.whatsapp_opt_out_reenables where phone_key in ('7700900501', '7700900502');
  delete from public.whatsapp_conversations where id in (
    '25000000-0000-4000-8000-000000000001', '25000000-0000-4000-8000-000000000002',
    '25000000-0000-4000-8000-000000000003', '25000000-0000-4000-8000-000000000004');
  delete from public.staff_profiles where id = '25000000-0000-4000-8000-000000000040';
  delete from auth.users where id = '25000000-0000-4000-8000-000000000041';
  commit;
$cleanup$);

do $disconnect$
begin
  perform extensions.dblink_disconnect('ack');
  perform extensions.dblink_disconnect('reenable');
  perform extensions.dblink_disconnect('setup');
end;
$disconnect$;

select * from finish();
rollback;

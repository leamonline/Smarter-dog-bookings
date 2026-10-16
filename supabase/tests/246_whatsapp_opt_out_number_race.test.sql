-- A STOP racing a customer record on the same number
-- (migration 20261014120000, trg_whatsapp_conversation_apply_opt_out and
-- trg_humans_apply_number_opt_out).
--
-- The two triggers each read the other table. Without serialisation, a STOP
-- in flight and a customer record created with the same number at the same
-- moment would each miss the other's uncommitted row, leaving the number
-- suppressed but the customer opted in, which the Twilio notify paths trust.
-- Both triggers take an advisory lock on the number first. Two genuine
-- PostgreSQL backends prove that whichever comes second waits, then sees the
-- first one's committed row, in either order. A STOP that lands while staff
-- are re-enabling the number waits for the re-enable and then stops the number
-- again: the newer request wins. A re-enable that meets an opt-out in flight
-- on the number waits for it, then refuses: its scope changed. Fixtures are
-- synthetic,
-- committed only because a dblink backend cannot see the pgTAP controller's
-- transaction, and removed before the test finishes.

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

select extensions.dblink_exec('setup', $setup$
  begin;
  set local role postgres;
  delete from public.humans where id in (
    '24600000-0000-4000-8000-000000000011',
    '24600000-0000-4000-8000-000000000012'
  );
  delete from public.whatsapp_conversations where id in (
    '24600000-0000-4000-8000-000000000001',
    '24600000-0000-4000-8000-000000000002'
  );
  delete from public.whatsapp_opt_out_reenables where phone_key in ('7700900463', '7700900464');
  delete from public.humans where id in (
    '24600000-0000-4000-8000-000000000013',
    '24600000-0000-4000-8000-000000000014',
    '24600000-0000-4000-8000-000000000015'
  );
  delete from public.whatsapp_conversations where id = '24600000-0000-4000-8000-000000000003';
  delete from public.staff_profiles where id = '24600000-0000-4000-8000-000000000040';
  delete from auth.users where id = '24600000-0000-4000-8000-000000000041';
  insert into public.whatsapp_conversations (id, phone_e164) values
    ('24600000-0000-4000-8000-000000000001', '+447700900461'),
    ('24600000-0000-4000-8000-000000000002', '+447700900462'),
    ('24600000-0000-4000-8000-000000000003', '+447700900463');
  -- Order 3's number has said STOP, and its customer is flagged by it.
  update public.whatsapp_conversations set whatsapp_opted_out_at = now()
   where id = '24600000-0000-4000-8000-000000000003';
  insert into public.humans (id, name, surname, phone)
  values ('24600000-0000-4000-8000-000000000013', 'Race', 'Reenable', '07700 900 463');
  -- Order 4's number never said STOP: one record opted out by staff, one not.
  insert into public.humans (id, name, surname, phone, whatsapp_opted_out, whatsapp_opted_out_reason) values
    ('24600000-0000-4000-8000-000000000014', 'Race', 'OptedOut', '07700 900 464', true, 'told staff by phone'),
    ('24600000-0000-4000-8000-000000000015', 'Race', 'OptedIn', '+44 7700 900464', false, null);
  -- The member of staff who re-enables it.
  set local session_replication_role = replica;
  insert into auth.users (id) values ('24600000-0000-4000-8000-000000000041');
  insert into public.staff_profiles (id, user_id, role, display_name)
  values ('24600000-0000-4000-8000-000000000040', '24600000-0000-4000-8000-000000000041', 'staff', 'Race Test Staff');
  commit;
$setup$);

select extensions.dblink_connect('stop', (select connstr from _dblink_config));
select extensions.dblink_connect('customer', (select connstr from _dblink_config));

-- Backend pids, read while both connections are idle.
create temp table _backend (name text primary key, pid int not null);
insert into _backend
select 'stop', pid from extensions.dblink('stop', 'select pg_backend_pid()') as t(pid int)
union all
select 'customer', pid from extensions.dblink('customer', 'select pg_backend_pid()') as t(pid int);

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
  perform status from extensions.dblink_get_result(p_conn) as r(status text);
  perform status from extensions.dblink_get_result(p_conn) as r(status text);
end;
$$;

-- ── Order 1: the STOP is in flight when the customer record is written ──
select extensions.dblink_exec('stop', 'begin isolation level read committed');
select extensions.dblink_exec('stop',
  'update public.whatsapp_conversations set whatsapp_opted_out_at = now()
    where id = ''24600000-0000-4000-8000-000000000001''');

select extensions.dblink_exec('customer', 'begin isolation level read committed');
select extensions.dblink_exec('customer', 'set local lock_timeout = ''8s''');
select is(
  extensions.dblink_send_query('customer',
    'insert into public.humans (id, name, surname, phone)
     values (''24600000-0000-4000-8000-000000000011'', ''Race'', ''Customer'', ''07700 900 461'')'),
  1,
  'a customer record with the same number, typed differently, is written on an independent backend'
);
select ok(pg_temp.wait_until_blocked('stop', 'customer'),
  'the customer write waits for the STOP still in flight on that number');

select extensions.dblink_exec('stop', 'commit');
select pg_temp.finish('customer');
select extensions.dblink_exec('customer', 'commit');

select is(
  (select v from extensions.dblink('setup',
     'select whatsapp_opted_out from public.humans where id = ''24600000-0000-4000-8000-000000000011''') as t(v boolean)),
  true,
  'once the STOP commits, the new customer record is opted out as it is written'
);
select is(
  (select v from extensions.dblink('setup',
     'select whatsapp_opted_out_reason from public.humans where id = ''24600000-0000-4000-8000-000000000011''') as t(v text)),
  'asked_on_whatsapp',
  'with the STOP as its reason'
);

-- ── Order 2: the customer record is in flight when the STOP lands ──────
select extensions.dblink_exec('customer', 'begin isolation level read committed');
select extensions.dblink_exec('customer',
  'insert into public.humans (id, name, surname, phone)
   values (''24600000-0000-4000-8000-000000000012'', ''Race'', ''Second'', ''+44 7700 900462'')');

select extensions.dblink_exec('stop', 'begin isolation level read committed');
select extensions.dblink_exec('stop', 'set local lock_timeout = ''8s''');
select is(
  extensions.dblink_send_query('stop',
    'update public.whatsapp_conversations set whatsapp_opted_out_at = now()
      where id = ''24600000-0000-4000-8000-000000000002'''),
  1,
  'the STOP is recorded on an independent backend'
);
select ok(pg_temp.wait_until_blocked('customer', 'stop'),
  'the STOP waits for the customer record still in flight on that number');

select extensions.dblink_exec('customer', 'commit');
select pg_temp.finish('stop');
select extensions.dblink_exec('stop', 'commit');

select is(
  (select v from extensions.dblink('setup',
     'select whatsapp_opted_out from public.humans where id = ''24600000-0000-4000-8000-000000000012''') as t(v boolean)),
  true,
  'once the customer record commits, the STOP sees it and opts it out'
);
select isnt(
  (select v from extensions.dblink('setup',
     'select whatsapp_opted_out_at from public.whatsapp_conversations where id = ''24600000-0000-4000-8000-000000000002''') as t(v timestamptz)),
  null,
  'and the number itself stays suppressed'
);

-- ── Order 3: a STOP lands while staff re-enable the number ───────────
select extensions.dblink_exec('customer', 'begin isolation level read committed');
-- dblink, not dblink_exec: both statements return a row.
select v from extensions.dblink('customer',
  'select set_config(''request.jwt.claims'', ''{"sub":"24600000-0000-4000-8000-000000000041","role":"authenticated"}'', true)') as t(v text);
select v from extensions.dblink('customer',
  'select public.staff_reenable_whatsapp_number(''07700900463'',
     array[''24600000-0000-4000-8000-000000000013'']::uuid[],
     (select whatsapp_last_stop_at from public.whatsapp_conversations where id = ''24600000-0000-4000-8000-000000000003''),
     ''Customer phoned to ask for reminders again'')::text') as t(v text);

select extensions.dblink_exec('stop', 'begin isolation level read committed');
select extensions.dblink_exec('stop', 'set local lock_timeout = ''8s''');
-- The agent's own write: by id alone. (Filtered on "not yet stopped", it
-- would be checked against the committed, still-stopped row, match nothing
-- and be lost when the re-enable commits.)
select is(
  extensions.dblink_send_query('stop',
    'update public.whatsapp_conversations set whatsapp_opted_out_at = now(), auto_send_enabled = false
      where id = ''24600000-0000-4000-8000-000000000003'''),
  1,
  'a new STOP is recorded on an independent backend while the re-enable is in flight'
);
select ok(pg_temp.wait_until_blocked('customer', 'stop'),
  'the STOP waits for the re-enable');

select extensions.dblink_exec('customer', 'commit');
select pg_temp.finish('stop');
select extensions.dblink_exec('stop', 'commit');

select isnt(
  (select v from extensions.dblink('setup',
     'select whatsapp_opted_out_at from public.whatsapp_conversations where id = ''24600000-0000-4000-8000-000000000003''') as t(v timestamptz)),
  null,
  'once the re-enable commits, the newer STOP stops the number again'
);
select is(
  (select v from extensions.dblink('setup',
     'select whatsapp_opted_out from public.humans where id = ''24600000-0000-4000-8000-000000000013''') as t(v boolean)),
  true,
  'and opts the customer out again, so no send path misses it'
);

-- ── Order 4: a re-enable meets an opt-out in flight on the number ────
select extensions.dblink_exec('customer', 'begin isolation level read committed');
select extensions.dblink_exec('customer',
  'update public.humans set whatsapp_opted_out = true, whatsapp_opted_out_reason = ''told staff by phone''
    where id = ''24600000-0000-4000-8000-000000000015''');

select extensions.dblink_exec('stop', 'begin isolation level read committed');
select extensions.dblink_exec('stop', 'set local lock_timeout = ''8s''');
select v from extensions.dblink('stop',
  'select set_config(''request.jwt.claims'', ''{"sub":"24600000-0000-4000-8000-000000000041","role":"authenticated"}'', true)') as t(v text);
-- Staff confirmed the scope as it was: only the record already opted out.
select is(
  extensions.dblink_send_query('stop',
    'select public.staff_reenable_whatsapp_number(''07700900464'',
       array[''24600000-0000-4000-8000-000000000014'']::uuid[], null, ''Customer phoned to ask for reminders again'')::text'),
  1,
  'a re-enable is made on an independent backend while another record on the number is being opted out'
);
select ok(pg_temp.wait_until_blocked('customer', 'stop'),
  'the re-enable waits for that opt-out');

select extensions.dblink_exec('customer', 'commit');
do $wait$
declare
  v_deadline timestamptz := clock_timestamp() + interval '5 seconds';
begin
  loop
    exit when extensions.dblink_is_busy('stop') = 0;
    if clock_timestamp() >= v_deadline then
      perform extensions.dblink_cancel_query('stop');
      raise exception 'the re-enable did not finish';
    end if;
    perform pg_sleep(0.01);
  end loop;
end;
$wait$;
create temp table _reenable_result (v text);
insert into _reenable_result
select v from extensions.dblink_get_result('stop', false) as r(v text);
select matches(
  extensions.dblink_error_message('stop'),
  'have changed',
  'once it commits, the re-enable sees the new opt-out and refuses: its scope changed'
);
do $drain$ begin perform v from extensions.dblink_get_result('stop', false) as r(v text); end; $drain$;
select extensions.dblink_exec('stop', 'rollback');

select is(
  (select v from extensions.dblink('setup',
     'select whatsapp_opted_out from public.humans where id = ''24600000-0000-4000-8000-000000000014''') as t(v boolean)),
  true,
  'and the record staff confirmed stays opted out'
);

-- ── Clean up the committed fixtures ─────────────────────────────────
select extensions.dblink_exec('setup', $cleanup$
  begin;
  set local role postgres;
  delete from public.humans where id in (
    '24600000-0000-4000-8000-000000000011',
    '24600000-0000-4000-8000-000000000012'
  );
  delete from public.whatsapp_conversations where id in (
    '24600000-0000-4000-8000-000000000001',
    '24600000-0000-4000-8000-000000000002'
  );
  delete from public.whatsapp_opt_out_reenables where phone_key in ('7700900463', '7700900464');
  delete from public.humans where id in (
    '24600000-0000-4000-8000-000000000013',
    '24600000-0000-4000-8000-000000000014',
    '24600000-0000-4000-8000-000000000015'
  );
  delete from public.whatsapp_conversations where id = '24600000-0000-4000-8000-000000000003';
  delete from public.staff_profiles where id = '24600000-0000-4000-8000-000000000040';
  delete from auth.users where id = '24600000-0000-4000-8000-000000000041';
  commit;
$cleanup$);

do $disconnect$
begin
  perform extensions.dblink_disconnect('stop');
  perform extensions.dblink_disconnect('customer');
  perform extensions.dblink_disconnect('setup');
end;
$disconnect$;

select * from finish();
rollback;

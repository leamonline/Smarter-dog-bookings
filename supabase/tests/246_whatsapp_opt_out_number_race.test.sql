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
-- first one's committed row, in either order. Fixtures are synthetic,
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
  insert into public.whatsapp_conversations (id, phone_e164) values
    ('24600000-0000-4000-8000-000000000001', '+447700900461'),
    ('24600000-0000-4000-8000-000000000002', '+447700900462');
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

-- A customer cancellation and a staff regroup use genuine independent
-- PostgreSQL backends. All fixtures are synthetic, committed only because a
-- dblink backend cannot see the pgTAP controller's outer transaction, and
-- removed again before the test finishes.

begin;
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
select plan(12);

create temp table _dblink_config (connstr text not null);
insert into _dblink_config
values (
  format(
    'hostaddr=%s port=%s dbname=%I user=postgres password=postgres',
    host(inet_server_addr()),
    current_setting('port'),
    current_database()
  )
);

select extensions.dblink_connect(
  'setup',
  (select connstr from _dblink_config)
);

-- Pre-clean the reserved namespace so an interrupted prior run is harmless,
-- then create committed fixtures with application triggers disabled.
select extensions.dblink_exec('setup', $setup$
  begin;
  set local session_replication_role = replica;

  delete from smarter_dog_private.customer_cancellation_receipts
   where customer_user_id = '47000000-0000-4000-8000-000000000002'
      or target_booking_id = '47200000-0000-4000-8000-000000000101';
  delete from public.notification_log
   where booking_id in (
     '47200000-0000-4000-8000-000000000101',
     '47200000-0000-4000-8000-000000000102',
     '47200000-0000-4000-8000-000000000103'
   );
  delete from public.booking_events
   where booking_id in (
     '47200000-0000-4000-8000-000000000101',
     '47200000-0000-4000-8000-000000000102',
     '47200000-0000-4000-8000-000000000103'
   );
  delete from public.booking_capacity_audit
   where booking_id in (
     '47200000-0000-4000-8000-000000000101',
     '47200000-0000-4000-8000-000000000102',
     '47200000-0000-4000-8000-000000000103'
   );
  delete from public.bookings
   where id in (
     '47200000-0000-4000-8000-000000000101',
     '47200000-0000-4000-8000-000000000102',
     '47200000-0000-4000-8000-000000000103'
   );
  delete from public.dogs
   where id in (
     '47100000-0000-4000-8000-000000000001',
     '47100000-0000-4000-8000-000000000002',
     '47100000-0000-4000-8000-000000000003'
   );
  delete from public.humans
   where id = '47000000-0000-4000-8000-000000000001';
  delete from public.staff_profiles
   where id = '47000000-0000-4000-8000-000000000040';
  delete from auth.users
   where id in (
     '47000000-0000-4000-8000-000000000002',
     '47000000-0000-4000-8000-000000000041'
   );
  delete from public.salon_config
   where id = '47400000-0000-4000-8000-000000000001';
  delete from vault.secrets
   where description = 'pgtap-115-cancellation-concurrency';

  do $vault$
  begin
    if not exists (
      select 1 from vault.secrets where name = 'supabase_url'
    ) then
      perform vault.create_secret(
        'http://localhost:54321',
        'supabase_url',
        'pgtap-115-cancellation-concurrency'
      );
    end if;
    if not exists (
      select 1 from vault.secrets where name = 'webhook_secret'
    ) then
      perform vault.create_secret(
        'pgtap-115-secret',
        'webhook_secret',
        'pgtap-115-cancellation-concurrency'
      );
    end if;
  end;
  $vault$;

  insert into auth.users (id) values
    ('47000000-0000-4000-8000-000000000002'),
    ('47000000-0000-4000-8000-000000000041');

  insert into public.humans (
    id, name, surname, customer_user_id, source, approved_at
  ) values (
    '47000000-0000-4000-8000-000000000001',
    'Concurrency',
    'Customer',
    '47000000-0000-4000-8000-000000000002',
    'existing',
    now()
  );

  insert into public.staff_profiles (id, user_id, role, display_name)
  values (
    '47000000-0000-4000-8000-000000000040',
    '47000000-0000-4000-8000-000000000041',
    'staff',
    'Concurrency Staff'
  );

  insert into public.dogs (id, name, breed, human_id, size) values
    (
      '47100000-0000-4000-8000-000000000001',
      'Concurrency One', 'Poodle',
      '47000000-0000-4000-8000-000000000001', 'small'
    ),
    (
      '47100000-0000-4000-8000-000000000002',
      'Concurrency Two', 'Poodle',
      '47000000-0000-4000-8000-000000000001', 'medium'
    ),
    (
      '47100000-0000-4000-8000-000000000003',
      'Concurrency Three', 'Poodle',
      '47000000-0000-4000-8000-000000000001', 'small'
    );

  insert into public.bookings (
    id, booking_date, slot, dog_id, size, service, status, confirmed,
    payment, group_id
  ) values
    (
      '47200000-0000-4000-8000-000000000101', current_date + 30, '09:00',
      '47100000-0000-4000-8000-000000000001', 'small', 'full-groom',
      'Booked', false, 'Due at Pick-up',
      '47300000-0000-4000-8000-000000000001'
    ),
    (
      '47200000-0000-4000-8000-000000000102', current_date + 30, '10:00',
      '47100000-0000-4000-8000-000000000002', 'medium', 'full-groom',
      'Booked', false, 'Due at Pick-up',
      '47300000-0000-4000-8000-000000000001'
    ),
    (
      '47200000-0000-4000-8000-000000000103', current_date + 30, '11:00',
      '47100000-0000-4000-8000-000000000003', 'small', 'full-groom',
      'Booked', false, 'Due at Pick-up',
      '47300000-0000-4000-8000-000000000002'
    );

  insert into public.salon_config (id, settings)
  values (
    '47400000-0000-4000-8000-000000000001',
    '{"minCancellationHours":24,"customerPortal":{"allowCancellations":true}}'::jsonb
  );
  commit;
$setup$);

select extensions.dblink_connect(
  'canceller',
  (select connstr from _dblink_config)
);
select extensions.dblink_connect(
  'writer',
  (select connstr from _dblink_config)
);

select extensions.dblink_exec(
  'canceller',
  'begin isolation level read committed'
);
select extensions.dblink_exec(
  'canceller',
  'set local statement_timeout = ''10s'''
);
select extensions.dblink_exec(
  'canceller',
  'set local lock_timeout = ''5s'''
);
select extensions.dblink_exec(
  'canceller',
  'set local "request.jwt.claims" = ''{"sub":"47000000-0000-4000-8000-000000000002","role":"authenticated"}'''
);
select extensions.dblink_exec('canceller', 'set local role authenticated');

select extensions.dblink_exec(
  'writer',
  'begin isolation level read committed'
);
select extensions.dblink_exec(
  'writer',
  'set local statement_timeout = ''10s'''
);
select extensions.dblink_exec(
  'writer',
  'set local lock_timeout = ''8s'''
);
select extensions.dblink_exec(
  'writer',
  'set local "request.jwt.claims" = ''{"sub":"47000000-0000-4000-8000-000000000041","role":"authenticated"}'''
);

-- Create the exception-capturing wrapper while the backend is still postgres;
-- it remains SECURITY INVOKER and therefore performs its UPDATE as the
-- authenticated staff role set immediately afterwards.
select extensions.dblink_exec('writer', $writer_function$
  create or replace function pg_temp.try_join_cancelled_visit()
  returns text
  language plpgsql
  as $function$
  begin
    update public.bookings
       set group_id = '47300000-0000-4000-8000-000000000001'
     where id = '47200000-0000-4000-8000-000000000103';
    return '00000';
  exception
    when others then
      return sqlstate;
  end;
  $function$;
$writer_function$);

select extensions.dblink_exec('writer', 'set local role authenticated');

create temp table _backend_state (
  canceller_pid integer,
  writer_pid integer,
  writer_blocked boolean not null default false
);
insert into _backend_state (canceller_pid, writer_pid)
select canceller.pid, writer.pid
from extensions.dblink(
  'canceller',
  'select pg_backend_pid()'
) as canceller(pid integer)
cross join extensions.dblink(
  'writer',
  'select pg_backend_pid()'
) as writer(pid integer);

select is(
  (
    select isolation_level
    from extensions.dblink(
      'canceller',
      'show transaction_isolation'
    ) as isolation(isolation_level text)
  ),
  'read committed',
  'the cancellation race is exercised at the application default isolation level'
);

select is(
  (
    select acquired
    from extensions.dblink('canceller', $lock$
      select true
      from (
        select pg_advisory_xact_lock(
          hashtextextended(
            'customer_booking_cancellation|'
              || '47300000-0000-4000-8000-000000000001'
              || '|'
              || (current_date + 30)::text,
            0
          )
        )
      ) held
    $lock$) as lock_result(acquired boolean)
  ),
  true,
  'the customer session holds the production visit-membership lock'
);

-- Catching SQLSTATE inside the writer backend keeps dblink_get_result from
-- raising the remote exception in the controller and preserves the exact code.
select is(
  extensions.dblink_send_query(
    'writer',
    'select pg_temp.try_join_cancelled_visit()'
  ),
  1,
  'the staff regroup is dispatched on an independent backend'
);

do $poll$
declare
  v_deadline timestamptz := clock_timestamp() + interval '5 seconds';
begin
  loop
    update _backend_state state
       set writer_blocked = exists (
         select 1
           from pg_stat_activity activity
          where activity.pid = state.writer_pid
            and activity.wait_event_type = 'Lock'
            and state.canceller_pid = any(pg_blocking_pids(activity.pid))
       );

    exit when (select writer_blocked from _backend_state);
    exit when clock_timestamp() >= v_deadline;
    perform pg_sleep(0.01);
  end loop;
end;
$poll$;

select ok(
  (select writer_blocked from _backend_state),
  'the staff regroup genuinely blocks behind the cancellation visit lock'
);

create temp table _receipt (payload jsonb not null);
insert into _receipt (payload)
select receipt_text::jsonb
from extensions.dblink('canceller', $cancel$
  select to_jsonb(receipt)::text
  from public.cancel_customer_booking(
    '47200000-0000-4000-8000-000000000101',
    'Concurrency test'
  ) receipt
$cancel$) as cancelled(receipt_text text);

select is(
  (select payload ->> 'target_booking_id' from _receipt),
  '47200000-0000-4000-8000-000000000101',
  'the cancellation receipt identifies the requested target'
);
select is(
  (select (payload ->> 'cancelled_count')::integer from _receipt),
  2,
  'the cancellation receipt contains the original two-member visit'
);
select is(
  (
    select count(*)
    from _receipt,
         lateral jsonb_array_elements_text(
           payload -> 'cancelled_booking_ids'
         ) member(id)
    where member.id in (
      '47200000-0000-4000-8000-000000000101',
      '47200000-0000-4000-8000-000000000102'
    )
  ),
  2::bigint,
  'the receipt names both original members and no phantom member'
);

select extensions.dblink_exec('canceller', 'commit');

do $writer_wait$
declare
  v_deadline timestamptz := clock_timestamp() + interval '5 seconds';
begin
  loop
    exit when extensions.dblink_is_busy('writer') = 0;
    if clock_timestamp() >= v_deadline then
      perform extensions.dblink_cancel_query('writer');
      raise exception 'writer did not finish after the cancellation committed';
    end if;
    perform pg_sleep(0.01);
  end loop;
end;
$writer_wait$;

create temp table _writer_result (sqlstate text not null);
insert into _writer_result (sqlstate)
select result_code
from extensions.dblink_get_result('writer') as result(result_code text);

select is(
  (select sqlstate from _writer_result),
  'SDC03',
  'the waiting regroup revalidates and rejects the cancelled destination'
);

-- dblink async mode requires one final empty result read before the connection
-- is reusable, even after the query's row has already been consumed above.
do $drain_writer$
begin
  perform result_code
  from extensions.dblink_get_result('writer') as result(result_code text);
end;
$drain_writer$;

select extensions.dblink_exec('writer', 'rollback');

-- A fresh transaction must recover the same receipt if the original HTTP
-- response was lost after commit. This proves the receipt is durable rather
-- than merely reusable inside the first database transaction.
select extensions.dblink_connect(
  'retry',
  (select connstr from _dblink_config)
);
select extensions.dblink_exec(
  'retry',
  'begin isolation level read committed'
);
select extensions.dblink_exec(
  'retry',
  'set local statement_timeout = ''10s'''
);
select extensions.dblink_exec(
  'retry',
  'set local "request.jwt.claims" = ''{"sub":"47000000-0000-4000-8000-000000000002","role":"authenticated"}'''
);
select extensions.dblink_exec('retry', 'set local role authenticated');

create temp table _retry_receipt (payload jsonb not null);
insert into _retry_receipt (payload)
select receipt_text::jsonb
from extensions.dblink('retry', $retry$
  select to_jsonb(receipt)::text
  from public.cancel_customer_booking(
    '47200000-0000-4000-8000-000000000101',
    'Concurrency test'
  ) receipt
$retry$) as replayed(receipt_text text);

select is(
  (select payload from _retry_receipt),
  (select payload from _receipt),
  'a fresh transaction replays the exact durable receipt after response loss'
);
select extensions.dblink_exec('retry', 'commit');

select is(
  (
    select count(*)
    from public.bookings
    where id in (
      '47200000-0000-4000-8000-000000000101',
      '47200000-0000-4000-8000-000000000102'
    )
      and status = 'Cancelled'
      and cancel_reason = 'Concurrency test'
  ),
  2::bigint,
  'both original visit members commit as cancelled with the reason'
);
select is(
  (
    select count(*)
    from public.bookings
    where id = '47200000-0000-4000-8000-000000000103'
      and status = 'Booked'
      and group_id = '47300000-0000-4000-8000-000000000002'
  ),
  1::bigint,
  'the rejected candidate remains booked outside the cancelled visit'
);
select is(
  (
    select count(*)
    from public.bookings
    where booking_date = current_date + 30
      and group_id = '47300000-0000-4000-8000-000000000001'
      and status = 'Booked'
  ),
  0::bigint,
  'no booked row remains in the cancelled group and date'
);

-- Normal-path cleanup. If an unexpected SQL error aborts the controller,
-- closing its dblink backends rolls back their open transactions; the reserved
-- namespace and pre-clean make the next run idempotent as well.
select extensions.dblink_exec('setup', $cleanup$
  begin;
  set local session_replication_role = replica;
  delete from smarter_dog_private.customer_cancellation_receipts
   where customer_user_id = '47000000-0000-4000-8000-000000000002'
      or target_booking_id = '47200000-0000-4000-8000-000000000101';
  delete from public.notification_log
   where booking_id in (
     '47200000-0000-4000-8000-000000000101',
     '47200000-0000-4000-8000-000000000102',
     '47200000-0000-4000-8000-000000000103'
   );
  delete from public.booking_events
   where booking_id in (
     '47200000-0000-4000-8000-000000000101',
     '47200000-0000-4000-8000-000000000102',
     '47200000-0000-4000-8000-000000000103'
   );
  delete from public.booking_capacity_audit
   where booking_id in (
     '47200000-0000-4000-8000-000000000101',
     '47200000-0000-4000-8000-000000000102',
     '47200000-0000-4000-8000-000000000103'
   );
  delete from public.bookings
   where id in (
     '47200000-0000-4000-8000-000000000101',
     '47200000-0000-4000-8000-000000000102',
     '47200000-0000-4000-8000-000000000103'
   );
  delete from public.dogs
   where id in (
     '47100000-0000-4000-8000-000000000001',
     '47100000-0000-4000-8000-000000000002',
     '47100000-0000-4000-8000-000000000003'
   );
  delete from public.humans
   where id = '47000000-0000-4000-8000-000000000001';
  delete from public.staff_profiles
   where id = '47000000-0000-4000-8000-000000000040';
  delete from auth.users
   where id in (
     '47000000-0000-4000-8000-000000000002',
     '47000000-0000-4000-8000-000000000041'
   );
  delete from public.salon_config
   where id = '47400000-0000-4000-8000-000000000001';
  delete from vault.secrets
   where description = 'pgtap-115-cancellation-concurrency';
  commit;
$cleanup$);

do $disconnect$
begin
  perform extensions.dblink_disconnect('retry');
  perform extensions.dblink_disconnect('writer');
  perform extensions.dblink_disconnect('canceller');
  perform extensions.dblink_disconnect('setup');
end;
$disconnect$;

select * from finish();
rollback;

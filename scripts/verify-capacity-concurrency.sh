#!/usr/bin/env bash
#
# Real two-session proof for the PostgreSQL booking-capacity guard.
#
# This gate is deliberately local-only and destructive to its fixed synthetic
# fixture namespace. It uses dblink to keep two independent READ COMMITTED
# PostgreSQL backends open at once, then proves the losing backend is blocked by
# the winner's real transaction-scoped advisory lock before the winner commits.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
source "$SCRIPT_DIR/postgres-concurrency-driver.sh"
concurrency_init_local_supabase "Capacity concurrency" "$REPO_ROOT"

CAPACITY_CONCURRENCY_TIMEOUT_SECONDS="${CAPACITY_CONCURRENCY_TIMEOUT_SECONDS:-120}"
concurrency_validate_positive_integer \
  "CAPACITY_CONCURRENCY_TIMEOUT_SECONDS" \
  "$CAPACITY_CONCURRENCY_TIMEOUT_SECONDS"

# Bound host connections and every controller-side SQL statement. Independent
# dblink backends receive equivalent connection options below, with the two
# contender transactions narrowing their statement timeout further.
export PGCONNECT_TIMEOUT=5
export PGOPTIONS="-c statement_timeout=60000 -c lock_timeout=10000"

PSQL=("${CONCURRENCY_PSQL[@]}")

CONFIG_ID="61400000-0000-4000-8000-000000000301"
FIXTURE_USER="61400000-0000-4000-8000-000000000001"
FIXTURE_HUMAN="61400000-0000-4000-8000-000000000010"
RUN_TOKEN="issue614-${BASHPID}-$(date -u +%s)"
HEAD_SHA="$(git -C "$REPO_ROOT" rev-parse HEAD)"
WORKTREE_STATE="$(concurrency_worktree_state "$REPO_ROOT")"
CONTROLLER_CLIENT_PID=""

sql() {
  concurrency_sql "$@"
}

trim() {
  concurrency_trim
}

fixture_marker_exists() {
  sql --command="
    select exists (
      select 1
        from public.salon_config
       where id = '$CONFIG_ID'::uuid
         and settings ->> 'capacityConcurrencyRunToken' = '$RUN_TOKEN'
    );" | trim
}

reserved_marker_exists() {
  sql --command="
    select exists (
      select 1 from public.salon_config where id = '$CONFIG_ID'::uuid
    );" | trim
}

terminate_named_backends() {
  concurrency_terminate_named_backends \
    ci_capacity_setup \
    ci_capacity_slot_a ci_capacity_slot_b \
    ci_capacity_day_a ci_capacity_day_b
}

cleanup_fixtures() {
  local marker
  local remains
  local modes

  marker="$(fixture_marker_exists 2>/dev/null || true)"
  if [ "$marker" != "t" ]; then
    return 0
  fi

  terminate_named_backends || true

  sql --command="
    begin;
    set local session_replication_role = replica;

    alter table public.bookings enable trigger trg_notify_booking_insert;
    alter table public.bookings enable trigger notify_booking_cancelled_trigger;
    alter table public.booking_events enable trigger trg_staff_push_booking_event;

    delete from public.notification_log
     where booking_id between
       '61400000-0000-4000-8000-000000000201'::uuid and
       '61400000-0000-4000-8000-000000000206'::uuid;
    delete from public.booking_events
     where booking_id between
       '61400000-0000-4000-8000-000000000201'::uuid and
       '61400000-0000-4000-8000-000000000206'::uuid;
    delete from public.booking_capacity_audit
     where booking_id between
       '61400000-0000-4000-8000-000000000201'::uuid and
       '61400000-0000-4000-8000-000000000206'::uuid;
    delete from public.bookings
     where dog_id between
       '61400000-0000-4000-8000-000000000101'::uuid and
       '61400000-0000-4000-8000-000000000106'::uuid;
    delete from public.booking_visits
     where human_id = '$FIXTURE_HUMAN'::uuid;
    delete from public.booking_lineages
     where human_id = '$FIXTURE_HUMAN'::uuid;
    delete from public.dogs
     where id between
       '61400000-0000-4000-8000-000000000101'::uuid and
       '61400000-0000-4000-8000-000000000106'::uuid;
    delete from public.humans where id = '$FIXTURE_HUMAN'::uuid;
    delete from auth.users where id = '$FIXTURE_USER'::uuid;
    delete from public.salon_config where id = '$CONFIG_ID'::uuid;
    commit;" >/dev/null

  remains="$(
    sql --command="
      select count(*)
        from (
          select 1 from public.salon_config where id = '$CONFIG_ID'::uuid
          union all
          select 1 from auth.users where id = '$FIXTURE_USER'::uuid
          union all
          select 1 from public.humans where id = '$FIXTURE_HUMAN'::uuid
          union all
          select 1 from public.dogs where id between
            '61400000-0000-4000-8000-000000000101'::uuid and
            '61400000-0000-4000-8000-000000000106'::uuid
          union all
          select 1 from public.bookings where dog_id between
            '61400000-0000-4000-8000-000000000101'::uuid and
            '61400000-0000-4000-8000-000000000106'::uuid
          union all
          select 1 from public.notification_log where booking_id between
            '61400000-0000-4000-8000-000000000201'::uuid and
            '61400000-0000-4000-8000-000000000206'::uuid
          union all
          select 1 from public.booking_events where booking_id between
            '61400000-0000-4000-8000-000000000201'::uuid and
            '61400000-0000-4000-8000-000000000206'::uuid
          union all
          select 1 from public.booking_capacity_audit where booking_id between
            '61400000-0000-4000-8000-000000000201'::uuid and
            '61400000-0000-4000-8000-000000000206'::uuid
          union all
          select 1 from public.booking_visits
           where human_id = '$FIXTURE_HUMAN'::uuid
          union all
          select 1 from public.booking_lineages
           where human_id = '$FIXTURE_HUMAN'::uuid
        ) fixture_rows;" | trim
  )"
  if [ "$remains" != "0" ]; then
    echo "FAIL: capacity concurrency fixture cleanup left $remains row(s)." >&2
    return 1
  fi

  modes="$(
    sql --command="
      select string_agg(t.tgenabled::text, '' order by expected.ordinality)
        from unnest(array[
               'public.bookings.trg_notify_booking_insert',
               'public.bookings.notify_booking_cancelled_trigger',
               'public.booking_events.trg_staff_push_booking_event'
             ]) with ordinality expected(qualified_name, ordinality)
        join pg_trigger t
          on t.tgname = split_part(expected.qualified_name, '.', 3)
        join pg_class c on c.oid = t.tgrelid
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = split_part(expected.qualified_name, '.', 1)
         and c.relname = split_part(expected.qualified_name, '.', 2)
         and not t.tgisinternal;" | trim
  )"
  if [ "$modes" != "OOO" ]; then
    echo "FAIL: capacity concurrency cleanup did not restore all outbound triggers to origin mode (got '$modes')." >&2
    return 1
  fi
}

cleanup_on_exit() {
  local result=$?
  trap - EXIT INT TERM
  set +e

  concurrency_cleanup_tracked_psql_sessions || result=1
  CONTROLLER_CLIENT_PID=""

  if ! cleanup_fixtures; then
    result=1
  fi
  exit "$result"
}

# A matching row could belong to an interrupted prior run, but its identity
# alone is not enough authority to delete it. Fail closed before installing the
# cleanup trap; every run that starts from an empty namespace cleans up its own
# committed marker on normal exit or failure.
if [ "$(reserved_marker_exists)" = "t" ]; then
  echo "FAIL: the reserved capacity fixture marker already exists; inspect the disposable local database before retrying." >&2
  exit 2
fi

trap cleanup_on_exit EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

"${PSQL[@]}" \
  --set=head_sha="$HEAD_SHA" \
  --set=worktree_state="$WORKTREE_STATE" \
  --set=run_token="$RUN_TOKEN" \
  --set=dblink_password="$PGPASSWORD" <<'SQL' &
begin;
create extension if not exists dblink with schema extensions;
set local search_path = public, extensions, pg_temp;

create or replace function pg_temp.assert_true(
  p_condition boolean,
  p_message text
)
returns void
language plpgsql
as $$
begin
  if not coalesce(p_condition, false) then
    raise exception 'ASSERTION FAILED: %', p_message;
  end if;
  raise notice 'PASS: %', p_message;
end;
$$;

select pg_temp.assert_true(
  (select count(*) = 0 from public.salon_config),
  'the disposable database has no ambiguous salon_config row'
);

select pg_temp.assert_true(
  (
    select count(*) = 3 and bool_and(t.tgenabled = 'O')
      from unnest(array[
             'public.bookings.trg_notify_booking_insert',
             'public.bookings.notify_booking_cancelled_trigger',
             'public.booking_events.trg_staff_push_booking_event'
           ]) expected(qualified_name)
      join pg_trigger t
        on t.tgname = split_part(expected.qualified_name, '.', 3)
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = split_part(expected.qualified_name, '.', 1)
       and c.relname = split_part(expected.qualified_name, '.', 2)
       and not t.tgisinternal
  ),
  'the three outbound triggers start in origin mode'
);

select pg_temp.assert_true(
  (
    select count(*) = 0
      from (
        select 1 from auth.users
         where id = '61400000-0000-4000-8000-000000000001'::uuid
        union all
        select 1 from public.humans
         where id = '61400000-0000-4000-8000-000000000010'::uuid
        union all
        select 1 from public.dogs
         where id between
           '61400000-0000-4000-8000-000000000101'::uuid and
           '61400000-0000-4000-8000-000000000106'::uuid
        union all
        select 1 from public.bookings
         where id between
           '61400000-0000-4000-8000-000000000201'::uuid and
           '61400000-0000-4000-8000-000000000206'::uuid
        union all
        select 1 from public.notification_log
         where booking_id between
           '61400000-0000-4000-8000-000000000201'::uuid and
           '61400000-0000-4000-8000-000000000206'::uuid
        union all
        select 1 from public.booking_events
         where booking_id between
           '61400000-0000-4000-8000-000000000201'::uuid and
           '61400000-0000-4000-8000-000000000206'::uuid
        union all
        select 1 from public.booking_capacity_audit
         where booking_id between
           '61400000-0000-4000-8000-000000000201'::uuid and
           '61400000-0000-4000-8000-000000000206'::uuid
      ) collisions
  ),
  'the reserved synthetic fixture namespace is unused'
);

create temp table _dates (
  scenario text primary key,
  booking_date date not null unique
);

insert into _dates (scenario, booking_date)
select scenario, booking_date
  from (
    select row_number() over (order by candidate_date) as ordinal,
           candidate_date as booking_date
      from generate_series(
             current_date + 7,
             current_date + 70,
             interval '1 day'
           ) candidate(candidate_date)
     where extract(isodow from candidate_date) in (1, 2, 3)
       and not exists (
         select 1 from public.bookings b
          where b.booking_date = candidate_date::date
       )
       and not exists (
         select 1 from public.day_settings ds
          where ds.setting_date = candidate_date::date
       )
     order by candidate_date
     limit 2
  ) dates
  join (values (1, 'same-slot'), (2, 'daily-cap')) scenarios(ordinal, scenario)
    using (ordinal);

select pg_temp.assert_true(
  (select count(*) = 2 from _dates),
  'two empty future open dates are available for the races'
);

create temp table _connection (connstr text not null);
insert into _connection
select format(
  'hostaddr=%L port=%L dbname=%L user=%L password=%L connect_timeout=5 options=%L',
  host(inet_server_addr()),
  current_setting('port'),
  current_database(),
  session_user,
  :'dblink_password',
  '-c statement_timeout=60000 -c lock_timeout=10000'
);

select extensions.dblink_connect(
  'capacity_setup',
  (select connstr || ' application_name=ci_capacity_setup' from _connection)
);

select extensions.dblink_exec(
  'capacity_setup',
  format($setup$
    begin;
    set local role postgres;
    set local session_replication_role = replica;

    alter table public.bookings disable trigger trg_notify_booking_insert;
    alter table public.bookings disable trigger notify_booking_cancelled_trigger;
    alter table public.booking_events disable trigger trg_staff_push_booking_event;

    insert into auth.users (id)
    values ('61400000-0000-4000-8000-000000000001'::uuid);

    insert into public.humans (
      id, name, surname, address, customer_user_id, source,
      approved_at, policies_accepted_at, policies_version
    ) values (
      '61400000-0000-4000-8000-000000000010'::uuid,
      'Capacity Concurrency', 'Fixture', '614 Test Lane',
      '61400000-0000-4000-8000-000000000001'::uuid,
      'existing', now(), now(), 'issue-614-test'
    );

    insert into public.dogs (id, name, breed, human_id, size, is_pregnant)
    values
      ('61400000-0000-4000-8000-000000000101', 'Slot Seed', 'Poodle', '61400000-0000-4000-8000-000000000010', 'small', false),
      ('61400000-0000-4000-8000-000000000102', 'Slot A', 'Poodle', '61400000-0000-4000-8000-000000000010', 'small', false),
      ('61400000-0000-4000-8000-000000000103', 'Slot B', 'Poodle', '61400000-0000-4000-8000-000000000010', 'small', false),
      ('61400000-0000-4000-8000-000000000104', 'Day Seed', 'Poodle', '61400000-0000-4000-8000-000000000010', 'small', false),
      ('61400000-0000-4000-8000-000000000105', 'Day A', 'Poodle', '61400000-0000-4000-8000-000000000010', 'small', false),
      ('61400000-0000-4000-8000-000000000106', 'Day B', 'Poodle', '61400000-0000-4000-8000-000000000010', 'small', false);

    insert into public.salon_config (
      id, enforce_server_capacity, daily_dog_cap, settings
    ) values (
      '61400000-0000-4000-8000-000000000301'::uuid,
      true,
      14,
      jsonb_build_object('capacityConcurrencyRunToken', %L)
    );

    insert into public.bookings (
      id, booking_date, slot, dog_id, size, service, status, source
    ) values
      (
        '61400000-0000-4000-8000-000000000201'::uuid,
        %L::date,
        '10:00',
        '61400000-0000-4000-8000-000000000101'::uuid,
        'small', 'full-groom', 'Booked', 'customer_portal'
      ),
      (
        '61400000-0000-4000-8000-000000000204'::uuid,
        %L::date,
        '08:30',
        '61400000-0000-4000-8000-000000000104'::uuid,
        'small', 'full-groom', 'Booked', 'customer_portal'
      );
    commit;
  $setup$,
    :'run_token',
    (select booking_date from _dates where scenario = 'same-slot'),
    (select booking_date from _dates where scenario = 'daily-cap')
  )
);

create or replace function pg_temp.open_contender(
  p_connection_name text,
  p_application_name text
)
returns void
language plpgsql
as $$
declare
  v_connstr text;
begin
  select connstr || format(' application_name=%s', p_application_name)
    into v_connstr
    from _connection;
  perform extensions.dblink_connect(p_connection_name, v_connstr);
  perform extensions.dblink_exec(
    p_connection_name,
    'begin isolation level read committed'
  );
  perform extensions.dblink_exec(
    p_connection_name,
    'set local statement_timeout = ''20s'''
  );
  perform extensions.dblink_exec(
    p_connection_name,
    'set local "request.jwt.claims" = ''{"sub":"61400000-0000-4000-8000-000000000001","role":"authenticated"}'''
  );
end;
$$;

create or replace function pg_temp.install_insert_probe(
  p_connection_name text
)
returns void
language plpgsql
as $$
begin
  perform extensions.dblink_exec(p_connection_name, $probe$
    create or replace function pg_temp.try_capacity_insert(
      p_id uuid,
      p_booking_date date,
      p_slot text,
      p_dog_id uuid
    )
    returns table (sqlstate text, message text, inserted boolean)
    language plpgsql
    as $function$
    begin
      insert into public.bookings (
        id, booking_date, slot, dog_id, size, service, status, source
      ) values (
        p_id, p_booking_date, p_slot, p_dog_id,
        'small', 'full-groom', 'Booked', 'customer_portal'
      );
      return query select '00000'::text, 'inserted'::text, true;
    exception
      when others then
        return query select sqlstate::text, sqlerrm::text, false;
    end;
    $function$;
  $probe$);
end;
$$;

create temp table _preflight (
  scenario text not null,
  participant text not null,
  backend_pid integer not null,
  target_slot text not null,
  seats_used integer not null,
  day_count integer not null,
  daily_cap integer not null,
  available boolean not null,
  primary key (scenario, participant)
);

create temp table _wait_proof (
  scenario text primary key,
  winner_pid integer not null,
  loser_pid integer not null,
  expected_lock_key bigint not null,
  loser_blocked boolean not null default false
);

-- Same-slot final-seat race.
select pg_temp.open_contender('slot_a', 'ci_capacity_slot_a');
select pg_temp.open_contender('slot_b', 'ci_capacity_slot_b');
select pg_temp.install_insert_probe('slot_b');

select pg_temp.assert_true(
  (
    select bool_and(isolation_level = 'read committed')
      from (values ('slot_a'), ('slot_b')) participant(connection_name)
      cross join lateral extensions.dblink(
        participant.connection_name,
        'show transaction_isolation'
      ) result(isolation_level text)
  ),
  'both same-slot contenders use READ COMMITTED transactions'
);

insert into _preflight
select 'same-slot', participant, backend_pid, '10:00', seats_used,
       day_count, daily_cap, available
  from (values ('a', 'slot_a'), ('b', 'slot_b')) participant(participant, connection_name)
  cross join lateral extensions.dblink(
    participant.connection_name,
    format($preflight$
      select pg_backend_pid(),
             public.get_seats_used(%L::date, '10:00', null),
             (
               select count(*)::integer
                 from public.bookings
                where booking_date = %L::date
                  and status is distinct from 'Cancelled'
             ),
             (select daily_dog_cap from public.salon_config limit 1),
             exists (
               select 1
                 from public.get_small_medium_availability(%L::date, %L::date)
                where slot = '10:00'
             )
    $preflight$,
      (select booking_date from _dates where scenario = 'same-slot'),
      (select booking_date from _dates where scenario = 'same-slot'),
      (select booking_date from _dates where scenario = 'same-slot'),
      (select booking_date from _dates where scenario = 'same-slot')
    )
  ) result(
    backend_pid integer,
    seats_used integer,
    day_count integer,
    daily_cap integer,
    available boolean
  );

select pg_temp.assert_true(
  (
    select count(*) = 2
       and count(distinct backend_pid) = 2
       and bool_and(seats_used = 1)
       and bool_and(day_count = 1)
       and bool_and(daily_cap = 14)
       and bool_and(available)
      from _preflight
     where scenario = 'same-slot'
  ),
  'both distinct same-slot sessions observe the final seat as available'
);

select pg_temp.assert_true(
  (
    select bool_and(not is_staff)
      from (values ('slot_a'), ('slot_b')) participant(connection_name)
      cross join lateral extensions.dblink(
        participant.connection_name,
        'select public.is_staff()'
      ) result(is_staff boolean)
  ),
  'both same-slot contenders exercise the non-staff capacity path'
);

select extensions.dblink_exec(
  'slot_a',
  format($insert$
    insert into public.bookings (
      id, booking_date, slot, dog_id, size, service, status, source
    ) values (
      '61400000-0000-4000-8000-000000000202'::uuid,
      %L::date,
      '10:00',
      '61400000-0000-4000-8000-000000000102'::uuid,
      'small', 'full-groom', 'Booked', 'customer_portal'
    )
  $insert$, (select booking_date from _dates where scenario = 'same-slot'))
);

select pg_temp.assert_true(
  extensions.dblink_send_query(
    'slot_b',
    format($insert$
      select * from pg_temp.try_capacity_insert(
        '61400000-0000-4000-8000-000000000203'::uuid,
        %L::date,
        '10:00',
        '61400000-0000-4000-8000-000000000103'::uuid
      )
    $insert$, (select booking_date from _dates where scenario = 'same-slot'))
  ) = 1,
  'the same-slot loser is dispatched on its independent backend'
);

insert into _wait_proof (
  scenario, winner_pid, loser_pid, expected_lock_key
)
select 'same-slot',
       max(backend_pid) filter (where participant = 'a'),
       max(backend_pid) filter (where participant = 'b'),
       hashtextextended(
         (select booking_date::text from _dates where scenario = 'same-slot')
           || '|10:00',
         0
       )
  from _preflight
 where scenario = 'same-slot';

do $poll_slot$
declare
  v_deadline timestamptz := clock_timestamp() + interval '5 seconds';
begin
  loop
    -- The controller is one long transaction. Clear PostgreSQL's statistics
    -- snapshot so newly opened contender backends and changing wait states are
    -- visible on every poll.
    perform pg_stat_clear_snapshot();

    update _wait_proof proof
       set loser_blocked = exists (
         select 1
           from pg_stat_activity activity
          where activity.pid = proof.loser_pid
            and activity.wait_event_type = 'Lock'
            and activity.wait_event = 'advisory'
            and proof.winner_pid = any(pg_blocking_pids(activity.pid))
            and exists (
              select 1
                from pg_locks waiting
                join pg_locks held
                  on held.locktype = waiting.locktype
                 and held.database is not distinct from waiting.database
                 and held.classid is not distinct from waiting.classid
                 and held.objid is not distinct from waiting.objid
                 and held.objsubid is not distinct from waiting.objsubid
               where waiting.pid = proof.loser_pid
                 and waiting.locktype = 'advisory'
                 and not waiting.granted
                 and waiting.classid = (
                       (proof.expected_lock_key >> 32) & 4294967295
                     )::oid
                 and waiting.objid = (
                       proof.expected_lock_key & 4294967295
                     )::oid
                 and waiting.objsubid = 1
                 and held.pid = proof.winner_pid
                 and held.granted
            )
       )
     where proof.scenario = 'same-slot';

    exit when (
      select loser_blocked from _wait_proof where scenario = 'same-slot'
    );
    exit when clock_timestamp() >= v_deadline;
    perform pg_sleep(0.01);
  end loop;
end;
$poll_slot$;

select pg_temp.assert_true(
  (select loser_blocked from _wait_proof where scenario = 'same-slot'),
  'the same-slot loser waits on the winner production advisory lock'
);

select extensions.dblink_exec('slot_a', 'commit');

do $wait_slot$
declare
  v_deadline timestamptz := clock_timestamp() + interval '5 seconds';
begin
  loop
    exit when extensions.dblink_is_busy('slot_b') = 0;
    if clock_timestamp() >= v_deadline then
      perform extensions.dblink_cancel_query('slot_b');
      raise exception 'same-slot loser did not finish after the winner committed';
    end if;
    perform pg_sleep(0.01);
  end loop;
end;
$wait_slot$;

create temp table _slot_result (
  sqlstate text not null,
  message text not null,
  inserted boolean not null
);
insert into _slot_result
select *
  from extensions.dblink_get_result('slot_b')
    as result(sqlstate text, message text, inserted boolean);
do $drain_slot$
begin
  perform *
    from extensions.dblink_get_result('slot_b')
      as result(sqlstate text, message text, inserted boolean);
end;
$drain_slot$;

select extensions.dblink_exec(
  'slot_b',
  case when (select inserted from _slot_result) then 'commit' else 'rollback' end
);

select pg_temp.assert_true(
  (
    select not inserted
       and sqlstate = 'P0001'
       and message = 'Slot is full'
      from _slot_result
  ),
  'the same-slot loser returns P0001 Slot is full'
);

select pg_temp.assert_true(
  (
    select count(*) = 2
       and count(*) filter (
             where id in (
               '61400000-0000-4000-8000-000000000202'::uuid,
               '61400000-0000-4000-8000-000000000203'::uuid
             )
           ) = 1
       and bool_and(not coalesce(staff_capacity_override, false))
      from public.bookings
     where booking_date = (
             select booking_date from _dates where scenario = 'same-slot'
           )
       and slot = '10:00'
       and status is distinct from 'Cancelled'
  ),
  'the same-slot race commits exactly one contender and ends at two seats'
);

select extensions.dblink_disconnect('slot_a');
select extensions.dblink_disconnect('slot_b');

-- Different-slot race for the date-wide daily cap.
select extensions.dblink_exec(
  'capacity_setup',
  'update public.salon_config set daily_dog_cap = 2 where id = ''61400000-0000-4000-8000-000000000301''::uuid'
);

select pg_temp.open_contender('day_a', 'ci_capacity_day_a');
select pg_temp.open_contender('day_b', 'ci_capacity_day_b');
select pg_temp.install_insert_probe('day_b');

select pg_temp.assert_true(
  (
    select bool_and(isolation_level = 'read committed')
      from (values ('day_a'), ('day_b')) participant(connection_name)
      cross join lateral extensions.dblink(
        participant.connection_name,
        'show transaction_isolation'
      ) result(isolation_level text)
  ),
  'both daily-cap contenders use READ COMMITTED transactions'
);

insert into _preflight
select 'daily-cap', participant, backend_pid, target_slot, seats_used,
       day_count, daily_cap, available
  from (
    values ('a', 'day_a', '10:30'), ('b', 'day_b', '11:30')
  ) participant(participant, connection_name, target_slot)
  cross join lateral extensions.dblink(
    participant.connection_name,
    format($preflight$
      select pg_backend_pid(),
             public.get_seats_used(%L::date, %L, null),
             (
               select count(*)::integer
                 from public.bookings
                where booking_date = %L::date
                  and status is distinct from 'Cancelled'
             ),
             (select daily_dog_cap from public.salon_config limit 1),
             exists (
               select 1
                 from public.get_small_medium_availability(%L::date, %L::date)
                where slot = %L
             )
    $preflight$,
      (select booking_date from _dates where scenario = 'daily-cap'),
      participant.target_slot,
      (select booking_date from _dates where scenario = 'daily-cap'),
      (select booking_date from _dates where scenario = 'daily-cap'),
      (select booking_date from _dates where scenario = 'daily-cap'),
      participant.target_slot
    )
  ) result(
    backend_pid integer,
    seats_used integer,
    day_count integer,
    daily_cap integer,
    available boolean
  );

select pg_temp.assert_true(
  (
    select count(*) = 2
       and count(distinct backend_pid) = 2
       and bool_and(seats_used = 0)
       and bool_and(day_count = 1)
       and bool_and(daily_cap = 2)
       and bool_and(available)
      from _preflight
     where scenario = 'daily-cap'
  ),
  'both distinct daily-cap sessions observe empty physical slots and one remaining day place'
);

select pg_temp.assert_true(
  (
    select bool_and(not is_staff)
      from (values ('day_a'), ('day_b')) participant(connection_name)
      cross join lateral extensions.dblink(
        participant.connection_name,
        'select public.is_staff()'
      ) result(is_staff boolean)
  ),
  'both daily-cap contenders exercise the non-staff capacity path'
);

select extensions.dblink_exec(
  'day_a',
  format($insert$
    insert into public.bookings (
      id, booking_date, slot, dog_id, size, service, status, source
    ) values (
      '61400000-0000-4000-8000-000000000205'::uuid,
      %L::date,
      '10:30',
      '61400000-0000-4000-8000-000000000105'::uuid,
      'small', 'full-groom', 'Booked', 'customer_portal'
    )
  $insert$, (select booking_date from _dates where scenario = 'daily-cap'))
);

select pg_temp.assert_true(
  extensions.dblink_send_query(
    'day_b',
    format($insert$
      select * from pg_temp.try_capacity_insert(
        '61400000-0000-4000-8000-000000000206'::uuid,
        %L::date,
        '11:30',
        '61400000-0000-4000-8000-000000000106'::uuid
      )
    $insert$, (select booking_date from _dates where scenario = 'daily-cap'))
  ) = 1,
  'the daily-cap loser is dispatched on its independent backend'
);

insert into _wait_proof (
  scenario, winner_pid, loser_pid, expected_lock_key
)
select 'daily-cap',
       max(backend_pid) filter (where participant = 'a'),
       max(backend_pid) filter (where participant = 'b'),
       hashtextextended(
         'booking_day_cap|'
           || (select booking_date::text from _dates where scenario = 'daily-cap'),
         0
       )
  from _preflight
 where scenario = 'daily-cap';

do $poll_day$
declare
  v_deadline timestamptz := clock_timestamp() + interval '5 seconds';
begin
  loop
    perform pg_stat_clear_snapshot();

    update _wait_proof proof
       set loser_blocked = exists (
         select 1
           from pg_stat_activity activity
          where activity.pid = proof.loser_pid
            and activity.wait_event_type = 'Lock'
            and activity.wait_event = 'advisory'
            and proof.winner_pid = any(pg_blocking_pids(activity.pid))
            and exists (
              select 1
                from pg_locks waiting
                join pg_locks held
                  on held.locktype = waiting.locktype
                 and held.database is not distinct from waiting.database
                 and held.classid is not distinct from waiting.classid
                 and held.objid is not distinct from waiting.objid
                 and held.objsubid is not distinct from waiting.objsubid
               where waiting.pid = proof.loser_pid
                 and waiting.locktype = 'advisory'
                 and not waiting.granted
                 and waiting.classid = (
                       (proof.expected_lock_key >> 32) & 4294967295
                     )::oid
                 and waiting.objid = (
                       proof.expected_lock_key & 4294967295
                     )::oid
                 and waiting.objsubid = 1
                 and held.pid = proof.winner_pid
                 and held.granted
            )
       )
     where proof.scenario = 'daily-cap';

    exit when (
      select loser_blocked from _wait_proof where scenario = 'daily-cap'
    );
    exit when clock_timestamp() >= v_deadline;
    perform pg_sleep(0.01);
  end loop;
end;
$poll_day$;

select pg_temp.assert_true(
  (select loser_blocked from _wait_proof where scenario = 'daily-cap'),
  'the different-slot loser waits on the winner date-cap advisory lock'
);

select extensions.dblink_exec('day_a', 'commit');

do $wait_day$
declare
  v_deadline timestamptz := clock_timestamp() + interval '5 seconds';
begin
  loop
    exit when extensions.dblink_is_busy('day_b') = 0;
    if clock_timestamp() >= v_deadline then
      perform extensions.dblink_cancel_query('day_b');
      raise exception 'daily-cap loser did not finish after the winner committed';
    end if;
    perform pg_sleep(0.01);
  end loop;
end;
$wait_day$;

create temp table _day_result (
  sqlstate text not null,
  message text not null,
  inserted boolean not null
);
insert into _day_result
select *
  from extensions.dblink_get_result('day_b')
    as result(sqlstate text, message text, inserted boolean);
do $drain_day$
begin
  perform *
    from extensions.dblink_get_result('day_b')
      as result(sqlstate text, message text, inserted boolean);
end;
$drain_day$;

select extensions.dblink_exec(
  'day_b',
  case when (select inserted from _day_result) then 'commit' else 'rollback' end
);

select pg_temp.assert_true(
  (
    select not inserted
       and sqlstate = 'P0001'
       and message = format(
         'Day is fully booked: %s already has 2 dog(s) (maximum 2 per day)',
         to_char(
           (select booking_date from _dates where scenario = 'daily-cap'),
           'DD Mon YYYY'
         )
       )
      from _day_result
  ),
  'the different-slot loser returns the governed P0001 daily-cap rejection'
);

select pg_temp.assert_true(
  (
    select count(*) = 2
       and count(*) filter (
             where id in (
               '61400000-0000-4000-8000-000000000205'::uuid,
               '61400000-0000-4000-8000-000000000206'::uuid
             )
           ) = 1
       and count(*) <= (
             select daily_dog_cap from public.salon_config limit 1
           )
       and bool_and(not coalesce(staff_capacity_override, false))
      from public.bookings
     where booking_date = (
             select booking_date from _dates where scenario = 'daily-cap'
           )
       and status is distinct from 'Cancelled'
  ),
  'the daily-cap race commits exactly one contender and never exceeds two dogs'
);

select extensions.dblink_disconnect('day_a');
select extensions.dblink_disconnect('day_b');

select format(
  'RESULT|same-slot|a|committed|pid=%s|preflight_used=1|final_active=2',
  (select backend_pid from _preflight
    where scenario = 'same-slot' and participant = 'a')
);
select format(
  'RESULT|same-slot|b|rejected|pid=%s|preflight_used=1|sqlstate=%s|message=%s',
  (select backend_pid from _preflight
    where scenario = 'same-slot' and participant = 'b'),
  (select sqlstate from _slot_result),
  (select message from _slot_result)
);
select format(
  'RESULT|daily-cap|a|committed|pid=%s|preflight_day_count=1|final_active=2',
  (select backend_pid from _preflight
    where scenario = 'daily-cap' and participant = 'a')
);
select format(
  'RESULT|daily-cap|b|rejected|pid=%s|preflight_day_count=1|sqlstate=%s|message=%s',
  (select backend_pid from _preflight
    where scenario = 'daily-cap' and participant = 'b'),
  (select sqlstate from _day_result),
  (select message from _day_result)
);
select format(
  'EVIDENCE|sha=%s|worktree=%s|isolation=read committed|sessions=4',
  :'head_sha',
  :'worktree_state'
);

select extensions.dblink_exec('capacity_setup', $cleanup$
  begin;
  set local role postgres;
  set local session_replication_role = replica;

  alter table public.bookings enable trigger trg_notify_booking_insert;
  alter table public.bookings enable trigger notify_booking_cancelled_trigger;
  alter table public.booking_events enable trigger trg_staff_push_booking_event;

  delete from public.notification_log
   where booking_id between
     '61400000-0000-4000-8000-000000000201'::uuid and
     '61400000-0000-4000-8000-000000000206'::uuid;
  delete from public.booking_events
   where booking_id between
     '61400000-0000-4000-8000-000000000201'::uuid and
     '61400000-0000-4000-8000-000000000206'::uuid;
  delete from public.booking_capacity_audit
   where booking_id between
     '61400000-0000-4000-8000-000000000201'::uuid and
     '61400000-0000-4000-8000-000000000206'::uuid;
  delete from public.bookings
   where dog_id between
     '61400000-0000-4000-8000-000000000101'::uuid and
     '61400000-0000-4000-8000-000000000106'::uuid;
  delete from public.booking_visits
   where human_id = '61400000-0000-4000-8000-000000000010'::uuid;
  delete from public.booking_lineages
   where human_id = '61400000-0000-4000-8000-000000000010'::uuid;
  delete from public.dogs
   where id between
     '61400000-0000-4000-8000-000000000101'::uuid and
     '61400000-0000-4000-8000-000000000106'::uuid;
  delete from public.humans
   where id = '61400000-0000-4000-8000-000000000010'::uuid;
  delete from auth.users
   where id = '61400000-0000-4000-8000-000000000001'::uuid;
  delete from public.salon_config
   where id = '61400000-0000-4000-8000-000000000301'::uuid;
  commit;
$cleanup$);

select extensions.dblink_disconnect('capacity_setup');

select pg_temp.assert_true(
  (
    select count(*) = 0
      from (
        select 1 from public.salon_config
         where id = '61400000-0000-4000-8000-000000000301'::uuid
        union all
        select 1 from auth.users
         where id = '61400000-0000-4000-8000-000000000001'::uuid
        union all
        select 1 from public.humans
         where id = '61400000-0000-4000-8000-000000000010'::uuid
        union all
        select 1 from public.dogs
         where id between
           '61400000-0000-4000-8000-000000000101'::uuid and
           '61400000-0000-4000-8000-000000000106'::uuid
        union all
        select 1 from public.bookings
         where dog_id between
           '61400000-0000-4000-8000-000000000101'::uuid and
           '61400000-0000-4000-8000-000000000106'::uuid
        union all
        select 1 from public.notification_log
         where booking_id between
           '61400000-0000-4000-8000-000000000201'::uuid and
           '61400000-0000-4000-8000-000000000206'::uuid
        union all
        select 1 from public.booking_events
         where booking_id between
           '61400000-0000-4000-8000-000000000201'::uuid and
           '61400000-0000-4000-8000-000000000206'::uuid
        union all
        select 1 from public.booking_capacity_audit
         where booking_id between
           '61400000-0000-4000-8000-000000000201'::uuid and
           '61400000-0000-4000-8000-000000000206'::uuid
      ) fixture_rows
  ),
  'all committed capacity fixtures are removed'
);

select pg_temp.assert_true(
  (
    select count(*) = 3 and bool_and(t.tgenabled = 'O')
      from unnest(array[
             'public.bookings.trg_notify_booking_insert',
             'public.bookings.notify_booking_cancelled_trigger',
             'public.booking_events.trg_staff_push_booking_event'
           ]) expected(qualified_name)
      join pg_trigger t
        on t.tgname = split_part(expected.qualified_name, '.', 3)
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = split_part(expected.qualified_name, '.', 1)
       and c.relname = split_part(expected.qualified_name, '.', 2)
       and not t.tgisinternal
  ),
  'all outbound trigger modes are restored exactly'
);

select 'PASS: same-slot and different-slot daily-cap races preserved legal PostgreSQL state.';
rollback;
SQL

CONTROLLER_CLIENT_PID=$!
concurrency_track_psql_pid "$CONTROLLER_CLIENT_PID"

set +e
concurrency_reap_psql_session \
  "$CONTROLLER_CLIENT_PID" \
  "$CAPACITY_CONCURRENCY_TIMEOUT_SECONDS" \
  "capacity concurrency controller"
controller_result=$?
set -e
CONTROLLER_CLIENT_PID=""

if [ "$controller_result" -ne 0 ]; then
  exit "$controller_result"
fi

trap - EXIT INT TERM
cleanup_fixtures

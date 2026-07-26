#!/usr/bin/env bash
#
# Deterministic duplicate-submission gate for the atomic WhatsApp reschedule.
#
# pgTAP runs each file in one transaction, so it cannot prove that two database
# sessions contend on the production flow-token lock. This script creates a
# local-only fixture, pauses the first caller from a test-only BEFORE UPDATE
# trigger (after the RPC has taken its token lock), then proves via
# pg_stat_activity that the second caller is waiting on that advisory lock.
#
# Direct usage:
#   bash scripts/verify-whatsapp-reschedule-concurrency.sh
#
# The defaults target `supabase start`; every value remains overridable.
set -euo pipefail

PGHOST="${PGHOST:-127.0.0.1}"
PGPORT="${PGPORT:-54322}"
PGDATABASE="${PGDATABASE:-postgres}"
PGUSER="${PGUSER:-postgres}"
PGPASSWORD="${PGPASSWORD:-postgres}"
PSQL_BIN="${PSQL_BIN:-psql}"
export PGPASSWORD

case "$PGHOST" in
  127.0.0.1|localhost|::1) ;;
  *)
    echo "FAIL: concurrency gate only accepts a loopback PGHOST; got '$PGHOST'." >&2
    echo "Refusing to install test fixtures or enqueue notifications on a remote database." >&2
    exit 2
    ;;
esac

if ! command -v "$PSQL_BIN" >/dev/null 2>&1; then
  echo "FAIL: required PostgreSQL client '$PSQL_BIN' was not found in PATH." >&2
  exit 2
fi
if ! command -v timeout >/dev/null 2>&1; then
  echo "FAIL: required GNU timeout command was not found in PATH." >&2
  exit 2
fi

PSQL=(
  "$PSQL_BIN"
  --host="$PGHOST"
  --port="$PGPORT"
  --username="$PGUSER"
  --dbname="$PGDATABASE"
  --no-psqlrc
  --set=ON_ERROR_STOP=1
  --quiet
  --tuples-only
  --no-align
)

FIXTURE_USER="99000000-0000-4000-8000-000000000001"
FIXTURE_HUMAN="99000000-0000-4000-8000-0000000000b1"
FIXTURE_DOG="99000000-0000-4000-8000-0000000000c1"
ORIGINAL_BOOKING="99000000-0000-4000-8000-0000000000d1"
ORIGINAL_GROUP="99000000-0000-4000-8000-0000000000e1"
FLOW_TOKEN="ci-wa-reschedule-race-token"
FIRST_APP="ci_wa_reschedule_first"
SECOND_APP="ci_wa_reschedule_second"
DELAY_SECONDS="${CONCURRENCY_DELAY_SECONDS:-15}"
POLL_ATTEMPTS="${CONCURRENCY_POLL_ATTEMPTS:-100}"
POLL_INTERVAL="${CONCURRENCY_POLL_INTERVAL:-0.1}"
RPC_TIMEOUT_SECONDS="${CONCURRENCY_RPC_TIMEOUT_SECONDS:-45}"
VAULT_DESCRIPTION="ci-wa-reschedule-concurrency"

if [[ ! "$DELAY_SECONDS" =~ ^[0-9]+([.][0-9]+)?$ ]] ||
   [[ ! "$POLL_ATTEMPTS" =~ ^[1-9][0-9]*$ ]] ||
   [[ ! "$POLL_INTERVAL" =~ ^[0-9]+([.][0-9]+)?$ ]] ||
   [[ ! "$RPC_TIMEOUT_SECONDS" =~ ^[1-9][0-9]*$ ]]; then
  echo "FAIL: delay/interval must be non-negative numbers; poll attempts and RPC timeout must be positive integers." >&2
  exit 2
fi

TMP_ROOT="${TMPDIR:-/tmp}"
RUN_DIR="$(mktemp -d "$TMP_ROOT/wa-reschedule-concurrency.XXXXXX")"
FIRST_OUT="$RUN_DIR/first.out"
SECOND_OUT="$RUN_DIR/second.out"
FIRST_PID=""
SECOND_PID=""
TEST_URL_SECRET_ID=""
TEST_WEBHOOK_SECRET_ID=""
DB_SETUP_STARTED=0

sql() {
  "${PSQL[@]}" "$@"
}

trim() {
  tr -d '[:space:]'
}

dump_activity() {
  echo "Relevant pg_stat_activity rows:" >&2
  sql --command="
    select pid, application_name, state,
           coalesce(wait_event_type, '-'), coalesce(wait_event, '-'),
           coalesce(array_to_string(pg_blocking_pids(pid), ','), '-')
      from pg_stat_activity
     where application_name in ('$FIRST_APP', '$SECOND_APP')
     order by application_name;" >&2 || true
}

dump_client_outputs() {
  echo "FIRST CLIENT OUTPUT:" >&2
  cat "$FIRST_OUT" >&2 || true
  echo "SECOND CLIENT OUTPUT:" >&2
  cat "$SECOND_OUT" >&2 || true
}

terminate_named_backends() {
  sql --command="
    select pg_terminate_backend(pid)
      from pg_stat_activity
     where pid <> pg_backend_pid()
       and application_name in ('$FIRST_APP', '$SECOND_APP');" \
    >/dev/null
}

cleanup() {
  local result=$?
  local cleanup_failed=0
  trap - EXIT
  set +e

  if [ "$DB_SETUP_STARTED" = "1" ]; then
    terminate_named_backends || cleanup_failed=1
  fi

  if [ -n "$SECOND_PID" ]; then
    kill "$SECOND_PID" 2>/dev/null || true
    wait "$SECOND_PID" 2>/dev/null || true
  fi
  if [ -n "$FIRST_PID" ]; then
    kill "$FIRST_PID" 2>/dev/null || true
    wait "$FIRST_PID" 2>/dev/null || true
  fi

  if [ "$DB_SETUP_STARTED" = "1" ]; then
    sql --command="
      drop trigger if exists zz_ci_wa_reschedule_delay on public.bookings;
      drop function if exists public.zz_ci_wa_reschedule_delay();" \
      >/dev/null || cleanup_failed=1
    sql --command="
      delete from public.booking_capacity_audit
       where booking_id = '$ORIGINAL_BOOKING'::uuid
          or booking_id = any (
               select unnest(new_booking_ids)
                 from public.whatsapp_reschedule_receipts
                where flow_token = '$FLOW_TOKEN'
             );
      delete from public.booking_events
       where booking_id = '$ORIGINAL_BOOKING'::uuid
          or booking_id = any (
               select unnest(new_booking_ids)
                 from public.whatsapp_reschedule_receipts
                where flow_token = '$FLOW_TOKEN'
             );
      delete from public.whatsapp_reschedule_receipts where flow_token = '$FLOW_TOKEN';
      delete from public.bookings where dog_id = '$FIXTURE_DOG'::uuid;
      delete from public.dogs where id = '$FIXTURE_DOG'::uuid;
      delete from public.humans where id = '$FIXTURE_HUMAN'::uuid;
      delete from public.staff_profiles where user_id = '$FIXTURE_USER'::uuid;
      delete from auth.users where id = '$FIXTURE_USER'::uuid;" >/dev/null || cleanup_failed=1
  fi

  if [ -n "$TEST_URL_SECRET_ID" ]; then
    sql --command="delete from vault.secrets where id = '$TEST_URL_SECRET_ID'::uuid;" \
      >/dev/null || cleanup_failed=1
  fi
  if [ -n "$TEST_WEBHOOK_SECRET_ID" ]; then
    sql --command="delete from vault.secrets where id = '$TEST_WEBHOOK_SECRET_ID'::uuid;" \
      >/dev/null || cleanup_failed=1
  fi

  rm -f -- "$FIRST_OUT" "$SECOND_OUT"
  rmdir -- "$RUN_DIR" 2>/dev/null || true

  if [ "$cleanup_failed" = "1" ]; then
    echo "FAIL: test cleanup was incomplete; inspect the local disposable database." >&2
    if [ "$result" = "0" ]; then
      result=1
    fi
  fi
  exit "$result"
}

trap cleanup EXIT
trap 'exit 130' INT TERM

if ! sql --command='select 1;' >/dev/null 2>&1; then
  echo "FAIL: cannot connect to PostgreSQL at $PGHOST:$PGPORT/$PGDATABASE as $PGUSER." >&2
  exit 2
fi

# Fixed fixture identities make assertions and cleanup simple, but they must
# never be treated as permission to destroy pre-existing local data. Refuse
# before writing Vault or touching fixtures if any identity/object is occupied.
FIXTURE_COLLISIONS="$(
  sql --command="
    select coalesce(string_agg(collision, ',' order by collision), '')
      from (
        select 'delay-trigger' as collision
         where exists (
           select 1
             from pg_trigger t
             join pg_class c on c.oid = t.tgrelid
             join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public'
              and c.relname = 'bookings'
              and t.tgname = 'zz_ci_wa_reschedule_delay'
              and not t.tgisinternal
         )
        union all
        select 'delay-function'
         where to_regprocedure('public.zz_ci_wa_reschedule_delay()') is not null
        union all
        select 'auth-user' where exists (
          select 1 from auth.users where id = '$FIXTURE_USER'::uuid
        )
        union all
        select 'staff-profile' where exists (
          select 1 from public.staff_profiles where user_id = '$FIXTURE_USER'::uuid
        )
        union all
        select 'human' where exists (
          select 1 from public.humans where id = '$FIXTURE_HUMAN'::uuid
        )
        union all
        select 'dog' where exists (
          select 1 from public.dogs where id = '$FIXTURE_DOG'::uuid
        )
        union all
        select 'booking' where exists (
          select 1
            from public.bookings
           where id = '$ORIGINAL_BOOKING'::uuid
              or dog_id = '$FIXTURE_DOG'::uuid
              or group_id = '$ORIGINAL_GROUP'::uuid
        )
        union all
        select 'receipt' where exists (
          select 1
            from public.whatsapp_reschedule_receipts
           where flow_token = '$FLOW_TOKEN'
        )
        union all
        select 'flow-session' where exists (
          select 1
            from public.whatsapp_flow_sessions
           where flow_token = '$FLOW_TOKEN'
        )
        union all
        select 'booking-event' where exists (
          select 1
            from public.booking_events
           where booking_id = '$ORIGINAL_BOOKING'::uuid
        )
        union all
        select 'capacity-audit' where exists (
          select 1
            from public.booking_capacity_audit
           where booking_id = '$ORIGINAL_BOOKING'::uuid
        )
        union all
        select 'named-session' where exists (
          select 1
            from pg_stat_activity
           where application_name in ('$FIRST_APP', '$SECOND_APP')
        )
      ) collisions;" | trim
)"
if [ -n "$FIXTURE_COLLISIONS" ]; then
  echo "FAIL: fixed concurrency fixture identities are already in use: $FIXTURE_COLLISIONS." >&2
  echo "Refusing to drop or delete pre-existing local state; use a fresh local stack." >&2
  exit 2
fi

# Do not inspect, reuse, or overwrite any existing credential. CI's disposable
# stack has no Vault data after pgTAP rolls back. If a developer's local stack
# does, stop rather than risk turning this fixture into a production request.
EXISTING_VAULT_NAMES="$(
  sql --command="
    select count(*)
      from vault.secrets
     where name in ('supabase_url', 'webhook_secret');" | trim
)"
if [ "$EXISTING_VAULT_NAMES" != "0" ]; then
  echo "FAIL: local Vault already contains supabase_url or webhook_secret." >&2
  echo "The gate refuses to read or overwrite existing credentials; use a fresh 'supabase start' stack." >&2
  exit 2
fi

# Keep every production business trigger active, including booking_events.
# Notification triggers therefore execute their real paths, but all requests
# are directed to a closed loopback port and carry a test-only token.
TEST_URL_SECRET_ID="$(
  sql --command="
    select vault.create_secret(
      'http://127.0.0.1:1',
      'supabase_url',
      '$VAULT_DESCRIPTION'
    );" | trim
)"
TEST_WEBHOOK_SECRET_ID="$(
  sql --command="
    select vault.create_secret(
      'ci-not-a-credential',
      'webhook_secret',
      '$VAULT_DESCRIPTION'
    );" | trim
)"

DB_SETUP_STARTED=1
sql <<SQL
delete from public.booking_capacity_audit
 where booking_id = '$ORIGINAL_BOOKING'::uuid
    or booking_id = any (
         select unnest(new_booking_ids)
           from public.whatsapp_reschedule_receipts
          where flow_token = '$FLOW_TOKEN'
       );
delete from public.booking_events
 where booking_id = '$ORIGINAL_BOOKING'::uuid
    or booking_id = any (
         select unnest(new_booking_ids)
           from public.whatsapp_reschedule_receipts
          where flow_token = '$FLOW_TOKEN'
       );
delete from public.whatsapp_reschedule_receipts where flow_token = '$FLOW_TOKEN';
delete from public.bookings where dog_id = '$FIXTURE_DOG'::uuid;
delete from public.dogs where id = '$FIXTURE_DOG'::uuid;
delete from public.humans where id = '$FIXTURE_HUMAN'::uuid;
delete from public.staff_profiles where user_id = '$FIXTURE_USER'::uuid;
delete from auth.users where id = '$FIXTURE_USER'::uuid;

insert into auth.users (id)
values ('$FIXTURE_USER'::uuid);

insert into public.staff_profiles (user_id, role)
values ('$FIXTURE_USER'::uuid, 'owner');

insert into public.humans (id, name, surname)
values ('$FIXTURE_HUMAN'::uuid, 'Concurrency', 'Fixture');

insert into public.dogs (id, name, breed, size, human_id)
values ('$FIXTURE_DOG'::uuid, 'Race', 'Poodle', 'small', '$FIXTURE_HUMAN'::uuid);

create function public.zz_ci_wa_reschedule_delay()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as \$delay\$
begin
  if current_setting('application_name', true) = '$FIRST_APP'
     and old.id = '$ORIGINAL_BOOKING'::uuid
     and old.status is distinct from new.status
     and new.status = 'Cancelled'
  then
    perform pg_sleep($DELAY_SECONDS);
  end if;
  return new;
end;
\$delay\$;

create trigger zz_ci_wa_reschedule_delay
  before update on public.bookings
  for each row execute function public.zz_ci_wa_reschedule_delay();
SQL

SOURCE_DATE="$(
  sql --command="
    select d::text
      from (
        select generate_series(current_date + 90, current_date + 97, interval '1 day')::date d
      ) dates
     where extract(isodow from d) <= 3
     order by d
     limit 1;" | trim
)"
TARGET_DATE="$(
  sql --command="
    select d::text
      from (
        select generate_series(current_date + 120, current_date + 127, interval '1 day')::date d
      ) dates
     where extract(isodow from d) <= 3
     order by d
     limit 1;" | trim
)"
if [ -z "$SOURCE_DATE" ] || [ -z "$TARGET_DATE" ]; then
  echo "FAIL: could not choose deterministic fixture dates." >&2
  exit 1
fi

sql --command="
  do \$claims\$
  begin
    perform set_config(
      'request.jwt.claims',
      '{\"sub\":\"$FIXTURE_USER\",\"role\":\"authenticated\"}',
      false
    );
  end
  \$claims\$;
  insert into public.bookings
    (id, booking_date, slot, dog_id, size, service, status, group_id, source)
  values
    ('$ORIGINAL_BOOKING'::uuid, '$SOURCE_DATE'::date, '09:00',
     '$FIXTURE_DOG'::uuid, 'small', 'full-groom', 'Booked',
     '$ORIGINAL_GROUP'::uuid, 'whatsapp_flow');" >/dev/null

CALL_SQL="
do \$claims\$
begin
  perform set_config(
    'request.jwt.claims',
    '{\"sub\":\"$FIXTURE_USER\",\"role\":\"authenticated\"}',
    false
  );
end
\$claims\$;
select replayed
  from public.reschedule_whatsapp_booking_group(
    jsonb_build_array(
      jsonb_build_object(
        'dog_id', '$FIXTURE_DOG',
        'slot', '10:00',
        'service', 'full-groom'
      )
    ),
    '$TARGET_DATE'::date,
    '$FIXTURE_HUMAN'::uuid,
    '$ORIGINAL_GROUP'::uuid,
    null,
    null,
    'Rescheduled via WhatsApp',
    '$FLOW_TOKEN'
  );"

run_rpc() {
  local application_name=$1
  PGAPPNAME="$application_name" timeout \
    --signal=TERM \
    --kill-after=5s \
    "${RPC_TIMEOUT_SECONDS}s" \
    "${PSQL[@]}" \
    --command="$CALL_SQL"
}

run_rpc "$FIRST_APP" >"$FIRST_OUT" 2>&1 &
FIRST_PID=$!

FIRST_READY=0
FIRST_STATE="missing"
for ((attempt = 1; attempt <= POLL_ATTEMPTS; attempt++)); do
  FIRST_STATE="$(
    sql --command="
      select coalesce(
        (
          select case
                   when wait_event_type = 'Timeout' and wait_event = 'PgSleep'
                     then 'sleeping'
                   else coalesce(state, '-') || '/' ||
                        coalesce(wait_event_type, '-') || '/' ||
                        coalesce(wait_event, '-')
                 end
            from pg_stat_activity
           where application_name = '$FIRST_APP'
           limit 1
        ),
        'missing'
      );" | trim
  )"
  if [ "$FIRST_STATE" = "sleeping" ]; then
    FIRST_READY=1
    break
  fi
  sleep "$POLL_INTERVAL"
done
if [ "$FIRST_READY" != "1" ]; then
  echo "FAIL: first caller never reached the test delay after acquiring the token lock (last state: $FIRST_STATE)." >&2
  cat "$FIRST_OUT" >&2 || true
  dump_activity
  exit 1
fi

run_rpc "$SECOND_APP" >"$SECOND_OUT" 2>&1 &
SECOND_PID=$!

CONTENTION_PROVED=0
SECOND_STATE="missing"
for ((attempt = 1; attempt <= POLL_ATTEMPTS; attempt++)); do
  SECOND_STATE="$(
    sql --command="
      select coalesce(
        (
          select case
                   when contender.wait_event_type = 'Lock'
                    and contender.wait_event = 'advisory'
                    and blocker.pid = any(pg_blocking_pids(contender.pid))
                     then 'waiting-on-first-advisory'
                   else coalesce(contender.state, '-') || '/' ||
                        coalesce(contender.wait_event_type, '-') || '/' ||
                        coalesce(contender.wait_event, '-')
                 end
            from pg_stat_activity contender
            join pg_stat_activity blocker
              on blocker.application_name = '$FIRST_APP'
           where contender.application_name = '$SECOND_APP'
           limit 1
        ),
        'missing'
      );" | trim
  )"
  if [ "$SECOND_STATE" = "waiting-on-first-advisory" ]; then
    CONTENTION_PROVED=1
    break
  fi
  sleep "$POLL_INTERVAL"
done
if [ "$CONTENTION_PROVED" != "1" ]; then
  echo "FAIL: no bounded pg_stat_activity proof that the second caller waited on the first caller's advisory lock (last state: $SECOND_STATE)." >&2
  cat "$FIRST_OUT" >&2 || true
  cat "$SECOND_OUT" >&2 || true
  dump_activity
  exit 1
fi

# Give both named RPC sessions a fresh bounded window to commit/replay after
# contention has been proven. This makes the waits below observational only:
# they cannot be reached while a database client is still active indefinitely.
COMPLETION_DEADLINE=$((SECONDS + RPC_TIMEOUT_SECONDS))
while :; do
  ACTIVE_RPC_SESSIONS="$(
    sql --command="
      select count(*)
        from pg_stat_activity
       where application_name in ('$FIRST_APP', '$SECOND_APP');" | trim
  )"
  if [ "$ACTIVE_RPC_SESSIONS" = "0" ]; then
    break
  fi
  if ((SECONDS >= COMPLETION_DEADLINE)); then
    echo "FAIL: post-contention RPC completion deadline of ${RPC_TIMEOUT_SECONDS}s expired with $ACTIVE_RPC_SESSIONS named session(s) active." >&2
    dump_activity
    dump_client_outputs
    terminate_named_backends || true
    exit 1
  fi
  sleep "$POLL_INTERVAL"
done

set +e
wait "$FIRST_PID"
FIRST_STATUS=$?
wait "$SECOND_PID"
SECOND_STATUS=$?
FIRST_PID=""
SECOND_PID=""
set -e
if [ "$FIRST_STATUS" = "124" ] || [ "$SECOND_STATUS" = "124" ]; then
  echo "FAIL: RPC completion deadline of ${RPC_TIMEOUT_SECONDS}s expired (first=$FIRST_STATUS second=$SECOND_STATUS)." >&2
  dump_activity
  dump_client_outputs
  terminate_named_backends || true
  exit 1
fi
if [ "$FIRST_STATUS" != "0" ] || [ "$SECOND_STATUS" != "0" ]; then
  echo "FAIL: RPC caller exited non-zero (first=$FIRST_STATUS second=$SECOND_STATUS)." >&2
  dump_client_outputs
  exit 1
fi

FIRST_RESULT="$(trim < "$FIRST_OUT")"
SECOND_RESULT="$(trim < "$SECOND_OUT")"
FAIL=0

if [ "$FIRST_RESULT$SECOND_RESULT" != "ft" ] &&
   [ "$FIRST_RESULT$SECOND_RESULT" != "tf" ]; then
  echo "FAIL: expected one perform and one replay (first=$FIRST_RESULT second=$SECOND_RESULT)." >&2
  FAIL=1
fi

RECEIPTS="$(
  sql --command="
    select count(*)
      from public.whatsapp_reschedule_receipts
     where flow_token = '$FLOW_TOKEN';" | trim
)"
if [ "$RECEIPTS" != "1" ]; then
  echo "FAIL: expected 1 receipt, found $RECEIPTS." >&2
  FAIL=1
fi

LIVE="$(
  sql --command="
    select count(*)
      from public.bookings b
      join public.dogs d on d.id = b.dog_id
     where d.human_id = '$FIXTURE_HUMAN'::uuid
       and b.status = 'Booked';" | trim
)"
if [ "$LIVE" != "1" ]; then
  echo "FAIL: expected exactly 1 live replacement booking, found $LIVE." >&2
  FAIL=1
fi

ORIGINAL_LIVE="$(
  sql --command="
    select count(*)
      from public.bookings
     where id = '$ORIGINAL_BOOKING'::uuid
       and status = 'Booked';" | trim
)"
if [ "$ORIGINAL_LIVE" != "0" ]; then
  echo "FAIL: original booking is still active after the reschedule." >&2
  FAIL=1
fi

STORED_IDS="$(
  sql --command="
    select array_to_string(new_booking_ids, ',')
      from public.whatsapp_reschedule_receipts
     where flow_token = '$FLOW_TOKEN';" | trim
)"
LIVE_IDS="$(
  sql --command="
    select array_to_string(array_agg(b.id order by b.id), ',')
      from public.bookings b
      join public.dogs d on d.id = b.dog_id
     where d.human_id = '$FIXTURE_HUMAN'::uuid
       and b.status = 'Booked';" | trim
)"
if [ -z "$STORED_IDS" ] || [ "$STORED_IDS" != "$LIVE_IDS" ]; then
  echo "FAIL: receipt and surviving booking IDs differ (receipt=$STORED_IDS live=$LIVE_IDS)." >&2
  FAIL=1
fi

if [ "$FAIL" != "0" ]; then
  echo "CONCURRENCY GATE FAILED" >&2
  exit 1
fi

echo "PASS: advisory contention observed; one perform, one replay, one receipt, one live replacement, original cancelled, IDs match."

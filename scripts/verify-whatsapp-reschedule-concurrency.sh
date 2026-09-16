#!/usr/bin/env bash
#
# Deterministic duplicate-submission gate for the atomic WhatsApp reschedule.
#
# pgTAP runs each file in one transaction, so it cannot prove that two database
# sessions contend on the production advisory locks. This script creates a
# local-only fixture, pauses a caller from a test-only BEFORE UPDATE trigger,
# then proves via pg_stat_activity that the other real database session is
# waiting on the expected advisory lock.
#
# Direct usage:
#   CONCURRENCY_LOCAL_STACK_CONFIRMED=1 \
#     bash scripts/verify-whatsapp-reschedule-concurrency.sh
#
# This destructive test is pinned to the exact local `supabase start`
# connection identity. It refuses all connection overrides.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
source "$SCRIPT_DIR/postgres-concurrency-driver.sh"
concurrency_init_local_supabase "WhatsApp reschedule concurrency" "$REPO_ROOT"
PSQL=("${CONCURRENCY_PSQL[@]}")

FIXTURE_USER="99000000-0000-4000-8000-000000000001"
FIXTURE_HUMAN="99000000-0000-4000-8000-0000000000b1"
FIXTURE_DOG="99000000-0000-4000-8000-0000000000c1"
ORIGINAL_BOOKING="99000000-0000-4000-8000-0000000000d1"
ORIGINAL_GROUP="99000000-0000-4000-8000-0000000000e1"
FLOW_TOKEN="ci-wa-reschedule-race-token"
MEMBERSHIP_SOURCE_DOG="99000000-0000-4000-8000-0000000000c2"
MEMBERSHIP_PHANTOM_DOG="99000000-0000-4000-8000-0000000000c3"
MEMBERSHIP_SOURCE_BOOKING="99000000-0000-4000-8000-0000000000d2"
MEMBERSHIP_PHANTOM_BOOKING="99000000-0000-4000-8000-0000000000d3"
MEMBERSHIP_GROUP="99000000-0000-4000-8000-0000000000e2"
MEMBERSHIP_FLOW_TOKEN="ci-wa-reschedule-membership-race-token"
FIRST_APP="ci_wa_reschedule_first"
SECOND_APP="ci_wa_reschedule_second"
MEMBERSHIP_RESCHEDULE_APP="ci_wa_reschedule_membership"
MEMBERSHIP_STAFF_APP="ci_wa_reschedule_staff"
DELAY_SECONDS="${CONCURRENCY_DELAY_SECONDS:-15}"
POLL_ATTEMPTS="${CONCURRENCY_POLL_ATTEMPTS:-100}"
POLL_INTERVAL="${CONCURRENCY_POLL_INTERVAL:-0.1}"
RPC_TIMEOUT_SECONDS="${CONCURRENCY_RPC_TIMEOUT_SECONDS:-45}"
BOOKING_INSERT_TRIGGER_MODE=""
BOOKING_CANCEL_TRIGGER_MODE=""
STAFF_PUSH_TRIGGER_MODE=""

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
MEMBERSHIP_RESCHEDULE_OUT="$RUN_DIR/membership-reschedule.out"
MEMBERSHIP_STAFF_OUT="$RUN_DIR/membership-staff.out"
FIRST_PID=""
SECOND_PID=""
MEMBERSHIP_RESCHEDULE_PID=""
MEMBERSHIP_STAFF_PID=""
DB_SETUP_STARTED=0

sql() {
  concurrency_sql "$@"
}

trim() {
  concurrency_trim
}

dump_activity() {
  echo "Relevant pg_stat_activity rows:" >&2
  sql --command="
    select pid, application_name, state,
           coalesce(wait_event_type, '-'), coalesce(wait_event, '-'),
           coalesce(array_to_string(pg_blocking_pids(pid), ','), '-')
      from pg_stat_activity
     where application_name in (
       '$FIRST_APP', '$SECOND_APP',
       '$MEMBERSHIP_RESCHEDULE_APP', '$MEMBERSHIP_STAFF_APP'
     )
     order by application_name;" >&2 || true
}

dump_client_outputs() {
  echo "FIRST CLIENT OUTPUT:" >&2
  cat "$FIRST_OUT" >&2 || true
  echo "SECOND CLIENT OUTPUT:" >&2
  cat "$SECOND_OUT" >&2 || true
  echo "MEMBERSHIP RESCHEDULE CLIENT OUTPUT:" >&2
  cat "$MEMBERSHIP_RESCHEDULE_OUT" >&2 || true
  echo "MEMBERSHIP STAFF CLIENT OUTPUT:" >&2
  cat "$MEMBERSHIP_STAFF_OUT" >&2 || true
}

terminate_named_backends() {
  concurrency_terminate_named_backends \
    "$FIRST_APP" "$SECOND_APP" \
    "$MEMBERSHIP_RESCHEDULE_APP" "$MEMBERSHIP_STAFF_APP"
}

restore_trigger_mode() {
  local table_name=$1
  local trigger_name=$2
  local trigger_mode=$3
  local action
  case "$trigger_mode" in
    O) action="enable" ;;
    D) action="disable" ;;
    R) action="enable replica" ;;
    A) action="enable always" ;;
    *)
      echo "FAIL: cannot restore unknown trigger mode '$trigger_mode' for $table_name.$trigger_name." >&2
      return 1
      ;;
  esac
  sql --command="alter table public.$table_name $action trigger $trigger_name;" >/dev/null
}

cleanup() {
  local result=$?
  local cleanup_failed=0
  trap - EXIT
  set +e

  if [ "$DB_SETUP_STARTED" = "1" ]; then
    terminate_named_backends || cleanup_failed=1
  fi

  concurrency_cleanup_tracked_psql_sessions || cleanup_failed=1
  FIRST_PID=""
  SECOND_PID=""
  MEMBERSHIP_RESCHEDULE_PID=""
  MEMBERSHIP_STAFF_PID=""

  if [ "$DB_SETUP_STARTED" = "1" ]; then
    sql --command="
      drop trigger if exists zz_ci_wa_reschedule_delay on public.bookings;
      drop function if exists public.zz_ci_wa_reschedule_delay();" \
      >/dev/null || cleanup_failed=1
    sql --command="
      delete from public.booking_capacity_audit
       where booking_id in (
               '$ORIGINAL_BOOKING'::uuid,
               '$MEMBERSHIP_SOURCE_BOOKING'::uuid,
               '$MEMBERSHIP_PHANTOM_BOOKING'::uuid
             )
          or booking_id = any (
               select unnest(new_booking_ids)
                 from public.whatsapp_reschedule_receipts
                where flow_token in ('$FLOW_TOKEN', '$MEMBERSHIP_FLOW_TOKEN')
             );
      delete from public.booking_events
       where booking_id in (
               '$ORIGINAL_BOOKING'::uuid,
               '$MEMBERSHIP_SOURCE_BOOKING'::uuid,
               '$MEMBERSHIP_PHANTOM_BOOKING'::uuid
             )
          or booking_id = any (
               select unnest(new_booking_ids)
                 from public.whatsapp_reschedule_receipts
                where flow_token in ('$FLOW_TOKEN', '$MEMBERSHIP_FLOW_TOKEN')
             );
      delete from public.whatsapp_reschedule_receipts
       where flow_token in ('$FLOW_TOKEN', '$MEMBERSHIP_FLOW_TOKEN');
      delete from public.whatsapp_flow_sessions
       where flow_token in ('$FLOW_TOKEN', '$MEMBERSHIP_FLOW_TOKEN');
      delete from public.bookings
       where dog_id in (
         '$FIXTURE_DOG'::uuid,
         '$MEMBERSHIP_SOURCE_DOG'::uuid,
         '$MEMBERSHIP_PHANTOM_DOG'::uuid
       );
      delete from public.booking_visits
       where human_id = '$FIXTURE_HUMAN'::uuid;
      delete from public.booking_lineages
       where human_id = '$FIXTURE_HUMAN'::uuid;
      delete from public.dogs
       where id in (
         '$FIXTURE_DOG'::uuid,
         '$MEMBERSHIP_SOURCE_DOG'::uuid,
         '$MEMBERSHIP_PHANTOM_DOG'::uuid
       );
      delete from public.humans where id = '$FIXTURE_HUMAN'::uuid;
      delete from public.staff_profiles where user_id = '$FIXTURE_USER'::uuid;
      delete from auth.users where id = '$FIXTURE_USER'::uuid;" >/dev/null || cleanup_failed=1

    FIXTURE_REMAINS="$(
      sql --command="
        select count(*)
          from (
            select 1 from auth.users where id = '$FIXTURE_USER'::uuid
            union all
            select 1 from public.humans where id = '$FIXTURE_HUMAN'::uuid
            union all
            select 1 from public.dogs where id in (
              '$FIXTURE_DOG'::uuid,
              '$MEMBERSHIP_SOURCE_DOG'::uuid,
              '$MEMBERSHIP_PHANTOM_DOG'::uuid
            )
            union all
            select 1 from public.bookings where id in (
              '$ORIGINAL_BOOKING'::uuid,
              '$MEMBERSHIP_SOURCE_BOOKING'::uuid,
              '$MEMBERSHIP_PHANTOM_BOOKING'::uuid
            )
            union all
            select 1 from public.booking_visits
             where human_id = '$FIXTURE_HUMAN'::uuid
            union all
            select 1 from public.booking_lineages
             where human_id = '$FIXTURE_HUMAN'::uuid
            union all
            select 1 from public.whatsapp_reschedule_receipts
             where flow_token in ('$FLOW_TOKEN', '$MEMBERSHIP_FLOW_TOKEN')
            union all
            select 1 from public.whatsapp_flow_sessions
             where flow_token in ('$FLOW_TOKEN', '$MEMBERSHIP_FLOW_TOKEN')
            union all
            select 1
              from pg_trigger t
              join pg_class c on c.oid = t.tgrelid
              join pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'public'
               and c.relname = 'bookings'
               and t.tgname = 'zz_ci_wa_reschedule_delay'
               and not t.tgisinternal
            union all
            select 1
             where to_regprocedure('public.zz_ci_wa_reschedule_delay()') is not null
          ) fixture_rows;" | trim
    )"
    if [ "$FIXTURE_REMAINS" != "0" ]; then
      echo "FAIL: concurrency fixture state was not restored (remaining rows=$FIXTURE_REMAINS)." >&2
      cleanup_failed=1
    fi

    restore_trigger_mode bookings trg_notify_booking_insert \
      "$BOOKING_INSERT_TRIGGER_MODE" || cleanup_failed=1
    restore_trigger_mode bookings notify_booking_cancelled_trigger \
      "$BOOKING_CANCEL_TRIGGER_MODE" || cleanup_failed=1
    restore_trigger_mode booking_events trg_staff_push_booking_event \
      "$STAFF_PUSH_TRIGGER_MODE" || cleanup_failed=1
    restore_trigger_mode booking_events trg_slack_alerts_booking_event \
      "$SLACK_ALERTS_TRIGGER_MODE" || cleanup_failed=1

    RESTORED_TRIGGER_MODES="$(
      sql --command="
        select string_agg(t.tgenabled::text, '' order by expected.ordinality)
          from unnest(array[
                 'public.bookings.trg_notify_booking_insert',
                 'public.bookings.notify_booking_cancelled_trigger',
                 'public.booking_events.trg_staff_push_booking_event',
                 'public.booking_events.trg_slack_alerts_booking_event'
               ]) with ordinality expected(qualified_name, ordinality)
          join pg_trigger t
            on t.tgname = split_part(expected.qualified_name, '.', 3)
          join pg_class c on c.oid = t.tgrelid
          join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = split_part(expected.qualified_name, '.', 1)
           and c.relname = split_part(expected.qualified_name, '.', 2)
           and not t.tgisinternal;" | trim
    )"
    if [ "$RESTORED_TRIGGER_MODES" != \
         "$BOOKING_INSERT_TRIGGER_MODE$BOOKING_CANCEL_TRIGGER_MODE$STAFF_PUSH_TRIGGER_MODE$SLACK_ALERTS_TRIGGER_MODE" ]; then
      echo "FAIL: outbound trigger enabled modes were not restored exactly." >&2
      cleanup_failed=1
    fi
  fi

  rm -f -- "$FIRST_OUT" "$SECOND_OUT" \
    "$MEMBERSHIP_RESCHEDULE_OUT" "$MEMBERSHIP_STAFF_OUT"
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
# before touching fixtures if any identity/object is occupied.
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
        select 'booking-visit' where exists (
          select 1 from public.booking_visits
           where human_id = '$FIXTURE_HUMAN'::uuid
        )
        union all
        select 'booking-lineage' where exists (
          select 1 from public.booking_lineages
           where human_id = '$FIXTURE_HUMAN'::uuid
        )
        union all
        select 'dog' where exists (
          select 1
            from public.dogs
           where id in (
             '$FIXTURE_DOG'::uuid,
             '$MEMBERSHIP_SOURCE_DOG'::uuid,
             '$MEMBERSHIP_PHANTOM_DOG'::uuid
           )
        )
        union all
        select 'booking' where exists (
          select 1
            from public.bookings
           where id in (
                 '$ORIGINAL_BOOKING'::uuid,
                 '$MEMBERSHIP_SOURCE_BOOKING'::uuid,
                 '$MEMBERSHIP_PHANTOM_BOOKING'::uuid
               )
              or dog_id in (
                '$FIXTURE_DOG'::uuid,
                '$MEMBERSHIP_SOURCE_DOG'::uuid,
                '$MEMBERSHIP_PHANTOM_DOG'::uuid
              )
              or group_id in ('$ORIGINAL_GROUP'::uuid, '$MEMBERSHIP_GROUP'::uuid)
        )
        union all
        select 'receipt' where exists (
          select 1
            from public.whatsapp_reschedule_receipts
           where flow_token in ('$FLOW_TOKEN', '$MEMBERSHIP_FLOW_TOKEN')
        )
        union all
        select 'flow-session' where exists (
          select 1
            from public.whatsapp_flow_sessions
           where flow_token in ('$FLOW_TOKEN', '$MEMBERSHIP_FLOW_TOKEN')
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
           where application_name in (
             '$FIRST_APP', '$SECOND_APP',
             '$MEMBERSHIP_RESCHEDULE_APP', '$MEMBERSHIP_STAFF_APP'
           )
        )
      ) collisions;" | trim
)"
if [ -n "$FIXTURE_COLLISIONS" ]; then
  echo "FAIL: fixed concurrency fixture identities are already in use: $FIXTURE_COLLISIONS." >&2
  echo "Refusing to drop or delete pre-existing local state; use a fresh local stack." >&2
  exit 2
fi

# Snapshot pg_net before changing trigger state. The exact four outbound
# notification triggers are disabled for this local fixture; every business
# trigger (capacity, calendar, lifecycle and booking-event emission) remains
# active and is asserted below.
NET_QUEUE_BEFORE="$(sql --command='select count(*) from net.http_request_queue;' | trim)"
NET_RESPONSE_BEFORE="$(sql --command='select count(*) from net._http_response;' | trim)"

BOOKING_INSERT_TRIGGER_MODE="$(
  sql --command="
    select t.tgenabled
      from pg_trigger t
     where t.tgrelid = 'public.bookings'::regclass
       and t.tgname = 'trg_notify_booking_insert'
       and not t.tgisinternal;" | trim
)"
BOOKING_CANCEL_TRIGGER_MODE="$(
  sql --command="
    select t.tgenabled
      from pg_trigger t
     where t.tgrelid = 'public.bookings'::regclass
       and t.tgname = 'notify_booking_cancelled_trigger'
       and not t.tgisinternal;" | trim
)"
STAFF_PUSH_TRIGGER_MODE="$(
  sql --command="
    select t.tgenabled
      from pg_trigger t
     where t.tgrelid = 'public.booking_events'::regclass
       and t.tgname = 'trg_staff_push_booking_event'
       and not t.tgisinternal;" | trim
)"
SLACK_ALERTS_TRIGGER_MODE="$(
  sql --command="
    select t.tgenabled
      from pg_trigger t
     where t.tgrelid = 'public.booking_events'::regclass
       and t.tgname = 'trg_slack_alerts_booking_event'
       and not t.tgisinternal;" | trim
)"
for trigger_mode in \
  "$BOOKING_INSERT_TRIGGER_MODE" \
  "$BOOKING_CANCEL_TRIGGER_MODE" \
  "$STAFF_PUSH_TRIGGER_MODE" \
  "$SLACK_ALERTS_TRIGGER_MODE"; do
  if [[ ! "$trigger_mode" =~ ^[ODRA]$ ]]; then
    echo "FAIL: one of the exact outbound notification triggers is missing or has an unknown enabled mode." >&2
    exit 2
  fi
done

DB_SETUP_STARTED=1
sql --command="
  alter table public.bookings disable trigger trg_notify_booking_insert;
  alter table public.bookings disable trigger notify_booking_cancelled_trigger;
  alter table public.booking_events disable trigger trg_staff_push_booking_event;
  alter table public.booking_events disable trigger trg_slack_alerts_booking_event;" \
  >/dev/null

sql <<SQL
delete from public.booking_capacity_audit
 where booking_id in (
         '$ORIGINAL_BOOKING'::uuid,
         '$MEMBERSHIP_SOURCE_BOOKING'::uuid,
         '$MEMBERSHIP_PHANTOM_BOOKING'::uuid
       )
    or booking_id = any (
         select unnest(new_booking_ids)
           from public.whatsapp_reschedule_receipts
          where flow_token in ('$FLOW_TOKEN', '$MEMBERSHIP_FLOW_TOKEN')
       );
delete from public.booking_events
 where booking_id in (
         '$ORIGINAL_BOOKING'::uuid,
         '$MEMBERSHIP_SOURCE_BOOKING'::uuid,
         '$MEMBERSHIP_PHANTOM_BOOKING'::uuid
       )
    or booking_id = any (
         select unnest(new_booking_ids)
           from public.whatsapp_reschedule_receipts
          where flow_token in ('$FLOW_TOKEN', '$MEMBERSHIP_FLOW_TOKEN')
       );
delete from public.whatsapp_reschedule_receipts
 where flow_token in ('$FLOW_TOKEN', '$MEMBERSHIP_FLOW_TOKEN');
delete from public.whatsapp_flow_sessions
 where flow_token in ('$FLOW_TOKEN', '$MEMBERSHIP_FLOW_TOKEN');
delete from public.bookings
 where dog_id in (
   '$FIXTURE_DOG'::uuid,
   '$MEMBERSHIP_SOURCE_DOG'::uuid,
   '$MEMBERSHIP_PHANTOM_DOG'::uuid
 );
delete from public.booking_visits
 where human_id = '$FIXTURE_HUMAN'::uuid;
delete from public.booking_lineages
 where human_id = '$FIXTURE_HUMAN'::uuid;
delete from public.dogs
 where id in (
   '$FIXTURE_DOG'::uuid,
   '$MEMBERSHIP_SOURCE_DOG'::uuid,
   '$MEMBERSHIP_PHANTOM_DOG'::uuid
 );
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
values
  ('$FIXTURE_DOG'::uuid, 'Race', 'Poodle', 'small', '$FIXTURE_HUMAN'::uuid),
  ('$MEMBERSHIP_SOURCE_DOG'::uuid, 'Membership Source', 'Poodle', 'small', '$FIXTURE_HUMAN'::uuid),
  ('$MEMBERSHIP_PHANTOM_DOG'::uuid, 'Membership Phantom', 'Poodle', 'small', '$FIXTURE_HUMAN'::uuid);

insert into public.whatsapp_flow_sessions
  (flow_token, phone_e164, human_id, flow_type, status)
values
  ('$FLOW_TOKEN', '+447700900001', '$FIXTURE_HUMAN'::uuid, 'cancel_reschedule', 'active'),
  ('$MEMBERSHIP_FLOW_TOKEN', '+447700900002', '$FIXTURE_HUMAN'::uuid, 'cancel_reschedule', 'active');

create function public.zz_ci_wa_reschedule_delay()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as \$delay\$
begin
  if current_setting('application_name', true) in ('$FIRST_APP', '$MEMBERSHIP_RESCHEDULE_APP')
     and old.id in ('$ORIGINAL_BOOKING'::uuid, '$MEMBERSHIP_SOURCE_BOOKING'::uuid)
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
    array['$ORIGINAL_BOOKING'::uuid],
    'Rescheduled via WhatsApp',
    '$FLOW_TOKEN',
    '$SOURCE_DATE'::date,
    '09:00',
    jsonb_build_object('$FIXTURE_DOG', 'full-groom'),
    jsonb_build_array(
      jsonb_build_object(
        'booking_id', '$ORIGINAL_BOOKING',
        'dog_id', '$FIXTURE_DOG',
        'booking_date', '$SOURCE_DATE'::date,
        'slot', '09:00',
        'service', 'full-groom'
      )
    )
  );"

concurrency_start_psql_session "$FIRST_APP" "$FIRST_OUT" "$CALL_SQL"
FIRST_PID="$CONCURRENCY_SESSION_PID"

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

concurrency_start_psql_session "$SECOND_APP" "$SECOND_OUT" "$CALL_SQL"
SECOND_PID="$CONCURRENCY_SESSION_PID"

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
if ! concurrency_wait_for_named_backends \
  "$RPC_TIMEOUT_SECONDS" "$POLL_INTERVAL" "$FIRST_APP" "$SECOND_APP"; then
  echo "FAIL: post-contention RPC completion deadline of ${RPC_TIMEOUT_SECONDS}s expired with $CONCURRENCY_ACTIVE_SESSION_COUNT named session(s) active." >&2
  dump_activity
  dump_client_outputs
  terminate_named_backends || true
  exit 1
fi

set +e
concurrency_reap_psql_session \
  "$FIRST_PID" "$RPC_TIMEOUT_SECONDS" "first WhatsApp reschedule client"
FIRST_STATUS=$?
concurrency_reap_psql_session \
  "$SECOND_PID" "$RPC_TIMEOUT_SECONDS" "second WhatsApp reschedule client"
SECOND_STATUS=$?
FIRST_PID=""
SECOND_PID=""
set -e
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

# Install the second scenario only after the original duplicate-submission
# assertions, so its independent live source cannot contaminate their
# one-surviving-booking invariant.
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
    ('$MEMBERSHIP_SOURCE_BOOKING'::uuid, '$SOURCE_DATE'::date, '09:00',
     '$MEMBERSHIP_SOURCE_DOG'::uuid, 'small', 'full-groom', 'Booked',
     '$MEMBERSHIP_GROUP'::uuid, 'whatsapp_flow');" >/dev/null

# A distinct two-session race: the reschedule must take the same exact
# group/date membership lock used by the booking write trigger. The staff
# writer below is a real INSERT through that trigger, not a hand-acquired or
# sequential approximation. It must wait on the first caller's advisory lock;
# after the reschedule commits, the trigger's post-lock revalidation must reject
# the attempted Booked member instead of letting a phantom survive in the old
# visit.
MEMBERSHIP_CALL_SQL="
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
        'dog_id', '$MEMBERSHIP_SOURCE_DOG',
        'slot', '11:00',
        'service', 'full-groom'
      )
    ),
    '$TARGET_DATE'::date,
    '$FIXTURE_HUMAN'::uuid,
    '$MEMBERSHIP_GROUP'::uuid,
    null,
    array['$MEMBERSHIP_SOURCE_BOOKING'::uuid],
    'Rescheduled via WhatsApp',
    '$MEMBERSHIP_FLOW_TOKEN',
    '$SOURCE_DATE'::date,
    '09:00',
    jsonb_build_object('$MEMBERSHIP_SOURCE_DOG', 'full-groom'),
    jsonb_build_array(
      jsonb_build_object(
        'booking_id', '$MEMBERSHIP_SOURCE_BOOKING',
        'dog_id', '$MEMBERSHIP_SOURCE_DOG',
        'booking_date', '$SOURCE_DATE'::date,
        'slot', '09:00',
        'service', 'full-groom'
      )
    )
  );"

MEMBERSHIP_STAFF_SQL="
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
  ('$MEMBERSHIP_PHANTOM_BOOKING'::uuid, '$SOURCE_DATE'::date, '10:00',
   '$MEMBERSHIP_PHANTOM_DOG'::uuid, 'small', 'full-groom', 'Booked',
   '$MEMBERSHIP_GROUP'::uuid, 'staff');"

concurrency_start_psql_session \
  "$MEMBERSHIP_RESCHEDULE_APP" \
  "$MEMBERSHIP_RESCHEDULE_OUT" \
  "$MEMBERSHIP_CALL_SQL"
MEMBERSHIP_RESCHEDULE_PID="$CONCURRENCY_SESSION_PID"

MEMBERSHIP_FIRST_READY=0
MEMBERSHIP_FIRST_STATE="missing"
for ((attempt = 1; attempt <= POLL_ATTEMPTS; attempt++)); do
  MEMBERSHIP_FIRST_STATE="$(
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
           where application_name = '$MEMBERSHIP_RESCHEDULE_APP'
           limit 1
        ),
        'missing'
      );" | trim
  )"
  if [ "$MEMBERSHIP_FIRST_STATE" = "sleeping" ]; then
    MEMBERSHIP_FIRST_READY=1
    break
  fi
  sleep "$POLL_INTERVAL"
done
if [ "$MEMBERSHIP_FIRST_READY" != "1" ]; then
  echo "FAIL: membership reschedule never reached the test delay (last state: $MEMBERSHIP_FIRST_STATE)." >&2
  dump_client_outputs
  dump_activity
  exit 1
fi

concurrency_start_psql_session \
  "$MEMBERSHIP_STAFF_APP" \
  "$MEMBERSHIP_STAFF_OUT" \
  "$MEMBERSHIP_STAFF_SQL"
MEMBERSHIP_STAFF_PID="$CONCURRENCY_SESSION_PID"

MEMBERSHIP_CONTENTION_PROVED=0
MEMBERSHIP_STAFF_STATE="missing"
for ((attempt = 1; attempt <= POLL_ATTEMPTS; attempt++)); do
  MEMBERSHIP_STAFF_STATE="$(
    sql --command="
      select coalesce(
        (
          select case
                   when contender.wait_event_type = 'Lock'
                    and contender.wait_event = 'advisory'
                    and blocker.pid = any(pg_blocking_pids(contender.pid))
                     then 'waiting-on-membership-advisory'
                   else coalesce(contender.state, '-') || '/' ||
                        coalesce(contender.wait_event_type, '-') || '/' ||
                        coalesce(contender.wait_event, '-')
                 end
            from pg_stat_activity contender
            join pg_stat_activity blocker
              on blocker.application_name = '$MEMBERSHIP_RESCHEDULE_APP'
           where contender.application_name = '$MEMBERSHIP_STAFF_APP'
           limit 1
        ),
        'missing'
      );" | trim
  )"
  if [ "$MEMBERSHIP_STAFF_STATE" = "waiting-on-membership-advisory" ]; then
    MEMBERSHIP_CONTENTION_PROVED=1
    break
  fi
  sleep "$POLL_INTERVAL"
done
if [ "$MEMBERSHIP_CONTENTION_PROVED" != "1" ]; then
  echo "FAIL: no bounded pg_stat_activity proof that the staff INSERT waited on the reschedule's exact customer_booking_cancellation group/date advisory lock (last state: $MEMBERSHIP_STAFF_STATE)." >&2
  dump_client_outputs
  dump_activity
  FAIL=1
fi

if ! concurrency_wait_for_named_backends \
  "$RPC_TIMEOUT_SECONDS" "$POLL_INTERVAL" \
  "$MEMBERSHIP_RESCHEDULE_APP" "$MEMBERSHIP_STAFF_APP"; then
  echo "FAIL: membership race completion deadline of ${RPC_TIMEOUT_SECONDS}s expired with $CONCURRENCY_ACTIVE_SESSION_COUNT named session(s) active." >&2
  dump_activity
  dump_client_outputs
  terminate_named_backends || true
  exit 1
fi

set +e
concurrency_reap_psql_session \
  "$MEMBERSHIP_RESCHEDULE_PID" "$RPC_TIMEOUT_SECONDS" \
  "membership reschedule client"
MEMBERSHIP_RESCHEDULE_STATUS=$?
concurrency_reap_psql_session \
  "$MEMBERSHIP_STAFF_PID" "$RPC_TIMEOUT_SECONDS" \
  "membership staff client"
MEMBERSHIP_STAFF_STATUS=$?
MEMBERSHIP_RESCHEDULE_PID=""
MEMBERSHIP_STAFF_PID=""
set -e
if [ "$MEMBERSHIP_RESCHEDULE_STATUS" != "0" ]; then
  echo "FAIL: membership reschedule caller exited non-zero ($MEMBERSHIP_RESCHEDULE_STATUS)." >&2
  dump_client_outputs
  FAIL=1
fi
if [ "$MEMBERSHIP_STAFF_STATUS" = "0" ] ||
   ! file_contains_fixed_string \
       'booking_visit_already_cancelled' \
       "$MEMBERSHIP_STAFF_OUT"; then
  echo "FAIL: staff insert was not refused after membership-lock revalidation (status=$MEMBERSHIP_STAFF_STATUS)." >&2
  cat "$MEMBERSHIP_STAFF_OUT" >&2 || true
  FAIL=1
fi

MEMBERSHIP_SOURCE_LIVE="$(
  sql --command="
    select count(*)
      from public.bookings
     where id = '$MEMBERSHIP_SOURCE_BOOKING'::uuid
       and status = 'Booked';" | trim
)"
if [ "$MEMBERSHIP_SOURCE_LIVE" != "0" ]; then
  echo "FAIL: membership source booking is still active after the reschedule." >&2
  FAIL=1
fi

MEMBERSHIP_PHANTOM_LIVE="$(
  sql --command="
    select count(*)
      from public.bookings
     where id = '$MEMBERSHIP_PHANTOM_BOOKING'::uuid
       and group_id = '$MEMBERSHIP_GROUP'::uuid
       and booking_date = '$SOURCE_DATE'::date
       and status = 'Booked';" | trim
)"
if [ "$MEMBERSHIP_PHANTOM_LIVE" != "0" ]; then
  echo "FAIL: staff insert left a Booked phantom in the exact old group/date (count=$MEMBERSHIP_PHANTOM_LIVE)." >&2
  FAIL=1
fi

NET_QUEUE_AFTER="$(sql --command='select count(*) from net.http_request_queue;' | trim)"
NET_RESPONSE_AFTER="$(sql --command='select count(*) from net._http_response;' | trim)"
if [ "$NET_QUEUE_AFTER" != "$NET_QUEUE_BEFORE" ] ||
   [ "$NET_RESPONSE_AFTER" != "$NET_RESPONSE_BEFORE" ]; then
  echo "FAIL: committed concurrency gate changed pg_net queue/response state (queue $NET_QUEUE_BEFORE->$NET_QUEUE_AFTER, response $NET_RESPONSE_BEFORE->$NET_RESPONSE_AFTER)." >&2
  FAIL=1
fi

if [ "$FAIL" != "0" ]; then
  echo "CONCURRENCY GATE FAILED" >&2
  exit 1
fi

echo "PASS: flow-token and exact membership advisory contention observed; no Booked old-visit phantom or pg_net delta."

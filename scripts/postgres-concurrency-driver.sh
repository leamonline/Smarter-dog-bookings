#!/usr/bin/env bash
# Shared local PostgreSQL concurrency-driver primitives.
#
# Scenario scripts own their fixtures, transactions and domain assertions. This
# driver owns the safety boundary and process/session mechanics that every real
# multi-session proof must share.

CONCURRENCY_TRACKED_PSQL_PIDS=""
CONCURRENCY_REAPED_PSQL_PIDS=""
CONCURRENCY_TERM_GRACE_SECONDS="${CONCURRENCY_TERM_GRACE_SECONDS:-5}"

concurrency_fail() {
  echo "FAIL: $*" >&2
  return 2
}

concurrency_trim() {
  tr -d '[:space:]'
}

file_contains_fixed_string() {
  grep -F -q -e "$1" "$2"
}

concurrency_worktree_state() {
  local repo_root=$1

  if git -C "$repo_root" diff --quiet --ignore-submodules -- &&
     git -C "$repo_root" diff --cached --quiet --ignore-submodules -- &&
     [ -z "$(git -C "$repo_root" ls-files --others --exclude-standard)" ]; then
    printf '%s\n' clean
  else
    printf '%s\n' dirty
  fi
}

concurrency_validate_positive_integer() {
  local name=$1
  local value=$2

  if [[ ! "$value" =~ ^[1-9][0-9]*$ ]]; then
    concurrency_fail "$name must be a positive integer."
  fi
}

concurrency_init_local_supabase() {
  local gate_label=$1
  local repo_root=$2

  if [ "${CONCURRENCY_LOCAL_STACK_CONFIRMED:-}" != "1" ]; then
    concurrency_fail "set CONCURRENCY_LOCAL_STACK_CONFIRMED=1 to opt in to the destructive local concurrency gate."
    return
  fi

  if [ -n "${PGHOSTADDR:-}" ] ||
     [ -n "${PGSERVICE:-}" ] ||
     [ -n "${PGSERVICEFILE:-}" ] ||
     [ -n "${PGSYSCONFDIR:-}" ]; then
    concurrency_fail "libpq connection indirection variables PGHOSTADDR, PGSERVICE, PGSERVICEFILE, and PGSYSCONFDIR must be unset."
    return
  fi

  PGHOST="${PGHOST:-127.0.0.1}"
  PGPORT="${PGPORT:-54322}"
  PGDATABASE="${PGDATABASE:-postgres}"
  PGUSER="${PGUSER:-postgres}"
  PGPASSWORD="${PGPASSWORD:-postgres}"
  export PGHOST PGPORT PGDATABASE PGUSER PGPASSWORD

  if [ "$PGHOST" != "127.0.0.1" ] ||
     [ "$PGPORT" != "54322" ] ||
     [ "$PGDATABASE" != "postgres" ] ||
     [ "$PGUSER" != "postgres" ] ||
     [ "$PGPASSWORD" != "postgres" ]; then
    concurrency_fail "$gate_label requires the exact local Supabase connection identity 127.0.0.1:54322/postgres as postgres with the default local password. Refusing to connect or mutate because one or more PG* values differ."
    return
  fi

  CONCURRENCY_SUPABASE_BIN="${SUPABASE_BIN:-supabase}"
  if ! command -v "$CONCURRENCY_SUPABASE_BIN" >/dev/null 2>&1; then
    if [ -x "$repo_root/node_modules/.bin/supabase" ]; then
      CONCURRENCY_SUPABASE_BIN="$repo_root/node_modules/.bin/supabase"
    else
      concurrency_fail "required Supabase CLI was not found."
      return
    fi
  fi

  if ! (
    cd -- "$repo_root"
    env -u SUPABASE_ACCESS_TOKEN -u SUPABASE_DB_PASSWORD \
      "$CONCURRENCY_SUPABASE_BIN" status >/dev/null 2>&1
  ); then
    concurrency_fail "supabase status did not confirm a running local stack for this checkout."
    return
  fi

  CONCURRENCY_PSQL_BIN="${PSQL_BIN:-psql}"
  if ! command -v "$CONCURRENCY_PSQL_BIN" >/dev/null 2>&1; then
    if [ -x /opt/homebrew/opt/libpq/bin/psql ]; then
      CONCURRENCY_PSQL_BIN=/opt/homebrew/opt/libpq/bin/psql
    else
      concurrency_fail "required PostgreSQL client '$CONCURRENCY_PSQL_BIN' was not found."
      return
    fi
  fi

  CONCURRENCY_PSQL=(
    "$CONCURRENCY_PSQL_BIN"
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
}

concurrency_sql() {
  "${CONCURRENCY_PSQL[@]}" "$@"
}

concurrency_quote_application_names() {
  local quoted_names=""
  local application_name

  if [ "$#" -eq 0 ]; then
    concurrency_fail "at least one application name is required for backend termination."
    return
  fi

  for application_name in "$@"; do
    if [[ ! "$application_name" =~ ^[A-Za-z0-9_]+$ ]]; then
      concurrency_fail "unsafe PostgreSQL application name '$application_name'."
      return
    fi
    if [ -n "$quoted_names" ]; then
      quoted_names+=", "
    fi
    quoted_names+="'$application_name'"
  done

  CONCURRENCY_QUOTED_APPLICATION_NAMES="$quoted_names"
}

concurrency_start_psql_session() {
  local application_name=$1
  local output_file=$2
  local sql_text=$3

  concurrency_quote_application_names "$application_name" || return

  PGAPPNAME="$application_name" "${CONCURRENCY_PSQL[@]}" \
    --command="$sql_text" >"$output_file" 2>&1 &
  CONCURRENCY_SESSION_PID=$!
  if ! concurrency_track_psql_pid "$CONCURRENCY_SESSION_PID"; then
    kill -KILL "$CONCURRENCY_SESSION_PID" 2>/dev/null || true
    wait "$CONCURRENCY_SESSION_PID" 2>/dev/null || true
    return 2
  fi
}

concurrency_psql_pid_is_tracked() {
  local client_pid=$1
  local tracked_pid

  for tracked_pid in $CONCURRENCY_TRACKED_PSQL_PIDS; do
    if [ "$tracked_pid" = "$client_pid" ]; then
      return 0
    fi
  done
  return 1
}

concurrency_psql_pid_is_reaped() {
  local client_pid=$1
  local reaped_pid

  for reaped_pid in $CONCURRENCY_REAPED_PSQL_PIDS; do
    if [ "$reaped_pid" = "$client_pid" ]; then
      return 0
    fi
  done
  return 1
}

concurrency_track_psql_pid() {
  local client_pid=$1

  concurrency_validate_positive_integer "PostgreSQL client PID" "$client_pid" || return
  if concurrency_psql_pid_is_tracked "$client_pid"; then
    concurrency_fail "PostgreSQL client PID $client_pid is already tracked."
    return
  fi
  CONCURRENCY_TRACKED_PSQL_PIDS="${CONCURRENCY_TRACKED_PSQL_PIDS:+$CONCURRENCY_TRACKED_PSQL_PIDS }$client_pid"
}

concurrency_mark_psql_pid_reaped() {
  local client_pid=$1

  if ! concurrency_psql_pid_is_reaped "$client_pid"; then
    CONCURRENCY_REAPED_PSQL_PIDS="${CONCURRENCY_REAPED_PSQL_PIDS:+$CONCURRENCY_REAPED_PSQL_PIDS }$client_pid"
  fi
}

concurrency_wait_for_named_backends() {
  local timeout_seconds=$1
  local poll_interval=$2
  local deadline
  shift 2

  concurrency_validate_positive_integer \
    "named-backend completion timeout" "$timeout_seconds" || return
  if [[ ! "$poll_interval" =~ ^[0-9]+([.][0-9]+)?$ ]]; then
    concurrency_fail "named-backend poll interval must be a non-negative number."
    return
  fi
  concurrency_quote_application_names "$@" || return

  deadline=$((SECONDS + timeout_seconds))
  while :; do
    CONCURRENCY_ACTIVE_SESSION_COUNT="$(
      concurrency_sql --command="
        select count(*)
          from pg_stat_activity
         where application_name in ($CONCURRENCY_QUOTED_APPLICATION_NAMES);" |
        concurrency_trim
    )"
    if [ "$CONCURRENCY_ACTIVE_SESSION_COUNT" = "0" ]; then
      return 0
    fi
    if ((SECONDS >= deadline)); then
      return 1
    fi
    sleep "$poll_interval"
  done
}

concurrency_terminate_named_backends() {
  concurrency_quote_application_names "$@" || return

  concurrency_sql --command="
    select pg_terminate_backend(pid)
      from pg_stat_activity
     where pid <> pg_backend_pid()
       and application_name in ($CONCURRENCY_QUOTED_APPLICATION_NAMES);" \
    >/dev/null
}

concurrency_start_watchdog() {
  local client_pid=$1
  local timeout_seconds=$2
  local description=$3
  local term_grace_seconds=$CONCURRENCY_TERM_GRACE_SECONDS
  local caller_exit_trap

  concurrency_validate_positive_integer "watchdog client PID" "$client_pid" || return
  concurrency_validate_positive_integer "watchdog timeout" "$timeout_seconds" || return
  concurrency_validate_positive_integer \
    "CONCURRENCY_TERM_GRACE_SECONDS" "$term_grace_seconds" || return

  caller_exit_trap="$(trap -p EXIT)"
  trap - EXIT
  (
    local watchdog_sleep_pid=""

    trap - EXIT
    concurrency_cancel_watchdog() {
      trap - TERM INT
      if [ -n "$watchdog_sleep_pid" ]; then
        kill -TERM "$watchdog_sleep_pid" 2>/dev/null || true
        wait "$watchdog_sleep_pid" 2>/dev/null || true
      fi
      exit 0
    }
    trap concurrency_cancel_watchdog TERM INT

    sleep "$timeout_seconds" &
    watchdog_sleep_pid=$!
    if ! wait "$watchdog_sleep_pid"; then
      exit 0
    fi
    watchdog_sleep_pid=""

    if kill -0 "$client_pid" 2>/dev/null; then
      echo "FAIL: $description exceeded ${timeout_seconds}s; terminating it." >&2
      kill -TERM "$client_pid" 2>/dev/null || true
      sleep "$term_grace_seconds" &
      watchdog_sleep_pid=$!
      if ! wait "$watchdog_sleep_pid"; then
        exit 0
      fi
      watchdog_sleep_pid=""
      if kill -0 "$client_pid" 2>/dev/null; then
        echo "FAIL: $description did not exit within ${term_grace_seconds}s of TERM; killing it." >&2
        kill -KILL "$client_pid" 2>/dev/null || true
      fi
    fi
  ) &
  CONCURRENCY_WATCHDOG_PID=$!
  if [ -n "$caller_exit_trap" ]; then
    eval "$caller_exit_trap"
  fi
}

concurrency_stop_watchdog() {
  local watchdog_pid=$1

  if [ -z "$watchdog_pid" ]; then
    return 0
  fi
  kill "$watchdog_pid" 2>/dev/null || true
  wait "$watchdog_pid" 2>/dev/null || true
}

concurrency_reap_psql_session() {
  local client_pid=$1
  local timeout_seconds=$2
  local description=$3
  local watchdog_pid
  local client_status

  if ! concurrency_psql_pid_is_tracked "$client_pid"; then
    concurrency_fail "PostgreSQL client PID $client_pid is not tracked."
    return
  fi
  if concurrency_psql_pid_is_reaped "$client_pid"; then
    concurrency_fail "PostgreSQL client PID $client_pid has already been reaped."
    return
  fi

  concurrency_start_watchdog \
    "$client_pid" "$timeout_seconds" "$description" || return
  watchdog_pid=$CONCURRENCY_WATCHDOG_PID

  if wait "$client_pid"; then
    client_status=0
  else
    client_status=$?
  fi
  concurrency_stop_watchdog "$watchdog_pid"
  concurrency_mark_psql_pid_reaped "$client_pid"
  return "$client_status"
}

concurrency_cleanup_tracked_psql_sessions() {
  local client_pid
  local has_unreaped_clients=0

  concurrency_validate_positive_integer \
    "CONCURRENCY_TERM_GRACE_SECONDS" "$CONCURRENCY_TERM_GRACE_SECONDS" || return

  for client_pid in $CONCURRENCY_TRACKED_PSQL_PIDS; do
    if ! concurrency_psql_pid_is_reaped "$client_pid"; then
      has_unreaped_clients=1
      kill -TERM "$client_pid" 2>/dev/null || true
    fi
  done

  if [ "$has_unreaped_clients" = "0" ]; then
    return 0
  fi

  sleep "$CONCURRENCY_TERM_GRACE_SECONDS"
  for client_pid in $CONCURRENCY_TRACKED_PSQL_PIDS; do
    if ! concurrency_psql_pid_is_reaped "$client_pid" &&
       kill -0 "$client_pid" 2>/dev/null; then
      kill -KILL "$client_pid" 2>/dev/null || true
    fi
  done

  for client_pid in $CONCURRENCY_TRACKED_PSQL_PIDS; do
    if ! concurrency_psql_pid_is_reaped "$client_pid"; then
      wait "$client_pid" 2>/dev/null || true
      concurrency_mark_psql_pid_reaped "$client_pid"
    fi
  done
}

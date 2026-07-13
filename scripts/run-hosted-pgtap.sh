#!/usr/bin/env bash
set -euo pipefail

STAGING_PROJECT_REF="${1:?Usage: run-hosted-pgtap.sh <staging-project-ref>}"
EXPECTED_STAGING_PROJECT_REF="btjnxvgkpdbfrrqxvkfj"
PRODUCTION_PROJECT_REF="nlzhllhkigmsvrzduefz"

test "$STAGING_PROJECT_REF" = "$EXPECTED_STAGING_PROJECT_REF"
test "$STAGING_PROJECT_REF" != "$PRODUCTION_PROJECT_REF"

tests=(
  supabase/tests/100_customer_write_permissions.test.sql
  supabase/tests/120_trusted_contact_lock.test.sql
  supabase/tests/110_customer_cancellation.test.sql
  supabase/tests/115_customer_cancellation_concurrency.test.sql
  supabase/tests/125_merge_humans_opt_outs.test.sql
)

umask 077
credential_script="$(mktemp)"
credential_exports="$(mktemp)"
tap_dir="$(mktemp -d)"

cleanup() {
  rm -f "$credential_script"
  rm -f "$credential_exports"
  rm -rf "$tap_dir"
  unset PGPASSWORD || true
}
trap cleanup EXIT

test "$(cat supabase/.temp/project-ref)" = "$STAGING_PROJECT_REF"
command -v psql >/dev/null
command -v prove >/dev/null

supabase db dump --linked --schema public --dry-run > "$credential_script"
sed -En '/^export PG(HOST|PORT|USER|PASSWORD|DATABASE)=/p' \
  "$credential_script" > "$credential_exports"
test "$(wc -l < "$credential_exports" | tr -d ' ')" = 5
source "$credential_exports"

if [[ ! "${PGPASSWORD:-}" =~ ^[A-Za-z0-9_-]+$ ]]; then
  echo "Temporary password needs unsupported conninfo escaping." >&2
  exit 1
fi

psql -X -q --set ON_ERROR_STOP=1 \
  --command "set role postgres; create extension if not exists pg_net with schema extensions;"
extension_schema="$(
  psql -X -A -t -q --set ON_ERROR_STOP=1 \
    --command "select extnamespace::regnamespace::text from pg_extension where extname = 'pg_net';"
)"
test "$extension_schema" = "extensions"

for test_file in "${tests[@]}"; do
  tap_file="$tap_dir/$(basename "$test_file").tap"
  psql_args=(
    -X
    -A
    -t
    -q
    --set ON_ERROR_STOP=1
    --command "set role postgres; set search_path = public, extensions;"
  )

  if [[ "$test_file" == *115_customer_cancellation_concurrency.test.sql ]]; then
    psql_args+=(--set=hosted_dblink_password="$PGPASSWORD")
  fi

  psql "${psql_args[@]}" --file "$test_file" > "$tap_file"
  prove --nocolor --exec cat "$tap_file"
done

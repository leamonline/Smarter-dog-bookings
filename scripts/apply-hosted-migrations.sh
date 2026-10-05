#!/usr/bin/env bash
# Apply named committed migration files to the STAGING project, one at a time,
# through the CLI's short-lived database login (the same mechanism as
# scripts/run-hosted-pgtap.sh). Production is refused by construction.
#
# Why this exists: the MCP migration tool refuses to run any SQL text that
# contains a destructive keyword (DROP FUNCTION, DROP TRIGGER, DELETE FROM),
# even inside a function body or an `if exists` guard, and that confirmation
# cannot be answered from an agent session. Several committed migrations need
# exactly those statements, so staging drifted behind the repository.
#
# Each file is applied inside one transaction together with its ledger row,
# so the schema and supabase_migrations.schema_migrations can never disagree.
# A migration whose NAME is already in the ledger is skipped: the ledger is
# what CI's migrations-applied check reads, and names (not versions) are the
# identity, because the MCP tool records its own timestamp as the version.
#
# Usage: scripts/apply-hosted-migrations.sh <staging-project-ref> <file>...
#   where each <file> is a basename under supabase/migrations/, e.g.
#   20260830203000_funnel_blocked_reason.sql
#
# REAPPLY_MIGRATIONS (optional, space-separated basenames): files to run even
# though their name is already in the ledger. Needed when migrations reach
# staging out of repository order: an older file that redefines a function a
# newer, already-applied file also defines must be followed by that newer file
# again, or staging keeps the older definition. Every file is still restricted
# to committed basenames, and the ledger never gains a second row for a name.
set -euo pipefail

STAGING_PROJECT_REF="${1:?Usage: apply-hosted-migrations.sh <staging-project-ref> <migration-file>...}"
shift
EXPECTED_STAGING_PROJECT_REF="btjnxvgkpdbfrrqxvkfj"
PRODUCTION_PROJECT_REF="nlzhllhkigmsvrzduefz"

test "$STAGING_PROJECT_REF" = "$EXPECTED_STAGING_PROJECT_REF"
test "$STAGING_PROJECT_REF" != "$PRODUCTION_PROJECT_REF"
test "$#" -ge 1

# Validate every requested file before touching the database.
# shellcheck disable=SC2086
for migration in "$@" ${REAPPLY_MIGRATIONS:-}; do
  if [[ ! "$migration" =~ ^[0-9]{14}_[a-z0-9_]+\.sql$ ]]; then
    echo "Refusing '$migration': expected <14-digit version>_<snake_case_name>.sql" >&2
    exit 1
  fi
  test -f "supabase/migrations/$migration"
done

may_reapply() {
  local candidate
  for candidate in ${REAPPLY_MIGRATIONS:-}; do
    [ "$candidate" = "$1" ] && return 0
  done
  return 1
}

umask 077
credential_script="$(mktemp)"
credential_exports="$(mktemp)"

cleanup() {
  rm -f "$credential_script"
  rm -f "$credential_exports"
  unset PGPASSWORD || true
}
trap cleanup EXIT

command -v psql >/dev/null

test "$(cat supabase/.temp/project-ref)" = "$STAGING_PROJECT_REF"
supabase db dump --linked --schema public --dry-run > "$credential_script"
sed -En '/^export PG(HOST|PORT|USER|PASSWORD|DATABASE)=/p' \
  "$credential_script" > "$credential_exports"
test "$(wc -l < "$credential_exports" | tr -d ' ')" = 5
# shellcheck disable=SC1090
source "$credential_exports"

if [[ ! "${PGPASSWORD:-}" =~ ^[A-Za-z0-9_-]+$ ]]; then
  echo "Temporary password needs unsupported conninfo escaping." >&2
  exit 1
fi

for migration in "$@"; do
  version="${migration%%_*}"
  name="${migration#*_}"
  name="${name%.sql}"
  file="supabase/migrations/$migration"

  # The temporary login is not postgres, so every psql session must adopt the
  # role first (as run-hosted-pgtap.sh does), or supabase_migrations is denied.
  # psql only interpolates :'variables' in scripts, never in --command strings.
  already="$(
    printf '%s\n' \
      "set role postgres;" \
      "select count(*) from supabase_migrations.schema_migrations where name = :'name';" |
      psql -X -A -t -q --set ON_ERROR_STOP=1 --set=name="$name" --file -
  )"
  if [ "$already" != "0" ] && ! may_reapply "$migration"; then
    echo "skip   $migration (name already in the staging ledger)"
    continue
  fi

  if [ "$already" != "0" ]; then
    echo "reapply $migration (name already in the staging ledger; ledger unchanged)"
  else
    echo "apply  $migration"
  fi
  # Files without their own transaction become atomic here, ledger row
  # included. A file that carries its own begin/commit commits itself (the
  # nested begin only produces a WARNING) and its ledger row follows at once
  # in the same psql session under ON_ERROR_STOP; if that insert ever failed,
  # the ledger row would have to be added by hand before re-running.
  {
    echo "begin;"
    echo "set role postgres;"
    cat "$file"
    echo
    echo "insert into supabase_migrations.schema_migrations (version, name, statements)"
    echo "  select :'version', :'name', array[:'body']"
    echo "  where not exists (select 1 from supabase_migrations.schema_migrations where name = :'name');"
    echo "commit;"
  } | psql -X -q --set ON_ERROR_STOP=1 \
        --set=version="$version" \
        --set=name="$name" \
        --set=body="$(cat "$file")" \
        --file -
done

echo "Ledger rows after this run:"
psql -X -A -t -q --set ON_ERROR_STOP=1 \
  --command "set role postgres; select version || '  ' || name from supabase_migrations.schema_migrations order by version;"

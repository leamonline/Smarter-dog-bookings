#!/usr/bin/env bash
# Apply named committed migration files to ONE hosted project, one at a time,
# through the CLI's short-lived database login (the same mechanism as
# scripts/run-hosted-pgtap.sh). Staging is the default and the only target a
# bare call can reach; production is refused unless the caller opts in with
# HOSTED_MIGRATION_TARGET=production AND repeats the exact production ref in
# CONFIRM_PRODUCTION_REF. Both workflows that call this script run under a
# named GitHub environment with its own required reviewers.
#
# Why this exists: the MCP migration tool refuses to run any SQL text that
# contains a destructive keyword (DROP FUNCTION, DROP TRIGGER, DROP COLUMN,
# DELETE FROM), even inside a function body or an `if exists` guard, and that
# confirmation cannot be answered from an agent session. Several committed
# migrations need exactly those statements, so staging drifted behind the
# repository.
#
# Each file is applied inside one transaction together with its ledger row,
# so the schema and supabase_migrations.schema_migrations can never disagree.
# A migration whose NAME is already in the ledger is skipped: the ledger is
# what CI's migrations-applied check reads, and names (not versions) are the
# identity, because the MCP tool records its own timestamp as the version.
# After the last file, every requested name must be in the ledger or the
# script fails, so a run that ends green has recorded what it applied.
#
# Usage: scripts/apply-hosted-migrations.sh <project-ref> <file>...
#   where each <file> is a basename under supabase/migrations/, e.g.
#   20260830203000_funnel_blocked_reason.sql
#
# HOSTED_MIGRATION_TARGET (optional): `staging` (default) or `production`.
#   <project-ref> must be that target's hard-coded ref, and `production` also
#   needs CONFIRM_PRODUCTION_REF to equal it; anything else exits before any
#   hosted command. Only the production workflow sets it.
#
# REAPPLY_MIGRATIONS (optional, space-separated basenames): files to run even
# though their name is already in the ledger. Needed when migrations reach a
# project out of repository order: an older file that redefines a function a
# newer, already-applied file also defines must be followed by that newer file
# again, or the project keeps the older definition. Every file is still
# restricted to committed basenames, and the ledger never gains a second row
# for a name.
set -euo pipefail

TARGET_PROJECT_REF="${1:?Usage: apply-hosted-migrations.sh <project-ref> <migration-file>...}"
shift
STAGING_PROJECT_REF="btjnxvgkpdbfrrqxvkfj"
PRODUCTION_PROJECT_REF="nlzhllhkigmsvrzduefz"
TARGET="${HOSTED_MIGRATION_TARGET:-staging}"

# Resolve the one ref the declared target may use. Production needs a second,
# explicit confirmation on top of the opt-in, so neither a stray variable nor
# a copied command line can reach it on its own.
case "$TARGET" in
  staging)
    EXPECTED_PROJECT_REF="$STAGING_PROJECT_REF"
    ;;
  production)
    EXPECTED_PROJECT_REF="$PRODUCTION_PROJECT_REF"
    if [ "${CONFIRM_PRODUCTION_REF:-}" != "$PRODUCTION_PROJECT_REF" ]; then
      echo "Refusing production: CONFIRM_PRODUCTION_REF must repeat the production project ref." >&2
      exit 1
    fi
    ;;
  *)
    echo "Refusing HOSTED_MIGRATION_TARGET='$TARGET': expected staging or production." >&2
    exit 1
    ;;
esac
test "$STAGING_PROJECT_REF" != "$PRODUCTION_PROJECT_REF"
if [ "$TARGET_PROJECT_REF" != "$EXPECTED_PROJECT_REF" ]; then
  echo "Refusing project ref '$TARGET_PROJECT_REF': the $TARGET target is $EXPECTED_PROJECT_REF." >&2
  exit 1
fi
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

test "$(cat supabase/.temp/project-ref)" = "$TARGET_PROJECT_REF"
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

# Identify exactly what is about to run: the committed file, its digest and
# its length. The SQL itself is committed code; the workflow prints it.
for migration in "$@"; do
  echo "file   $migration sha256=$(sha256sum "supabase/migrations/$migration" | cut -c1-64) lines=$(wc -l < "supabase/migrations/$migration" | tr -d ' ')"
done

echo "Ledger rows before this run ($TARGET $TARGET_PROJECT_REF):"
psql -X -A -t -q --set ON_ERROR_STOP=1 \
  --command "set role postgres; select version || '  ' || name from supabase_migrations.schema_migrations order by version;"

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
    echo "skip   $migration (name already in the $TARGET ledger)"
    continue
  fi

  if [ "$already" != "0" ]; then
    echo "reapply $migration (name already in the $TARGET ledger; ledger unchanged)"
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
  echo "done   $migration"
done

# A green run must have recorded every requested name, whether this run
# applied it or an earlier one did.
echo "Verifying the requested migrations are recorded in the $TARGET ledger:"
missing=0
for migration in "$@"; do
  name="${migration#*_}"
  name="${name%.sql}"
  recorded="$(
    printf '%s\n' \
      "set role postgres;" \
      "select string_agg(version, ',' order by version) from supabase_migrations.schema_migrations where name = :'name';" |
      psql -X -A -t -q --set ON_ERROR_STOP=1 --set=name="$name" --file -
  )"
  if [ -z "$recorded" ]; then
    echo "MISSING $migration: no ledger row is named '$name'" >&2
    missing=1
  else
    echo "recorded $migration (ledger version $recorded)"
  fi
done
test "$missing" = 0

echo "Ledger rows after this run:"
psql -X -A -t -q --set ON_ERROR_STOP=1 \
  --command "set role postgres; select version || '  ' || name from supabase_migrations.schema_migrations order by version;"

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
# A migration already in the ledger is skipped, but only when the SQL last
# recorded on that row equals the committed file. "Already in the ledger"
# means any of the three identities CI's migrations-applied check accepts:
# the file's version, its name after the timestamp, or its full basename
# (the MCP tool records its own timestamp as the version; one row was once
# recorded under the whole filename). A file edited after it was applied
# must never pass as applied, so a mismatch stops the run; REAPPLY_MIGRATIONS
# applies the committed content and APPENDS it to the row's statements, so
# the original evidence is kept and the last element is what was applied
# most recently. After the last file, every requested migration must be in
# the ledger with the committed content, and the postcondition (a read-only
# SELECT returning exactly one boolean true, required for production as
# ADR 006 asks) must hold, or the script fails.
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
# POSTCONDITION_SQL (required for production, optional for staging): one
#   SELECT with no semicolons or backslashes that must return exactly one
#   boolean true after the files are applied. It runs as postgres inside a
#   read-only transaction AND inside a scalar subquery, `select (<query>)`,
#   so no statement separator can end the transaction and smuggle a write
#   behind the verdict; it can prove the schema but cannot change it.
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

if [ "$TARGET" = "production" ] && [ -z "${POSTCONDITION_SQL:-}" ]; then
  echo "Refusing production: POSTCONDITION_SQL is required (one read-only SELECT returning exactly one boolean true; ADR 006)." >&2
  exit 1
fi
if [ -n "${POSTCONDITION_SQL:-}" ]; then
  # One trailing semicolon is tolerated; any other makes it more than one statement.
  POSTCONDITION_SQL="${POSTCONDITION_SQL%;}"
  if [[ "$POSTCONDITION_SQL" == *";"* ]] || [[ "$POSTCONDITION_SQL" == *"\\"* ]] || [[ ! "$POSTCONDITION_SQL" =~ ^[[:space:]]*[sS][eE][lL][eE][cC][tT][[:space:]] ]]; then
    echo "Refusing POSTCONDITION_SQL: it must be a single SELECT with no semicolons or backslashes." >&2
    exit 1
  fi
fi

# Every REAPPLY_MIGRATIONS entry must also be in the list to apply: the list is
# what runs; the re-apply set only lifts the already-recorded skip.
for candidate in ${REAPPLY_MIGRATIONS:-}; do
  listed=0
  for migration in "$@"; do
    [ "$migration" = "$candidate" ] && listed=1
  done
  if [ "$listed" != 1 ]; then
    echo "Refusing REAPPLY_MIGRATIONS entry '$candidate': it is not in the list of migrations to apply, so it would never run." >&2
    exit 1
  fi
done

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

# Every ledger predicate matches the three identities the migrations-applied
# check accepts, so a row recorded under another form is never applied twice.
LEDGER_MATCH="name = :'name' or name = :'base' or version = :'version'"

# The SQL most recently recorded for a migration: the last element of the
# newest matching row's statements (this script stores a whole file as one
# element; a re-apply appends another).
stored_sql() {
  printf '%s\n' \
    "set role postgres;" \
    "select coalesce(statements[array_upper(statements, 1)], '') from supabase_migrations.schema_migrations where $LEDGER_MATCH order by version desc limit 1;" |
    psql -X -A -t -q --set ON_ERROR_STOP=1 --set=name="$1" --set=base="$2" --set=version="$3" --file -
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
  base="${migration%.sql}"
  name="${migration#*_}"
  name="${name%.sql}"
  file="supabase/migrations/$migration"

  # The temporary login is not postgres, so every psql session must adopt the
  # role first (as run-hosted-pgtap.sh does), or supabase_migrations is denied.
  # psql only interpolates :'variables' in scripts, never in --command strings.
  already="$(
    printf '%s\n' \
      "set role postgres;" \
      "select count(*) from supabase_migrations.schema_migrations where $LEDGER_MATCH;" |
      psql -X -A -t -q --set ON_ERROR_STOP=1 --set=name="$name" --set=base="$base" --set=version="$version" --file -
  )"
  if [ "$already" != "0" ] && ! may_reapply "$migration"; then
    if [ "$(stored_sql "$name" "$base" "$version")" = "$(cat "$file")" ]; then
      echo "skip   $migration (name already in the $TARGET ledger; stored SQL matches the committed file)"
      continue
    fi
    echo "MISMATCH $migration: name already in the $TARGET ledger but its stored SQL differs from the committed file." >&2
    echo "         Drop it from the list if another tool applied it and it is known good, or add it to REAPPLY_MIGRATIONS to apply the committed content." >&2
    exit 1
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
    echo "update supabase_migrations.schema_migrations set statements = coalesce(statements, '{}') || array[:'body']"
    echo "  where $LEDGER_MATCH;"
    echo "insert into supabase_migrations.schema_migrations (version, name, statements)"
    echo "  select :'version', :'name', array[:'body']"
    echo "  where not exists (select 1 from supabase_migrations.schema_migrations where $LEDGER_MATCH);"
    echo "commit;"
  } | psql -X -q --set ON_ERROR_STOP=1 \
        --set=version="$version" \
        --set=base="$base" \
        --set=name="$name" \
        --set=body="$(cat "$file")" \
        --file -
  echo "done   $migration"
done

# A green run must have recorded every requested name with the committed
# content, whether this run applied it or an earlier one did.
echo "Verifying the requested migrations are recorded in the $TARGET ledger with the committed SQL:"
missing=0
for migration in "$@"; do
  version="${migration%%_*}"
  base="${migration%.sql}"
  name="${migration#*_}"
  name="${name%.sql}"
  recorded="$(
    printf '%s\n' \
      "set role postgres;" \
      "select string_agg(version || ' ' || name, ', ' order by version) from supabase_migrations.schema_migrations where $LEDGER_MATCH;" |
      psql -X -A -t -q --set ON_ERROR_STOP=1 --set=name="$name" --set=base="$base" --set=version="$version" --file -
  )"
  if [ -z "$recorded" ]; then
    echo "MISSING $migration: no ledger row matches its version, name or basename" >&2
    missing=1
  elif [ "$(stored_sql "$name" "$base" "$version")" != "$(cat "supabase/migrations/$migration")" ]; then
    echo "MISMATCH $migration: recorded as [$recorded], but the stored SQL differs from the committed file" >&2
    missing=1
  else
    echo "recorded $migration (ledger row [$recorded]; stored SQL matches the committed file)"
  fi
done
test "$missing" = 0

# ADR 006: a behavioural postcondition against the same target, read-only.
if [ -n "${POSTCONDITION_SQL:-}" ]; then
  echo "Checking the postcondition in a read-only transaction:"
  # The query is a scalar subquery: it must yield one row and one column, and
  # a statement separator inside the parentheses is a syntax error, so the
  # read-only transaction cannot be ended from inside the input.
  verdict="$(
    printf '%s\n' \
      "set role postgres;" \
      "begin;" \
      "set transaction read only;" \
      "select (" \
      "$POSTCONDITION_SQL" \
      ");" \
      "rollback;" |
      psql -X -A -t -q --set ON_ERROR_STOP=1 --file -
  )"
  if [ "$verdict" = "t" ]; then
    echo "postcondition passed"
  else
    echo "POSTCONDITION FAILED: expected exactly 't', got '${verdict:-nothing}'" >&2
    exit 1
  fi
fi

echo "Ledger rows after this run:"
psql -X -A -t -q --set ON_ERROR_STOP=1 \
  --command "set role postgres; select version || '  ' || name from supabase_migrations.schema_migrations order by version;"

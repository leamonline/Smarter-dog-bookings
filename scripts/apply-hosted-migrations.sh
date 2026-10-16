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
# The apply supplies that transaction: the one `begin;`/`commit;` pair that
# encloses a file (its first and last statements, the repository's usual
# style) is removed before execution so it cannot commit the schema change
# ahead of the ledger row, while the ledger stores the file exactly as
# committed. Which lines those are, and whether anything else psql or
# PostgreSQL would act on is left, is decided by scripts/lex-migration-sql.pl,
# a one-pass scan of the file's strings, identifiers, comments and
# dollar-quoted bodies in the order psql reads them: a `commit;` inside a
# function body or a string is content and stays, and any other top-level
# transaction control (a second begin;/commit; pair, start transaction,
# rollback, end, commit and chain, a commit sharing a line) is refused,
# because the apply must neither split nor merge what the file keeps atomic,
# as are psql meta-commands and variable references outside strings, a
# quoted construct still open at the end of the file, and a file that
# mentions standard_conforming_strings or client_encoding (the two settings
# that would change how its quoting reads).
# A migration already in the ledger is skipped, but only when the SQL last
# recorded on that row equals the committed file. "Already in the ledger"
# means a row whose NAME is the file's name after the timestamp or its full
# basename (the MCP tool records its own timestamp as the version; one row
# was once recorded under the whole filename). A row that shares only the
# file's VERSION under another name is a conflict, not an identity: it may be
# this migration recorded under a different name or an unrelated row, so the
# run stops and says which, and nothing is written to that row. A file edited
# after it was applied must never pass as applied, so a mismatch stops the
# run; REAPPLY_MIGRATIONS applies the committed content and APPENDS it to the
# row's statements, so the original evidence is kept and the last element is
# what was applied most recently. After the last file, every requested
# migration must be in the ledger with the committed content, and the
# postcondition (a read-only SELECT returning exactly one boolean true,
# required for production as ADR 006 asks) must hold, or the script fails.
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
#   boolean true after the files are applied. It runs as the `anon` role
#   inside a read-only transaction with a 30-second statement timeout, and as
#   `select (<query>) is true`: no statement separator can end the
#   transaction, only a genuine boolean true (never the text 't') passes, and
#   `anon` sees no more than an anonymous API client would (the catalogs
#   pg_tables, pg_attribute, pg_proc, pg_indexes, pg_policies ... in full;
#   tables only through their grants and row-level security) and cannot use
#   privileged functions such as pg_terminate_backend. Write postconditions
#   against pg_catalog, not information_schema (which hides what the role
#   cannot select).
#
# LEDGER_PROVENANCE (optional; the production workflow sets it): one line,
#   starting with `-- ` and containing no dollar sign, stored in the ledger row
#   just ahead of the file, with the exact basename appended (`-- applied to
#   production from pull request #N head <sha> by <actor>, run <url> (file
#   <basename>)`), so the migrations-applied check can demand that very file
#   stays in a pull request's tree even if a later push drops or renames it.
#   The last element of statements stays the SQL applied, which is what every
#   comparison reads. A file with no SQL statement is refused.
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

# LEDGER_PROVENANCE, when set, is stored in the ledger row ahead of the file:
# one line, starting with `-- `, with no dollar sign (it travels inside the
# same dollar-quoted literal as the file). The last element of statements
# stays the SQL applied, which is what every comparison reads.
if [ -n "${LEDGER_PROVENANCE:-}" ]; then
  if [[ "$LEDGER_PROVENANCE" == *$'\n'* ]] || [[ "$LEDGER_PROVENANCE" == *'$'* ]] || [[ ! "$LEDGER_PROVENANCE" =~ ^--\  ]]; then
    echo "Refusing LEDGER_PROVENANCE: it must be one line starting with '-- ' and contain no dollar sign." >&2
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
  if [ -L "supabase/migrations/$migration" ]; then
    echo "Refusing '$migration': it is a symbolic link, not a committed file." >&2
    exit 1
  fi
  test -f "supabase/migrations/$migration"
done

# A file listed twice would run twice under REAPPLY_MIGRATIONS: refused.
if [ "$(printf '%s\n' "$@" | sort | uniq -d | wc -l | tr -d ' ')" != "0" ]; then
  echo "Refusing the migration list: it names the same file more than once: $(printf '%s\n' "$@" | sort | uniq -d | tr '\n' ' ')" >&2
  exit 1
fi

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

# Session-scoped advisory locks require a direct/session connection, never
# the provider's transaction-pooling endpoint.
if [ "$PGPORT" != "5432" ]; then
  echo "Refusing non-session database endpoint; expected port 5432." >&2
  exit 1
fi

# Shared engine retains one database session and advisory lock across all files.
# Both workflow paths and the local operator use this engine.
node "$(cd "$(dirname "$0")" && pwd)/release/engine.mjs" "$@"

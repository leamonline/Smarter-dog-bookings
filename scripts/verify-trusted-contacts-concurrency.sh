#!/usr/bin/env bash
# Disposable, synthetic fixtures only; the shared driver refuses hosted targets.
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
source "$SCRIPT_DIR/postgres-concurrency-driver.sh"
concurrency_init_local_supabase "Trusted contacts concurrency" "$REPO_ROOT"
export TRUSTED_CONTACTS_PSQL_BIN="$CONCURRENCY_PSQL_BIN"
python3 "$SCRIPT_DIR/verify-trusted-contacts-concurrency.py"

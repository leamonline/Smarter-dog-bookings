#!/usr/bin/env bash
# PreToolUse guard adapter for Claude Code's mcp__Supabase__apply_migration.
#
# Delegates project-ref classification and fail-closed validation to the shared
# repository guard (scripts/guard-supabase-migration.mjs) so Claude Code and
# Antigravity share one security boundary without duplicated rules.
#
# .claude/settings.json intentionally omits permissions.allow for this tool. If
# Node or the shared guard fails to execute, this adapter fails closed back to
# the interactive permission prompt (`ask`).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SHARED_GUARD="$REPO_ROOT/scripts/guard-supabase-migration.mjs"

fallback_ask() {
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"%s"}}\n' "$1"
}

if ! command -v node >/dev/null 2>&1 || [ ! -f "$SHARED_GUARD" ]; then
  fallback_ask "apply_migration guard: shared Node guard unavailable; confirm by hand."
  exit 0
fi

if ! output="$(node "$SHARED_GUARD" --agent claude)"; then
  fallback_ask "apply_migration guard: shared guard execution failed; confirm by hand."
  exit 0
fi

if [ -z "$output" ]; then
  fallback_ask "apply_migration guard: shared guard returned empty output; confirm by hand."
  exit 0
fi

printf '%s\n' "$output"

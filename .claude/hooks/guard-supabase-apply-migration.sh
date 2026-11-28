#!/usr/bin/env bash
# PreToolUse guard adapter for Claude Code's Supabase MCP and shell guardrails.
#
# Delegates to scripts/guard-supabase-hook.sh -> scripts/guard-supabase-migration.mjs
# so Claude Code and Antigravity share one launcher and target-classification boundary.
# .claude/settings.json intentionally omits permissions.allow and sets onFailure: "block".
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LAUNCHER="$SCRIPT_DIR/../../scripts/guard-supabase-hook.sh"

if [ ! -x "$LAUNCHER" ]; then
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Supabase guard: shared launcher unavailable; failing closed."}}\n'
  exit 0
fi

exec "$LAUNCHER" claude

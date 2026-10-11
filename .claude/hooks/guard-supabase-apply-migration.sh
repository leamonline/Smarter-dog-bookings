#!/usr/bin/env bash
# PreToolUse guard for mcp__Supabase__apply_migration.
#
# .claude/settings.json allows that tool so routine STAGING applies need no
# per-call prompt. The allow rule alone cannot tell projects apart, and the
# repository grants no standing production authority (AGENTS.md, ADR 006), so
# this hook reads the call's project ref and hands anything that is not the
# staging project back to the permission prompt. It never runs the tool and
# never blocks it outright: a human still decides, per call, for production.
#
# Exit 0 with a JSON decision on stdout; anything unreadable is treated as a
# production-grade call and asked about.
set -euo pipefail

STAGING_PROJECT_REF="btjnxvgkpdbfrrqxvkfj"
PRODUCTION_PROJECT_REF="nlzhllhkigmsvrzduefz"

decide() {
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"%s","permissionDecisionReason":"%s"}}\n' "$1" "$2"
}

input="$(cat)"
if ! command -v jq >/dev/null 2>&1; then
  decide ask "apply_migration guard: jq is not installed, so the project ref could not be checked; confirm by hand."
  exit 0
fi

project="$(printf '%s' "$input" | jq -r '.tool_input.project_id // empty' 2>/dev/null || true)"
case "$project" in
  "$STAGING_PROJECT_REF")
    decide allow "apply_migration on staging ($project) is allowed without a prompt."
    ;;
  "$PRODUCTION_PROJECT_REF")
    decide ask "apply_migration targets PRODUCTION ($project): a human must confirm this call; the repository grants no standing production authority."
    ;;
  *)
    decide ask "apply_migration targets an unrecognised project ref ('${project:-none}'): confirm by hand."
    ;;
esac

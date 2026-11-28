#!/usr/bin/env bash
# Shared POSIX/Bash fail-closed hook launcher for Claude Code, Codex and Antigravity.
#
# Resolves `node` across standard PATH and common macOS GUI/nvm locations,
# invokes scripts/guard-supabase-migration.mjs for the requested agent mode,
# and emits an explicit JSON `deny` decision on exit 0 if Node, the shared
# script or its execution fails.
set -euo pipefail

AGENT="${1:-}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SHARED_GUARD="$SCRIPT_DIR/guard-supabase-migration.mjs"

emit_deny() {
  local reason="$1"
  if [ "$AGENT" = "claude" ] || [ "$AGENT" = "codex" ]; then
    printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"%s"}}\n' "$reason"
  else
    printf '{"decision":"deny","reason":"%s"}\n' "$reason"
  fi
}

find_node() {
  if command -v node >/dev/null 2>&1; then
    command -v node
    return 0
  fi
  local candidate
  for candidate in /opt/homebrew/bin/node /usr/local/bin/node; do
    if [ -x "$candidate" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  if [ -d "${HOME:-}/.nvm/versions/node" ]; then
    candidate="$(ls -d "${HOME}/.nvm/versions/node"/v*/bin/node 2>/dev/null | sort -V | tail -n 1 || true)"
    if [ -n "$candidate" ] && [ -x "$candidate" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  fi
  return 1
}

if [ "$AGENT" != "claude" ] && [ "$AGENT" != "codex" ] && [ "$AGENT" != "antigravity" ]; then
  emit_deny "Supabase guard: unsupported or missing agent mode; failing closed."
  exit 0
fi

NODE_BIN="$(find_node || true)"
if [ -z "$NODE_BIN" ] || [ ! -f "$SHARED_GUARD" ]; then
  emit_deny "Supabase guard: Node or shared guard script unavailable; failing closed."
  exit 0
fi

if ! output="$("$NODE_BIN" "$SHARED_GUARD" --agent "$AGENT")"; then
  emit_deny "Supabase guard: shared guard execution failed; failing closed."
  exit 0
fi

if [ -z "$output" ]; then
  emit_deny "Supabase guard: shared guard returned empty output; failing closed."
  exit 0
fi

printf '%s\n' "$output"

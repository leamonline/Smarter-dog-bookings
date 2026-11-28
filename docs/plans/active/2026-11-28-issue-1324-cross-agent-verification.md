# Cross-agent runtime verification and agent-independent credential isolation

- Status: Active
- Issue: [#1324](https://github.com/leamonline/Smarter-dog-bookings/issues/1324)
- Base: `main@70d188181a369868760e6d6e47e46d5c30f83b37`
- Last verified: 28 November 2026
- Owners: Cross-agent runtime verification, Codex/Claude/Antigravity compatibility and owner decision prep
- Dependencies: Completed foundation in [#1322](https://github.com/leamonline/Smarter-dog-bookings/issues/1322) / [completed plan](../completed/2026-11-28-cross-agent-compatibility.md)
- Related requirements: Synthetic verification, explicit target controls and approval boundaries in [AGENTS.md](../../../AGENTS.md)
- Related ADRs: [ADR 006](../../architecture/decisions/006-manual-target-verified-database-rollout.md)

## Goal

Complete runtime verification of migration and mutation protections across Codex, Claude Code and Antigravity, establish agent-independent production credential isolation, and execute an end-to-end cross-agent handover and independent review drill.

## Why

[PR #1323](https://github.com/leamonline/Smarter-dog-bookings/pull/1323) landed shared hook guard logic (`scripts/guard-supabase-migration.mjs` + `scripts/guard-supabase-hook.sh`), Antigravity `.agents/hooks.json`, Claude Code `.claude/settings.json` (`onFailure: "block"`) and `.mcp.json` (`read_only=true`), but runtime evidence and server-side credential isolation remained incomplete across environments.

## Current behaviour (verified 28 November 2026)

### Stage 1 — Read-only credential and permission inventory

1. **Repository & local checkout:** Neither `.env.local` nor `supabase/.temp/` is present in the local checkout (`.env.example` only).
2. **Antigravity (`supabase_mcp`):** Provided by the user-global Supabase plugin (`0.1.17-agy.a224d9f1`) whose `mcp_config.json` targets `https://mcp.supabase.com/mcp` with **no** `project_ref=`, **no** `read_only=true`, and **no** `features=` restriction. Antigravity's `list_plugin_accounts` reports no managed plugin sign-in provider; auth relies on the Supabase MCP OAuth session. Therefore, Antigravity's `supabase_mcp` has unrestricted org/project reach at the server endpoint and depends on `.agents/hooks.json` + host approvals.
3. **Claude Code (`2.1.331`):** Global `~/.claude.json` has `mcpServers: []`; user `~/.claude/settings.json` has `permissions: null` and `hooks: []`. The repo `.claude/settings.local.json` enables `.mcp.json`'s `supabase` server, which pins `project_ref=nlzhllhkigmsvrzduefz&read_only=true&features=docs%2Cdatabase%2Cdebugging`.
4. **Codex (`~/.codex/config.toml`):** Sets `approval_policy = "never"` and `[projects."/Users/leam/Documents/GitHub/Smarter-dog-bookings"] trust_level = "trusted"`. `[features]` enables `memories = true` only (no hooks feature toggle set). Global MCP servers list `node_repl`, `graphify` and `home_assistant_mcp` (no Supabase MCP server configured). Installed plugins include `agent-guard` (`3.15.0`, using `"hooks": { "PreToolUse": ... }` with `matcher: "Bash|apply_patch|Agent|Task|mcp__.*"` and exit `2` on block).
5. **GitHub Environments:** `Production`, `staging`, and `supabase-automation` all enforce `deployment_branch_policy: { custom_branch_policies: true, protected_branches: false }` with one branch policy (`name: "main", type: "branch"`). `Preview` and `copilot` have no protection rules or branch policies.

### Stage 2 — Codex runtime enforcement status

- Local `codex` CLI binary is not installed on `PATH` (only Codex Desktop state under `~/.codex/`, `/opt/homebrew/.codex/hooks.json`, and `~/.local/state/codex-fusion` exist). Live Codex CLI/Desktop/Cloud `PreToolUse` execution could not be tested in this session without installing software.
- Inspected `agent-guard@3.15.0/hooks.json` on disk, confirming Codex plugin `PreToolUse` uses the same top-level `"hooks"` → `"PreToolUse"` schema already supported by `scripts/guard-supabase-migration.mjs --agent codex`. However, because `approval_policy = "never"` and `[features]` lacks a hooks flag in `~/.codex/config.toml`, repo `.codex/hooks.json` should not be committed until verified in a live Codex runtime.

### Stage 3 — Claude Code runtime verification status

- Retried `claude -p --model haiku --strict-mcp-config` against the harmless local mock stdio MCP server; Anthropic returned `429 rate_limit_error` (`usage_limit_reached`, `rateLimitType: "seven_day"`, resets 10pm Europe/London). Per task rules, stopped retrying until quota resets.

### Stage 4 — Antigravity live host hook dispatch status

- Executed synthetic `call_mcp_tool` probes in fresh `self` Antigravity subagents targeting nonexistent servers (`synthetic_nonexistent_mcp` / `synthetic_nonexistent_supabase`) so zero real MCP servers or databases could be touched even if hooks failed:
  - **`apply_migration` on `nlzhllhkigmsvrzduefz` (`0cce1d3e`):** Host `PreToolUse` dispatched `.agents/hooks.json` → `scripts/guard-supabase-hook.sh antigravity` → `scripts/guard-supabase-migration.mjs` and returned `Encountered error in tool execution: tool call denied by pre-tool hook: Blocked MCP apply_migration against production (nlzhllhkigmsvrzduefz). Production migrations must use the target-verified production workflow, not MCP.`
  - **`execute_sql` on `nlzhllhkigmsvrzduefz` (`c0226ce1`):** Host `PreToolUse` dispatched and returned `Encountered error in tool execution: tool call denied by pre-tool hook: Blocked mutating/unclassified Supabase MCP tool (execute_sql) targeting production (nlzhllhkigmsvrzduefz).`
  - **Malformed `Arguments` on `apply_migration` (`2899dd36`):** Host `PreToolUse` dispatched on `Arguments: "{not-json"` and returned `Encountered error in tool execution: tool call denied by pre-tool hook: Supabase migration guard blocked unreadable Arguments (Expected property name or '}' in JSON at position 1 (line 1 column 2)).`
- Host timeout/unhandled-spawn failure remains documented-only (Antigravity `hooks.md` exposes no `onFailure: "block"` setting; `scripts/guard-supabase-hook.sh` traps missing/failing `node` and emits valid `deny` JSON on exit `0`).

## Desired behaviour

1. Agent-independent production credential isolation prevents unintended production mutations across Antigravity, Claude Code (`--bare` included) and Codex even if client-side hooks fail or are absent.
2. Codex, Claude Code and Antigravity all have executed runtime verification of their hook/guard paths (or an explicit owner-accepted boundary where a platform lacks a mechanism).
3. Cross-agent handover and independent review are exercised end-to-end without context loss or weakened gates.

## Scope

Staged verification, credential isolation proposals, runtime tests and handover evidence for `#1324` (`Stages 1–5`).

## Non-goals

- Modifying production infrastructure, Supabase OAuth permissions, GitHub environment secrets or customer data without separate owner approval.
- Installing software (`codex`, `supabase`, `deno`, `playwright`) without approval.
- Touching PR #1320.

## Architecture

Follows the existing shared guard architecture in [docs/migrations.md](../../migrations.md#the-supabase-mcp-tool-and-agent-migration-guards) and the workflow in [docs/project-management.md](../../project-management.md#authorised-development-and-session-recovery).

## Data/database changes

None.

## API changes

None.

## UI changes

None.

## Security/privacy considerations

All inventories inspected metadata, URL query parameters (redacting non-routing params) and key names only; no secret values, OAuth tokens or customer data were accessed or recorded.

## Dependencies

- **Stage 1 implementation:** Owner approval to modify personal MCP plugin configs, Supabase OAuth/PAT scopes or GitHub account settings.
- **Stage 2:** Host with `codex` CLI / Desktop / Cloud access and owner decision on `.codex/hooks.json` & `[features]` trust.
- **Stage 3:** Anthropic usage quota reset (after 10pm Europe/London).
- **Stage 4 host timeout/crash test:** Optional isolated workspace probe if needed beyond launcher-level tests.
- **Stage 5:** Blocked until Stages 2–4 complete.

## Risks

- Antigravity's user-global `supabase_mcp` plugin targets `https://mcp.supabase.com/mcp` with no `project_ref=` or `read_only=true` scope, meaning `claude --bare`-equivalent bypass or an Antigravity host hook crash/timeout would rely on interactive OAuth/Supabase destructive confirmation.
- Codex Desktop's `approval_policy = "never"` in `~/.codex/config.toml` suppresses interactive command prompts on trusted workspaces if a token or CLI target were ever present.

## Migration/rollout

Documentation and test/config PRs only; any credential or environment change requires separate owner action.

## Implementation sequence

1. **Stage 1:** Present owner decision options for Supabase MCP / PAT scoping; apply approved changes separately.
2. **Stage 2:** Run synthetic `PreToolUse` verification in Codex CLI/Desktop/Cloud; open `.codex/hooks.json` PR only if verified and owner-approved.
3. **Stage 3:** Re-run local mock-MCP `PreToolUse` + 5 read-only workflow evaluations in `claude -p` once quota resets.
4. **Stage 4:** Complete any remaining Antigravity host failure-mode checks (e.g., isolated timeout/malformed test) and record results.
5. **Stage 5:** Execute cross-agent handover + independent review drill once Stages 2–4 close.

## Testing

- `npm run check:docs && git diff --check`
- `npm run test -- src/security/migrationGuardHooks.test.ts src/security/productionApplyMigrationsWorkflow.test.ts`

## Observability

Track per-stage runtime evidence on issue `#1324` and update this plan's checkpoint before hand-off.

## Documentation updates

Update `docs/migrations.md` and `prompts/evals/codex-workflows.md` once Stages 2–4 runtime evidence is collected.

## Definition of done

All 5 stages in `#1324` have executed runtime evidence or explicit owner-recorded acceptance decisions.

## Open questions

1. Owner decision on restricting Antigravity's global `supabase_mcp` / personal Supabase access (read-only production vs staging-only vs leaving OAuth scoped to per-call approvals).
2. Owner decision on enabling Codex hooks (`[features]` + `.codex/hooks.json`) vs keeping Codex MCP-free and sandbox/CI-guarded.

## Consolidated owner decisions

Three decisions require repository-owner approval before modifying credentials, local agent configurations, or Codex enforcement posture.

### Decision 1 — Agent-independent production credential and `supabase_mcp` isolation

- **Recommended option:** Keep production database writes restricted to the `main`-protected `Production` / `supabase-automation` GitHub Environments workflow and remove unscoped production write authority from local agent credentials: configure Antigravity `supabase_mcp` with an explicit read-only / staging-scoped setup (matching `.mcp.json`'s `read_only=true&project_ref=nlzhllhkigmsvrzduefz&features=docs%2Cdatabase%2Cdebugging` pattern for read-only inspection, or using a dedicated non-production / read-only Supabase credential rather than an all-project personal OAuth session).
- **Alternative options:**
  1. Rely on repository `PreToolUse` hooks (`scripts/guard-supabase-hook.sh` + `scripts/guard-supabase-migration.mjs`) while keeping Antigravity's unscoped `https://mcp.supabase.com/mcp` OAuth URL.
  2. Disable `supabase_mcp` across all local agent runtimes (`Claude Code`, `Antigravity`, `Codex`) and perform all database work against local Docker PostgreSQL plus GitHub Actions (`staging-apply-migrations.yml` / production release workflow).
- **Security implications:** Antigravity's installed Supabase plugin config (`/Users/leam/.gemini/config/plugins/supabase/mcp_config.json`, `0.1.17-agy.a224d9f1`) omits `project_ref=`, `read_only=true`, and `features=`, and Antigravity's hook specification (`hooks.md`) provides no host-level `onFailure: "block"` fallback if the hook launcher itself fails or times out. Leaving full-scope personal OAuth credentials reachable makes client hooks a single point of failure (and bypassable via alternative tools or `claude --bare`).
- **Effect on existing development workflows:** Read-only production schema/log inspection remains intact via scoped MCP (`read_only=true`), while staging and local development continue via local Supabase (`npm run test:db`), `.mcp.json` / staging tokens, and GitHub Actions. Any ad-hoc local OAuth write to production via MCP is intentionally blocked at the credential layer.
- **Implementation and rollback requirements:** Reconfigure or separate the Antigravity Supabase MCP connection (and any user-level OAuth token/PAT used by local agents) to read-only / staging scope, and document the separation in `docs/migrations.md`. Rollback requires restoring the owner's previous MCP server URL / OAuth session in machine-local plugin/user config.
- **Supporting verification evidence:**
  - Stage 1 credential inventory: `/Users/leam/.gemini/config/plugins/supabase/mcp_config.json` sets `"serverUrl": "https://mcp.supabase.com/mcp"` with no query scoping; repo `.mcp.json` already enforces `project_ref=nlzhllhkigmsvrzduefz&read_only=true&features=docs%2Cdatabase%2Cdebugging`; GitHub Environments `Production`, `staging`, and `supabase-automation` enforce `deployment_branch_policy` targeting `main` only.
  - Stage 4 probes (`0cce1d3e`, `c0226ce1`, `2899dd36`): Antigravity `PreToolUse` blocked `apply_migration`, `execute_sql`, and malformed JSON `Arguments`, but `hooks.md` documents no host `onFailure` setting.

### Decision 2 — Codex runtime enforcement posture (`approval_policy = "never"` and absent hooks feature flag)

- **Recommended option:** Do not claim Codex hook parity or add `.codex/hooks.json` as verified enforcement yet. Keep Codex sessions without production Supabase MCP credentials (`~/.codex/config.toml` currently has no Supabase MCP entry), and decide whether to authorise installing/exposing `codex` CLI on this Mac (or running an explicit interactive Codex Desktop / Cloud hook verification) with hooks enabled and an explicit approval posture.
- **Alternative options:**
  1. Commit `.codex/hooks.json` using the `PreToolUse` schema observed in `~/.codex/plugins/cache/awesome-codex-plugins/agent-guard/3.15.0/hooks.json` without live runtime verification on this machine.
  2. Keep `.codex/hooks.json` uncommitted and permanently forbid production credentials in Codex environments (relying exclusively on `~/.codex/config.toml` lacking Supabase MCP plus GitHub Environment protections).
- **Security implications:** `~/.codex/config.toml` sets `approval_policy = "never"`, `trust_level = "trusted"` for this repository, and `[features] memories = true` without a hooks enablement flag. Even with a repo `.codex/hooks.json`, an unflagged or desktop/cloud Codex runtime that ignores hooks would execute approved tool calls without prompting if production credentials were ever added.
- **Effect on existing development workflows:** Keeping Codex without production credentials requires zero changes to Codex Cloud or documentation workflows; enabling hooks or changing `approval_policy` would alter Codex prompt/confirmation behaviour across trusted tools.
- **Implementation and rollback requirements:** Enabling runtime verification requires either authorising `codex` CLI availability on macOS or running a scripted Desktop/Cloud session check, plus adding `.codex/hooks.json` and updating `docs/migrations.md` only after live `PreToolUse` interception is observed. Rollback is removing `.codex/hooks.json` or reverting `~/.codex/config.toml`.
- **Supporting verification evidence:**
  - Stage 2 inspection: `which codex` returned not found (`codex` CLI absent; `/opt/homebrew/.codex` and `/Users/leam/.local/state/codex-fusion` only); `~/.codex/config.toml` contains `approval_policy = "never"`, `[projects."/Users/leam/Documents/GitHub/Smarter-dog-bookings"] trust_level = "trusted"`, and no hooks feature flag; `agent-guard` (`3.15.0`) and `tree-ring-memory` (`0.3.10`) confirm Codex plugin `hooks.json` uses `"PreToolUse"` (`exit 2` closed mode in `agent-guard`), matching `scripts/guard-supabase-migration.mjs --agent codex`.

### Decision 3 — Staging MCP write allowance and optional Antigravity host-timeout fault injection

- **Recommended option:** Keep staging (`btjnxvgkpdbfrrqxvkfj`) allowed under the MCP guard for non-destructive development ergonomics (while GitHub Actions `staging-apply-migrations.yml` remains the path for destructive DDL keywords), and accept wrapper-level exit-`0` error trapping (`scripts/guard-supabase-hook.sh`) + `guard-supabase-migration.test.mjs` rather than temporarily breaking `.agents/hooks.json` in a dirty worktree to force a host timeout.
- **Alternative options:**
  1. Deny `apply_migration` and `execute_sql` via MCP even against staging (`btjnxvgkpdbfrrqxvkfj`), forcing all staging SQL/migrations through `staging-apply-migrations.yml` or local CLI only.
  2. Authorise a brief, isolated local-only test (outside tracked `main` history) that points a temporary test workspace's `.agents/hooks.json` at a crashing/sleeping script to observe Antigravity host behaviour on unhandled hook timeouts.
- **Security implications:** Allowing staging MCP migrations trades convenience for blast radius limited to the non-production staging project (`btjnxvgkpdbfrrqxvkfj`), provided Decision 1 cleanly isolates staging credentials from production. Testing Antigravity host timeout in an isolated scratch workspace confirms whether an unhandled `>10s` crash fails open or closed in the host binary.
- **Effect on existing development workflows:** Option 1 would require pushing branches / triggering `staging-apply-migrations.yml` for every staging migration test instead of quick MCP verification; the recommended option keeps current staging speed unchanged.
- **Implementation and rollback requirements:** None unless changing staging policy (one-rule change in `scripts/guard-supabase-migration.mjs` + tests, trivially reversible) or running an isolated scratch-workspace timeout check.
- **Supporting verification evidence:**
  - Stage 4 live probes (`0cce1d3e`, `c0226ce1`, `2899dd36`) verified live Antigravity `PreToolUse` `deny` enforcement on production `apply_migration`, production `execute_sql`, and malformed JSON `Arguments`; `hooks.md` shows no `onFailure: "block"` configuration field for host-level timeouts.

## Checkpoint

- **Revision and ownership** — Issue [#1324](https://github.com/leamonline/Smarter-dog-bookings/issues/1324), branch `feat/1324-cross-agent-verification` from `main@70d18818`. Single writer.
- **Evidence** — Stage 1 read-only inventory complete; Stage 2 confirmed `codex` CLI absent and `~/.codex/config.toml` `approval_policy = "never"` without hooks feature flag; Stage 3 hit `429 usage_limit_reached` (10pm Europe/London reset); Stage 4 live-verified Antigravity host `PreToolUse` `deny` on `apply_migration` (`0cce1d3e`), `execute_sql` (`c0226ce1`), and malformed JSON `Arguments` (`2899dd36`); consolidated owner decisions drafted above.
- **Next** — Obtain owner decisions on Decisions 1–3, resume Stage 3 live Claude mock-MCP verification after the 10pm Europe/London quota reset, verify Codex enforcement once a supported Codex runtime is available, and complete Stage 5 handover/independent review.

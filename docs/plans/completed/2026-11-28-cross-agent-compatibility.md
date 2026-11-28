# Cross-agent compatibility and fail-closed migration protection

- Status: Completed (incremental scope merged in [PR #1323](https://github.com/leamonline/Smarter-dog-bookings/pull/1323); remaining runtime/parity items tracked in [#1324](https://github.com/leamonline/Smarter-dog-bookings/issues/1324))
- Issue: [#1322](https://github.com/leamonline/Smarter-dog-bookings/issues/1322)
- Base: `origin/main@0348fa31e61af5eaba9c8cddce5c5f8de1b1dae3`
- Last verified: 28 November 2026
- Owners: Shared agent rules, hooks, MCP config, skills, security tests and cross-agent documentation
- Dependencies: None (PRs #1320 and #1321 remain open and untouched)
- Related requirements: Synthetic verification, explicit target controls and approval boundaries in [AGENTS.md](../../../AGENTS.md)
- Related ADRs: [ADR 006](../../architecture/decisions/006-manual-target-verified-database-rollout.md)

## Goal

Ensure Smarter Dog Bookings can be developed interchangeably using Codex, Claude Code and Antigravity with consistent project knowledge, fail-closed migration and mutation protection, refined skills, tool-neutral documentation and durable session recovery.

## Why

PR #1315 and PR #1319 established `AGENTS.md`, repository skills under `.agents/skills/`, checkpoint recovery and the cloud development runbook, while exposing uneven enforcement across agents:

- Claude Code's `.mcp.json` pointed at production (`nlzhllhkigmsvrzduefz`) without `read_only=true`, and its `PreToolUse` hook only matched `mcp__Supabase__apply_migration`, omitted `onFailure: "block"`, and fell back to `ask` (permitting click-through on prohibited targets or missing dependencies).
- Antigravity had no `.agents/hooks.json` guard for `supabase_mcp` `apply_migration` or mutating `supabase_mcp` calls (`execute_sql`, `deploy_edge_function`, etc.) even though global MCP connectors can expose production.
- `smarter-dog-booking-change` triggered unnecessarily on a generic intake-collision case in the initial evaluation pilot, and shared docs/skills treated Codex, Codex Cloud or Graphify as assumed rather than optional capabilities.

## Current behaviour and security enforcement audit

### Cross-agent enforcement and mutation-route audit (28 November 2026)

| Control / route | Claude Code (2.1.331) | Antigravity (2.0 / IDE) | Codex (CLI / Desktop / Cloud) |
|---|---|---|---|
| Canonical instructions | `AGENTS.md` via `CLAUDE.md` | `AGENTS.md` auto-loaded (< 24 KB rule limit) | `AGENTS.md` native |
| Repository skills | Referenced via `prompts/README.md` | `.agents/skills/*/SKILL.md` auto-discovered | `.agents/skills/*/SKILL.md` auto-discovered |
| Infrastructure / MCP scoping | `.mcp.json` pins `nlzhllhkigmsvrzduefz` with `read_only=true&features=docs,database,debugging` (blocks writes even under `--bare`) | Global `supabase_mcp` OAuth plugin outside repo; cannot be scoped by `.mcp.json` | No hosted Supabase MCP configured in repository |
| Executable `PreToolUse` hook | `.claude/settings.json` (`mcp__Supabase__.*\|Bash`, `onFailure: "block"`, `permissions` undefined) → `.claude/hooks/guard-supabase-apply-migration.sh` → `scripts/guard-supabase-hook.sh claude` → `scripts/guard-supabase-migration.mjs` | `.agents/hooks.json` (`call_mcp_tool\|.*apply_migration.*`) → `../scripts/guard-supabase-hook.sh antigravity` → `scripts/guard-supabase-migration.mjs` | Documented `.codex/hooks.json` (`[features] hooks = true` + project trust); `--agent codex` supported in `guard-supabase-migration.mjs`, unverified at runtime (no `codex` CLI on host) |
| `apply_migration` behaviour | Staging `allow`; production / missing / unknown / malformed / Node failure `deny` | Staging `allow`; production / missing / unknown / malformed / launcher-caught failure `deny` | Prompt/instruction + sandbox only unless `.codex/hooks.json` is configured & trusted |
| `execute_sql`, `deploy_edge_function`, secrets & branch mutations | Staging `ask`; production / missing / unknown `deny` (plus `.mcp.json` `read_only=true`) | Staging `ask`; production / missing / unknown `deny` | Not exposed in repo |
| Direct CLI / Management API (`Bash` / `run_command`) | Guarded in `.claude/settings.json` (`Bash` matcher): denies `supabase db push`, `migration up/repair`, non-staging `functions deploy` / `secrets set`, and non-staging `api.supabase.com/v1/projects/` | `run_command` not intercepted in `.agents/hooks.json` (Antigravity requires explicit `decision` on every matched call); relies on terminal policy, absent tokens & `check-hosted-supabase-targets.mjs` | Relies on sandbox policy, absent tokens & `check-hosted-supabase-targets.mjs` |
| Production deployment workflow | `production-apply-migrations.yml` (manual dispatch from `main`, typed ref confirmation, `production` env `main`-only policy, `PRODUCTION_SUPABASE_ACCESS_TOKEN` env secret, `scripts/apply-hosted-migrations.sh`); `deploy-edge-functions.yml` (`main` push only, `supabase-automation` env `main`-only policy) | Same | Same |

### Fail-closed boundary limitations

- **Claude Code:** Setting `permissionDecision: "deny"` across all non-staging/unknown/malformed/fallback paths plus `"onFailure": "block"` in `.claude/settings.json` ensures hook crashes, missing `node`, timeouts and invalid JSON block execution rather than falling back to `ask` (except when `--bare` explicitly skips hooks, where `.mcp.json` `read_only=true` still blocks production MCP writes).
- **Antigravity:** `scripts/guard-supabase-hook.sh` resolves Homebrew/nvm `node` on minimal macOS GUI `PATH` and emits valid `{"decision":"deny",...}` on exit `0` when `node` or `guard-supabase-migration.mjs` is missing or crashes. However, Antigravity's documented `hooks.md` has no `onFailure: "block"` setting if the shell launcher itself fails to spawn or exceeds its 10s timeout, and Antigravity's `PreToolUse` failure mode is documented to fail open on unhandled crashes/timeouts.
- **Credential restriction:** `.mcp.json` restricts Claude Code's project Supabase MCP endpoint to `read_only=true` for production (`nlzhllhkigmsvrzduefz`). Antigravity's `supabase_mcp` and Codex's optional account tokens sit outside the repository, so token-level staging/read-only restriction requires Supabase OAuth/PAT scoping or separate staging-only tokens.

## Scope

- `scripts/guard-supabase-migration.mjs`, `scripts/guard-supabase-hook.sh`
- `.agents/hooks.json`, `.gitignore`, `.claude/settings.json`, `.claude/hooks/guard-supabase-apply-migration.sh`, `.mcp.json`
- `src/security/migrationGuardHooks.test.ts`, `src/security/productionApplyMigrationsWorkflow.test.ts`
- `.agents/skills/smarter-dog-booking-change/SKILL.md`, `.agents/skills/smarter-dog-release-review/SKILL.md`
- `CLAUDE.md`, `docs/migrations.md`, `docs/project-management.md`, `docs/runbooks/cloud-development.md`, `prompts/README.md`, `prompts/evals/codex-workflows.md`

## Non-goals

- Modifying production infrastructure, data, Supabase OAuth permissions or GitHub environment secrets.
- Merging or modifying PR #1320 or PR #1321.
- Adding an untested `.codex/hooks.json` without a local Codex runtime to verify `[features] hooks = true` and trust prompts.
- Resolving the 66 pre-existing ESLint warnings in unrelated test files and `useDaySettings.ts`.

## Verification status

| Capability | Status | Evidence / scope |
|---|---|---|
| Shared guard (`scripts/guard-supabase-migration.mjs`), shared launcher (`scripts/guard-supabase-hook.sh`) & Claude adapter | Executed | Synthetic CLI and Vitest regression tests (`src/security/migrationGuardHooks.test.ts`, `src/security/productionApplyMigrationsWorkflow.test.ts`) covering staging allow, production `apply_migration` / `execute_sql` / `deploy_edge_function` `deny`, missing/empty/padded/unknown `project_id`, malformed JSON/arguments, direct CLI/Management API shell blocks, failing-`node` & missing-script fallbacks, and `.mcp.json` `read_only=true`. |
| Claude Code 2.1.331 config & `SessionStart` | Executed | `claude doctor` reported zero issues with `.claude/settings.json` (`onFailure: "block"`, `mcp__Supabase__.*\|Bash`) and `.mcp.json`; `claude -p` launched `SessionStart` hooks cleanly. |
| Claude Code 2.1.331 live `PreToolUse` mock-MCP dispatch & 5 workflow evals | Blocked by account rate limit (unverified at model turn) | `claude -p --strict-mcp-config` against a harmless local mock MCP server hit Anthropic `429 rate_limit_error` (`usage_limit_reached`) before a model turn could invoke a tool or run the 5 workflow eval prompts. |
| Antigravity skill discovery & 5 synthetic workflow evaluations | Executed | All 5 synthetic fixtures passed in fresh `research` subagent sessions (`prompts/evals/codex-workflows.md#antigravity-evaluation-on-28-november-2026`), including zero false-positive skill load on `Intake collision`. |
| Antigravity `.agents/hooks.json` schema & command resolution | Verified via documentation + static/CLI tests | Verified against `agy-customizations/docs/hooks.md` and `migrationGuardHooks.test.ts` resolving `../scripts/guard-supabase-hook.sh` from `.agents/`. |
| Antigravity live host `PreToolUse` dispatch & timeout/spawn-failure | Unverified at runtime | Live host dispatch was not triggered during this session (`.agents/hooks.json` was authored mid-session and live MCP mutation tools were not invoked). |
| Codex CLI / Cloud live hook & eval execution | Unverified in this session | `codex` CLI is not installed on PATH; 27 Nov Codex CLI skill evals remain recorded in `prompts/evals/codex-workflows.md#initial-pilot-on-27-november-2026`. |
| Repository checks | Executed | `check:docs`, `lint` (0 errors, 66 pre-existing warnings; local Chromium icon render skipped), `typecheck`, `check:migrations`, `check:edge-auth` (31 functions), `test:release`, `test` and offline `build`. |

## Checkpoint

- **Revision and ownership** — Issue [#1322](https://github.com/leamonline/Smarter-dog-bookings/issues/1322), PR [#1323](https://github.com/leamonline/Smarter-dog-bookings/pull/1323), branch `feat/cross-agent-compatibility` from `origin/main@0348fa31`. Single writer.
- **Evidence** — Hardened `.mcp.json` (`read_only=true`), `.claude/settings.json` (`mcp__Supabase__.*|Bash`, `onFailure: "block"`), shared launcher `scripts/guard-supabase-hook.sh`, explicit `deny` across prohibited MCP/CLI/fallback paths, updated regression tests, verified `claude doctor`, ran full repository validation and documented runtime limits for Claude `429 usage_limit_reached` and missing local `codex`.
- **Next** — Push update to PR #1323, verify GitHub Actions pass on the new head SHA, and await owner merge approval. PRs #1320 and #1321 remain untouched.

## Acceptance evidence

GitHub records [PR #1323](https://github.com/leamonline/Smarter-dog-bookings/pull/1323) merged at exact authorised head `8e51dad4087c55787fbc98e8f9571b4d90202b44` into `main@43d2f9d7f467fd762f6562f2289832c3c364354b` on 28 November 2026 as an incremental cross-agent security and compatibility improvement. All five required pre-merge checks (`build`, `coverage`, `agent-tests`, `pr-production-smoke`, `migrations-applied`), `release-tool-tests`, `playwright-version`, `auth-core`, `SmarterDog | Default | Build - iOS` and `Vercel` passed on `8e51dad4`.

The remaining acceptance items (Codex desktop/CLI/cloud enforcement compatibility, Claude Code live mock-MCP hook verification, Antigravity live hook dispatch and host failure behaviour, agent-independent production credential isolation, and a cross-agent handover and independent review exercise) are preserved in follow-up issue [#1324](https://github.com/leamonline/Smarter-dog-bookings/issues/1324). The earlier checkpoint above records the pre-merge state.

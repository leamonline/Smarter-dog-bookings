# Cross-agent compatibility and fail-closed migration protection

- Status: Active
- Issue: [#1322](https://github.com/leamonline/Smarter-dog-bookings/issues/1322)
- Base: `origin/main@0348fa31e61af5eaba9c8cddce5c5f8de1b1dae3`
- Last verified: 28 November 2026
- Owners: Shared agent rules, hooks, skills, security tests and cross-agent documentation
- Dependencies: None (PRs #1320 and #1321 remain open and untouched)
- Related requirements: Synthetic verification, explicit target controls and approval boundaries in [AGENTS.md](../../../AGENTS.md)
- Related ADRs: [ADR 006](../../architecture/decisions/006-manual-target-verified-database-rollout.md)

## Goal

Ensure Smarter Dog Bookings can be developed interchangeably using Codex, Claude Code and Antigravity with consistent project knowledge, shared fail-closed migration protection, refined skills, tool-neutral documentation and durable session recovery.

## Why

PR #1315 and PR #1319 established `AGENTS.md`, repository skills under `.agents/skills/`, checkpoint recovery and the cloud development runbook, but agent safety controls and operational assumptions remained uneven across tools:

- Claude Code enforced `.claude/hooks/guard-supabase-apply-migration.sh`, whereas Antigravity had no `.agents/hooks.json` guard for `supabase_mcp` `apply_migration` or other production Supabase MCP calls even though `.mcp.json` and global MCP connectors can expose production (`nlzhllhkigmsvrzduefz`).
- The migration guard lived inside a Claude-specific bash script depending on `jq`, which could not be shared directly with Antigravity's camelCase `call_mcp_tool` hook contract.
- `smarter-dog-booking-change` triggered unnecessarily on a generic intake-collision case in the initial evaluation pilot, and shared docs/skills treated Codex, Codex Cloud or Graphify as assumed rather than optional capabilities.

## Current behaviour

### Safety audit across Codex, Claude Code and Antigravity (verified 28 November 2026)

| Surface | Shared / Claude Code | Codex (CLI / Cloud) | Antigravity (pre-change) |
|---|---|---|---|
| Canonical instructions | `AGENTS.md` (linked first in `CLAUDE.md`) | `AGENTS.md` (native) | `AGENTS.md` (discovered under 24 KB rule limit) |
| Repository skills | Referenced via `prompts/README.md` | `.agents/skills/*/SKILL.md` | `.agents/skills/*/SKILL.md` |
| Hosted CLI target check | `scripts/check-hosted-supabase-targets.mjs` (`npm run lint`) | Same | Same |
| Offline test & dev isolation | `vitest.config.ts` (`VITE_FORCE_OFFLINE=1`), `scripts/dev.mjs`, `scripts/lib/preview-guard.mjs` | Same | Same |
| Supabase MCP migration guard | `.claude/settings.json` -> `.claude/hooks/guard-supabase-apply-migration.sh` (`allow` staging, `ask` non-staging, `permissions` undefined) | No repo `.codex/` hook or Supabase MCP config; relies on `AGENTS.md` + sandbox approvals + CLI target checks | **Gap:** no `.agents/hooks.json`; global `supabase_mcp` `call_mcp_tool` had instruction-only protection |
| Session environment bootstrap | `.claude/settings.json` `SessionStart` (`CLAUDE_CODE_REMOTE=true` only) | Named Cloud environment / CI Actions | Local Mac or CI Actions |

## Desired behaviour

1. One shared Node 24 guard (`scripts/guard-supabase-migration.mjs`) owns project-ref classification (`STAGING_PROJECT_REF` vs `PRODUCTION_PROJECT_REF` vs missing/unknown) and fail-closed payload validation.
2. Both `.agents/hooks.json` (Antigravity `PreToolUse`) and `.claude/hooks/guard-supabase-apply-migration.sh` (Claude Code `PreToolUse`) delegate to that shared guard without duplicating security rules.
3. In Antigravity, `apply_migration` is permitted (`allow`) only for staging (`btjnxvgkpdbfrrqxvkfj`) and denied (`deny`) for production (`nlzhllhkigmsvrzduefz`), missing `project_id`, unknown destinations and malformed payloads; other `supabase_mcp` calls on non-staging or missing targets require per-call confirmation ignoring Always-Allow cache (`force_ask`).
4. In Claude Code, existing fail-closed semantics remain intact: staging returns `allow`, and production, unknown, missing or unreadable inputs return `ask` (with `permissions` undefined in `.claude/settings.json` and a bash fallback if `node` is unavailable).
5. Skill descriptions carry explicit negative trigger boundaries, shared docs treat Graphify, MCP servers and cloud workspaces as optional with fallbacks, and the five synthetic workflow evaluations pass in Antigravity.

## Scope

- `scripts/guard-supabase-migration.mjs` (shared guard)
- `.agents/hooks.json` and `.gitignore` (Antigravity hook wiring)
- `.claude/hooks/guard-supabase-apply-migration.sh` (thin Claude adapter)
- `src/security/migrationGuardHooks.test.ts` and `src/security/productionApplyMigrationsWorkflow.test.ts`
- `.agents/skills/smarter-dog-booking-change/SKILL.md` and `.agents/skills/smarter-dog-release-review/SKILL.md`
- `CLAUDE.md`, `docs/migrations.md`, `docs/project-management.md`, `docs/runbooks/cloud-development.md`, `prompts/README.md`, `prompts/evals/codex-workflows.md`

## Non-goals

- Modifying production infrastructure, data, Supabase settings or GitHub permissions.
- Merging or editing PR #1320 or PR #1321.
- Weakening `.claude/settings.json`, `check-hosted-supabase-targets.mjs` or `check-migrations-applied.yml`.
- Adding a `run_command` `PreToolUse` hook in Antigravity (Antigravity requires an explicit `decision` on every matched call, so matching `run_command` would either auto-allow shell commands or prompt unnecessarily on every read-only check; CLI target safety stays enforced by `check-hosted-supabase-targets.mjs`, `scripts/apply-hosted-migrations.sh` and `scripts/release/local-release.mjs`).

## Relevant code

- `.claude/hooks/guard-supabase-apply-migration.sh` and `.claude/settings.json`
- `src/security/productionApplyMigrationsWorkflow.test.ts`
- `scripts/check-hosted-supabase-targets.mjs`
- `.agents/skills/smarter-dog-booking-change/SKILL.md` and `.agents/skills/smarter-dog-release-review/SKILL.md`

## Architecture

A single Node >= 24 module (`scripts/guard-supabase-migration.mjs`) evaluates hook payloads for both Claude Code (`--agent claude`) and Antigravity (`--agent antigravity`). Agent-specific files remain thin adapters:

- Antigravity `.agents/hooks.json` matches `call_mcp_tool|.*apply_migration.*` per the Antigravity `PreToolUse` hook contract (`decision`: `"allow" | "deny" | "ask" | "force_ask"`).
- Claude Code `.claude/hooks/guard-supabase-apply-migration.sh` pipes stdin to `node scripts/guard-supabase-migration.mjs --agent claude` and emits a fail-closed `permissionDecision: "ask"` fallback if `node` or the script fails.

## Data/database changes

None.

## API changes

None.

## UI changes

None.

## Security/privacy considerations

All tests and evaluations use synthetic payloads and never call `apply_migration` against hosted projects or inspect production data. Exact string equality (`===`) gates staging allowance; whitespace-padded, case-altered, URL-wrapped, missing, non-string or unknown project identifiers fail closed.

## Dependencies

None.

## Risks

- Antigravity plugin hooks vs workspace `.agents/hooks.json` differ in top-level JSON structure (named hook keys vs `"hooks"` wrapper). Verified against `/Users/leam/.gemini/antigravity/builtin/skills/agy-customizations/docs/hooks.md`; runtime invocation inside a live Antigravity `PreToolUse` step cannot be self-triggered without invoking an actual tool call, so hook execution is verified directly via `node` + `.claude/hooks/guard-supabase-apply-migration.sh` against documented stdin schemas while Antigravity host dispatch is recorded as documented-verified.
- PR #1321 also edits `docs/runbooks/cloud-development.md` (currently open); keep edits minimal and tool-neutral so rebase/merge stays straightforward.

## Migration/rollout

Standard branch PR into `main`; no database migration or production deployment action required beyond normal CI.

## Implementation sequence

1. Implement `scripts/guard-supabase-migration.mjs`, `.agents/hooks.json`, `.gitignore` whitelist and thin `.claude/hooks/guard-supabase-apply-migration.sh` adapter.
2. Add comprehensive regression tests in `src/security/migrationGuardHooks.test.ts` and update `src/security/productionApplyMigrationsWorkflow.test.ts` to test the refactored Claude adapter without weakening any invariant.
3. Refine skill descriptions and negative trigger boundaries; update shared documentation to be tool-neutral with documented optional-tool fallbacks.
4. Execute the five synthetic workflow evaluations in Antigravity and record results in `prompts/evals/codex-workflows.md`.
5. Run the full verification suite (`check:docs`, `lint`, `typecheck`, `check:migrations`, `test`, `build`, `test:release`) and open a PR linked to `#1322`.

## Testing

- `npm run test -- src/security/migrationGuardHooks.test.ts src/security/productionApplyMigrationsWorkflow.test.ts`
- `npm run check:docs && npm run lint && npm run typecheck && npm run check:migrations && npm run test && npm run build && npm run test:release`

## Observability

Verification table in this plan and the PR summary explicitly separate executed checks, documentation-verified behaviour and unverified live host dispatch.

## Documentation updates

- `CLAUDE.md`, `docs/migrations.md`, `docs/project-management.md`, `docs/runbooks/cloud-development.md`, `prompts/README.md`, `prompts/evals/codex-workflows.md`, `.agents/skills/*/SKILL.md`.

## Definition of done

All verification checks pass, synthetic regression tests cover every failure mode, the five synthetic workflow evaluations are recorded for Antigravity, the checkpoint is updated, and a PR referencing `#1322` is open for review.

## Open questions

None.

## Verification status

| Capability | Status | Evidence / scope |
|---|---|---|
| Shared guard (`scripts/guard-supabase-migration.mjs`) & Claude adapter (`.claude/hooks/guard-supabase-apply-migration.sh`) | Executed | Synthetic CLI and unit tests in `src/security/migrationGuardHooks.test.ts` and `src/security/productionApplyMigrationsWorkflow.test.ts` covering staging allow, production `apply_migration` block/ask, missing/empty/padded/unknown `project_id`, malformed JSON/arguments, non-migration `supabase_mcp` `force_ask`, non-Supabase MCP `ask`, and missing-`node` shell fallback. |
| Antigravity `.agents/hooks.json` schema & command path resolution | Verified via documentation + static/CLI test | Verified against `/Users/leam/.gemini/antigravity/builtin/skills/agy-customizations/docs/hooks.md` and `migrationGuardHooks.test.ts` resolving `../scripts/guard-supabase-migration.mjs` from `.agents/`. |
| Antigravity host `PreToolUse` live dispatch inside a running tool step | Unverified at runtime | Live host hook dispatch is not triggered without invoking an actual MCP step; behaviour rests on documented `hooks.md` contract + direct CLI tests against documented stdin/stdout payloads. |
| Codex CLI / Claude Code live runtime execution | Unverified in this session | Codex CLI was previously piloted in `prompts/evals/codex-workflows.md` (27 Nov 2026); Claude Code and Codex live hook/session runs were not re-executed in this Antigravity session (Claude adapter executed directly via `bash`). |
| Antigravity skill discovery & 5 synthetic workflow evals | Executed | All 5 synthetic fixtures passed in fresh `research` subagent sessions (`prompts/evals/codex-workflows.md#antigravity-evaluation-on-28-november-2026`), including zero false-positive skill load on `Intake collision`. |
| Repository documentation, lint, types, migrations, unit/security tests & build | Executed | `check:docs`, `lint` (66 existing test-file/hook warnings, Chromium icon render skipped locally), `typecheck`, `check:migrations`, `test:release`, `test` (528 files, 5,899 tests) and offline `build` passed. |

## Checkpoint

- **Revision and ownership** — Issue [#1322](https://github.com/leamonline/Smarter-dog-bookings/issues/1322), branch `feat/cross-agent-compatibility` from `origin/main@0348fa31`. Single writer.
- **Evidence** — Shared guard + Antigravity/Claude hook adapters implemented and verified with synthetic tests (`528` files / `5,899` Vitest tests, `check:docs`, `lint`, `typecheck`, `check:migrations`, `test:release`, offline `build`); all 5 synthetic workflow evaluations passed in fresh Antigravity subagent sessions and are recorded in [codex-workflows.md](../../../prompts/evals/codex-workflows.md#antigravity-evaluation-on-28-november-2026).
- **Next** — Review PR on `feat/cross-agent-compatibility` (checks, live host hook check if desired, and separate merge decision). PRs #1320 and #1321 remain open and untouched.

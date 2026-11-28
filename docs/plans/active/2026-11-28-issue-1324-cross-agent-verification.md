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

Complete runtime verification of migration and mutation protections across Codex Desktop/CLI, Claude Code and Antigravity, establish credential-level isolation enforcing the 4-tier target architecture, and prepare/execute a low-risk cross-agent handover and independent review drill once prerequisites are met.

## Why

[PR #1323](https://github.com/leamonline/Smarter-dog-bookings/pull/1323) landed shared hook guard logic (`scripts/guard-supabase-migration.mjs` + `scripts/guard-supabase-hook.sh`), Antigravity `.agents/hooks.json`, Claude Code `.claude/settings.json` (`onFailure: "block"`) and `.mcp.json` (`read_only=true`). Runtime proof, credential-level isolation across developer tools, and cross-agent handover evidence remained incomplete.

## Verified baseline & post-merge reconciliation (28 November 2026)

- **PR #1325:** Head `facca61aebfb2eced7626534c5858ad796fdbfef` merged into `main` as `9ee7158bf8e4fbe3662e6b95c65fa1a70f84f469` (`2026-11-28T02:05:38Z`); completed plans are archived in `docs/plans/completed/`.
- **PR #1321 SHA reconciliation (verified directly from GitHub API & git):**
  - Previously typed authorisation string (`09572431ec58d4869e7a65493bd5b865646d673b75`) is **42 characters** long (containing an extra `d6` at indices 35–36).
  - Actual GitHub PR #1321 `head.sha`, `commits[-1]`, and `git rev-parse 70d188181a369868760e6d6e47e46d5c30f83b37^2` is **`09572431ec58d4869e7a65493bd5b86564673b75`** (**40 characters**).
  - PR #1321 merged into `main` as `70d188181a369868760e6d6e47e46d5c30f83b37` at `2026-11-28T02:06:05Z` (`merged_by: leamonline`); diff vs `9ee7158bf8e4fbe3662e6b95c65fa1a70f84f469` updated only `docs/plans/completed/2026-11-27-cloud-first-development.md` and `docs/runbooks/cloud-development.md`.
- **Post-merge `main` checks (`70d188181a369868760e6d6e47e46d5c30f83b37`):** `CI` (`46096392572`, including `build`, `agent-tests`, `release-tool-tests`, `playwright-version`, `coverage`, `e2e`), `Migrations Applied Check` (`46096392387`), `iPhone auth` (`46096392375`), `Vercel`, and `SmarterDog | Default` (Xcode Cloud) all passed (`success`).
- **PR #1320:** Untouched (`OPEN`, `codex/1193-inbox-controls`, head `132610a2b20bced4cf4b199bd1ad3053c776bf2d`).

## Evidence status by category (implemented vs runtime vs unverified vs blocked)

### Stage 1 — Credential isolation audit, storage design & exact approval-gated plan

#### 1. Enforcement-layer matrix (URL params and hooks are NOT credential isolation)

| Layer | Examples | Where enforced | Can an agent / alternative tool bypass it? |
| --- | --- | --- | --- |
| **Client configuration & hooks** | `.agents/hooks.json`, `.claude/settings.json` (`onFailure: "block"`), `scripts/guard-supabase-hook.sh` | Local agent runtime | **Yes** — via `--bare`, local file edits, direct CLI/API calls, or Antigravity host fail-open on unhandled crash/timeout. |
| **Endpoint / MCP gateway parameters** | `?project_ref=...&read_only=true&features=...` (`.mcp.json`) | Hosted MCP server (`mcp.supabase.com/mcp`) | **Partial** — blocks write tools and runs SQL as a read-only Postgres user only on calls using that URL; ineffective if caller hits `api.supabase.com/v1` or another endpoint using a broad OAuth/PAT. |
| **Supabase account / organisation role** | Separate org/project memberships (`Owner`, `Administrator`, `Developer`, `Read-Only` [Team/Enterprise], `No-Access`) | Supabase IAM (server-side) | **No** — cross-project requests return HTTP `403` regardless of client/URL (`verify-supabase-credential-isolation.yml`, run `40757712758`). |
| **Credential scope (Scoped PAT `sbp_fc...`)** | Project-pinned token + per-capability toggles starting from `No access` | Supabase Auth / MCP / Management API (server-side) | **No** across PAT-authenticated interfaces (bounded by owning account's role). Direct Postgres passwords (`--db-url` / `psql`) bypass PAT scopes if present locally. |

#### 2. Verified Supabase Scoped PAT permission options & interface coverage

From official Supabase documentation (`supabase.com/docs`):

- **Token scoping rules:** Scoped PATs (`sbp_fc...`) bind to **selected project(s)** (or all projects in selected orgs) and cannot exceed the owning account's role. Token scopes **cannot be edited after creation** (must be revoked/deleted and regenerated).
- **Available permission categories (Read vs Read-Write):** `Database`, `Edge Functions`, `Auth`, `Storage`, `Secrets` / `API Key Secrets`, `Analytics / Logs`, `Project Settings`, and `Branches`.
  - Starting from **No access** and toggling strictly needed capabilities is recommended because broad "Read-only" presets may expose sensitive settings; omitting **API Key Secrets** / **Secrets** prevents retrieving `service_role` keys or administrative secrets.
  - SQL queries executed through Management API / MCP run **read-only** unless **Database: Read-Write** is explicitly enabled.
- **Alternative-interface coverage (`MCP`, `Management API`, `CLI`, `Direct Postgres`):**
  - **Hosted MCP (`mcp.supabase.com/mcp`):** Validates Scoped PAT `sbp_fc...` scopes per tool (`403` on excluded projects/permissions; read-only SQL unless `Database: Read-Write` is set).
  - **Management API (`api.supabase.com/v1`):** Validates Scoped PAT per endpoint (`403` with `missing_permissions` array on denied operations or non-selected projects).
  - **Supabase CLI (Management operations):** `functions deploy`, `secrets set`, project commands enforce the same `sbp_fc...` PAT permissions. **Important bypass vector:** direct Postgres connections (`--db-url`, Session Pooler, `psql`) authenticate via Postgres role password independently of PAT scopes — so local checkouts must **never** store production DB passwords or `service_role` secrets (already verified absent: no `.env.local` or `supabase/.temp/`).

#### 3. Secure credential storage & plugin-disruption check

- **Zero plaintext tokens in files/logs/comments:** `agy-customizations/docs/mcp_servers.md` does not document `${ENV_VAR}` expansion inside HTTP `headers`, whereas `/usr/bin/security` (macOS Keychain) and Node 24 are installed locally. Scoped PATs can be stored encrypted in **macOS Login Keychain** (`security add-generic-password`) and read strictly in-memory by a local stdio-to-HTTP launcher under `~/.gemini/config/bin/` registered via Antigravity's documented **Stdio transport (`command`, `args`)** — keeping plaintext PATs out of `~/.gemini/config/mcp_config.json`, `.env*`, git, logs, and issue comments. (Alternatively, browser OAuth using dedicated per-environment/Read-Only Supabase accounts requires no local PAT file.)
- **Disabling Antigravity `supabase` plugin — disruption check:** Inspected all 7 plugin `mcp_config.json` files (`cloudflare`, `context7`, `linear`, `postman`, `sentry`, `supabase`, `vercel-plugin`), `plugin.json` metadata, and repo references. None of the other 8 enabled plugins (`auth0`, `cloudflare`, `context7`, `linear`, `postman`, `sentry`, `swarm`, `vercel-plugin`) depend on `supabase`. Disabling `"supabase"` in `/Users/leam/.gemini/config/config.json` removes only the unscoped `supabase_mcp` endpoint and its two bundled reference skills (`supabase`, `supabase-postgres-best-practices`).

#### 4. Exact proposed configuration & rollback procedure (NOT executed — awaiting explicit approval)

1. **Owner provisions two `sbp_fc...` Scoped PATs in Supabase Dashboard → Access Tokens (from *No access*):**
   - **Staging dev PAT:** Project = `btjnxvgkpdbfrrqxvkfj` only (`nlzhllhkigmsvrzduefz` excluded); toggle `Database` (Read-Write), `Edge Functions` (Read-Write as needed for staging), `Project Settings` (Read), `Analytics/Logs` (Read). Keep production excluded so production calls return HTTP `403`.
   - **Production inspection PAT:** Project = `nlzhllhkigmsvrzduefz` only (`btjnxvgkpdbfrrqxvkfj` excluded); toggle `Database` (**Read** only), `Analytics/Logs` (**Read** only), `Project Settings` (**Read** only); leave **Database: Read-Write**, **API Key Secrets / Secrets**, **Edge Functions (Write)**, **Auth (Write)**, **Storage (Write)** unchecked.
2. **Owner stores tokens in macOS Login Keychain** (never on disk in plaintext) and reviews/approves installing the user-local Keychain stdio MCP entries in `/Users/leam/.gemini/config/mcp_config.json` (`supabase-staging` + `supabase-prod-readonly`), preserving `supabase` in both server names so `scripts/guard-supabase-migration.mjs` continues matching them, plus disabling `"supabase"` plugin in `/Users/leam/.gemini/config/config.json`. (Retain Claude Code `.mcp.json` `read_only=true` and `onFailure: "block"`; keep Codex free of Supabase MCP.)
3. **Post-change verification (synthetic/read-only):** Confirm via non-mutating requests that staging PAT returns `403` on `nlzhllhkigmsvrzduefz`, production inspection PAT returns `403` on `btjnxvgkpdbfrrqxvkfj` and `403` / read-only refusal on `api.supabase.com/v1` write or secrets endpoints, and no plaintext tokens appear on disk or logs.
4. **Rollback procedure:**
   - Revoke both new `sbp_fc...` PATs in Supabase Dashboard and delete their macOS Keychain items (`security delete-generic-password`).
   - Re-enable `"supabase"` in `/Users/leam/.gemini/config/config.json`, revert `/Users/leam/.gemini/config/mcp_config.json`, remove any local helper script under `~/.gemini/config/bin/`, and reload Antigravity. GitHub `Production` / `staging` / `supabase-automation` CI environments remain untouched.

### Stage 2 — Codex Desktop (coordinated via issue #1324; handled independently by Codex Desktop)

- Bundled runtime verified read-only: `/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex` (`codex-cli 0.171.0-alpha.13.2`, `hooks` = `stable` `true`). Global `~/.codex/config.toml` untouched.
- Not duplicating Codex Desktop's Stage 2 execution here; waiting for Codex Desktop results on issue `#1324`.

### Stage 3 — Claude Code runtime verification status

- Held until after `10pm (Europe/London)` quota reset (`429 usage_limit_reached`; no premature retries executed).

### Stage 4 — Antigravity live probes & isolated host-failure check

- **Verified live `PreToolUse` `deny` dispatch (`0cce1d3e`, `c0226ce1`, `2899dd36`):** Host pre-tool hook denied production `apply_migration`, production `execute_sql`, and malformed JSON `Arguments` on nonexistent servers.
- **Host failure-mode isolation check (`cb73e074`):** `Workspace: "branch"` subagents do **not** reload `.agents/hooks.json` independently of the Smarter Dog Bookings parent workspace; `agy` CLI is absent on host; `ConversationService` exposes no new-project registration without altering `~/.gemini/config/` or interactively opening a separate scratch window. Thus **live Antigravity host-binary failure behaviour** remains blocked from execution inside this Smarter Dog Bookings workspace session.
- **Official Antigravity documentation behaviour:** Official `antigravity.google/docs/hooks.md` confirms Antigravity `PreToolUse` hooks **fail open** when a hook times out, crashes without valid JSON, emits malformed JSON, or fails to spawn. This verified fail-open host design is explicitly incorporated into Stage 1 so credential-level isolation does not rely on Antigravity hooks.
- **Standalone scratch workspace kit staged:** Created harmless scratch project files under conversation artifact scratch (`scratch/antigravity-hook-lab/`) so an independent Antigravity 2.0 window can run the 5 failure probes (timeout, crash, missing executable, malformed JSON, missing dependencies) without ever modifying Smarter Dog Bookings safeguards.

### Stage 5 — Cross-agent handover candidate selection (revised; NOT started yet)

Per owner instruction to avoid customer communication work initially and select a genuinely low-risk documentation or isolated regression-test task:

- **Primary recommended candidate:** **Documentation truth & superseded-plan reconciliation** — update [docs/README.md](../../README.md) (`Last verified: 2 September 2026`) and archive demonstrably superseded active plan [2026-10-19-whatsapp-business-app-echoes.md](2026-10-19-whatsapp-business-app-echoes.md) (explicitly marked `Superseded` 21 Oct 2026 by [2026-10-21-staff-reply-clears-stale-ai-drafts.md](../completed/2026-10-21-staff-reply-clears-stale-ai-drafts.md)) and/or [2026-11-22-ios-app.md](2026-11-22-ios-app.md) (`Draft. Superseded in direction`) per `AGENTS.md`, opening a small dedicated GitHub issue or tying to documentation housekeeping, verified with `npm run check:docs` + `lint` + `typecheck`.
- **Alternative candidate (isolated regression tests):** Mirror `scripts/release/migration-security.test.mjs` coverage into Vitest (`src/security/`) for `verify-supabase-credential-isolation.yml` + add explicit `guard-supabase-hook.sh` crash/empty-output assertions in `src/security/migrationGuardHooks.test.ts` (zero production/customer-code impact).
- **Strict prerequisite gate:** Do **not** start Stage 5 until Stages 2–4 runtime evidence and approved credential-isolation controls are satisfied.

## Testing

- `npm run check:docs && npm run check:migrations && git diff --check`
- `npm run test -- src/security/migrationGuardHooks.test.ts src/security/docsLinkCheck.test.ts src/security/productionApplyMigrationsWorkflow.test.ts`
- `npm run lint && npm run typecheck`

## Checkpoint

- **Revision and ownership** — Issue [#1324](https://github.com/leamonline/Smarter-dog-bookings/issues/1324), Draft PR [#1326](https://github.com/leamonline/Smarter-dog-bookings/pull/1326) (`DO NOT MERGE`), branch `feat/1324-cross-agent-verification` from `main@70d18818`. Single writer on plan; Codex Desktop owns Stage 2 execution.
- **Verified implemented / runtime** — Reconciled PR #1321 exact 40-char head `09572431ec58d4869e7a65493bd5b86564673b75` (`70d18818`) vs previously typed 42-char string (`09572431ec58d4869e7a65493bd5b865646d673b75`); confirmed `main` post-merge CI `46096392572` `success`; completed Scoped PAT permission/interface/storage/plugin audit + rollback spec; documented Antigravity fail-open host behaviour and staged scratch lab; prepared low-risk Stage 5 doc/test candidates (not `#1186`).
- **Unverified / Blocked** — Owner approval required before creating PATs or editing `/Users/leam/.gemini/config/`; Codex Desktop live Stage 2 awaited via `#1324`; Antigravity host-binary failure probes blocked in-session (`agy` CLI absent); Claude Code held on `429` until `10pm (Europe/London)`.
- **Next** — Present final Stage 1 permission/storage changes for explicit approval, coordinate with Codex Desktop on `#1324`, retry Claude Code after `10pm (Europe/London)`, and confirm Stage 5 low-risk task selection before execution.

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

Complete runtime verification of migration and mutation protections across Codex Desktop/CLI, Claude Code and Antigravity, establish credential-level isolation enforcing the 4-tier target architecture, and prepare/execute an end-to-end cross-agent handover and independent review drill once prerequisites are met.

## Why

[PR #1323](https://github.com/leamonline/Smarter-dog-bookings/pull/1323) landed shared hook guard logic (`scripts/guard-supabase-migration.mjs` + `scripts/guard-supabase-hook.sh`), Antigravity `.agents/hooks.json`, Claude Code `.claude/settings.json` (`onFailure: "block"`) and `.mcp.json` (`read_only=true`). Runtime proof, credential-level isolation across developer tools, and cross-agent handover evidence remained incomplete.

## Verified baseline & post-merge reconciliation (28 November 2026)

- **PR #1325** (`facca61aebfb2eced7626534c5858ad796fdbfef`) merged cleanly into `main` as `9ee7158bf8e4fbe3662e6b95c65fa1a70f84f469` (`2026-11-28T02:05:38Z`); completed plans are archived in `docs/plans/completed/`.
- **PR #1321 reconciliation:** Previously authorised SHA `09572431ec58d4869e7a65493bd5b865646d673b75` matches GitHub `headRefOid` (`09572431ec58d4869e7a65493bd5b865646d673b75`) and merged into `main` as `70d188181a369868760e6d6e47e46d5c30f83b37` (`2026-11-28T02:06:05Z`).
- **PR #1320:** Untouched (`OPEN`, `codex/1193-inbox-controls`, head `132610a2b20bced4cf4b199bd1ad3053c776bf2d`).

## Evidence status by category (implemented vs runtime vs unverified vs blocked)

### Stage 1 — Credential isolation analysis & exact configuration / rollback plan

#### 1. Enforcement-layer comparison (what restricts what)

URL parameters and repository hooks are **not** equivalent to credential-level isolation:

| Layer | Examples in this repository / host | Where enforced | Can an agent or CLI bypass it? |
| --- | --- | --- | --- |
| **Client configuration & hooks** | `.agents/hooks.json`, `.claude/settings.json` (`onFailure: "block"`), `scripts/guard-supabase-hook.sh`, `.mcp.json` | Local agent runtime | **Yes** — via `--bare`, local file edits, alternative CLIs, or host binary fail-open on Antigravity timeout/crash. |
| **Endpoint / MCP gateway parameters** | `https://mcp.supabase.com/mcp?project_ref=nlzhllhkigmsvrzduefz&read_only=true&features=docs%2Cdatabase%2Cdebugging` (`.mcp.json`) | Hosted Supabase MCP server (`mcp.supabase.com`) | **Partial** — blocks writes and account tools on calls sent through that URL (`read_only=true` executes SQL under a read-only Postgres role), **but** if the backing OAuth token/PAT carries write rights, a client can change URLs or hit `api.supabase.com/v1` directly. |
| **Supabase account / organisation role** | Separate org/project memberships (`Owner`, `Administrator`, `Developer`, `Read-Only` on Team/Enterprise, `No-Access`); CI staging vs prod account separation | Supabase IAM (server-side) | **No** — server rejects unauthorised projects with HTTP `403` regardless of client/URL (`verify-supabase-credential-isolation.yml` run `40757712758`). |
| **Credential scope (Scoped PAT `sbp_fc...`)** | Supabase Scoped Personal Access Tokens (`sbp_fc...`) pinned to selected project(s) and capability toggles (e.g., *Database: Read* only vs *Read-Write*) | Supabase Auth / API / MCP server-side | **No** (bounded by the owning account's role; never grants more access than the account holds, and enforces SQL read-only unless Database Read-Write is granted). |

#### 2. Current state observed (read-only)

1. **GitHub Actions CI/CD (already credential-isolated):**
   - `Production` & `supabase-automation` (`main`-only deployment branch policy): hold `PRODUCTION_SUPABASE_ACCESS_TOKEN` / `SUPABASE_AUTOMATION_TOKEN`; run `40757712758` proved `SUPABASE_AUTOMATION_TOKEN` reads `nlzhllhkigmsvrzduefz` and receives HTTP `403` on staging (`btjnxvgkpdbfrrqxvkfj`). Note: `verify-supabase-credential-isolation.yml` tests `supabase-automation` + `staging`; `Production` (`PRODUCTION_SUPABASE_ACCESS_TOKEN`) is exercised only by `production-apply-migrations.yml` / `database-backup.yml`.
   - `staging` (`main`-only deployment branch policy): holds `STAGING_SUPABASE_ACCESS_TOKEN`; run `40757712758` proved it reads `btjnxvgkpdbfrrqxvkfj` and receives HTTP `403` on production (`nlzhllhkigmsvrzduefz`).
2. **Local checkout:** Neither `.env.local` nor `supabase/.temp/` exists.
3. **Antigravity (`supabase_mcp`):** `/Users/leam/.gemini/config/plugins/supabase/mcp_config.json` (`0.1.17-agy.a224d9f1`) uses `"serverUrl": "https://mcp.supabase.com/mcp"` with **no** `project_ref=`, `read_only=true`, or `features=`, relying on browser OAuth across all projects/orgs accessible to the user's Supabase account (`list_plugin_accounts` reports no managed Antigravity sign-in provider).
4. **Claude Code (`2.1.331`):** Repo `.claude/settings.local.json` enables `.mcp.json` (`project_ref=nlzhllhkigmsvrzduefz&read_only=true&features=docs%2Cdatabase%2Cdebugging`); interactive OAuth still determines the underlying token authority if invoked with `--bare` against another config/CLI.
5. **Codex (`~/.codex/config.toml`):** No Supabase MCP server configured (`node_repl`, `graphify`, `home_assistant_mcp` only).

#### 3. Exact target configuration changes & rollback procedures (awaiting owner approval — NOT applied)

To realise the 4-tier target architecture (**Local dev → Project-scoped staging read/write → Production read-only inspection → Production mutations exclusively via GitHub workflows**) with real credential-level enforcement:

- **Step A (Credential-level scoping in Supabase Dashboard — Owner action):**
  1. Provision two dedicated **Scoped PATs (`sbp_fc...`)** from Supabase Dashboard → Account Settings → Access Tokens (ideally under the separated non-Owner/automation posture already used in CI, or with explicit project selection + minimal permissions starting from *No access*):
     - **Staging dev PAT (`sbp_fc_...`):** Selected project = **staging only** (`btjnxvgkpdbfrrqxvkfj`); Database + Edge Functions read/write enabled as needed for staging dev/testing; **production (`nlzhllhkigmsvrzduefz`) excluded** (so calls to production fail HTTP `403` at Supabase regardless of hook/URL).
     - **Production read-only PAT (`sbp_fc_...`):** Selected project = **production only** (`nlzhllhkigmsvrzduefz`); start from *No access* and enable only read-only capabilities required for diagnostics (e.g., *Database: Read*, *Project Settings: Read* if needed, avoiding API-key/secret read permissions if unneeded) — **Database read-write unchecked** so Supabase executes SQL strictly read-only at the credential layer.
  2. Do **not** sign local MCP sessions into an all-project Owner OAuth session; store tokens only in user-local shell env / untracked config, never in Git.
- **Step B (Client & endpoint alignment — requires owner approval for machine-local files):**
  1. **Antigravity:** Disable the unscoped plugin MCP (`supabase` plugin in `/Users/leam/.gemini/config/config.json` -> `{"plugins": {"supabase": {"enabled": false}}}` or sign out of broad OAuth), and configure two explicitly scoped HTTP MCP entries in `/Users/leam/.gemini/config/mcp_config.json` (which documents `mcpServers.<name>.url` + HTTP headers, matching `plugins/supabase/mcp_config.json`'s `"headers"` key):
     - `supabase-staging`: `https://mcp.supabase.com/mcp?project_ref=btjnxvgkpdbfrrqxvkfj` with `Authorization: Bearer ${STAGING_MCP_TOKEN}` (or local env/token injection; confirm Antigravity env interpolation vs literal user-local file) — server names containing `supabase` still match `scripts/guard-supabase-migration.mjs` `isSupabaseServerName()`.
     - `supabase-prod-readonly`: `https://mcp.supabase.com/mcp?project_ref=nlzhllhkigmsvrzduefz&read_only=true&features=docs%2Cdatabase%2Cdebugging` with `Authorization: Bearer ${PROD_READONLY_MCP_TOKEN}`.
  2. **Claude Code (`.mcp.json`):** Retain `read_only=true&project_ref=nlzhllhkigmsvrzduefz&features=docs%2Cdatabase%2Cdebugging`, and optionally split or document `supabase-staging` vs `supabase` with `sbp_fc...` scoped credentials instead of broad Owner OAuth.
  3. **Verification:** Run an equivalent read-only credential probe (like `verify-supabase-credential-isolation.yml`): verify staging PAT returns `403` on `nlzhllhkigmsvrzduefz` and production read-only PAT rejects a harmless disallowed write (or `POST` DML in a rolled-back / rejected statement check, or inspecting capability denial) and returns `403` on `btjnxvgkpdbfrrqxvkfj`.
- **Rollback procedure:**
  1. Revoke newly minted `sbp_fc...` PATs in Supabase Dashboard → Access Tokens.
  2. Restore `/Users/leam/.gemini/config/config.json` (`"supabase"` enabled) and `/Users/leam/.gemini/config/mcp_config.json` (empty `{}` or previous contents), then restart Antigravity / reload MCP servers.
  3. Leave CI environments (`Production`, `staging`, `supabase-automation`) untouched — GitHub deployment branch policies remain active throughout.

### Stage 2 — Codex Desktop bundled runtime findings & handover prompt

- **Verified bundled runtime (no new installation performed):**
  - `which codex` failed earlier solely because `/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin` is not in shell `PATH`.
  - Codex Desktop (`/Applications/ChatGPT.app`) **already bundles `codex-cli 0.171.0-alpha.13.2`** (`/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex` → `CodexCLI.app/Contents/MacOS/codex`).
  - `codex features list` on that bundled binary confirms **`hooks` is `stable` (`true` by default)**. Binary inspection confirms `.codex/hooks.json`, `PreToolUse`, `hookSpecificOutput` (`hookEventName: "PreToolUse"`, `permissionDecision`, `permissionDecisionReason`), exit `2` blocking + stderr feedback, `~/.codex/.hook-trust/` trust tracking, and `--dangerously-bypass-hook-trust`.
  - `~/.codex/config.toml` remains **unmodified** (`approval_policy = "never"`, `trust_level = "trusted"` for this repo, `[features] memories = true`).
  - **Is a separate CLI installation required?** **No** for running inside Codex Desktop or invoking `/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex` directly. Adding a standalone CLI on `PATH` is optional (either symlink/PATH-export the bundled `bin/` or install officially via `brew install --cask codex`, `npm install -g @openai/codex`, or `curl -fsSL https://chatgpt.com/codex/install.sh | sh`).
- **Self-contained Codex Desktop verification prompt:** (ready to paste directly into Codex Desktop against an isolated test/branch without modifying global `~/.codex/config.toml` or touching real credentials):

```text
Verify Smarter Dog Bookings `.codex/hooks.json` compatibility in Codex Desktop without modifying `~/.codex/config.toml`, production credentials, or `main`.

1. Confirm runtime & config posture (read-only):
   - Print `/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex --version` and `features list | grep -E '^hooks\b'`.
   - Confirm `~/.codex/config.toml` was not edited and no Supabase MCP server is enabled in `~/.codex/config.toml`.
2. In an isolated temporary git branch/worktree (never commit to `main` and never run real `supabase` commands or API calls):
   - Create a temporary `.codex/hooks.json` with a `PreToolUse` matcher `"Bash|mcp__.*"` pointing to `"./scripts/guard-supabase-hook.sh codex"` (approve its hook-trust prompt if Codex Desktop asks once).
   - Verify live host `PreToolUse` interception across:
     a) Blocked shell command: run `supabase db push` or `curl https://api.supabase.com/v1/projects/nlzhllhkigmsvrzduefz/database/query` (harmless/blocked — expect immediate `PreToolUse` denial BEFORE command execution).
     b) Synthetic MCP payload check via `node scripts/guard-supabase-migration.mjs --agent codex`: verify `allow` on staging (`btjnxvgkpdbfrrqxvkfj`), `deny` on production (`nlzhllhkigmsvrzduefz`), `deny` on missing/unknown `project_id`, `deny` on malformed JSON, and non-zero/missing-Node wrapper denial via `scripts/guard-supabase-hook.sh codex`.
     c) If testing Codex `PreToolUse` crash/timeout behaviour on an isolated mock tool script, record whether Codex Desktop fails closed (`exit 2` / non-zero) or fails open on invalid JSON / missing script / timeout.
   - Run the existing 5 synthetic read-only workflow evaluations in `prompts/evals/codex-workflows.md` (without touching hosted Supabase).
3. Clean up any temporary `.codex/hooks.json` test edits unless creating a reviewed PR branch for `#1324`, and report exact commands, raw hook block outputs, any host caveats (`approval_policy = "never"` interaction with `.hook-trust` or hook failure modes), and pass/fail status per check.
```

### Stage 3 — Claude Code runtime verification status

- Still **blocked on quota** (`429 rate_limit_error`, `usage_limit_reached`, `seven_day` quota resets `10pm (Europe/London)`). No retries made before reset per Decision 5.

### Stage 4 — Antigravity live probes & host failure testing status

- **Verified live host `PreToolUse` `deny` dispatch (`0cce1d3e`, `c0226ce1`, `2899dd36`):**
  - `call_mcp_tool` on `synthetic_nonexistent_mcp` / `apply_migration` (`nlzhllhkigmsvrzduefz`) → denied by host pre-tool hook.
  - `call_mcp_tool` on `synthetic_nonexistent_supabase` / `execute_sql` (`nlzhllhkigmsvrzduefz`) → denied by host pre-tool hook.
  - `call_mcp_tool` with malformed `Arguments: "{not-json"` → denied by host pre-tool hook.
- **Decision 4 scratch-workspace isolation check (`cb73e074` — verified blocker, safeguards untouched):**
  - Tested `invoke_subagent(..., Workspace: "branch")` (`cb73e074`): modifying `.agents/hooks.json` inside the disposable branched worktree did **not** take effect for `call_mcp_tool` — Antigravity continued running the Smarter Dog Bookings parent workspace's `.agents/hooks.json` (`Blocked MCP apply_migration against production...` instead of `BRANCHED_WORKSPACE_HOOK_MARKER`). `cb73e074` was killed and Smarter Dog Bookings `.agents/hooks.json` stayed completely untouched.
  - Verified `agy` CLI is absent (`which agy` / `which antigravity` not found; `/Applications/Antigravity.app` bundles `Antigravity`, `language_server`, `agy-desktop-helper`, `agy-desktop-rtc`, `agy-desktop-script`, `cable_ble_scanner`), and `ConversationService` (`conversations/SKILL.md`) has no API to register a new standalone scratch project without altering `~/.gemini/config/` or interactively opening a scratch folder in Antigravity 2.0 UI.
  - Therefore, **live Antigravity host-binary failure behaviour** across the 5 failure modes (**hook timeout, process crash, missing executable, malformed output, missing dependencies**) remains **unverified at the host binary layer** and **blocked** from execution inside this Smarter Dog Bookings workspace session.
  - **Architectural incorporation into Decision 1:** Antigravity's documented `hooks.md` exposes no `onFailure: "block"` field, and standard `PreToolUse` command-hook architectures default to **fail-open** when a hook crashes without JSON, times out, or fails to spawn. While `scripts/guard-supabase-hook.sh` traps internal `node`/script failures cleanly inside exit `0`, host-level fail-open risk means Antigravity hooks are **defence-in-depth only**, reinforcing Decision 1's requirement for server-side Supabase credential isolation.
- **Ready-to-run isolated scratch-workspace failure test pack (run in a separate Antigravity 2.0 window opened on an empty `/tmp/agy-hook-lab` or Desktop scratch folder — never inside Smarter Dog Bookings):**

```json
{
  "failure-probe-timeout": {
    "PreToolUse": [{ "matcher": "call_mcp_tool", "hooks": [{ "type": "command", "command": "sleep 15", "timeout": 2 }] }]
  },
  "failure-probe-crash": {
    "PreToolUse": [{ "matcher": "call_mcp_tool", "hooks": [{ "type": "command", "command": "sh -c 'exit 1'" }] }]
  },
  "failure-probe-missing-exec": {
    "PreToolUse": [{ "matcher": "call_mcp_tool", "hooks": [{ "type": "command", "command": "/nonexistent/guard-hook-bin" }] }]
  },
  "failure-probe-malformed-json": {
    "PreToolUse": [{ "matcher": "call_mcp_tool", "hooks": [{ "type": "command", "command": "printf '{bad-json\n'" }] }]
  },
  "failure-probe-missing-deps": {
    "PreToolUse": [{ "matcher": "call_mcp_tool", "hooks": [{ "type": "command", "command": "sh -c 'PATH=/nonexistent node -v'" }] }]
  }
}
```
Enable **one** entry at a time in the scratch project's `.agents/hooks.json`, call `call_mcp_tool(ServerName="synthetic_nonexistent_mcp", ToolName="apply_migration", Arguments={"project_id":"nlzhllhkigmsvrzduefz"})`, and record whether the host denies (`tool call denied by pre-tool hook`), falls back to an approval prompt (`ask`), or reaches the tool dispatcher (meaning `synthetic_nonexistent_mcp` fails with unknown server — confirming **fail-open**).

### Stage 5 — Cross-agent handover candidate prepared (NOT started yet)

- **Selected candidate issue:** **[#1186](https://github.com/leamonline/Smarter-dog-bookings/issues/1186) — Stage 1 ("Safety fixes first — no new selector or combined-feed UI")**.
- **Why it satisfies Decision 6 criteria:**
  - Genuine open issue with an explicitly bounded, independently shippable Stage 1 PR (`Stage 1 → Stage 2 → Stage 3`).
  - Zero `database-migration` or `production-risk` labels, no external secret blocker (unlike `#994`, which waits on Vercel `SENTRY_AUTH_TOKEN`), and no overlap with `#1193`/`PR #1320`.
  - Confirmed still unimplemented on `main`: `src/components/views/inbox/workspace/useInboxActionHandlers.ts` (`handleRetryMessage` lines 105–109 still passes only `{ text: message.content }`), plus `supabase/functions/sms-send/` capability enforcement.
- **Strict prerequisite gate:** Do **not** begin Stage 5 until Stages 2–4 runtime evidence and Decision 1 credential-isolation approvals are complete.

## Testing

- `npm run check:docs && git diff --check`

## Checkpoint

- **Revision and ownership** — Issue [#1324](https://github.com/leamonline/Smarter-dog-bookings/issues/1324), branch `feat/1324-cross-agent-verification` from `main@70d18818`. Single writer.
- **Verified implemented / runtime** — PR #1325 (`9ee7158b`) & PR #1321 (`09572431` → `70d18818`) merged/reconciled; Antigravity live `PreToolUse` `deny` verified (`0cce1d3e`, `c0226ce1`, `2899dd36`); `Workspace: "branch"` non-reload verified (`cb73e074`); bundled `codex-cli 0.171.0-alpha.13.2` (`hooks: stable true`) verified inside `ChatGPT.app`.
- **Unverified / Blocked** — Host-level Antigravity fail-open check across the 5 failure modes blocked in-session without `agy` CLI or a separate Antigravity window; Codex Desktop live `PreToolUse` check awaiting Desktop prompt execution; Claude Code blocked on `429` until `10pm (Europe/London)`.
- **Next** — Await owner execution/approval on Decision 1 Supabase credential scoping + local MCP config, run the Codex Desktop handover prompt, optionally run the scratch-workspace Antigravity 5-case harness in a separate window, retry Claude Code after 10pm, then start Stage 5 (`#1186` Stage 1).

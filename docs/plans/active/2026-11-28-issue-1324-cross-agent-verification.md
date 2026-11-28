# Cross-agent runtime verification and agent-independent credential isolation

- Status: Active
- Issue: [#1324](https://github.com/leamonline/Smarter-dog-bookings/issues/1324)
- Base: `main@70d188181a369868760e6d6e47e46d5c30f83b37`
- Last verified: 28 November 2026
- Owners: Cross-agent runtime verification, Codex/Claude/Antigravity compatibility and Stage 1 credential isolation
- Dependencies: Completed foundation in [#1322](https://github.com/leamonline/Smarter-dog-bookings/issues/1322) / [completed plan](../completed/2026-11-28-cross-agent-compatibility.md)
- Related requirements: Synthetic verification, explicit target controls and approval boundaries in [AGENTS.md](../../../AGENTS.md)
- Related ADRs: [ADR 006](../../architecture/decisions/006-manual-target-verified-database-rollout.md)

## Goal

Complete runtime verification of migration and mutation protections across Codex Desktop/CLI, Claude Code and Antigravity, establish credential-level isolation enforcing the 4-tier target architecture, and run a multi-agent documentation reconciliation handover drill once prerequisites are satisfied.

## Verified baseline & post-merge reconciliation (28 November 2026)

- **PR #1325:** Head `facca61aebfb2eced7626534c5858ad796fdbfef` merged into `main` as `9ee7158bf8e4fbe3662e6b95c65fa1a70f84f469` (`2026-11-28T02:05:38Z`); completed plans archived in `docs/plans/completed/`.
- **PR #1321 SHA reconciliation (verified via GitHub API & git):**
  - Previously typed string (`09572431ec58d4869e7a65493bd5b865646d673b75`) was **42 characters** (extra `d6` at indices 35–36).
  - Actual GitHub PR #1321 `head.sha`, `commits[-1].sha`, and `git rev-parse 70d188181a369868760e6d6e47e46d5c30f83b37^2` is **`09572431ec58d4869e7a65493bd5b86564673b75`** (**40 characters**).
  - Merged into `main` as `70d188181a369868760e6d6e47e46d5c30f83b37` (`2026-11-28T02:06:05Z`, `merged_by: leamonline`); diff vs `9ee7158bf8e4fbe3662e6b95c65fa1a70f84f469` updated only `docs/plans/completed/2026-11-27-cloud-first-development.md` and `docs/runbooks/cloud-development.md`.
- **Post-merge `main` checks (`70d188181a369868760e6d6e47e46d5c30f83b37`):** `CI` (`46096392572`: `build`, `agent-tests`, `release-tool-tests`, `playwright-version`, `coverage`, `e2e`), `Migrations Applied Check` (`46096392387`), `iPhone auth` (`46096392375`), `Vercel`, and `SmarterDog | Default` all passed (`success`).
- **PR #1320:** Untouched (`OPEN`, `codex/1193-inbox-controls`, head `132610a2b20bced4cf4b199bd1ad3053c776bf2d`).

## Evidence status across Stages 1–5

### Stage 1 — Credential isolation implementation & owner token checkpoint

#### Implemented & synthetically verified (machine-local `/Users/leam/.gemini/config/`)

1. **Backups preserved before any edit:**
   - `/Users/leam/.gemini/config/backups/2026-11-28-pre-stage1/config.json` (`chmod 600`)
   - `/Users/leam/.gemini/config/backups/2026-11-28-pre-stage1/mcp_config.json` (`chmod 600`)
2. **User-local Keychain-backed MCP bridge (`/Users/leam/.gemini/config/bin/supabase-mcp-keychain-bridge.mjs`):**
   - Stdio-to-Streamable-HTTP bridge reading the Bearer token exclusively in memory via `/usr/bin/security find-generic-password -a <user> -s <service> -w` (no token on CLI `argv`, dotfiles, git, logs, or issue comments).
   - Restricts HTTPS destination strictly to `mcp.supabase.com` (HTTP permitted only on loopback `127.0.0.1`/`localhost` when `SUPABASE_MCP_TEST_ALLOW_HTTP=1` for synthetic tests), forwards `Mcp-Session-Id`, handles `202`/`204`, `application/json`, and `text/event-stream`, and redacts `Bearer ...` and `sbp_...` patterns from diagnostics.
   - **Synthetic test evidence:** Passed isolated loopback HTTP + mock-`security` test suite (`ALL_SYNTHETIC_BRIDGE_TESTS_PASSED` covering missing Keychain fail-closed exit, unexpected host refusal, Bearer header transmission, `Mcp-Session-Id` propagation, JSON + SSE responses, `202` notifications, and redacted `403` error reporting).
3. **Non-mutating isolation verifier (`/Users/leam/.gemini/config/bin/verify-supabase-isolation.mjs`):**
   - Syntax-checked and verified failing closed cleanly with zero secret output before Keychain entries exist (`EXIT=1`).
4. **Separate MCP connections configured (`/Users/leam/.gemini/config/mcp_config.json`, `chmod 600`):**
   - `supabase-staging`: `--service smarterdog-supabase-staging-pat --url https://mcp.supabase.com/mcp?project_ref=btjnxvgkpdbfrrqxvkfj`
   - `supabase-prod-readonly`: `--service smarterdog-supabase-prod-readonly-pat --url https://mcp.supabase.com/mcp?project_ref=nlzhllhkigmsvrzduefz&read_only=true&features=docs%2Cdatabase%2Cdebugging`
   - Unrelated plugins and settings in `/Users/leam/.gemini/config/config.json` remain untouched; `"supabase"` plugin remains enabled **only until** the two replacement connections are verified with real credentials.

#### macOS Login Keychain ACL review (which local processes can retrieve credentials)

- Creating items with `security add-generic-password -U -a "$USER" -s "<service>" -w` (specifying `-w` last with **no inline value**) prompts interactively with hidden input so tokens never enter `~/.zsh_history` or `ps aux` `argv`.
- By default, `security add-generic-password` places `/usr/bin/security` in that Keychain item's trusted-application ACL. While the user's macOS Login Keychain is unlocked in an interactive desktop session, **any local process running as user `$USER` that executes `/usr/bin/security find-generic-password -w`** (including Antigravity, Claude Code, Codex, or local shell tools) can read the item silently without a per-call GUI prompt. (Passing `-T ""` forces macOS Keychain prompts on every MCP startup until `/usr/bin/security` is allowed.)
- Therefore:
  1. Keychain protects credentials encrypted at rest under FileVault + login password and keeps plaintext tokens off disk, out of configs, and out of transcripts/logs;
  2. Server-side **Supabase Scoped PAT restrictions** (`btjnxvgkpdbfrrqxvkfj` vs read-only `nlzhllhkigmsvrzduefz`, with `API Key Secrets` / `Secrets` disabled) remain the enforceable boundary against cross-project access or production writes.
  3. Because direct Postgres connection strings (`--db-url` / `psql`) bypass PAT scopes if stored locally, no production DB password or `service_role` secret is stored in Keychain or `.env*`.

#### Consolidated owner checkpoint (one-time Supabase Dashboard + macOS Keychain actions)

1. In **Supabase Dashboard → Account Settings → Access Tokens**, generate two **Scoped Access Tokens (`sbp_fc...`)** starting from preset **No access** (never paste either token into chat or files):
   - **Token 1 (Staging development):** Project = **`btjnxvgkpdbfrrqxvkfj` only** (`nlzhllhkigmsvrzduefz` excluded). Enable **Database (`Read-Write`)**, **Edge Functions (`Read-Write` as needed)**, **Project Settings (`Read`)**, and **Analytics / Logs (`Read`)**. Keep **API Key Secrets / Secrets** unchecked unless specifically needed for staging CLI operations.
   - **Token 2 (Production read-only inspection):** Project = **`nlzhllhkigmsvrzduefz` only** (`btjnxvgkpdbfrrqxvkfj` excluded). Enable **Database (`Read`)**, **Project Settings (`Read`)**, and **Analytics / Logs (`Read`)** only. Leave **Database (`Read-Write`)**, **API Key Secrets / Secrets**, **Edge Functions**, **Auth**, and **Storage** disabled.
2. Run these two interactive terminal commands locally (each prompts secretly for the token and stores it in macOS Login Keychain without shell history or `argv` exposure):
   ```bash
   security add-generic-password -U -a "$USER" -s "smarterdog-supabase-staging-pat" -l "Smarter Dog Supabase Staging PAT" -w
   security add-generic-password -U -a "$USER" -s "smarterdog-supabase-prod-readonly-pat" -l "Smarter Dog Supabase Prod Read-Only PAT" -w
   ```
3. Notify the agent when complete so we run the non-mutating `/Users/leam/.gemini/config/bin/verify-supabase-isolation.mjs` check, reload Antigravity MCP servers, confirm both connections work cleanly, and disable the unscoped `"supabase"` plugin in `/Users/leam/.gemini/config/config.json`.

#### Security-preserving rollback procedure

If `supabase-staging` or `supabase-prod-readonly` fails verification or breaks:
1. Disable only the broken entry (`"disabled": true` or remove the broken key in `/Users/leam/.gemini/config/mcp_config.json`) while keeping unrelated MCP entries (`mcp_config.json` / plugin configs) intact; restore `/Users/leam/.gemini/config/backups/2026-11-28-pre-stage1/config.json` only for unrelated plugin settings while keeping `"supabase"` **disabled** (`{"plugins": {"supabase": {"enabled": false}}}`).
2. Revoke the affected `sbp_fc...` token(s) in Supabase Dashboard and delete matching Keychain item(s) (`security delete-generic-password -a "$USER" -s "<service>"`).
3. Never automatically re-enable the unscoped `supabase` plugin, restore broad OAuth/PAT access, or clear unrelated MCP configs.

---

### Stage 2 — Codex runtime verification (completed by Codex Desktop; recorded on `#1324`)

From Codex Desktop [comment `7232496959`](https://github.com/leamonline/Smarter-dog-bookings/issues/1324#issuecomment-7232496959) (testing `9b7b94818d93d8561a12e47e834a46637a313b91`):

- **Bundled CLI (`codex-cli 0.171.0-alpha.13.2`, `hooks` `stable` `true`) & macOS App Server:** Verified using isolated `HOME`/`CODEX_HOME`, `workspace-write`, `approval_policy = "never"`, mock executables, and a synthetic stdio MCP server. Direct push, production CLI, production/unknown Management API targets, production MCP mutations, missing/unknown/wrong-type `project_id`, and malformed MCP args were all denied with zero markers written.
- **Host failure modes & trust behaviour in Codex:** Exit `2` and valid denial JSON blocked execution; missing shared JS and malformed launcher stdin returned explicit denial; however, **exit `1`, process death, missing hook command, malformed hook stdout, and timeout allowed the shell mock to run** (Codex fails open on unhandled hook crashes/timeouts). Folder trust alone did not enable hooks; a separate MCP allow rule let a mock production read bypass `ask`.
- **Cloud environment:** Hosted task (`danger-full-access`, `approval_policy = "never"`, no CLI on PATH, no hook review) had an empty diff and left Cloud hook dispatch unverified.
- **Workflow evals:** Both skills discovered; 4/5 cases met all criteria (both booking-capacity runs preserved PostgreSQL authority and persisted-row tests; each missed one secondary detail: Edge parity on run 1, dormant visit policy on repeat).
- **Local repository hook adoption still pending owner decision:** Recommended `.codex/hooks.json` (`Bash|mcp__.*` → `scripts/guard-supabase-hook.sh codex`, 10s timeout) approved in principle as defence in depth; Codex is preparing its reviewed implementation on its own branch/worktree.

### Cross-agent no-hooks resilience & GitHub release-authority audit (28 November 2026)

#### 1. Why the Stage 1 architecture stays safe even if every local hook is disabled

Verified runtime evidence confirms client hooks **cannot** be treated as a primary production boundary:
- **Codex Stage 2:** Unhandled hook faults (`exit 1`, process death, missing command/launcher, malformed stdout, timeout) let execution continue; a separate MCP approval rule overrides the guard's `ask` response; Codex Cloud interception remains unverified (`danger-full-access`, `approval_policy = "never"`).
- **Antigravity Stage 4 & docs:** Official `hooks.md` has no `onFailure: "block"` and fails open on unhandled crash/timeout/missing exec/malformed output (`Workspace: "branch"` also inherits parent hooks).
- **Claude Code:** `.claude/settings.json` has `onFailure: "block"`, yet `claude --bare` intentionally skips hooks.

Under the Stage 1 credential-isolation target, **disabling every local hook across all agents** still leaves production protected by server-side controls:

| Attack / failure path (all local hooks disabled) | Enforced safeguard without hooks | Outcome |
| --- | --- | --- |
| Agent calls `apply_migration`, DDL, `INSERT`/`UPDATE`/`DELETE`, or `deploy_edge_function` via `supabase-prod-readonly` (or overrides MCP `ask` approval) | Prod inspection PAT (`sbp_fc...`) enables **Database (`Read`)**, **Project Settings (`Read`)**, **Logs (`Read`)** only **and** MCP URL passes `?project_ref=nlzhllhkigmsvrzduefz&read_only=true&features=docs%2Cdatabase%2Cdebugging` | Blocked server-side (HTTP `403` / Postgres read-only refusal) |
| Agent calls `supabase-staging` MCP or `api.supabase.com/v1` targeting production (`nlzhllhkigmsvrzduefz`) | Staging PAT (`sbp_fc...`) scopes **only** `btjnxvgkpdbfrrqxvkfj` (`nlzhllhkigmsvrzduefz` excluded) | Blocked server-side (HTTP `403`) |
| Agent attempts to read `service_role` keys or DB passwords via MCP/Management API | **API Key Secrets / Secrets** disabled on agent PATs; no prod `--db-url` / `.env.local` / `supabase/.temp/` on disk | Blocked server-side (HTTP `403`) + absent locally |
| Agent runs in Codex Cloud (`danger-full-access`, hooks unverified) or `claude --bare` | Codex `~/.codex/config.toml` has no Supabase MCP; Claude `.mcp.json` enforces `read_only=true` + `project_ref=nlzhllhkigmsvrzduefz`; never provision Owner OAuth or prod write tokens into agent sessions | No prod write credential reachable |

#### 2. GitHub permissions audit — prepare changes vs release authority

Read-only inspection of live GitHub settings (`gh auth status`, repository metadata, Ruleset `#22452064` `"Protect main"`, Environments, `gh secret list`, `.github/workflows/`):

| Capability / path | Current GitHub technical state | Ability to **prepare** vs **release** |
| --- | --- | --- |
| **Local `gh` CLI token (`gho_****`)** | Active macOS keyring auth for owner `leamonline` (`repo`, `workflow`, `read:org`, `gist`; `admin: true`, `push: true`). | Holds **full owner release & admin authority**, not just prepare rights. |
| **Ruleset `22452064` (`Protect main`)** | Enforces PRs, non-FF/deletion blocks, `bypass_actors: []`, `current_user_can_bypass: "never"`, and 5 required status checks (`build`, `coverage`, `agent-tests`, `pr-production-smoke`, `migrations-applied`) — **but** `required_approving_review_count: 0`, `require_code_owner_review: false` (no `CODEOWNERS`), `dismiss_stale_reviews_on_push: false`. | Any green PR can be merged (`gh pr merge`) using local `gh` auth without a second human PR approval. |
| **Frontend & Edge releases on merge to `main`** | Merging to `main` deploys Vercel frontend (`main`) and triggers `deploy-edge-functions.yml` on changed `supabase/functions/**` using environment `supabase-automation` (`main`-only branch policy, **no** `required_reviewers`). | Merging a PR into `main` **immediately releases** frontend and changed Edge Functions to production. |
| **Workflow modifications (`.github/workflows/*`)** | PR branches cannot access `Production`, `staging`, `supabase-automation`, or `production-scheduled-backup` secrets (`main`-only policies; `check-migrations-applied.yml` checks out `main` only). **However**, an unblocked PR changing `.github/workflows/*` with no migration SQL passes `migrations-applied` and, if merged via local `gh` (`workflow` scope, `0` required reviewers), alters future `main` workflows. | Safe while unmerged on PR branches; becomes release-critical upon merge to `main`. |
| **Workflow dispatch & Environments (`Production`, `staging`, `production-scheduled-backup`)** | Repo `visibility` is **`public`** (`admin: true`). `Production` and `staging` enforce `main`-only branch policies **and** `required_reviewers: [leamonline]` (`prevent_self_review: false`); `supabase-automation` and `production-scheduled-backup` enforce `main`-only branch policies with no reviewers. Note legacy `BLUEHOST_FTP_*` secrets remain at repo scope (unused after publisher retirement `#999`). | A local `gh` token (`repo` + `workflow`) can dispatch `production-apply-migrations.yml` and call pending-deployment approval endpoints as `leamonline` unless `gh` is stripped/scoped or a separate reviewer/2FA boundary is used. |

**Architectural recommendation to separate prepare vs release authority (for owner review — no GitHub config changed):**
- Agents in local/cloud sandboxes should hold **prepare-only** capability (non-`main` branch push + PR open/draft, read-only status inspection) rather than an owner `gho_...` keyring token with `repo` + `workflow` + `admin` scopes that can merge PRs, modify `.github/workflows/`, dispatch `production-apply-migrations.yml`, or edit Ruleset `#22452064` / Environment rules via API.
- Clean options when ready: (a) keep local `gh` CLI logged out or use a fine-grained/non-admin branch-only collaborator token without `Administration`/`Actions write`/`Workflows`, leaving merges, workflow dispatches, and environment approvals to interactive browser sessions (`leamonline`), and/or (b) raise `Protect main` `required_approving_review_count` to `1` + `CODEOWNERS` on `.github/workflows/` with a separate human reviewer account if desired, plus clean up unused `BLUEHOST_FTP_*` repo secrets.

#### 3. Branch ownership & shared skill coordination with Codex

- **Branch / worktree ownership:** Keep `docs/plans/active/2026-11-28-issue-1324-cross-agent-verification.md` + Stage 1 credential-isolation verification + Stage 3 Claude retry + Draft PR `#1326` on Antigravity; Codex owns `.codex/hooks.json` implementation and its Stage 2 evidence (`docs/migrations.md`, `prompts/evals/codex-workflows.md`, `docs/research/2026-11-28-codex-runtime-hook-verification.md`) on its own dedicated branch/worktree (without Antigravity modifying or sweeping Codex's dirty working-tree files into `#1326`).
- **Shared skill improvement discovered by Codex Stage 2:** Both booking-capacity runs in Codex's Stage 2 eval scored `Partial` because one missed explicit Edge preflight parity and the other missed dormant visit policy (`previous_day_1500_v1` / `V1_ONLY_COMMANDS`) preservation. Recommend updating `.agents/skills/smarter-dog-booking-change/SKILL.md` (once Codex's current implementation lands or in a single agreed follow-up PR) to promote **both** Edge/PostgreSQL/browser parity **and** dormant visit-policy isolation into explicit required verification items.

---

### Stage 3 — Claude Code runtime verification status

- Held cleanly until after `10pm (Europe/London)` quota reset (`429 usage_limit_reached`; no premature retries executed).

---

### Stage 4 — Antigravity live probes & isolated host-failure check

- **Verified live `PreToolUse` `deny` dispatch (`0cce1d3e`, `c0226ce1`, `2899dd36`):** Denied production `apply_migration`, production `execute_sql`, and malformed JSON `Arguments` on nonexistent MCP servers.
- **Host failure-mode isolation check (`cb73e074`):** Confirmed `Workspace: "branch"` subagents do not reload `.agents/hooks.json` independently of the parent workspace, `agy` CLI is absent, and `ConversationService` provides no separate project-registration path without altering `~/.gemini/config/` or launching a separate scratch window.
- **Documented host behaviour:** Official `antigravity.google/docs/hooks.md` confirms `PreToolUse` hooks **fail open** on crash/timeout/malformed stdout/missing executable. Standalone 5-case scratch lab files are saved in conversation scratch (`scratch/antigravity-hook-lab/`) for optional independent verification in a separate Antigravity window.

---

### Stage 5 — Cross-agent handover exercise (documentation reconciliation; NOT started yet)

Per owner approval of **documentation reconciliation** (do not start until Stages 1 & 3 prerequisites close):

- **Pre-verified archival / reconciliation targets:**
  - **Valid for archival to `docs/archive/` or `docs/plans/completed/`:** [2026-10-19-whatsapp-business-app-echoes.md](2026-10-19-whatsapp-business-app-echoes.md) — issue `#1050` is `CLOSED`, status is explicitly `Superseded (21 October 2026)` by completed plan [2026-10-21-staff-reply-clears-stale-ai-drafts.md](../completed/2026-10-21-staff-reply-clears-stale-ai-drafts.md) (`#1063`, `CLOSED`), and all surviving intent/open notes are already recorded there (update relative link in the completed plan so `check:docs` stays green).
  - **Evaluate partial archival vs status-header retention:** [2026-11-22-ios-app.md](2026-11-22-ios-app.md) — `Draft. Superseded in direction (22 November 2026)`, no issue assigned; verify before moving whether any referenced notification/privacy/release requirements need preserving in [ios/README.md](../../../ios/README.md) or [docs/ios-api-contract.md](../../ios-api-contract.md).
  - **Do NOT archive (unresolved criteria confirmed):** [2026-09-10-smarterdog-domain-routing.md](2026-09-10-smarterdog-domain-routing.md) explicitly retains unresolved prerequisites (`staff device re-enrollment` and `ADR superseding ADR 009`), and [2026-10-15-local-production-release-design.md](2026-10-15-local-production-release-design.md) tracks unshipped local release tooling.
  - **Docs index refresh:** Reconcile [docs/README.md](../../README.md) (`Last verified: 2 September 2026`) against current `docs/plans/active/` and `docs/runbooks/cloud-development.md`.
- **Multi-agent handover structure to demonstrate:**
  1. **Agent A** prepares the scoped documentation reconciliation plan + dedicated GitHub issue + checkpoint;
  2. **Agent B** implements the reconciliation + link/registry updates on a branch and records validation evidence on the issue;
  3. **Agent C** independently reviews from GitHub issue/PR/git state without conversation history;
  4. Owner merges only upon explicit approval.

## Testing

- `node /Users/leam/.gemini/antigravity/brain/ec7b8c56-17e3-49c0-8d8b-7a33c5d6694a/scratch/test-keychain-bridge.mjs` → `ALL_SYNTHETIC_BRIDGE_TESTS_PASSED`
- `npm run check:docs && npm run check:migrations && npm run lint && npm run typecheck`
- `npm run test -- src/security/migrationGuardHooks.test.ts src/security/docsLinkCheck.test.ts src/security/productionApplyMigrationsWorkflow.test.ts`

## Checkpoint

- **Revision and ownership** — Issue [#1324](https://github.com/leamonline/Smarter-dog-bookings/issues/1324), Draft PR [#1326](https://github.com/leamonline/Smarter-dog-bookings/pull/1326) (`DO NOT MERGE`), branch `feat/1324-cross-agent-verification` from `main@70d18818`. Codex Desktop completed Stage 2 (`7232496959`).
- **Evidence** — Stage 1 backups (`backups/2026-11-28-pre-stage1/`), Keychain stdio bridge (`supabase-mcp-keychain-bridge.mjs`), non-mutating verifier (`verify-supabase-isolation.mjs`), and `/Users/leam/.gemini/config/mcp_config.json` entries staged; synthetic bridge suite passed (`ALL_SYNTHETIC_BRIDGE_TESTS_PASSED`); `"supabase"` plugin preserved until replacement connections verify; Stage 5 archival targets audited.
- **Blockers / Owner action** — Waiting on owner's 1-checkpoint creation of the two `sbp_fc...` Scoped PATs + interactive `security add-generic-password ... -w` storage; Claude Code Stage 3 waiting on `10pm (Europe/London)` reset; Antigravity 5-case host failure probes staged in scratch for optional separate-window run.

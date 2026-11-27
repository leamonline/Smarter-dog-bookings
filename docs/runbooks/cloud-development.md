# Cloud development

Use the Mac for coordination, review and owner approvals. Start with the
[task intake and recovery procedure](../project-management.md#authorised-development-and-session-recovery).
Check the issue, blockers, owners and open PRs before opening a workspace.
The [programme STOP](../../ROADMAP.md#tranche-gate--default-stop) and
[repository approval boundaries](../../AGENTS.md#safe-change-workflow) apply
across all environments.

## Choose the environment

| Activity | Where to run it |
|---|---|
| Edit, focused Vitest, typecheck, builds and quick browser checks | Existing **Smarter-dog-bookings** Codex Cloud environment. |
| Required web, browser and Edge gates | [GitHub Actions CI](../../.github/workflows/ci.yml). PR browser smoke covers Chromium and WebKit. |
| Migration replay, pgTAP, race checks and generated types | [Disposable database workflow](../../.github/workflows/db-tests.yml). Use its existing local stack and loopback guards. |
| Synthetic customer sign-in and booking journeys | [Customer journeys on a disposable stack](../customer-journey-tests.md). |
| Native iOS build and platform checks | Xcode Cloud **Default / Build – iOS**. Use [iPhone auth](../../.github/workflows/ios-auth.yml) for the Swift package. Use the [iPhone Debug sample modes](../../ios/README.md#trying-live-booking-on-staging-debug-only) for manual simulator checks. Treat archive and TestFlight distribution as separate owner-authorised work. |
| Combined staff and marketing presentation | Exact-commit Vercel Preview after checking the Preview boundary below. |
| Review, issue coordination and release decisions | Codex on the Mac, using GitHub, Graphify and the [release review skill](../../.agents/skills/smarter-dog-release-review/SKILL.md). |

## Prepare a Cloud task

1. Select the saved environment and verify its repository, `git status --short`
   and `git rev-parse HEAD`. Confirm the branch or PR SHA. Keep work on its
   own topic branch and use one writer per path. Check that root `AGENTS.md`
   and the [repository skills](../../prompts/README.md#repository-skills)
   are available in the session.
2. Use the repository's [Node 24 toolchain](../node-runtime.md). Use
   `npm ci` for a fresh root dependency tree and `npm ci --prefix website`
   when building the marketing site. Reuse dependencies only while the
   corresponding lockfile matches. Use the repository's Playwright binary
   and its matching browsers. Use Deno 2 for Edge work, as in CI.
3. Inspect network mode, identities and bindings by name and scope. Keep hosted
   Supabase, payment and communications credentials out of development tasks.
   Use a clean synthetic shell with explicit empty Supabase URL and key
   bindings. If egress is unrestricted, keep app verification on loopback and
   block browser requests outside the test origin. Use Actions for tests that
   need an isolated backend. Use `npm run dev` and confirm sample-data mode.
   Use an existing configured HTTP portal only after proving isolation.
   Keep secret values out of terminal output and artifacts.
4. Keep database and browser caches bounded. If Docker, image pulls, browser
   libraries or resources are unavailable, run the corresponding Actions
   workflow. A task workspace can expire. Push authorised work to a topic
   branch and keep the [checkpoint](../../.agent/PLANS.md#checkpoint-and-recovery)
   current. Confirm another session can locate the issue and diff before hand-off.

## Verify and hand off

Run focused checks first and record the command, exit result, tested SHA,
environment and omissions. Use the existing workflows to verify larger suites.
For an authorised branch, `gh workflow run db-tests.yml --ref <branch>` or
`gh workflow run customer-journeys.yml --ref <branch>` runs the relevant
disposable job when path triggers do not apply. Verify the run's ref and SHA.
For PR runs record the candidate head and, when applicable, the generated merge
SHA checked out by the workflow. Use the existing
[merge gate](../project-management.md#branch-controls-and-merge-gate) for an
exact-head release review. A stacked PR targeting a topic branch must be
retargeted and reverified before release.

Name the repository when querying Graphify and compare its index SHA with the
checkout. Verify branch changes locally. Graphify and other personal MCP
connections may be available only on the Mac. Use GitHub links and focused
repository searches if the connector or index is unavailable.

## Preview and deployment isolation

Vercel Preview requires `VITE_FORCE_OFFLINE=1`. Verify variable names and
scopes, including shared and branch overrides. The customer and marketing
clients use the Supabase URL and key independently of the staff sample-mode
switch. Confirm both generated bundles omit hosted Supabase bindings before
interaction. Use an authenticated, exact-revision Preview and keep customer
sign-in and mutations in the disposable customer-journey suite. See the
[combined build guard](../../scripts/lib/preview-guard.mjs).

The iOS project carries the salon's public connection configuration. Sample
launch modes are the safe interactive check. For any separately authorised
integration action, establish the exact synthetic target first. Follow the
[hosted target guard](../hosted-supabase-target-guard.md) and
[migration runbook](../migrations.md) for release work. A green verification
run conveys no authority to deploy or merge.

## Resources and fallback

Use one Cloud workspace per active change and check plan allowance before a
large run. Prefer existing standard Actions runners for long or repeated
checks and the existing Xcode Cloud allowance for native builds. On a cold
workspace, record dependency setup and test times before deciding whether a
persistent cache is needed. If the reusable Cloud environment fails, retain a
checkpoint and hand off through the topic branch. Continue with existing
Actions and the Mac's lightweight checkout where needed. Codespaces, hosted
Supabase branches, SSH hosts and paid capacity require a separate decision.

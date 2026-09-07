# Website and bookings repository consolidation

Status: Active — preparation implemented, cutover pending
Issue: [#784](https://github.com/leamonline/Smarter-dog-bookings/issues/784)
Base: origin/main at 452cc3d1e0c7815eef41f19c247d16b397809565 (discovery); preparation implemented on top of d80ab2d (7 September 2026)
Last verified: 2026-09-07
Owners: One serial implementer owns import, CI/configuration and documentation
Dependencies: No existing issue prerequisite identified; external cutover gates below
Related requirements: [PROJECT.md](../../../PROJECT.md) preservation and release principles; [repository invariants](../../../AGENTS.md)
Related ADRs: [ADR 009](../../architecture/decisions/009-independent-applications-in-one-repository.md), accepted 7 September 2026

## Preparation record (7 September 2026)

Steps 1–5 of the implementation sequence are done in the preparation pull
request; step 6's cutover has **not** been executed. Executed task list:
[2026-09-07 plan record](../../superpowers/plans/2026-09-07-website-repository-consolidation.md).
Cutover procedure: [runbook](../../superpowers/runbooks/2026-09-07-website-publisher-cutover.md).

- **Source drift since discovery.** Website `main` moved from `155b07fe` to
  `c55617b792ca7c458264f456aef73d89fb257e0a` (four pull requests merged on
  6 September 2026: holiday notice card, trust-stat contrast, Supabase
  build variables in CI, open-days strip during a holiday). The import pins
  `c55617b`.
- **History scan.** All 129 commits scanned for sensitive paths and content
  patterns, locations only. No credentials found; full history imported
  (details in the plan record above). Early history tracked build output
  and Lighthouse reports that were later removed; they hold no customer data.
- **Import.** `git subtree add --prefix=website`, no squash. The imported tree
  is byte-identical to the source tree (`git diff-tree` empty) and the source
  commit is an ancestor of the branch head.
- **Deliberate relocations.** `website/.github/` (a workflow and a
  Dependabot config, inert when nested) removed in a follow-up commit and
  recreated at the root as `.github/workflows/website.yml` and a `/website`
  Dependabot entry. Differences: Node 24 only, no Codecov upload, publisher
  dark behind the `WEBSITE_PUBLISHER_ENABLED` repository variable.
- **Isolation.** Root ESLint ignores and Vitest excludes `website/**`; tsc
  and Playwright were already `src/` and `e2e/` scoped; the root build does
  not read `website/`. `ci.yml` reports its existing required checks on every PR; `website.yml`
  runs for `website/**` and its own workflow. `src/security/websiteWorkflowIsolation.test.ts`
  asserts these and simulates change selection for website-only,
  bookings-only, shared-configuration, documentation-only and Supabase-only
  diffs on push and pull request.
- **Checks run on the branch** (Node 24.20.0): root `lint`, `check:docs`,
  `typecheck`, `check:migrations`, `test` (339 files, 3487 tests) and
  `build` (146 files, no website asset); website `npm ci`, `lint`,
  `test:run` (33 files, 211 tests), `test:coverage` (80.2% lines against a
  70% threshold) and `build` (167 files, no bookings asset). Website
  Playwright: see the pull request for what could run in the sandbox.
- **Not done, by design:** no Bluehost or Vercel setting changed, no secret
  provisioned, no publisher enabled, original repository untouched.

## PR #797 review reconciliation (7 September 2026)

The earlier approved [design](../../superpowers/specs/2026-09-07-website-repository-consolidation-design.md)
and original implementation plan were found on
`codex/website-repository-consolidation-spec@5669b9f844bcb54d78dcd6ccd3bb6eea9ddd1b76`.
The [plan record](../../superpowers/plans/2026-09-07-website-repository-consolidation.md#planning-provenance-and-reconciliation)
preserves the original instructions and explicitly lists implementation deviations.
The previous claim that these documents did not exist anywhere was incorrect.

Concurrent commit `340521c104f73f3768220fe8dfb1c2aaa85b33f8` had already removed
the CI path filters while this review was in progress. The continuation is
based on that commit and preserves its correction, extending the checks to
cover migration reporting and distinct website job names.

Review fixes preserve `build`, `coverage`, `agent-tests`, `pr-production-smoke`
and `migrations-applied` for every PR. Website checks use distinct display
names, and the missing website documentation-governance exclusion is restored.
The optional always-reporting website gate is deferred; the ruleset is unchanged.
No import is repeated and neither application runtime is changed.

Read-only repository-variable inspection found `WEBSITE_DEPLOY_ENABLED=false`,
but the implemented workflow consumes `WEBSITE_PUBLISHER_ENABLED`, which was
absent. The former is not an alias and does not control this publisher. No
variable was changed. Cutover must explicitly verify the consumed name.

Final command results and final-head Actions evidence are recorded on
[PR #797](https://github.com/leamonline/Smarter-dog-bookings/pull/797).
The earlier check counts above are historical preparation evidence.

## Goal

Both applications are maintained in this repository, install and build independently, and continue serving their existing addresses through their existing hosts. Completion requires verified deployment, not merely imported files.

## Why

One repository allows coordinated changes and common documentation while preserving the working booking system. Keeping builds separate avoids a framework upgrade or application rewrite as a prerequisite.

## Current behaviour

Verified from tracked configuration on 5 September 2026:

- Bookings discovery base is the SHA above. Root package.json uses React 19, Vite 7 and Node >=24; vercel.json defines SPA routing and security headers.
- supabase/functions and its deployment workflow are rooted in this repository; the workflow deploys changed functions on main and has explicit path filters.
- Website main was 155b07fe9fd76356f766d479c1e16e18df6d57f0. Its package.json uses React 19, Vite 8 and a separate package-lock.json.
- Website .github/workflows/ci.yml tests and builds before deploying dist/ to Bluehost using FTPS. Its deployment uses server-dir ./ and repository secrets.
- Website MAINTENANCE.md explains the FTP account is scoped to public_html; verify that account scope at cutover rather than assuming the historical note remains correct.

These are configuration observations, not evidence that production currently matches those revisions. Hosting settings, secret availability, current production assets and both applications' tests have not been verified for this migration.

## Desired behaviour

Developers can work on either application from one checkout. All PRs run the existing required repository checks. Website-relevant changes additionally run the independent website workflow; deployment remains separately gated. Shared release configuration changes run all affected checks. Users retain existing URLs, routes, booking links and functionality.

## Scope

Import website tracked source under website/ with history, independent lockfile and scripts. Own root tooling exclusions, GitHub workflows, documentation, and an explicit deployment-source cutover runbook. Keep bookings source, public assets, tests, scripts and Supabase paths in place.

## Non-goals

No combined frontend bundle, hosting move, domain change, shared dependency upgrade, npm workspace conversion, database migration, booking policy change, shared component extraction or automatic repository archival. No production/customer-data access is needed for preparation.

## Relevant code

- Root package.json, package-lock.json, vite.config.*, eslint.config.*, tsconfig*.json, vitest configuration and playwright*.config.*: discovery boundaries and independent builds.
- scripts/check-doc-links.mjs and other repository scanners: prevent imported project files being incorrectly treated as booking application code; preserve their security checks.
- .github/workflows/: CI and release paths; preserve existing required check names until release configuration is verified.
- vercel.json: existing bookings deployment routing and security.
- Website package.json, package-lock.json, vite.config.js, playwright.config.js, vitest.config.js, src/, public/ and .github/workflows/ci.yml: source build and deployment contract.

## Architecture

Keep the bookings application at the repository root and add website/ as a self-contained application. Each has its own node_modules, lockfile, assets, environment and build output. Use npm --prefix website commands from the root for convenience. Nested .github workflows are reference material only; active website CI must live in root .github/workflows. Supabase remains the booking authority. Do not merge global CSS, routers, authentication or service workers. See accepted ADR 009.

## Data/database changes

None. No migrations, RLS, grants, backfills, generated database types or hosted database operations.

## API changes

None. Retain existing RPC, Edge Function, external integration and website-to-booking contracts.

## UI changes

None intended. Verify existing navigation, links, forms and responsive rendering; avoid real submissions in production smoke tests.

## Security/privacy considerations

Import only tracked files after reviewing the source tree and checking history for sensitive paths using a scanner that reports locations without printing secret values. Do not read credential files or private customer records. If full history contains sensitive material, stop the import and document a sanitised-history approach for review. Never copy secrets into Git or print their values. Provision deployment secrets only through separately authorised account operations. PR checks receive no deployment credentials. Prevent website assets entering the bookings build and vice versa.

## Dependencies

Re-read this repository's current main and source website head before import. Record intervening changes. Coordinate any website edits during cutover so no source commits are lost. No current open issue was identified as a direct prerequisite; recheck before implementation. Before release, verify Vercel project/root/build settings and website build-variable names, establish authorised secret provisioning, and confirm the Bluehost target. The repository merge remains user-controlled.

## Risks

- Root lint/test/typecheck/scanners may recurse into website/: explicitly scope discovery and prove both suites still run; do not broadly disable checks.
- Duplicate publishing from old and new repositories can overwrite newer assets: disable the old publisher only at the authorised cutover, then enable the new one.
- History or concurrent source edits may be lost: pin source SHA, retain history, compare tracked trees and freeze/synchronise changes before switching.
- Wrong output or FTP target can overwrite a site: verify build output and exact account scope; do not use clean-slate deployment.
- Missing build variables can produce a successful but broken build: inventory variable names from code/configuration without reading secret values; verify preview behaviour.
- Returning to the previous source does not necessarily remove newly uploaded files: preserve asset manifest and previous build; account for stale files in rollback without destructive blanket cleanup.

## Migration/rollout

1. Prepare and validate in an isolated branch/worktree. Keep website deployment disabled in the destination while importing.
2. Produce separate build artefacts and inspect booking and website previews using synthetic data. Confirm Vercel still publishes only the root bookings dist/.
3. Present exact source/destination SHAs, checks, target account scope, secret-name inventory, prior artefact and rollback instructions for the user's release decision. Do not change hosting configuration or use credentials during preparation.
4. At the authorised cutover, stop the original website publisher, reconcile any new commits, provision destination secrets and enable the destination publisher. Maintain a single writer throughout. The user controls merge; main may deploy bookings automatically even for this repository change.
5. Confirm destination workflow SHA, successful FTPS outcome and public pages/assets, redirects, navigation and booking links. Verify bookings remains healthy without making live bookings or reading customer records.
6. Keep the old repository and previous build available. On failure, stop the new publisher, restore the known-good website artefact via the verified target, inspect stale assets and public behaviour, then re-enable the original publisher if appropriate. Revert repository/configuration changes through reviewed commits; do not rewrite main.
7. Archive the original repository only with explicit authority after acceptance. Move this plan to completed only after rollout evidence is linked.

## Implementation sequence

1. Land/review this plan and ADR; #784 owns live status. Reconfirm accepted boundaries before code changes.
2. Inventory both projects' tracked source, workflows, runtime and integration variable names. Run baseline installs/checks separately; record pre-existing failures rather than attributing them to the import.
3. Import the pinned website history without squashing, using a reviewed subtree merge or equivalent. Compare imported tracked tree against source, documenting intentional documentation/workflow relocation. Verify source SHA remains reachable from destination history.
4. Isolate root tool discovery, preserve application lockfiles, add convenient website commands and a website CI workflow. Initially keep production publishing disabled. Inspect every workflow, including dependency updates and security scanning, for path assumptions.
5. Add a cutover runbook with exact command order, target checks and rollback artefacts. Update documentation navigation and changelog. Run combined validation and review the diff.
6. Prepare the implementation PR referencing #784 without auto-closing the issue before deployment acceptance. Execute the separately authorised rollout, record exact evidence, then complete the plan and issue.

All steps are serial; no parallel writers are assigned.

## Testing

Run npm ci at root and npm ci --prefix website. Use the actual source scripts after revalidation:

- Bookings: npm run check:docs, npm run lint, npm run typecheck, npm run check:migrations, npm run test, npm run build.
- Website: npm --prefix website run lint, npm --prefix website run test:run, npm --prefix website run test:coverage, npm --prefix website run build, npm --prefix website run test:e2e.
- Run relevant bookings Playwright checks in deterministic sample-data mode across desktop, tablet and mobile; verify public website pages and booking links at the same sizes.
- Exercise CI change selection for website-only, bookings-only, shared workflow/configuration, documentation-only and Supabase-only diffs. Verify PRs cannot invoke publishing and website-only edits cannot deploy Edge Functions.
- Inspect both dist directories and test/coverage discovery for contamination. Verify imported history ancestry and tree equality.

No database or Edge code changes are intended, so database and Deno runtime suites are not required solely for this migration. Any expansion affecting those surfaces requires plan revision and corresponding checks. Record unavailable or failing checks honestly.

## Observability

Retain source SHA, destination SHA, imported tree comparison, command results, independent build manifests, preview screenshots and workflow/deployment identifiers. Production evidence must identify date and environment and contain no customer data. Distinguish successful deployment transport from successful public smoke tests.

## Documentation updates

Update this plan, ADR 009, docs/README.md, root development instructions, website maintenance/deployment guidance and CHANGELOG.md. Link the implementation PR and cutover runbook. No prompt or product-policy changes are intended.

## Definition of done

Imported history is reachable; tracked files reconcile; both builds and applicable checks pass; isolation and deployment change selection are proven; review is complete; both live surfaces are verified at the released revision; one website publisher remains; rollback artefacts exist; documentation records the release. The old repository need not be archived to satisfy technical completion.

## Open questions

Resolve by configuration inspection before release: Vercel build-ignore behaviour; actual website environment-variable inventory; current Bluehost account scope; source changes since the pinned SHA; any historical sensitive files. The user decides external cutover timing and optional archival. These unknowns do not prevent preparing the import and checks.

# Website Repository Consolidation Design

Issue: [#784](https://github.com/leamonline/Smarter-dog-bookings/issues/784)
Date: 2026-09-07
Status: Approved
Bookings base: `main@d80ab2dd51074debf3991bd21c9f085282cb9b3e`
Website source: `leamonline/smarter-dog-website@c55617b792ca7c458264f456aef73d89fb257e0a`
Related ADR: [ADR 009](../../architecture/decisions/009-independent-applications-in-one-repository.md)
Related plan: [2026-09-05 website consolidation](../../plans/active/2026-09-05-website-consolidation.md)

## Purpose

Move the independently deployed Smarter Dog public website into the Smarter Dog bookings repository without turning the two applications into one runtime, one dependency graph, or one deployment unit.

The consolidation exists to make coordinated product work easier while preserving the current safety boundaries around bookings, Supabase, Vercel, Bluehost and customer-facing release behaviour.

## Chosen architecture

Keep the bookings application at the repository root. Import the public website under `website/` as a self-contained React/Vite application with its own `package.json`, `package-lock.json`, configuration, source, public assets, tests and build output.

Do not introduce npm workspaces, a monorepo orchestration framework, shared runtime packages, a combined router, a shared Vite build, a hosting move, or a dependency-upgrade programme as part of this migration.

The destination repository becomes the source-of-truth home for both applications, while each application remains independently buildable, testable and deployable.

## History preservation

The website must be imported from exact source revision `c55617b792ca7c458264f456aef73d89fb257e0a` using a history-preserving Git operation such as a subtree-style merge or equivalent unrelated-history import.

A snapshot-only copy is not acceptable because #784 explicitly requires website history to remain reachable. After import:

- the pinned website source commit must be reachable from the destination repository history;
- the imported tracked tree under `website/` must reconcile with the source tree at the pinned revision, except for documented relocations such as active GitHub workflows;
- the original website repository must remain available during rollout and rollback.

If historical scanning finds committed credentials, private keys or identifiable customer data, stop the history import and replace this design with a reviewed sanitised-history migration. Do not print secret values while scanning.

## Application boundaries

### Bookings application

The bookings application remains at repository root with its existing:

- `package.json` and `package-lock.json`;
- Vite configuration and `dist/` output;
- `src/`, `public/`, `e2e/` and test structure;
- `supabase/` project and migrations;
- Edge Function deployment workflow;
- Vercel project assumptions.

No booking policy, database schema, Edge Function behaviour, notification semantics or customer data is changed by this consolidation.

### Website application

The website lives under `website/` and retains its own:

- `website/package.json`;
- `website/package-lock.json`;
- `website/src/`;
- `website/public/`;
- `website/e2e/`;
- `website/vite.config.*`;
- `website/vitest.config.*`;
- `website/playwright.config.*`;
- `website/dist/` build output.

Its current source remains React 19 with Vite 8 and retains its existing Supabase public-browser integration and public website behaviour.

## Tooling isolation

Root tooling must not accidentally recurse into the website application as if it were bookings source. Any scanner, linter, test discovery, typechecker, build input or duplicate-file check that currently assumes repository-root ownership must be explicitly audited.

The fix must be narrow. Prefer explicit include/exclude boundaries over disabling checks globally.

Conversely, website tooling must run from `website/` or through `npm --prefix website ...` and must not consume root `node_modules`, root build output or root test configuration implicitly.

Root convenience scripts may delegate to website commands, but the two lockfiles and installations remain independent.

## CI design

Active workflows stay under root `.github/workflows/`, because nested `.github/workflows/` files are not active GitHub Actions workflows.

Add or adapt a website CI workflow with these properties:

- triggers on website-relevant changes and on changes to its own workflow/shared release configuration;
- installs website dependencies independently;
- runs website lint, Vitest, coverage, build and Playwright checks using the website working directory or `npm --prefix website`;
- never publishes from a pull request;
- initially has production publishing disabled until the separate cutover gate is authorised;
- exposes stable job names suitable for future branch-rule requirements;
- uploads useful coverage, Playwright and build artefacts without mixing them with bookings artefacts.

Existing bookings CI job names that are already required by the `Protect main` ruleset must remain stable unless the ruleset is deliberately updated in the same controlled change.

## Release isolation

Website-only changes must not deploy Supabase Edge Functions. Existing Edge deployment path filters must be verified against the new `website/` tree.

Bookings-only changes must not trigger a Bluehost publication.

The destination website deployment job must remain disabled during the preparation/import PR. The old website repository remains the only website publisher until cutover is separately authorised.

At cutover, there must be exactly one active Bluehost publisher. The sequence is:

1. confirm destination secrets and exact target scope without exposing values;
2. reconcile any website source commits made after the pinned import revision;
3. disable the original website repository publisher;
4. enable the destination publisher;
5. deploy from the reviewed destination revision;
6. verify the public site and booking links;
7. retain the original repository and previous build for rollback.

The repository migration itself does not authorise changing Bluehost, Vercel, GitHub secrets or external accounts.

## Vercel boundary

The bookings Vercel deployment must continue to treat repository root as the bookings project and publish only the root bookings build output.

Before merge, verify that importing `website/` cannot cause Vercel to build the nested website, alter root dependency discovery or treat website assets as bookings output. Any required Vercel project-setting change is an external account operation and requires separate authority.

## Environment and secrets

Do not copy `.env*`, credentials, FTP passwords, private keys or customer data into the destination repository.

The website currently depends on these public browser build-variable names:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

The existing deployment also uses destination-only GitHub secrets for Bluehost FTPS. Their names may be documented, but values must never be read into logs or committed.

The preparation PR must be able to run its ordinary validation without production deployment credentials. Build behaviour that requires public Vite configuration should use an explicitly documented safe CI strategy.

## Verification strategy

### Source/history verification

- record source commit `c55617b792ca7c458264f456aef73d89fb257e0a`;
- prove that commit or its preserved ancestry is reachable after import;
- compare source tracked files with `website/` after applying documented relocation rules;
- verify no unreviewed sensitive history is imported.

### Bookings validation

Run the repository bar appropriate to this structural change:

- `npm run check:docs`
- `npm run lint`
- `npm run typecheck`
- `npm run check:migrations`
- `npm run test`
- `npm run build`

Also exercise the existing required PR browser gate because the repository structure and CI discovery boundaries are changing.

### Website validation

Run independently:

- `npm ci --prefix website`
- `npm --prefix website run lint`
- `npm --prefix website run test:run`
- `npm --prefix website run test:coverage`
- `npm --prefix website run build`
- `npm --prefix website run test:e2e`

Use synthetic/public data only. Do not submit real contact forms, create live bookings or inspect customer records.

### Change-selection verification

Prove CI behaviour for:

- website-only changes;
- bookings-only changes;
- shared workflow/configuration changes;
- documentation-only changes;
- Supabase-only changes.

The key invariants are that website-only changes cannot deploy Edge Functions and pull requests cannot publish either application to production.

## Rollback

Before website publisher cutover, rollback is simply to leave the old website repository as publisher and abandon/revert the destination preparation branch.

After cutover:

- stop the destination website publisher;
- restore the last known-good website artefact through the verified Bluehost target;
- re-enable the original website repository publisher if required;
- inspect for stale uploaded assets rather than using destructive blanket cleanup;
- revert repository/configuration changes through ordinary reviewed commits;
- do not rewrite protected `main`.

The original website repository is not archived as part of technical completion unless explicitly authorised later.

## Documentation changes

The implementation must update:

- ADR 009 from Proposed to Accepted when the repository boundary lands;
- the active #784 migration plan with current SHAs and verified evidence;
- `docs/README.md` navigation if required;
- root contributor/development instructions for running the website;
- website maintenance/deployment guidance after relocation;
- a cutover/rollback runbook;
- changelog/release documentation where the repository consolidation is recorded.

## Out of scope

- combining the website and bookings frontends;
- moving bookings under `apps/`;
- npm workspaces or shared-package extraction;
- framework or dependency convergence;
- changing public URLs or hosts;
- changing booking, capacity, notification or authentication policy;
- database migrations or production data access;
- automatically applying migrations;
- archiving the old website repository;
- changing external hosting or repository secrets during the preparation PR.

## Acceptance criteria

The migration is ready for release when all of the following are true:

1. Website history is preserved and the pinned source revision is reachable from the destination repository.
2. Imported website tracked files reconcile with the pinned source revision after documented relocations.
3. Root bookings installs, checks, tests and builds independently.
4. Website installs, checks, tests and builds independently from `website/`.
5. Root tooling does not accidentally lint/test/build website source as bookings code.
6. Website tooling does not depend on bookings installation or build output.
7. Website CI runs from root `.github/workflows/` and cannot publish from pull requests.
8. Destination Bluehost publishing remains disabled until explicit cutover authority.
9. Website-only changes cannot deploy Edge Functions.
10. Vercel continues to build and publish only the bookings application.
11. No credentials, private keys or identifiable customer data are imported.
12. A target-verified cutover and rollback runbook exists before publisher switch.
13. The original website repository remains available for rollback through acceptance.
14. Both public surfaces are smoke-tested at the released revision before #784 closes.

## Implementation boundary

The first implementation PR should prepare the consolidated repository and CI while leaving website production publishing disabled. #784 remains open after that PR merges.

A separate, explicitly authorised cutover step enables the new website publisher, disables the old one, verifies production and records rollback evidence. Only after that release evidence is complete should #784 be closed.

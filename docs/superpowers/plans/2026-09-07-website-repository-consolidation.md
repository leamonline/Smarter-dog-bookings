# Website repository consolidation — executed preparation plan

**Status:** Executed (preparation only; cutover not performed)
**Issue:** [#784](https://github.com/leamonline/Smarter-dog-bookings/issues/784)
**Governing plan:** [docs/plans/completed/2026-09-05-website-consolidation.md](../../plans/completed/2026-09-05-website-consolidation.md)
**Decision:** [ADR 009](../../architecture/decisions/009-independent-applications-in-one-repository.md)
**Cutover:** [runbook](../runbooks/2026-09-07-website-publisher-cutover.md)
**Date:** 7 September 2026

This file records the task list that the preparation pull request executed.
It was originally written without locating the earlier planning branch. The
claim that the approved plan/spec did not exist anywhere was incorrect. The
approved documents are restored below from the planning branch. This record
preserves the implemented work; it does not replace the approved design.

## Tasks

1. **Baseline.** Re-read both repositories. Website `main` had moved from the
   plan's pinned `155b07fe9fd76356f766d479c1e16e18df6d57f0` to
   `c55617b792ca7c458264f456aef73d89fb257e0a` (four merged pull requests:
   holiday notice card, trust-stat contrast, Supabase build variables in
   CI, open-days strip during a holiday). Baseline website checks in a
   standalone clone on Node 24: `npm ci`, `lint`, `test:run` (211 tests)
   and `build` all passed.
2. **Historical scan** of all 129 website commits for sensitive material,
   reporting locations only: no private keys, tokens, service-role keys,
   JWTs, connection strings or password assignments in any revision. The
   only sensitive-shaped path ever added is `.env.example` (names only).
   Contact-shaped content is the salon's own public business details. Build
   artefacts (`dist-upload/`, Lighthouse reports) were tracked in early
   history and later removed; they contain no customer data. Outcome: no
   stop condition; full history imported.
3. **Import** via `git subtree add --prefix=website` with no squash. Verified
   `git diff-tree c55617b^{tree} HEAD:website` is empty and
   `git merge-base --is-ancestor c55617b HEAD` holds.
4. **Isolate root tooling** (ESLint ignore, Vitest exclude, `.gitignore`
   negation for `website/.env.example`, `website:*` npm scripts, no
   workspace).
5. **Workflows.** Remove the inert nested `website/.github/`; add root
   `website.yml` with the publisher dark; `ci.yml` runs for every PR, including `website/**`;
   Dependabot covers `/website`. Guard test
   `src/security/websiteWorkflowIsolation.test.ts`.
6. **Documentation**: this record, the cutover runbook, plan update, ADR
   note, `docs/README.md`, root `README.md`, `CLAUDE.md`,
   `website/MAINTENANCE.md`, `CHANGELOG.md`.
7. **Validation** — recorded in the pull request and the active plan.

## Deliberate exclusions from the imported tree

| Path at source | Disposition |
|---|---|
| `.github/workflows/ci.yml` | Removed after import (inert when nested); recreated at root as `website.yml` with Node 24 only, no Codecov upload, publisher dark |
| `.github/dependabot.yml` | Removed after import; equivalent `/website` entry added to root `dependabot.yml` with the root's major-version hold |

Apart from these relocations and the documented `MAINTENANCE.md` updates,
website files remain byte-identical to the pinned source.

## Planning provenance and reconciliation

The approved plan and spec were present before implementation on
`codex/website-repository-consolidation-spec`, inspected at
`5669b9f844bcb54d78dcd6ccd3bb6eea9ddd1b76`. The original plan is preserved
below as historical instructions, not a request to repeat the import. Its
unchecked boxes are not current delivery status. The active plan and PR #797
record execution evidence.

### Explicit deviations

- Keep the existing `.github/workflows/website.yml` and its separate jobs.
  Defer the proposed always-reporting `website-gate`; no website context is
  added to the ruleset. All five existing required contexts still report on
  website-only PRs. Website job display names are prefixed to avoid colliding
  with the required bookings `build` context.
- The original plan omitted a publisher action entirely. The implementation
  retains a dormant FTPS job gated by push, main and
  `WEBSITE_PUBLISHER_ENABLED == true`. It cannot publish on PRs or manual
  dispatch. Enabling it remains a separate owner-authorised cutover.
- Website CI uses the source workflow's public Supabase build-variable names
  rather than the plan's placeholders. Missing values exercise static
  fallback behaviour, not live integration; release validation must verify
  the configured public data features before cutover acceptance. E2E uses
  reserved non-production placeholders so the existing mocked holiday scenarios
  execute instead of skipping all 20 cases across five browser projects.
- The missing docs-scanner exclusion from Task 3 is now implemented and
  tested. Bookings documentation governance excludes `website/`; repository
  security checks such as duplicate-file detection still cover both apps.
- The source Node matrix is reduced to repository-standard Node 24, Codecov
  upload is omitted, and Dependabot holds major updates. Separate coverage
  and browser artefacts remain available.
- Website workflow paths cover `website/**` and its own workflow; there is
  no shared runtime/build configuration. Root tooling changes are covered
  by the always-running repository checks and isolation guard.
- ADR 009 is marked Accepted to reflect the approved architecture decision
  on 7 September, as Task 6 requires. Acceptance does not claim deployment.
- The cutover runbook stays at the implemented `docs/superpowers/runbooks/`
  path. Its proposed required website-gate precondition is deferred with the
  gate itself; the owner must review website checks at the exact release SHA
  before authorising publishing. No ruleset change is part of preparation.

## Original approved implementation plan (historical)

# Website Repository Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import `leamonline/smarter-dog-website` into `leamonline/Smarter-dog-bookings` under `website/` with preserved Git history, independent tooling and CI, and no production publisher cutover.

**Architecture:** Keep the bookings application at repository root and add the public website as a self-contained nested React/Vite application. Preserve the exact website source revision in Git history, isolate root tooling from `website/`, add an always-reporting `website-gate` CI job suitable for branch protection, and leave Bluehost publishing in the original website repository until a separately authorised cutover.

**Tech Stack:** Git, Git subtree-style history import, Node.js 24, npm, React 19, Vite 7/8, Vitest, Playwright, GitHub Actions, Vercel, Supabase, Bluehost FTPS.

**Spec:** `docs/superpowers/specs/2026-09-07-website-repository-consolidation-design.md`

## Global Constraints

- Destination bookings baseline for this plan: `d80ab2dd51074debf3991bd21c9f085282cb9b3e`; rebase onto current `origin/main` before implementation if `main` has advanced.
- Website source revision is exactly `c55617b792ca7c458264f456aef73d89fb257e0a` unless a later source commit is explicitly reconciled before import.
- Preserve website Git history. A snapshot-only copy is not acceptable.
- Keep bookings at repository root and website under `website/`.
- Keep separate `package.json`, `package-lock.json`, installs, tests and builds.
- Do not introduce npm workspaces, shared packages, a combined router or a combined Vite build.
- Do not change database schema, RLS, grants, booking policy, capacity policy, notification semantics, Edge Function behaviour or customer data.
- Do not read `.env*`, credentials, private keys, `docs/private/` or identifiable customer records.
- Do not change Bluehost, Vercel project settings, GitHub secrets, external accounts or the original website publisher during this preparation plan.
- Pull requests must never publish the website.
- The destination repository must not become a Bluehost publisher in this plan.
- Keep the current required bookings check names `build`, `coverage`, `agent-tests`, `pr-production-smoke` and `migrations-applied` unchanged.
- Use UK English in repository prose.

---

### Task 1: Prepare an isolated implementation branch and verify the source revision

**Files:**
- No repository files changed in this task.

**Interfaces:**
- Consumes: destination repository `origin/main`; source repository `https://github.com/leamonline/smarter-dog-website.git`.
- Produces: an isolated implementation worktree/branch with the pinned website commit fetched into the local Git object database and a no-secret preflight result.

- [ ] **Step 1: Create an isolated worktree from current `main`**

Run from an existing clone of `Smarter-dog-bookings`:

```bash
git fetch origin main
git worktree add ../smarter-dog-bookings-website-consolidation \
  -b codex/website-repository-consolidation origin/main
cd ../smarter-dog-bookings-website-consolidation
```

Expected: the worktree is on `codex/website-repository-consolidation` and `git status --short` is empty.

- [ ] **Step 2: Record the exact destination base**

Run:

```bash
git rev-parse HEAD
```

Expected: a current `main` SHA. If it differs from `d80ab2dd51074debf3991bd21c9f085282cb9b3e`, update the active migration plan's `Base` field later in Task 6; do not reset `main` backwards.

- [ ] **Step 3: Fetch the website source without merging it**

Run:

```bash
git remote add website-source https://github.com/leamonline/smarter-dog-website.git
git fetch --no-tags website-source main
SOURCE_SHA=c55617b792ca7c458264f456aef73d89fb257e0a
test "$(git rev-parse website-source/main)" = "$SOURCE_SHA"
git cat-file -e "${SOURCE_SHA}^{commit}"
```

Expected: every command exits 0 and `website-source/main` is exactly the approved source revision.

- [ ] **Step 4: Scan source history for sensitive filenames without reading values**

Run:

```bash
git log --format= --name-only website-source/main \
  | sed '/^$/d' \
  | sort -u \
  | grep -E '(^|/)(\.env($|\.)|id_rsa($|\.)|id_ed25519($|\.)|.*\.pem$|.*\.p12$|.*\.pfx$|.*\.key$)' \
  || true
```

Expected: review filenames only. `.env.example` or documentation references are not automatically blockers; an actual credential/private-key path is a blocker and must stop this plan for a sanitised-history design review.

- [ ] **Step 5: Scan historical blob contents for high-confidence secret forms without printing secret values**

Run:

```bash
set -euo pipefail
pattern='-----BEGIN (RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9_]{20,}'
report="$(mktemp)"
while IFS= read -r sha; do
  git grep -Il -E "$pattern" "$sha" -- 2>/dev/null \
    | sed "s#^#$sha #" >> "$report" || true
done < <(git rev-list website-source/main)
sort -u "$report" -o "$report"
if [ -s "$report" ]; then
  echo "Potential secret-bearing historical blobs found; showing commit/path only:"
  cat "$report"
  exit 1
fi
rm -f "$report"
```

Expected: exit 0 with no secret-bearing blob paths. If it exits 1, stop before import and record the paths only; do not print matching values.

- [ ] **Step 6: Commit nothing**

This task is a preflight. `git status --short` must still be empty.

---

### Task 2: Import the website with preserved history and prove tree identity

**Files:**
- Create through history import: `website/**` from source commit `c55617b792ca7c458264f456aef73d89fb257e0a`.

**Interfaces:**
- Consumes: fetched `website-source` remote and `SOURCE_SHA` from Task 1.
- Produces: a merge/subtree commit whose history reaches the exact source SHA and whose initial `website/` tree is byte-for-byte the source tree.

- [ ] **Step 1: Import the pinned source with full history**

Run:

```bash
SOURCE_SHA=c55617b792ca7c458264f456aef73d89fb257e0a
git subtree add \
  --prefix=website \
  website-source "$SOURCE_SHA" \
  -m "chore: import website history under website"
```

Expected: Git creates the import commit without `--squash`.

- [ ] **Step 2: Prove the original website source commit remains reachable**

Run:

```bash
SOURCE_SHA=c55617b792ca7c458264f456aef73d89fb257e0a
git merge-base --is-ancestor "$SOURCE_SHA" HEAD
git cat-file -e "${SOURCE_SHA}^{commit}"
```

Expected: both commands exit 0.

- [ ] **Step 3: Prove initial subtree identity before any destination-specific relocation**

Run:

```bash
SOURCE_SHA=c55617b792ca7c458264f456aef73d89fb257e0a
source_tree="$(git rev-parse "${SOURCE_SHA}^{tree}")"
imported_tree="$(git rev-parse HEAD:website)"
printf 'source tree:   %s\nimported tree: %s\n' "$source_tree" "$imported_tree"
test "$source_tree" = "$imported_tree"
```

Expected: the two tree SHAs are identical.

- [ ] **Step 4: Record the import evidence for later documentation**

Run:

```bash
printf 'website source=%s\nimport commit=%s\nwebsite tree=%s\n' \
  "$SOURCE_SHA" \
  "$(git rev-parse HEAD)" \
  "$(git rev-parse HEAD:website)"
```

Copy these three non-sensitive SHAs into the active migration plan in Task 6.

---

### Task 3: Isolate bookings tooling from the nested website and add root convenience commands

**Files:**
- Modify: `eslint.config.js`
- Modify: `scripts/check-doc-links.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: the imported `website/` tree.
- Produces: root bookings tooling that deliberately excludes website source/docs where the root checker owns only bookings, plus explicit root commands that delegate to the website's own package scripts.

- [ ] **Step 1: Demonstrate the root ESLint discovery problem before fixing it**

Run:

```bash
npx eslint website --no-error-on-unmatched-pattern
```

Expected: ESLint attempts to inspect website files using the bookings configuration. This is the behaviour to prevent even if the command happens to exit 0.

- [ ] **Step 2: Exclude the nested application from root ESLint**

In the first `ignores` block of `eslint.config.js`, add:

```js
"website/**",
```

Place it alongside other whole-tree exclusions such as `docs/**` and `archive/**`.

- [ ] **Step 3: Verify root ESLint no longer discovers website files**

Run:

```bash
npx eslint website --no-error-on-unmatched-pattern --debug 2>&1 \
  | grep -q 'website/' && exit 1 || exit 0
```

Expected: exit 0. Then run:

```bash
npm run lint
```

Expected: root lint passes and continues to run `check-import-extensions`, `check-duplicate-files`, `check-lockfile-platform` and `check-hosted-supabase-targets`.

- [ ] **Step 4: Keep website Markdown outside the bookings documentation-governance scan**

In `scripts/check-doc-links.mjs`, extend `excludedMarkdownPrefixes` to:

```js
export const excludedMarkdownPrefixes = [
  "docs/archive/",
  "docs/private/",
  ".design-sync/docs-stubs/",
  "website/",
];
```

Reason: `check:docs` governs destination repository documentation; the nested application remains independently maintained and its imported Markdown must not silently become bookings documentation.

- [ ] **Step 5: Verify the docs checker excludes website Markdown but still governs destination docs**

Run:

```bash
node --input-type=module <<'NODE'
import { filterGovernedMarkdownFiles } from './scripts/check-doc-links.mjs';
const files = filterGovernedMarkdownFiles([
  'README.md',
  'docs/README.md',
  'website/README.md',
  'website/docs/guide.md',
]);
if (files.includes('website/README.md') || files.includes('website/docs/guide.md')) process.exit(1);
if (!files.includes('README.md') || !files.includes('docs/README.md')) process.exit(1);
NODE
npm run check:docs
```

Expected: both commands exit 0.

- [ ] **Step 6: Add explicit root convenience scripts without changing either dependency graph**

Add these entries to the root `package.json` `scripts` object:

```json
"website:dev": "npm --prefix website run dev",
"website:lint": "npm --prefix website run lint",
"website:test": "npm --prefix website run test:run",
"website:coverage": "npm --prefix website run test:coverage",
"website:build": "npm --prefix website run build",
"website:e2e": "npm --prefix website run test:e2e"
```

Do not add a root dependency on website packages and do not modify the root `package-lock.json` for these script-only additions.

- [ ] **Step 7: Prove each application still owns its own installation**

Run:

```bash
npm ci
npm ci --prefix website
test -d node_modules
test -d website/node_modules
test "$(realpath node_modules)" != "$(realpath website/node_modules)"
```

Expected: all commands exit 0.

- [ ] **Step 8: Commit the tooling-isolation change**

Run:

```bash
git add eslint.config.js scripts/check-doc-links.mjs package.json
git commit -m "build: isolate website tooling from bookings"
```

---

### Task 4: Relocate website CI and create an always-reporting website merge gate

**Files:**
- Delete after relocation: `website/.github/workflows/ci.yml`
- Create: `.github/workflows/website-ci.yml`

**Interfaces:**
- Consumes: website scripts from `website/package.json` and root protected-branch workflow conventions.
- Produces: one stable GitHub check named `website-gate` that reports success on every PR, runs full website validation only when website/website-CI files changed, and contains no production deployment action.

- [ ] **Step 1: Preserve the imported source workflow in history, then remove its inactive nested copy from the destination tree**

Run:

```bash
test -f website/.github/workflows/ci.yml
git rm website/.github/workflows/ci.yml
```

The source version remains recoverable through `c55617b792ca7c458264f456aef73d89fb257e0a`; active Actions workflows must live under root `.github/workflows/`.

- [ ] **Step 2: Create `.github/workflows/website-ci.yml` with a stable required-check candidate**

Create exactly:

```yaml
name: Website CI

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read

jobs:
  website-gate:
    runs-on: ubuntu-latest
    steps:
      - name: Check out repo
        uses: actions/checkout@v7
        with:
          fetch-depth: 0

      - name: Decide whether website validation is required
        id: changed
        shell: bash
        env:
          EVENT_NAME: ${{ github.event_name }}
          BASE_REF: ${{ github.base_ref }}
          BEFORE_SHA: ${{ github.event.before }}
        run: |
          set -euo pipefail

          if [ "$EVENT_NAME" = "workflow_dispatch" ]; then
            echo "required=true" >> "$GITHUB_OUTPUT"
            exit 0
          fi

          if [ "$EVENT_NAME" = "pull_request" ]; then
            git fetch --no-tags origin "$BASE_REF"
            range="origin/${BASE_REF}...HEAD"
          elif [[ "$BEFORE_SHA" =~ ^0+$ ]] || ! git cat-file -e "${BEFORE_SHA}^{commit}" 2>/dev/null; then
            range="$(git rev-parse HEAD^ 2>/dev/null || echo HEAD)...HEAD"
          else
            range="${BEFORE_SHA}...HEAD"
          fi

          echo "Checking website changes in $range"
          if git diff --quiet "$range" -- website/ .github/workflows/website-ci.yml; then
            echo "required=false" >> "$GITHUB_OUTPUT"
          else
            echo "required=true" >> "$GITHUB_OUTPUT"
          fi

      - name: No website changes
        if: steps.changed.outputs.required != 'true'
        run: echo "No website-relevant changes; website gate passes without installing the nested app."

      - name: Set up Node 24
        if: steps.changed.outputs.required == 'true'
        uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: npm
          cache-dependency-path: website/package-lock.json

      - name: Install website dependencies
        if: steps.changed.outputs.required == 'true'
        working-directory: website
        run: npm ci

      - name: Lint website
        if: steps.changed.outputs.required == 'true'
        working-directory: website
        run: npm run lint

      - name: Run website unit tests
        if: steps.changed.outputs.required == 'true'
        working-directory: website
        run: npm run test:run

      - name: Run website coverage
        if: steps.changed.outputs.required == 'true'
        working-directory: website
        run: npm run test:coverage

      - name: Build website with non-production public placeholders
        if: steps.changed.outputs.required == 'true'
        working-directory: website
        env:
          VITE_SUPABASE_URL: https://example.supabase.co
          VITE_SUPABASE_PUBLISHABLE_KEY: ci-public-placeholder
        run: npm run build

      - name: Install Playwright browsers
        if: steps.changed.outputs.required == 'true'
        working-directory: website
        run: npx playwright install --with-deps

      - name: Run website browser tests
        if: steps.changed.outputs.required == 'true'
        working-directory: website
        run: npm run test:e2e

      - name: Upload website coverage
        if: always() && steps.changed.outputs.required == 'true'
        uses: actions/upload-artifact@v7
        with:
          name: website-coverage
          path: website/coverage/
          if-no-files-found: warn
          retention-days: 30

      - name: Upload website Playwright report
        if: always() && steps.changed.outputs.required == 'true'
        uses: actions/upload-artifact@v7
        with:
          name: website-playwright-report
          path: website/playwright-report/
          if-no-files-found: warn
          retention-days: 30

      - name: Upload website build
        if: steps.changed.outputs.required == 'true'
        uses: actions/upload-artifact@v7
        with:
          name: website-build
          path: website/dist/
          if-no-files-found: error
          retention-days: 7
```

This workflow intentionally contains no Bluehost/FTP deploy job.

- [ ] **Step 3: Prove the destination workflow contains no publisher**

Run:

```bash
! grep -R -E 'FTP-Deploy-Action|BLUEHOST_FTP_|server-dir:|protocol: ftps' \
  .github/workflows/website-ci.yml
```

Expected: exit 0.

- [ ] **Step 4: Prove the existing Edge deployment trigger remains website-blind**

Run:

```bash
grep -q "'supabase/functions/\*\*'" .github/workflows/deploy-edge-functions.yml
! grep -q "website/" .github/workflows/deploy-edge-functions.yml
```

Expected: both checks exit 0. Do not edit `.github/workflows/deploy-edge-functions.yml` merely to restate this invariant; its current path filter already enforces it.

- [ ] **Step 5: Commit the CI relocation**

Run:

```bash
git add .github/workflows/website-ci.yml website/.github/workflows/ci.yml
git commit -m "ci: add independent website merge gate"
```

---

### Task 5: Verify website build/test independence locally before documentation work

**Files:**
- No intended file changes in this task.

**Interfaces:**
- Consumes: imported website and Task 3/4 tooling changes.
- Produces: evidence that both applications run independently and that website validation needs no destination production credentials.

- [ ] **Step 1: Run website checks from its own installation**

Run:

```bash
npm ci --prefix website
npm --prefix website run lint
npm --prefix website run test:run
npm --prefix website run test:coverage
VITE_SUPABASE_URL=https://example.supabase.co \
VITE_SUPABASE_PUBLISHABLE_KEY=ci-public-placeholder \
  npm --prefix website run build
```

Expected: every command passes without reading destination secrets.

- [ ] **Step 2: Run website Playwright tests**

Run:

```bash
npx --prefix website playwright install --with-deps
npm --prefix website run test:e2e
```

Expected: pass using synthetic/public behaviour only. Do not submit production forms or create real bookings.

- [ ] **Step 3: Prove build outputs remain separate**

Run:

```bash
npm run build
test -d dist
test -d website/dist
test "$(realpath dist)" != "$(realpath website/dist)"
```

Expected: both output directories exist and are distinct.

- [ ] **Step 4: Verify root Vercel configuration was not modified by the import**

Run:

```bash
git diff origin/main -- vercel.json
```

Expected: no output. If Vercel requires an external Root Directory or Ignore Command change after this structural import, stop before merge and request separate authority rather than encoding an unverified assumption here.

---

### Task 6: Update durable architecture, migration and operating documentation

**Files:**
- Modify: `docs/architecture/decisions/009-independent-applications-in-one-repository.md`
- Modify: `docs/plans/completed/2026-09-05-website-consolidation.md`
- Create: `docs/runbooks/website-repository-cutover.md`
- Modify: `docs/README.md`
- Modify: `README.md`
- Modify: `website/MAINTENANCE.md` if present in the imported tree
- Modify: `CHANGELOG.md` if repository convention records structural changes there

**Interfaces:**
- Consumes: exact SHAs and validation evidence from Tasks 1–5.
- Produces: accepted architecture record, current implementation status, developer commands and a non-destructive future cutover/rollback procedure.

- [ ] **Step 1: Mark ADR 009 accepted without claiming deployment completion**

Change the header of `docs/architecture/decisions/009-independent-applications-in-one-repository.md` from:

```markdown
Status: Proposed
```

to:

```markdown
Status: Accepted
```

Add a short evidence note under `## Execution`:

```markdown
The repository-boundary decision was approved on 7 September 2026. Repository import and deployment evidence are tracked in issue #784 and the active migration plan; `Accepted` records the architecture decision, not completion of the Bluehost publisher cutover.
```

- [ ] **Step 2: Refresh the active migration plan with current exact SHAs**

In `docs/plans/completed/2026-09-05-website-consolidation.md`:

- change `Status: Draft` to `Status: In progress`;
- replace the old `Base` with the actual Task 1 destination base SHA;
- set the website source to `c55617b792ca7c458264f456aef73d89fb257e0a`;
- record the Task 2 import commit SHA and imported tree SHA;
- state that destination Bluehost publishing remains disabled and source repo remains the only publisher;
- replace any superseded note that website source is `155b07f...` with the current pinned source evidence.

Do not mark the plan completed.

- [ ] **Step 3: Create the future cutover/rollback runbook**

Create `docs/runbooks/website-repository-cutover.md` containing these exact gates and order:

```markdown
# Website repository cutover

## Preconditions

- #784 preparation PR is merged and all required checks are green at one exact `main` SHA.
- `website-gate` is an enforced required check on `Protect main`.
- The destination repository has the required website build/deployment secret *names* provisioned through authorised account administration; values are never printed or committed.
- Bluehost FTPS account scope and target directory are independently verified.
- Any website commits after `c55617b792ca7c458264f456aef73d89fb257e0a` are reconciled before switching publishers.
- A known-good website build artefact and its source SHA are retained for rollback.

## Cutover

1. Record the exact destination `main` SHA and source website SHA.
2. Disable the original `smarter-dog-website` publisher so there is no concurrent writer.
3. Enable the reviewed destination website deployment workflow in a separate pull request.
4. Merge only after its checks are green and the destination target/secret-name inventory has been verified.
5. Observe the destination FTPS deployment result.
6. Smoke-test the public homepage, key navigation, holiday/open-day content and booking links at desktop, tablet and mobile widths without creating a live booking or submitting a contact form.
7. Record deployment workflow/run ID and public smoke evidence on #784.
8. Keep the original repository unarchived through acceptance.

## Rollback

1. Stop the destination publisher.
2. Restore the retained known-good website artefact through the verified Bluehost target.
3. Re-enable the original repository publisher if required.
4. Inspect for stale uploaded assets; do not use destructive blanket cleanup.
5. Revert destination workflow/configuration through a reviewed pull request; do not rewrite protected `main`.
6. Record the rollback revision and observed public state on #784.
```

- [ ] **Step 4: Add developer commands to root README**

Add a concise `Website` development subsection that includes:

```bash
npm ci --prefix website
npm run website:dev
npm run website:lint
npm run website:test
npm run website:build
npm run website:e2e
```

State that root and website dependencies are intentionally separate and that `npm ci` at root does not install website dependencies.

- [ ] **Step 5: Update website maintenance guidance**

If `website/MAINTENANCE.md` exists, replace references that say its active CI lives in `website/.github/workflows/ci.yml` or the old repository with the destination path:

```text
.github/workflows/website-ci.yml
```

Keep existing Bluehost operational notes, but explicitly state that publisher ownership does not move until the separately authorised #784 cutover.

- [ ] **Step 6: Link the runbook from `docs/README.md`**

Add `website-repository-cutover.md` to the existing runbook/navigation section using a relative repository link. Do not reorganise unrelated docs.

- [ ] **Step 7: Run documentation validation**

Run:

```bash
npm run check:docs
```

Expected: pass.

- [ ] **Step 8: Commit documentation**

Run:

```bash
git add \
  docs/architecture/decisions/009-independent-applications-in-one-repository.md \
  docs/plans/completed/2026-09-05-website-consolidation.md \
  docs/runbooks/website-repository-cutover.md \
  docs/README.md README.md website/MAINTENANCE.md CHANGELOG.md 2>/dev/null || true

git add -u
git commit -m "docs: record website consolidation boundaries"
```

Before committing, inspect `git status --short` and ensure no unrelated file is staged.

---

### Task 7: Run the full structural validation bar and verify no forbidden surface changed

**Files:**
- No intended file changes. Test artefacts remain ignored.

**Interfaces:**
- Consumes: complete preparation branch.
- Produces: merge evidence for both applications and repository-boundary invariants.

- [ ] **Step 1: Run the bookings repository bar**

Run in this order:

```bash
npm ci
npm run check:docs
npm run lint
npm run typecheck
npm run check:migrations
npm run test
npm run build
```

Expected: every command passes.

- [ ] **Step 2: Run the website repository bar independently**

Run:

```bash
npm ci --prefix website
npm --prefix website run lint
npm --prefix website run test:run
npm --prefix website run test:coverage
VITE_SUPABASE_URL=https://example.supabase.co \
VITE_SUPABASE_PUBLISHABLE_KEY=ci-public-placeholder \
  npm --prefix website run build
npm --prefix website run test:e2e
```

Expected: every command passes.

- [ ] **Step 3: Run the existing bookings PR browser gate locally where supported**

Run:

```bash
PLAYWRIGHT_PR_SMOKE=1 npx playwright test --project=desktop
PLAYWRIGHT_PR_SMOKE=1 npx playwright test e2e/smoke.spec.ts --project=mobile-webkit
```

Expected: both pass against deterministic sample data.

- [ ] **Step 4: Re-prove history reachability after all destination commits**

Run:

```bash
SOURCE_SHA=c55617b792ca7c458264f456aef73d89fb257e0a
git merge-base --is-ancestor "$SOURCE_SHA" HEAD
git cat-file -e "${SOURCE_SHA}^{commit}"
```

Expected: both exit 0.

- [ ] **Step 5: Verify destination-specific website deviations are deliberate**

Run:

```bash
SOURCE_SHA=c55617b792ca7c458264f456aef73d89fb257e0a
git diff --name-status "$SOURCE_SHA" -- website/ || true
```

Interpretation: because the source commit's paths are rooted differently, this command is context only. The authoritative initial equality proof is the Task 2 tree-SHA equality. Review current `website/` changes since the import commit and confirm they are limited to deliberate destination relocation/documentation changes such as removal of nested workflow guidance.

- [ ] **Step 6: Prove database and Edge runtime source remain untouched**

Run:

```bash
BASE_SHA="$(git merge-base origin/main HEAD)"
test -z "$(git diff --name-only "$BASE_SHA"...HEAD -- supabase/)"
test -z "$(git diff --name-only "$BASE_SHA"...HEAD -- vercel.json)"
```

Expected: both tests exit 0.

- [ ] **Step 7: Prove no destination website publisher exists**

Run:

```bash
! grep -R -E 'SamKirkland/FTP-Deploy-Action|BLUEHOST_FTP_PASSWORD|protocol: ftps' \
  .github/workflows/
```

Expected: exit 0 during this preparation PR.

- [ ] **Step 8: Inspect the final diff for accidental repository mixing**

Run:

```bash
git status --short
git diff --stat origin/main...HEAD
git diff --name-only origin/main...HEAD
```

Expected: clean working tree after tests, with changes limited to the website import, tooling isolation, website CI, approved spec/plan, ADR/plan/runbook and developer documentation.

---

### Task 8: Open the preparation PR, enforce the website gate, and stop before publisher cutover

**Files:**
- No additional repository files required unless review finds a defect.

**Interfaces:**
- Consumes: green implementation branch from Task 7.
- Produces: a reviewable preparation PR linked to #784; after its first successful website run, `website-gate` becomes a required `Protect main` check before merge.

- [ ] **Step 1: Push the implementation branch**

Run:

```bash
git push -u origin codex/website-repository-consolidation
```

Expected: push succeeds without bypassing `main` protection.

- [ ] **Step 2: Open the PR without auto-closing #784**

Use this title:

```text
Consolidate public website into bookings repository
```

Use a body containing:

```markdown
## What changed

Imports `leamonline/smarter-dog-website@c55617b792ca7c458264f456aef73d89fb257e0a` under `website/` with preserved Git history, keeps both applications independently installed/built/tested, isolates root tooling, and adds an always-reporting `website-gate` CI job.

## Why

Implements the preparation phase of #784 so website and bookings can be maintained together without coupling runtimes or deployments.

## Behaviour and evidence

- Original website source commit remains reachable from destination history.
- Initial imported subtree tree SHA matched the source tree SHA before documented relocations.
- Root bookings repository bar passes.
- Website lint, Vitest, coverage, build and Playwright pass independently.
- Existing bookings PR browser gates pass.
- Website-only source cannot trigger the Supabase Edge deployment workflow.
- Destination website CI contains no Bluehost publisher.

## Data, security and release

No database migration, production data access, provider change, secret read, Bluehost change or Vercel project-setting change. The original website repository remains the sole Bluehost publisher. #784 stays open until a separately authorised publisher cutover and public verification are complete.

## Documentation

Implements the approved design in `docs/superpowers/specs/2026-09-07-website-repository-consolidation-design.md`, the implementation plan in `docs/superpowers/plans/2026-09-07-website-repository-consolidation.md`, ADR 009 and the active #784 migration plan.
```

- [ ] **Step 3: Wait for the first `website-gate` result on the PR and verify its semantics**

For this PR, `website-gate` must execute the full website suite because `website/**` and `.github/workflows/website-ci.yml` changed. A success that only ran the `No website changes` step is a configuration bug and must not be accepted.

- [ ] **Step 4: Add `website-gate` to the `Protect main` required status checks**

This is a repository-governance step, not a publisher cutover. In GitHub:

```text
Settings → Rules → Rulesets → Protect main → Require status checks to pass → Add checks → website-gate
```

Keep the existing required checks unchanged: `build`, `coverage`, `agent-tests`, `pr-production-smoke`, `migrations-applied`.

After saving, verify the ruleset reports all six contexts and no bypass actor.

- [ ] **Step 5: Re-run/refresh PR checks after the ruleset change if GitHub requires it**

Expected required checks before merge:

```text
build
coverage
agent-tests
pr-production-smoke
migrations-applied
website-gate
```

All six must be green.

- [ ] **Step 6: Do not merge automatically from the implementation agent**

Stop with the PR green and review-ready. The preparation PR may be merged by the user under normal protected-branch governance, but this plan does not authorise the separate Bluehost publisher cutover.

- [ ] **Step 7: Keep #784 open after the preparation PR**

Add release evidence to #784 after merge, but do not close it. The next phase begins only after explicit authority to reconcile any source drift, transfer publisher ownership, provision destination deployment secrets/settings and verify production.

---

## Plan self-review

- Spec coverage: history preservation, app isolation, tooling isolation, CI, Edge deployment isolation, no publisher cutover, Vercel boundary, secrets boundary, documentation, rollback preparation and protected-branch enforcement are each mapped to explicit tasks.
- Placeholder scan: no `TBD`, `TODO`, unspecified implementation steps or hidden follow-up work remain in this preparation plan.
- Interface consistency: source SHA is consistently `c55617b792ca7c458264f456aef73d89fb257e0a`; nested app path is consistently `website/`; stable CI context is consistently `website-gate`; destination publisher remains absent throughout this plan.
- Scope boundary: production publisher cutover is deliberately excluded and will use the checked-in runbook plus a separately authorised execution step after this preparation PR is merged.

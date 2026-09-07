# Website repository consolidation — executed preparation plan

**Status:** Executed (preparation only; cutover not performed)
**Issue:** [#784](https://github.com/leamonline/Smarter-dog-bookings/issues/784)
**Governing plan:** [docs/plans/active/2026-09-05-website-consolidation.md](../../plans/active/2026-09-05-website-consolidation.md)
**Decision:** [ADR 009](../../architecture/decisions/009-independent-applications-in-one-repository.md)
**Cutover:** [runbook](../runbooks/2026-09-07-website-publisher-cutover.md)
**Date:** 7 September 2026

This file records the task list that the preparation pull request executed.
It was written in that pull request because the path was referenced by the
work request but did not exist in the repository; the design authority is
ADR 009 and the active plan above, not this record.

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
   `website.yml` with the publisher dark; `ci.yml` ignores `website/**`;
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

Everything else is byte-identical to the source commit.

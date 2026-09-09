# Website publisher cutover runbook

**Status:** Executed — cutover completed 9 September 2026 (first successful publish from this repository). See the [completion record](../../plans/completed/2026-09-05-website-consolidation.md#cutover-completion-record-9-september-2026).
**Issue:** [#784](https://github.com/leamonline/Smarter-dog-bookings/issues/784)
**Plan:** [website consolidation](../../plans/completed/2026-09-05-website-consolidation.md)
**Decision:** [ADR 009](../../architecture/decisions/009-independent-applications-in-one-repository.md)
**Prepared:** 7 September 2026 against website source
`c55617b792ca7c458264f456aef73d89fb257e0a`

This runbook moves the single publisher of smarterdog.co.uk from the
`leamonline/smarter-dog-website` repository to this repository's
[`website.yml`](../../../.github/workflows/website.yml) workflow. Steps 1–5 ran on 8 September 2026; the first trigger that day found the `deploy` job skipped (gate variable not yet set); the cutover completed on 9 September 2026 once the variable was set (see the status line). The runbook is retained as the procedure for any future re-cutover. It changes external accounts (GitHub secrets and variables in
this repository, the original repository's workflow) and therefore requires
explicit owner authority covering the steps marked **AUTHORISE**. An agreed
cutover scope can cover these steps together; this preparation is not that authority.

Preparation deliberately left the destination publisher dark: the `deploy`
job needs a push to `main` **and** the repository variable
`WEBSITE_PUBLISHER_ENABLED` set to exactly `true`. The variable does not exist
until step 8 creates it, so merging the preparation pull request publishes
nothing. Read-only inspection on 7 September found that gate absent and a
different variable, `WEBSITE_DEPLOY_ENABLED=false`, present. The latter is not
consumed by this workflow. Recheck the actual gate before any release.

## Invariants

- Exactly one publisher writes to Bluehost at any time. Disable the old one
  before enabling the new one; never run both.
- Never use a clean-slate deploy. `dangerous-clean-slate` stays `false`.
- Hosting, DNS and URLs do not change. The FTP target is the existing
  `public_html/` account.
- No credential value is ever committed, printed in a log, or pasted into
  an issue. Only names appear below.
- Rollback keeps the previous build available until acceptance.

## Names inventory (values are never recorded here)

| Kind | Name | Used by | Public? |
|---|---|---|---|
| Repository secret | `VITE_SUPABASE_URL` | website build (baked into the bundle) | Yes — browser configuration |
| Repository secret | `VITE_SUPABASE_PUBLISHABLE_KEY` | website build (baked into the bundle) | Yes — browser configuration |
| Repository secret | `BLUEHOST_FTP_HOST` | deploy job | No |
| Repository secret | `BLUEHOST_FTP_USER` | deploy job | No |
| Repository secret | `BLUEHOST_FTP_PASSWORD` | deploy job | No |
| Repository variable | `WEBSITE_PUBLISHER_ENABLED` | deploy job gate | n/a |

The website source also reads `VITE_GA_MEASUREMENT_ID`
(`website/src`, via `import.meta.env`) and its `.env.example` lists three
`VITE_EMAILJS_*` names. The source repository's workflow passed **only** the
two Supabase values into its production build, so the destination workflow
does the same. Adding the analytics or EmailJS names to the CI build is a
separate product decision, not part of this cutover.

## Before the cutover

1. **Reconcile source commits.** Compare the original repository's `main`
   with the imported history:

   ```bash
   git fetch https://github.com/leamonline/smarter-dog-website main
   git merge-base --is-ancestor FETCH_HEAD HEAD && echo "up to date" || echo "NEW SOURCE COMMITS"
   ```

   If there are new commits, pull them in with a subtree merge (no squash)
   in a reviewed pull request **before** continuing:

   ```bash
   git subtree pull --prefix=website https://github.com/leamonline/smarter-dog-website main
   ```

2. **Freeze the source.** Ask that no further changes merge to the original
   repository. After the freeze, fetch again and repeat the ancestry check
   from step 1 so a commit landing during reconciliation cannot be missed.
   Record the exact source and destination SHAs before switching publishers.

3. **Verify the FTP account scope** from the Bluehost/cPanel side, without
   deploying: the account behind `BLUEHOST_FTP_USER` must have `public_html/`
   as its root. `server-dir: ./` in `website.yml` is correct only then
   (see [`website/MAINTENANCE.md`](../../../website/MAINTENANCE.md)). If the
   account is different, change `server-dir` in a reviewed pull request
   before enabling the publisher.

4. **Keep a rollback artefact.** Download the most recent successful
   `build-artifacts` from the original repository's `CI` workflow (7-day
   retention) or rebuild it from the last published source SHA. Record the
   SHA and the artifact run ID in the issue. Also note the current
   `.ftp-deploy-sync-state.json` state at the verified target. Do not assume
   a repository change resets remote sync state; preserve it and inspect the
   proposed upload/deletion list. Keep the actual known-good artefact outside
   the short Actions retention window, including its checksum and file manifest.

5. **Verify Vercel scope** (read-only): the bookings Vercel project builds
   from the repository root with `npm run build` and publishes root `dist/`.
   `website/` is not referenced by root `vite.config.js`, and the root build
   inspected on 7 September 2026 contained no website asset. Vercel
   may still build on website-only merges. Recheck the current project root,
   build/output settings and ignore command; changing them is outside this
   runbook. Verify successful checks on the exact release SHA, including all
   five required repository contexts and the website suite. A required
   `website-gate` is deferred, so a green ruleset alone is insufficient proof
   of website validation.

## Cutover (single writer throughout)

6. **AUTHORISE — stop the original publisher.** In
   `leamonline/smarter-dog-website`, disable the `CI` workflow (Actions →
   CI → ⋯ → Disable workflow) or merge a change that removes its `deploy`
   job. Confirm no run is in progress. Record the time.

7. **AUTHORISE — provision destination secrets** in this repository's
   Settings → Secrets and variables → Actions, by name from the inventory
   above. Values come from the account administrator, never from Git.

8. **AUTHORISE — enable the destination publisher.** Create the repository
   variable `WEBSITE_PUBLISHER_ENABLED` with value `true`.

9. **Trigger a publish.** Merge a website-touching change to `main` (a
   one-line edit to `website/MAINTENANCE.md` recording the cutover date is
   sufficient — the workflow is path-filtered to `website/**`). Do not push
   an empty commit.

10. **Watch the run.** All four jobs (`website-test`, `website-build`,
    `website-e2e`, `deploy`) must
    succeed. Record the workflow run URL, the commit SHA, and the
    `deploy` job's FTP summary (files uploaded/deleted). Transport success is
    not acceptance.

## Acceptance (public smoke test, no real submissions)

11. From a browser with cache disabled, on desktop, tablet and mobile widths:
    - home page renders with the expected copy and images;
    - navigation to every route (services, community, FAQ, our approach,
      policies, terms, privacy, 404) works, including a hard refresh on a
      deep route (`.htaccess` SPA fallback still present);
    - booking links point at the bookings portal and open it;
    - the holiday notice card / open-days strip show live data if
      `VITE_SUPABASE_*` were set. Missing configuration hides holiday notices
      and uses fallback data for other features; this is not sufficient
      production acceptance for the existing live-data behaviour.
    - `llms.txt`, `favicon`, `manifest.json` and one hashed asset return 200.
12. Record the date, the checked URLs and the outcome on #784. Do not read
    or submit customer data; do not make a live booking.

## Rollback

- Set `WEBSITE_PUBLISHER_ENABLED` to `false` (or delete it) to prevent future
  jobs from starting. This does not stop an already-running FTPS job. Cancel
  and wait for every queued/running destination deploy to stop, inspect any
  partial upload, and verify no destination writer remains before restoring.
- Restore the retained rollback artefact from step 4 through the verified
  FTP target. Only re-run the original deployment if its exact known-good
  SHA and matching build artefact remain available; do not rebuild latest
  `main` and call it rollback. Inspect sync state and stale hashed assets
  against the retained manifest rather than running a blanket delete.
- Re-enable the original publisher only if the new repository is being
  abandoned as the source; otherwise fix forward in a reviewed pull request
  with the variable still `false`.
- Revert repository/configuration changes through reviewed commits. Do not
  rewrite `main`.

## After acceptance

- Update [the plan](../../plans/completed/2026-09-05-website-consolidation.md)
  with the run URL, SHA and smoke-test record, then move it to
  `docs/plans/completed/`.
- Update `website/MAINTENANCE.md` with the cutover date.
- **AUTHORISE (optional) — archive** `leamonline/smarter-dog-website`. Not
  required for technical completion. Done by the owner on 9 September 2026.

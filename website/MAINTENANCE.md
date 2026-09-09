# Maintenance Guide

This document outlines the maintenance procedures for the Smarter Dog Grooming website.

## Monthly Maintenance Checklist

### Dependencies (Automated via Dependabot)

The website deliberately overrides the repository root's
`legacy-peer-deps=true` setting in [`website/.npmrc`](.npmrc). Keep that
override: the website has peer-dependent test tooling, and Dependabot must
include those peers when it regenerates `website/package-lock.json`.

- [ ] Review and merge Dependabot PRs
- [ ] Run `npm audit` to check for vulnerabilities
- [ ] Run full test suite after updates: `npm run test:all`

### Content Review

- [ ] Check all pages for outdated information
- [ ] Verify opening hours are current
- [ ] Review pricing on services page
- [ ] Check external links still work (Houndsly, social media)

### Performance Check

- [ ] Run Lighthouse audit on production
- [ ] Target scores: Performance >90, Accessibility >95, SEO >95
- [ ] Check Core Web Vitals in Google Search Console

### Analytics Review

- [ ] Check GA4 for tracking issues
- [ ] Review key conversions (booking form submissions)
- [ ] Verify page view tracking is working

---

## Backup Procedures

### Code Backups

- **Primary**: Git repository (GitHub/GitLab)
- **Hosting backup**: Retain a known-good Bluehost website artefact and its source SHA.

### How to backup manually

```bash
# Archive tracked website source only; exclude local credentials and dependencies
git archive --format=zip --output=../website-source-backup.zip HEAD:website
```

### Recovery

```bash
# Clone from Git
git clone https://github.com/leamonline/Smarter-dog-bookings
cd Smarter-dog-bookings/website
npm ci
npm run dev
```

---

## Environment Variables

The production workflow supplies `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY` as public browser configuration. Their values
are embedded in the built assets. The source also supports
`VITE_GA_MEASUREMENT_ID`; the tracked template lists `VITE_EMAILJS_*` names,
but the current production workflow does not supply analytics or EmailJS
configuration. Do not describe these as mandatory booking-form settings.

Never commit local environment files or put privileged credentials in `VITE_`
variables. Destination build configuration is verified at the authorised cutover.

---

## Holiday Notices

The production build gets `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`
from GitHub Actions secrets of the same names in the original publisher
(configured there on 6 September 2026). Destination provisioning remains a
cutover step. If either is missing, the site still builds without a Supabase
client: holiday notices are hidden, while salon facts and open days use their
fallbacks. A successful unconfigured build does not verify live holiday data.

Holidays are **not** edited on the website. Staff schedule them in the booking
app (Settings → Holidays), which closes the diary dates and publishes the
notice together. The homepage hero reads `get_public_holiday_notices` from
Supabase (anon read, dates only) and shows:

- before the closure: "Upcoming holiday" with the first closed date and reopening date;
- during the closure: "We're taking a little break" with the reopening date;
- from the reopening date: nothing.

The card refreshes on tab focus and once a minute. If the read fails or the
diary no longer matches the holiday, the card is hidden rather than showing a
stale reopening date. There is no fallback copy for holidays in this repo, on
purpose. Source: `src/hooks/useHolidayNotices.js`, `src/utils/holidayNotice.js`,
`src/components/HolidayNoticeCard.jsx`.

## Deployment Checklist

Before deploying:

- [ ] Run lint: `npm run lint`
- [ ] Run tests: `npm run test:run`
- [ ] Run E2E tests: `npm run test:e2e`
- [ ] Build succeeds: `npm run build`
- [ ] Check bundle size: `npm run build:analyze`

### Publisher cutover — attempted 8 September 2026, publish not yet achieved

The cutover was attempted on 8 September 2026 following the
[cutover runbook](../docs/superpowers/runbooks/2026-09-07-website-publisher-cutover.md).
The trigger merge (PR #810, `main@25817ef`) ran the root
[`website.yml`](../.github/workflows/website.yml) workflow
([run 34232296635](https://github.com/leamonline/Smarter-dog-bookings/actions/runs/34232296635), two attempts): `website-test`, `website-build`
and `website-e2e` passed, but the `deploy` job was **skipped** on both
attempts because its gate (`vars.WEBSITE_PUBLISHER_ENABLED == 'true'`)
evaluated false. **Nothing has been published from this repository yet.**

Checked on 9 September 2026: smarterdog.co.uk still serves the original
repository's build of `c55617b` (`index-fMY7wPkx.js`, `index-DviFLipG.css`,
its run 177 of 6 September); the build this run produced was
`index-DqSb2wRt.js`. An earlier version of this note, written before the run,
said the publisher had moved — it had not. If the original repository's
workflow has been disabled as the runbook's step 6 requires, the site
currently has **no active publisher**, so website changes merged to `main`
here do not reach Bluehost until the repository variable is set to exactly
`true` and a website-touching push to `main` publishes successfully. Live
status and the remaining owner steps are on
[#784](https://github.com/leamonline/Smarter-dog-bookings/issues/784).

### Where this site lives now (7 September 2026)

This site is the `website/` directory of the
[Smarter-dog-bookings](https://github.com/leamonline/Smarter-dog-bookings)
repository, imported with full history from `smarter-dog-website`
([ADR 009](../docs/architecture/decisions/009-independent-applications-in-one-repository.md)).
Run every command in this guide from `website/`, or from the repository root
with the `website:*` scripts (`npm run website:test`, `npm run website:build`, …).
Use `npm ci`, not `npm install`, unless you mean to change dependencies.

### Bluehost FTP Deployment (CI)

The `deploy` job in the **root** workflow
[`.github/workflows/website.yml`](../.github/workflows/website.yml) syncs
`website/dist/` to Bluehost via FTPS using `SamKirkland/FTP-Deploy-Action`.
It runs only on a push to `main` that touches `website/**` or the workflow file **and** only while
the repository variable `WEBSITE_PUBLISHER_ENABLED` is `true`. Until the
[cutover runbook](../docs/superpowers/runbooks/2026-09-07-website-publisher-cutover.md)
has been executed, that variable must remain absent or false, the job cannot
publish, and the
original `smarter-dog-website` repository remains the single publisher.

**FTP account scope matters.** The original account was documented as scoped to `/home1/<cpanel-user>/public_html`. Reverify that scope at cutover. When the FTP root is `public_html/`, use `server-dir: ./`.

Do **not** use `/public_html/` (absolute) or `public_html/` (relative) with this account — both resolve to `public_html/public_html/` and the deploy will fail when it tries to step into `public_html/assets/`.

**If the FTP account is ever recreated or rotated:**

- Sub-account scoped to `public_html/` → keep `server-dir: ./`
- Main cPanel user (lands in `/home1/<cpanel-user>/`, above the website folder) → change `server-dir` to `public_html/` (no leading slash)
- Sub-account scoped to a subfolder of `public_html/` (e.g. `public_html/leam`) → won't work; recreate it scoped to `public_html` itself

The action stores its incremental-sync state in `.ftp-deploy-sync-state.json` at the FTP root. A repository or account change does not necessarily remove that remote file. Preserve and inspect its state and the proposed changes before cutover. Disabling the publisher variable prevents future jobs; cancel and wait for active deployments before rollback.

---

## Quick Commands Reference

| Task | Command |
|------|---------|
| Start dev server | `npm run dev` |
| Run all tests | `npm run test:all` |
| Run unit tests | `npm run test:run` |
| Run e2e tests | `npm run test:e2e` |
| Build for production | `npm run build` |
| Analyze bundle | `npm run build:analyze` |
| Check for vulnerabilities | `npm audit` |
| Update dependencies | `npm update` |

---

## Contact

For technical issues with the website:

- Check the [README.md](./README.md) for setup instructions
- Review [TESTING.md](./TESTING.md) for test procedures
- Check [CHANGELOG.md](./CHANGELOG.md) for recent changes

---

*Last updated: 7 September 2026 (repository consolidation)*

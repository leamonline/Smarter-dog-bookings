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
- **Hosting backup**: every production deployment stays in Vercel; roll back there.

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

The live site is built by the repository's root Vercel deployment
(`scripts/build-combined.mjs`), which passes the Vercel project's environment
variables through to this build. `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY` are set there (the same ones the booking app
uses) as public browser configuration, embedded in the built assets. The
source also supports `VITE_GA_MEASUREMENT_ID`; the tracked template lists
`VITE_EMAILJS_*` names, but production does not set analytics or EmailJS
configuration. Do not describe these as mandatory booking-form settings.

Never commit local environment files or put privileged credentials in `VITE_`
variables.

---

## Holiday Notices

The production build gets `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`
from the Vercel project's environment variables (see above). If either is missing, the site still builds without a Supabase
client: holiday notices are hidden, while salon facts and open days use their
fallbacks. A successful unconfigured build does not verify live holiday data.

Holidays are **not** edited on the website. Staff schedule them in the booking
app (Settings → Holidays), which closes the diary dates and publishes the
notice together. The homepage hero reads `get_public_holiday_notices` from
Supabase (anon read, dates only) and shows:

- before the closure: "Upcoming holiday" with the first closed date and reopening date;
- during the closure: "We're taking a little break" with the reopening date;
- from the reopening date: nothing.

While a holiday card is visible, it replaces the desktop hero booking button
and its “Easy peasy” and “quick and easy” stickers. The usual booking group
returns automatically when no verified notice is shown.

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

### How the site is published

Since the 11 September 2026 domain cutover, smarterdog.co.uk is served by the
repository's **root** Vercel deployment: a `website/**` change goes live when it
merges to `main`. The FTP publisher that ran from 9 September and was then kept
warm as a rollback target was retired on 20 October 2026
([#999](https://github.com/leamonline/Smarter-dog-bookings/issues/999)). The
history is in the
[completion record](../docs/plans/completed/2026-09-05-website-consolidation.md#cutover-completion-record-9-september-2026).

### Where this site lives now (7 September 2026)

This site is the `website/` directory of the
[Smarter-dog-bookings](https://github.com/leamonline/Smarter-dog-bookings)
repository, imported with full history from `smarter-dog-website`
([ADR 009](../docs/architecture/decisions/009-independent-applications-in-one-repository.md)).
Run every command in this guide from `website/`, or from the repository root
with the `website:*` scripts (`npm run website:test`, `npm run website:build`, …).
Use `npm ci`, not `npm install`, unless you mean to change dependencies.

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

# Maintenance Guide

This document outlines the maintenance procedures for the Smarter Dog Grooming website.

## Monthly Maintenance Checklist

### Dependencies (Automated via Dependabot)

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
- **Recommended**: Enable automatic backups on hosting provider (Vercel/Netlify)

### How to backup manually

```bash
# Create a dated zip of the project
zip -r "smarterdog-backup-$(date +%Y%m%d).zip" . -x "node_modules/*" -x ".git/*"
```

### Recovery

```bash
# Clone from Git
git clone <repository-url>
cd bestwebsitesofar-1
npm install
npm run dev
```

---

## Environment Variables

Required environment variables for production:

```bash
# EmailJS Configuration (for booking form)
VITE_EMAILJS_SERVICE_ID=your_service_id
VITE_EMAILJS_TEMPLATE_ID=your_template_id
VITE_EMAILJS_PUBLIC_KEY=your_public_key

# Google Analytics
VITE_GA_MEASUREMENT_ID=G-XXXXXXXXXX
```

**Security**: Never commit `.env` files to Git. Use hosting provider's environment variable settings.

---

## Holiday Notices

The production build gets `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`
from GitHub Actions secrets of the same names (set 6 September 2026). If either is
missing the site still builds, but with no Supabase client: the holiday card,
live salon facts and open-days strip all silently fall back to static copy.

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

- [ ] ### Bluehost FTP Deployment (CI)

The `deploy` job in `.github/workflows/ci.yml` syncs `dist/` to Bluehost via FTPS using `SamKirkland/FTP-Deploy-Action`.

**FTP account scope matters.** The account behind the `BLUEHOST_FTP_USER` secret is a sub-FTP account scoped to `/home1/<cpanel-user>/public_html`. Because that account's FTP root *is* `public_html/`, the workflow uses `server-dir: ./`.

Do **not** use `/public_html/` (absolute) or `public_html/` (relative) with this account — both resolve to `public_html/public_html/` and the deploy will fail when it tries to step into `public_html/assets/`.

**If the FTP account is ever recreated or rotated:**

- Sub-account scoped to `public_html/` → keep `server-dir: ./`
- Main cPanel user (lands in `/home1/<cpanel-user>/`, above the website folder) → change `server-dir` to `public_html/` (no leading slash)
- Sub-account scoped to a subfolder of `public_html/` (e.g. `public_html/leam`) → won't work; recreate it scoped to `public_html` itself

The action stores its incremental-sync state in `.ftp-deploy-sync-state.json` at the FTP root. If you switch FTP accounts, the first deploy under the new account will look like a "first publish" (uploads everything) until that file exists; subsequent deploys are diffs.

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

*Last updated: April 2026*

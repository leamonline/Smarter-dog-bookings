# Audit 07 — Marketing website, documentation vs reality, operations & release

Repository: `/home/user/Smarter-dog-bookings` at `main` (read-only audit, 12 October 2026).
Scope: A. `website/` · B. documentation load and accuracy · C. release, rollback, monitoring, data protection, bus factor.
Each finding is labelled **CONFIRMED** (read in code/config/docs) or **HYPOTHESIS** (inferred; needs a live check I could not make read-only).

Numbers used throughout (all CONFIRMED by counting):

| Measure | Value |
|---|---|
| Markdown files repo-wide (excl. node_modules) | 267 files, ~604k words |
| `docs/` | 207 files, ~562k words — of which `docs/archive/` is ~335k words (60%) |
| Live (non-archive) `docs/` | ~226k words: plans/research/ADR/spec/governance ≈ 141k (62%), UX reviews ≈ 46k (20%), domain references (`docs/*.md`) ≈ 35k (15%) |
| Root `*.md` | ~25.7k words (CLAUDE.md 3.4k, CHANGELOG 7.5k, TECHNICAL-DEBT-REGISTER 5.8k) |
| Non-test source (`src/`) | ~98k lines; 341 `.js/.jsx` + 226 `.ts/.tsx` files |
| `check:docs` governed files | 140 (passes) |
| Edge Functions | 28 · Migrations: 239 · `docs/plans/active/`: **9** plans (not 3) |

---

## Part A — The marketing website (`website/`)

### A1. Prices and service names on the website do not match the booking app
**What I found.** The site and the app describe the same four services with different names and different prices, and neither reads the other.
**Evidence.**
- `website/src/constants/servicesData.js:8-30` and `website/public/llms.txt`: Full Groom "From £42", **Maintenance Groom** "From £32", **De-shedding Groom** "From £35", **Puppy Intro** "£35"; walk-ins (nail clip, ear clean, anal glands) "£10" each, "Mon, Tue, Wed before 1pm".
- `src/constants/salon.ts:28-33,66-71`: services are **Bath & Brush** (3800/4200/5500p), **Bath & De-shed** (3800/4200/5500p), **Puppy Groom** (3800p), Full Groom (4200/4600/6000p). No walk-in prices anywhere in the app; `ADDON_PRICES` has only Flea Bath £10.
- `website/index.html:31` og:description and `website/README.md:14` call the mid service "**bath & tidy**" — a third name.
- `website/src/components/pages/FAQPage.jsx:40`: "A full groom for a medium-sized dog typically starts around £35–45" vs app medium Full Groom £46.
- `supabase/migrations/20260803120000_get_public_salon_facts_rpc.sql:47`: the public RPC the site already consumes explicitly says "no services/pricing summary included".
**Why it matters.** A customer reads "£32" on the site, logs into `/book`, and is quoted £38 (or whatever `salon_config.pricing` holds — `PRICING` in `salon.ts` is only the fallback). The service names also differ, so the thing they picked on the site is not a thing they can pick in the wizard. This is the first impression of the product.
**What currently happens.** Two hand-maintained price lists drift independently; MAINTENANCE.md's monthly "review pricing" checklist is the only control.
**Recommendation.** (1) Immediately: pick one name per service (I would adopt the app's, since customers see them when paying) and reconcile the four website copies (servicesData.js, llms.txt, FAQ, index.html og text). (2) Structurally: extend `get_public_salon_facts` (or add `get_public_price_list`) to return service names + "from" prices from `salon_config.pricing`, and have the site render those with the current values as fallback — the pattern already exists for hours.
**Expected benefit.** Zero price/name drift; one edit in Settings updates the website. **Difficulty** Medium · **Risk** Low · **Priority** High · **CONFIRMED** (the mismatch; which figure is *right* is HYPOTHESIS — the owner must say).

### A2. The website's machine-readable contact details are wrong (and advertised to AI crawlers)
**What I found.** `website/public/llms.txt` (served live and pointed to by `robots.txt`) and `website/BUSINESS_LISTINGS_SHEET.txt` give **phone 07507 731487** and **email leam@smarterdog.co.uk**; the app and the site's own fallback give **07873 329440 / bookings@smarterdog.co.uk** (`src/constants/salonContact.ts:7-12`, `website/src/constants/salonFacts.js:5-7`). `llms.txt` also says "Phone: AI receptionist available to take calls" — `salonContact.ts:4-6` says there is *no* phone line and tel: links must never be rendered — and "Online: Booking request form" (the pre-portal flow).
**Why it matters.** `robots.txt` explicitly invites GPTBot, Claude-Web, PerplexityBot and points them at `llms.txt`. AI assistants answering "what's Smarter Dog's number?" will quote the wrong one and tell people to ring.
**Recommendation.** Rewrite `llms.txt` from `salonFacts.js` + `servicesData.js` at build time (a 20-line Vite plugin) so it cannot drift; delete `BUSINESS_LISTINGS_SHEET.txt` from the repo (it is an owner's copy-paste sheet, not source).
**Benefit** Correct public facts. **Difficulty** Small · **Risk** Low · **Priority** High · **CONFIRMED**.

### A3. Opening hours exist in three forms, and the structured data depends on which one the owner saved
**What I found.** Website fallback: Mon–Wed **08:30–15:00** (`salonFacts.js:9-11`, Footer comment line 47, BUSINESS_LISTINGS). Booking app / CLAUDE.md / `docs/first-real-booking-checklist.md:3`: "Salon runs Mon–Wed, **08:30–13:00**" (the slot grid). Staff Settings template `DEFAULT_BUSINESS_HOURS`: **Mon–Sat 08:00–17:00** (`src/constants/salonSettings.ts:15-23`, flagged in CLAUDE.md as "not the hours"). The LocalBusiness JSON-LD `openingHoursSpecification` (`useRouteSeo.js:74-90`) and the FAQ-schema hours sentence are built from `get_public_salon_facts()` → `salon_config.settings.businessHours`, falling back to the 15:00 set only when that JSON is `{}` (`useSalonFacts.js:17-19`).
**Why it matters.** Google Business / rich results show whatever JSON-LD says. If the owner once saved Settings with the Mon–Sat template untouched, the website is telling Google the salon is open Saturdays. I cannot read prod to check.
**Recommendation.** Decide the canonical public meaning (drop-off window vs premises hours) and record it in one place; add a website unit test asserting the fallback's open days equal the app's `ALL_DAYS` defaults; add a staff-side warning when `businessHours` still equals the template.
**Difficulty** Small · **Risk** Low · **Priority** Medium · **CONFIRMED** (three sources) / **HYPOTHESIS** (which one is live).

### A4. The booking call-to-action is prominent and consistent — but drops all context, and the "AI Concierge" hand-off is a dead end
**What I found.** Every CTA (hero, nav, CTA section, sticky mobile bar, landing popup, aftercare) calls `goToBooking(source)` → `window.location.assign('https://smarterdog.co.uk/book/login')` (`website/src/utils/booking.js:11-14`, `links.js:16`). `goToBooking` takes one argument. `AIConciergeSection.jsx:133-150` builds a `bookingPrefill` (service, dog name, breed, visit plan, notes) and passes it as a second argument — it is silently discarded. The portal does have `/book/new` (`CustomerApp.jsx:223`) but no `returnTo`/`?service=` handling (`grep` for `returnTo|searchParams` in CustomerApp: none).
**Why it matters.** The site asks a visitor to fill in a concierge form, then throws the answers away and lands them on a login screen. On the live origin the link is same-origin and the Bluehost redirect-loop guard in `links.js` is well reasoned — the *path* is fine; the *hand-off* is not. GA funnel events (`trackEvent`) only fire if `VITE_GA_MEASUREMENT_ID` is set, which `MAINTENANCE.md:69-74` says the production workflow does not supply — so CTA conversion is probably unmeasured (HYPOTHESIS: Vercel env not checked).
**Recommendation.** Either remove the AI Concierge section, or carry `?service=<id>&source=<cta>` into `/book/login`, preserve it through login (sessionStorage), and preselect in the wizard; log the arrival as a funnel event (`booking_funnel_events` already exists). Confirm whether GA is configured; if not, delete `react-ga4` and the cookie banner.
**Difficulty** Medium · **Risk** Low · **Priority** Medium · **CONFIRMED** (prefill dropped) / **HYPOTHESIS** (GA dark).

### A5. SEO plumbing is client-side only and the sitemap is stale
**What I found.**
- `website/public/sitemap.xml`: every `lastmod` is `2025-12-11`; `/community` (a live, indexable route in `App.jsx:57` and `ROUTE_SEO`) is absent; `/houndsly` (an `ExternalRedirect`) is listed.
- All per-route `<title>`, description, canonical, og:* and JSON-LD are injected by `useRouteSeo` **at runtime**; `index.html` carries only homepage tags. There is no prerender step. Facebook/WhatsApp link previews do not execute JS, so sharing `/services` or `/faq` previews as the homepage. Google renders JS, so indexing itself is probably fine.
- `index.html:26` title is 73 characters; og:title says "**Premium** Dog Grooming" while the title and brand voice say "**Calm** … no fuss"; `<meta name="keywords">` is obsolete; `public/og-booking-2026.png` is unreferenced.
- LocalBusiness schema lacks `sameAs` (the footer already has Facebook/Instagram/TikTok URLs), `geo`, and uses `priceRange: "££"`.
**Recommendation.** Generate `sitemap.xml` from `ROUTE_SEO` at build; add a prerender pass (e.g. `vite-plugin-prerender`/`vite-ssg`) or at minimum per-route static HTML in `build-combined.mjs` so previews and non-JS crawlers see the right tags; add `sameAs`/`geo`; align og:title with the brand voice.
**Difficulty** Medium · **Risk** Low · **Priority** Medium · **CONFIRMED**.

### A6. Performance and accessibility are mostly good; residual gaps are small
**Done well (CONFIRMED).** AVIF/WebP `srcset` with LCP preload (`index.html:22-25`), lazy-loaded routes, `cyanText` contrast fix with documented ratios (`colors.js:15-16`), skip link, exactly one `<h1>` per page, `aria-expanded` on the menu, `usePrefersReducedMotion`, `useFocusTrap`, axe tests in unit and e2e.
**Gaps.** (1) Fonts: the site loads Poppins + Montserrat + Caveat (10 weights) from `fonts.googleapis.com` (`index.html:10-17`) while the booking app self-hosts woff2 (`/index.html:18-19`) — two font pipelines for one brand, and a render-blocking third-party stylesheet on the marketing LCP path. (2) `viteCompression` writes `.gz` and `.br` siblings into `website/dist` (`website/vite.config.js:31-40`); Vercel compresses itself and never serves them, so they only inflate `dist-combined` and the collision scan. (3) Nine `<img>` without an `alt=` attribute on the same line (LandingPopup ×2, Navigation logo, HoundslySection, BackgroundSticker, ResponsiveImage ×2, PolaroidImage ×2) — likely decorative/propagated, but worth an explicit `alt=""` (HYPOTHESIS). (4) Scaffold leftovers `public/vite.svg`, `src/assets/react.svg`; dark `theme-color #000000`.
**Recommendation.** Self-host the three fonts (copy the app's approach), drop `vite-plugin-compression`, delete the scaffold files, add explicit `alt`.
**Difficulty** Small · **Risk** Low · **Priority** Low · **CONFIRMED** unless marked.

### A7. The Bluehost "warm rollback" is past its own expiry and should be deleted
**What I found.** The cutover runbook (`docs/superpowers/runbooks/2026-09-11-smarterdog-domain-cutover.md:88-108`) kept `WEBSITE_PUBLISHER_ENABLED=true` as a rollback target and said "turn it off once a rollback is no longer plausible — a few weeks is sensible". It is now 4½ weeks later. Still present: the `deploy` job and FTPS action in `.github/workflows/website.yml:143-180`, the three `BLUEHOST_FTP_*` secrets, `website/htaccess_upload.txt`, the Bluehost FTP section of `website/MAINTENANCE.md:140-175`, and three documents that still call Bluehost the **live** publisher (`README.md` "Marketing website" section, `docs/README.md` "Where is the marketing website" row, `website/MAINTENANCE.md` "Publisher cutover").
**Why it matters.** (1) Every `website/**` merge still FTPs a build to a host no visitor reaches. (2) The rollback it protects is **not a working rollback**: the Bluehost copy is marketing-only, so after a DNS revert `/book` would hit the site's own `/book` route → `/book/login` → the SPA 404 page. Customers could not book; staff could not log in. The runbook calls this "degraded"; in practice it is "booking down". (3) Three docs give a new reader the wrong deployment model.
**Recommendation.** Delete the deploy job, the FTP secrets, the repository variable, `htaccess_upload.txt`, and the Bluehost sections of MAINTENANCE.md; append a dated "retired" note to the cutover runbook and routing plan (its step 5); correct the three docs. Rollback for the website then becomes the same as for the app: Vercel instant rollback (see C2).
**Difficulty** Small · **Risk** Low · **Priority** High · **CONFIRMED**.

### A8. The website's own documentation is stale and partly duplicated
**What I found.** `website/README.md` says Node 18/20, Vite 7.2.4, Vitest 4.0.14, Playwright 1.57, "npm install", "Booking modal with EmailJS integration", "403+ tests", "98.6% passing (353/358)". `website/package.json` has `vite ^8.3.1`, `vitest ^5.0.0`, `@playwright/test ^1.63.0`; the repo mandates Node 24 and `npm ci`. `@emailjs/browser` is still a dependency with **zero** imports (`grep -rn emailjs website/src` → none) and `.env.example` still documents `VITE_EMAILJS_*`. `TESTING.md` and `TESTING_COMPLETE.md` (13 KB) describe the same stack with different version numbers. `website/CHANGELOG.md` has sat in `[Unreleased]` since 1.0.0 (2025-12-01). `check:docs` excludes `website/` entirely (`scripts/check-doc-links.mjs:18`), so none of its links are validated.
**Recommendation.** Delete `TESTING_COMPLETE.md`, `BUSINESS_LISTINGS_SHEET.txt`, `htaccess_upload.txt`; collapse README to the truth (or point at the root README's website section); remove `@emailjs/browser` and the EmailJS env lines; include `website/*.md` in `check:docs`.
**Difficulty** Small · **Risk** Low · **Priority** Medium · **CONFIRMED**.

### A9. ADR 009's "independent applications" boundary has already collapsed at the publishing layer; the duplicated toolchain now costs more than it protects
**What I found.** ADR 009 (5 Sept) justified two toolchains by "preserve existing runtime and release boundaries" and "website CI publishes to Bluehost". Six days later the cutover made **one Vercel deployment, one build command** (`vercel.json` → `scripts/build-combined.mjs`), one `robots.txt`, one origin, shared Supabase RPCs (`get_public_salon_facts`, `get_public_open_days`, `get_public_holiday_notices`) and a second `@supabase/supabase-js` client (`website/src/lib/supabaseClient.js`). What remains independent is tooling: two React/Vite/Tailwind/Vitest/Playwright stacks, two lockfiles (website's is 211 KB), two ESLint configs, and `website.yml` running **5 browser projects × 6 specs with `playwright install --with-deps`** on every website PR — while the app's PR gate was deliberately trimmed to Chromium + WebKit to save minutes (`ci.yml:146-160`). Every production deploy also runs `npm ci --prefix website` inside the Vercel build (`build-combined.mjs:60-66`). `.github/dependabot.yml` lists only `directory: "/"` in what I read; MAINTENANCE.md claims website deps are "automated via Dependabot" (HYPOTHESIS: verify a second block exists).
**Why it matters.** The one thing ADR 009 said not to do — couple routing/CSS/auth — is still correctly not done. But "no npm workspaces, no shared packages" was justified by a Bluehost boundary that no longer exists, and the price is paid on every deploy and every dependency bump (CLAUDE.md already documents `deno.lock` drift from Dependabot — a second lockfile multiplies that class of chore).
**Recommendation.** Keep the ADR's product boundary (separate apps, separate routers, separate CSS). Supersede its *tooling* clause: npm workspaces with one lockfile and one Dependabot config; one Playwright version; a tiny shared `salon-facts` package (contact, services, open days) consumed by both apps — which also fixes A1–A3 structurally; Chromium-only e2e on website PRs. Record as ADR 014.
**Difficulty** Large · **Risk** Medium · **Priority** Medium · **CONFIRMED** (facts) / judgement on the recommendation.

### A10. `stafflogin` entrance — done well, one note
`/stafflogin` → 307 → `/staff` (`vercel.json`), footer dog-silhouette link (`FooterSection.jsx:115`), staff manifest scoped to `/staff/`, legacy paths redirected at the edge (the #826 lesson). Note only: the redirect is correctly *non-permanent*, and the e2e stub comment at `website/e2e/homepage.spec.js:40` still refers to `smarterdog.vercel.app` (comment only). **Low · CONFIRMED.**

---

## Part B — Documentation vs reality

### B1. The documentation load is disproportionate to a one-salon product, and most of it is governance rather than product knowledge
**What I found.** ~604k words of Markdown against ~98k lines of source. Of the ~226k live (non-archive) `docs/` words, **62% are plans, research, specs, ADRs and programme governance**, 20% are UX reviews of UIs that have since been redesigned (the June review targets `smarterdog.vercel.app` and the four-zone board; the `/today` stack replaced that in September), and only **15% (~35k words) is domain reference** — the part an engineer actually needs. `docs/ux-review-assets/_code-findings-digest.md` alone is 207 KB.
**Why it matters.** `AGENTS.md` tells every agent to read PROJECT.md, ROADMAP.md, docs/README.md and "the relevant route" before work. An agent that obeys spends its context on a programme (#603) that has been at **STOP since 15 August 2026** (`ROADMAP.md` "At a glance"). The signal-to-noise ratio is what produces the stale claims in B2: nobody can keep 226k words true.
**Recommendation.** Set a budget: live docs ≤ ~60k words. Move to `docs/archive/`: the #603 corpus (PROJECT.md programme sections, ROADMAP.md, `docs/traceability.md`, `docs/plans/active/2026-08-09-issue-603…`, `docs/research/2026-08-*` ×8, `docs/interface-capability-truth.md`), all UX reviews (`docs/ux/`, `docs/ux-review-assets/`, `docs/ux-review-2026-06.md`), `docs/superpowers/plans` and `docs/superpowers/specs` (every file is either implemented or deferred — see B2 #15), and `prompts/archive`. Replace PROJECT.md's programme content with a one-page "what this product is" plus a pointer.
**Difficulty** Medium (mostly `git mv` + link fixes, which `check:docs` will catch) · **Risk** Low · **Priority** High · **CONFIRMED**.

### B2. Sampled claims: roughly half of the narrative/status claims are wrong or stale; the domain rules are accurate
I checked 20 concrete claims against code/config.

| # | Claim | Source | Verdict |
|---|---|---|---|
| 1 | `src/index.jsx` routes `/customer/*` to the portal "and everything else to the staff dashboard" | `README.md:88-90` | **FALSE** — `src/routing/entrypoints.ts`: `/book/*` and `/staff/*`; everything else redirects |
| 2 | Booking workflow "Not Arrived → Checked In → In Bath → Ready for Pick-up → Completed" | `README.md:53` | **FALSE** — `salon.ts` `BOOKING_STATUS`: Booked → Reconfirmed → Arrived → Ready for collection → Completed, + No-show |
| 3 | `website.yml` deploy "has been the live Bluehost publisher since 9 September" | `README.md` Marketing section; `docs/README.md` start-here row; `website/MAINTENANCE.md` | **STALE** — Vercel serves the domain since 11 Sept (CLAUDE.md, cutover runbook) |
| 4 | Edge Functions list | `README.md` "Edge Functions" | **INCOMPLETE** — 5 of 28 missing: `broadcast-message`, `notify-staff`, `slack-alerts`, `whatsapp-media`, `whatsapp-update-notes` |
| 5 | "Critical PR browser gate with WebKit — Gap — PR job currently skips Playwright" | `README.md` capability table (pinned 9 Aug) | **FALSE now** — `ci.yml` `pr-production-smoke` runs desktop Chromium + mobile WebKit on every PR |
| 6 | "~357 `.js/.jsx` vs ~114 `.ts/.tsx`" | `CLAUDE.md:216` | **STALE** — 341 vs 226 today; debt register says 318 vs 181 (2 Sept). Three numbers, none current |
| 7 | "on GitHub Free there's no branch protection to make it required" | `check-migrations-drift.yml:19` | **FALSE** — repo is **public** and ruleset `Protect main` is `active` (`gh api …/rulesets`), as CLAUDE.md:245 says |
| 8 | "pg_cron and pg_net are available on paid Supabase plans (Pro+)" | `migrations/20260412122503…:18` | **CONTRADICTS** README/`docs/supabase-advisors.md` ("stays on Free") while 15+ cron jobs run — the comment is outdated |
| 9 | "Customer can reach `/customer`" | `docs/first-real-booking-checklist.md:16` | **STALE** path (works only via redirect) |
| 10 | Routing plan `Status: Draft`, verified 2026-09-10 | `docs/plans/active/2026-09-10-smarterdog-domain-routing.md:3` | **STALE** — the cutover runbook marks it Complete; only step 5 (Bluehost retirement) open |
| 11 | Daily-brief stack plan `Status: Active` | `docs/plans/active/2026-09-20-daily-brief-stack.md` | **STALE** — CLAUDE.md: the stack shipped in September and is the default landing |
| 12 | Brand reskin `Status: Draft` | `docs/plans/active/2026-09-20-brand-reskin.md` | **STALE** — website CHANGELOG records step 9 (#896) shipped |
| 13 | "approved, not yet implemented" | `docs/superpowers/specs/2026-09-16-partial-day-closures-design.md:4`, `…2026-09-11-turnstile-verification-design.md:4` | **FALSE** — both implemented (migration 20260919140000; captcha ENFORCED 14 Sept; completed plan exists) |
| 14 | "Last verified: 9 August 2026" | PROJECT.md, ROADMAP.md, traceability.md, interface-capability-truth.md + 6 more (10 docs) | **STALE by their own admission** — each carries a 2 Sept note saying line-level claims were not re-verified |
| 15 | "`docs/private/` may contain sensitive material" | `docs/README.md:134`, `check-doc-links.mjs:16` (+2) | Directory **does not exist** |
| 16 | Phone-OTP + password login; 5-step wizard; 7/30/90-day reports; 4 bookable services; add-ons; slot grid 08:30–13:00 | README / CLAUDE.md | **TRUE** (`useCustomerAuth.ts`, `BookingWizard.tsx:1116-1180`, `ReportWidgets.jsx:143`, `salon.ts`) |
| 17 | Env var names | `CLAUDE.md` Environment vs `.env.example` | **TRUE** |
| 18 | `legacy_salon_board_enabled` off by default; `SLACK_ALERTS_ENABLED`, `STAFF_PUSH_ENABLED` default off | CLAUDE.md | **TRUE** (`features.ts:33`, `slack-alerts/index.ts:67-70`, `.env.example`) |
| 19 | `npm run lint` = eslint + 4 scripts | `CLAUDE.md:36-37` | Minor — also runs `check-icons` |
| 20 | Capacity, daily cap, pregnancy gate, reason codes, migrations-by-hand | CLAUDE.md Domain rules / Gotchas | **TRUE** (spot-checked against `salon.ts`, workflows) |

**Pattern.** CLAUDE.md's *rules* are reliable; README.md, docs/README.md and every "Status/Last verified" header are not. README.md is the file GitHub shows first and it is wrong about the architecture (#1), the lifecycle (#2), the deployment model (#3) and the function inventory (#4).
**Recommendation.** Rewrite README.md's Architecture/Features/Marketing-website/Edge-Functions sections from code (30 minutes); drop the 9-August capability table or regenerate it; fix the two workflow/migration comments (#7, #8); move #10–#13 to `completed/`/archive with their real status.
**Difficulty** Small · **Risk** Low · **Priority** High · **CONFIRMED**.

### B3. `check:docs` guarantees links, not truth or freshness
**What I found.** `scripts/check-doc-links.mjs` discovers Markdown via `git ls-files`, excludes `docs/archive/`, `docs/private/`, `.design-sync/docs-stubs/`, `website/`, and validates relative targets, heading anchors and reference definitions. It does not read `Status:`/`Last verified:` headers, does not know the status vocabulary docs/README.md defines, and cannot notice that an `active/` plan is finished. Result: 140 files pass while B2 #10–#14 are wrong.
**Recommendation.** Add ~40 lines: (a) every file under `docs/plans/active/` must carry `Last verified` ≤ 60 days old or fail; (b) `Status: Draft` older than 30 days fails; (c) warn on any live doc that mentions `smarterdog.vercel.app` as a destination (7 non-archive docs still do). Keep it cheap; it runs in the `build` job already.
**Difficulty** Small · **Risk** Low · **Priority** Medium · **CONFIRMED**.

### B4. Parallel and duplicated structures
**What I found (CONFIRMED).** Four plan/spec homes: `docs/plans/{active,completed}`, `docs/superpowers/{plans,specs}` ("legacy active-path plans … awaiting classification" per `docs/plans/README.md`), `docs/archive/superpowers/{plans,specs}` (84 files, 281k words), plus `.agent/PLANS.md` as the standard. Two runbook dirs (`docs/runbooks/` with 1 file, `docs/superpowers/runbooks/` with 12). Two archive roots (`archive/edge-functions/ai-briefing/` at repo root; `docs/archive/`). Two near-identical research docs (`2026-08-14-` and `2026-08-15-tranche-a-exit-evidence.md`). `CHANGELOG.md` has **14 `## Unreleased` sections and the repo has zero git tags** — a changelog with no releases. `prompts/` (11 files) has its own `archive/`. In `website/`: `TESTING.md` + `TESTING_COMPLETE.md`.
**Recommendation.** One plans dir, one runbooks dir, one archive root; delete `archive/edge-functions` (the function was removed in PR #222 and git history keeps it); either tag releases or turn CHANGELOG headings into dates; merge the two exit-evidence docs.
**Difficulty** Small · **Risk** Low · **Priority** Medium · **CONFIRMED**.

### B5. What a new developer or agent actually needs
**Load-bearing set (keep, keep true):** `CLAUDE.md`, `AGENTS.md` (trim to the invariants), `docs/capacity-engine.md`, `docs/migrations.md` (but see C2 — it is a history log *and* a procedure; split), `docs/edge-function-auth.md`, `docs/whatsapp-agent.md`, `docs/whatsapp-flows.md`, `docs/today-command-centre.md`, `docs/partial-day-closures.md`, `docs/slack-alerts.md`, `docs/staff-web-push.md`, `docs/supabase-advisors.md`, `docs/node-runtime.md`, `docs/meta-app-recovery.md`, the 13 ADRs, the cutover runbook. That is ~45k words and is genuinely good.
**Missing:** a one-page operations overview (how a change reaches prod, how to roll each layer back, who to call — see Part C), a data-protection page (C4), and a services/cost/secrets inventory (C5, C8).
**Priority** High · judgement based on the inventory above.

---

## Part C — Operations & release

### C1. The release path itself is unusually well engineered (done well — CONFIRMED)
- **Frontend + website:** one Vercel deployment from `main`; `build-combined.mjs` refuses on file collisions, on a root `robots.txt` that would de-index the site, on `/` not being the marketing page, and on the booking shell missing; `vercel.json` carries edge redirects for every retired staff path, CSP on app routes only, immutable caching for hashed assets, `must-revalidate` for SW files, `noindex` for the `vercel.app` host; HSTS was corrected to exclude subdomains after the webmail incident.
- **Edge Functions:** `deploy-edge-functions.yml` diffs the whole pushed range, redeploys everything when `_shared/` changes, serialises deploys, and CI's `check:edge-auth` makes the in-function auth contract machine-checked.
- **Migrations:** `production-apply-migrations.yml` is approval-gated (`production` environment, required reviewer, PRODUCTION-scoped token, fails closed if either is missing), takes only `supabase/migrations/` from the named SHA while running the script from `main`, wraps each file + ledger row in one transaction, lexes the SQL for stray transaction control, requires a boolean postcondition, and records provenance. `check-migrations-applied` is a **required** check that also compares committed SQL with what prod recorded; a daily drift audit and weekly advisor diff backstop it. The June 2026 Settings outage is written on the workflow as the reason it exists.
- CI concurrency and cost are reasoned about in comments with measured minutes.
This is a better release control than most ten-person teams have.

### C2. Rollback is documented for none of the three layers (and the edge-function CLI is unpinned)
**What I found.** `grep -rniE "vercel.*(rollback|promote|instant)"` across live docs: **nothing**. Edge function rollback: nothing; `deploy-edge-functions.yml:108` uses `supabase/setup-cli … version: latest` while the four other workflows pin `2.109.1`. Migration rollback: ADR 006 says "rollback must be planned per migration … forward fix generally safer" and `docs/migrations.md` has one `restore what was applied` mention (line 541); there is no down-migration convention and no backup to restore from (C3). The build-time `VITE_LEGACY_SALON_BOARD` "rollback switch" needs a redeploy (`.env.example:62-69`) — correct, but it means every rollback is a deploy.
**Why it matters.** Rollback is the thing you do at 08:20 on a Monday with dogs arriving. Today the answer is "revert and merge, wait for CI and Vercel" for the frontend, "revert and merge, wait for the deploy job (on whatever CLI version is latest)" for functions, and "write a new migration" for the database. Vercel's one-click Instant Rollback and `supabase functions deploy` from a checked-out SHA are both available and both undocumented.
**Recommendation.** Write `docs/rollback.md` (one page): frontend = Vercel → Deployments → Promote previous (and when NOT to, i.e. after a contract migration); functions = `git checkout <sha> -- supabase/functions/<fn> && supabase functions deploy <fn> --project-ref … --no-verify-jwt` or revert-and-merge; database = forward fix + the C3 restore drill. Pin the CLI in `deploy-edge-functions.yml`. Split `docs/migrations.md` into `migrations-procedure.md` (stable) and `migrations-log.md` (append-only).
**Difficulty** Small · **Risk** Low · **Priority** High · **CONFIRMED**.

### C3. Database backup / PITR posture is undocumented and probably absent
**What I found.** No live document states that backups exist, how often, or how to restore. The only mentions are a rollout runbook telling the operator to "confirm Backup/PITR" before proceeding (`docs/superpowers/runbooks/2026-07-22-booking-policy-foundation-rollout.md:60`) and `--no-backup` flags in the local test harness. `README.md:249-251` and `docs/supabase-advisors.md:46` say the project is on the **Supabase Free plan** (the leaked-password toggle "requires Pro … while the project stays on Free"). Supabase Free includes **no automated backups and no PITR**.
**Why it matters.** If the plan is still Free, the live Postgres is the only copy of every customer, dog, booking, WhatsApp conversation and payment note. An operator error (a `delete` with a bad filter via the dashboard, a mis-applied migration) or a Supabase incident is unrecoverable. The repository has invested heavily in *preventing* bad writes and nothing in *recovering* from one.
**Recommendation.** (1) Confirm the plan this week. (2) If Free: either upgrade to Pro (daily backups, 7-day retention) and enable PITR, or add a scheduled GitHub Action that runs `pg_dump` with the production token into an encrypted private store (the production token/environment pattern already exists). (3) Write and *perform* a restore drill into staging; record the date. (4) Add the backup status to `check:advisors`-style tooling or at least to the first-real-booking checklist.
**Difficulty** Small–Medium · **Risk** Low (to add) / **High** (to leave) · **Priority** **Critical** · **HYPOTHESIS** (plan not verifiable read-only; the documentation gap is CONFIRMED).

### C4. Data retention and erasure: the privacy policy promises what nothing enforces
**What I found.**
- Retention jobs that exist: `booking_funnel_events` and `booking_denials` 90 days (`20260909150000_telemetry_retention_90_days.sql`), abandoned self-signups 7 days (`20260609160000`), Slack alert ledger, reminder/pending reapers.
- No retention job for `whatsapp_messages`, `whatsapp_media` (storage), `notification_log`, `booking_events`, `bookings`, `humans`, or any audit table (`grep` for prune/retention/`older than` over all migrations, filtered: none for these). `20260927160000_booking_payment_history.sql:25` itself says "Production rollout requires an approved retention/disposal policy".
- The public policy (`website/src/components/pages/PrivacyPolicyPage.jsx:135-147`) promises: active client records kept **3 years after last appointment**, financial **6 years**, health/incident notes **3 years**, and deletion on request. `docs/specifications/measurement-catalogue.md:297` acknowledges "erasure … obligations on operational sources".
- Erasure path: staff can hard-delete a human (`src/supabase/hooks/humans/useHumanMutations.ts:396` `.from("humans").delete()`), but FKs to `humans` are mixed — 16 without `ON DELETE` (the delete will be **refused** while bookings/messages exist), 6 `cascade`, 5 `set null`. There is no `anonymise_human` RPC and no documented SAR/erasure procedure.
**Why it matters.** UK GDPR Art. 5(1)(e) and Art. 17. A customer who asks to be forgotten today either cannot be deleted (FK refusal) or is deleted with their WhatsApp history orphaned/retained, and nobody could say which. The 3-year promise is unmonitored.
**Recommendation.** `docs/data-protection.md`: a retention table (table → period → mechanism → owner) and the SAR/erasure procedure. Add `anonymise_human(p_human_id)` (SECURITY DEFINER, staff-only) that scrubs PII while keeping booking/payment rows for the 6-year financial rule, and a monthly report of humans past 3 years since last appointment (the retention report already computes "last groomed"). Either enforce or soften the policy text.
**Difficulty** Medium · **Risk** Medium (touches customer rows — explain before changing) · **Priority** High · **CONFIRMED** (gap) — the legal exposure is judgement.

### C5. Secrets: a large surface, a partial inventory, no rotation story
**What I found.** 47 distinct `Deno.env.get` names across Edge Functions (`AGENT_CALLBACK_SECRET … WHATSAPP_SEND_URL`, incl. `ANTHROPIC_API_KEY`, `META_*`, `TWILIO_*` ×7, `SENDGRID_*`, `FLOW_PRIVATE_KEY/PASSPHRASE`, `VAPID_*`, `SLACK_SALON_TODAY_WEBHOOK`, `GEOAPIFY_API_KEY`, `WEBHOOK_SECRET`, `SEND_INTERNAL_SECRET`, `APPLY_CONFIRM_INTERNAL_SECRET`). GitHub: `SUPABASE_ACCESS_TOKEN` (repository-level PAT used by deploy, applied-check and drift audit), `PRODUCTION_SUPABASE_ACCESS_TOKEN` (environment), `BLUEHOST_FTP_*` ×3, `VITE_SUPABASE_*`. Vercel: `VITE_*` incl. Turnstile site key and Sentry DSN. Supabase dashboard: Twilio Verify credentials, Turnstile secret. `.env.example` is a good *partial* inventory (edge secrets with purpose). Rotation guidance exists only for the service-role key (`README.md:238`) and the Meta webhook secret (`docs/meta-app-recovery.md:190`).
**Why it matters.** The repository PAT is a personal token of one person (C6); if it is revoked the daily drift audit, the required merge check and function deploys all stop; if it leaks it can deploy functions to production. Nothing records when any secret was last rotated or who can rotate it.
**Recommendation.** `docs/secrets-inventory.md`: name → where it lives → who can rotate → how → last rotated. Replace the repository-level PAT with a least-privilege token and keep production-capable tokens only in the `production` environment. Delete the three Bluehost secrets (A7).
**Difficulty** Small · **Risk** Low · **Priority** Medium · **CONFIRMED**.

### C6. Bus factor is one, and the repository is public
**What I found.** `@leamonline` is the production environment's required reviewer (`docs/migrations.md:24,525`), the owner of the Supabase PAT, the Vercel team `smarterdog`, Bluehost, the Meta app, the Anthropic key, Sentry, and the Turnstile widget — which lives in a **second** Cloudflare account (`leam.waddington@…`) that the cutover runbook had to rediscover (`2026-09-11-smarterdog-domain-cutover.md:233-241`). The same runbook records webmail going down "during the owner's holiday". `gh api repos/leamonline/Smarter-dog-bookings` → `"visibility":"public"`: every runbook, prod project ref, DNS IP, account hint and owner email is world-readable. (This is also why the `Protect main` ruleset works on what the drift workflow calls "GitHub Free".)
**Why it matters.** Single-person dependency is normal for a one-salon product; what is missing is the *envelope*: where the accounts are, who the backup human is, and what to do if the owner is unreachable on a Monday. Public visibility is a deliberate-or-accidental choice that should be written down: nothing secret is committed (good), but the operational detail is reconnaissance material and a few docs include the owner's personal email.
**Recommendation.** A private (not in repo) "break-glass" sheet listing every account + a second administrator on Vercel, Supabase and GitHub; decide and record whether public visibility is intended; scrub personal emails from public docs.
**Difficulty** Small · **Risk** Low · **Priority** Medium · **CONFIRMED**.

### C7. Monitoring covers errors and drift, not availability or scheduled jobs
**What I found.** Present: Sentry (verified live by `check:sentry`), weekly advisor diff, daily migration drift, Slack `#salon-today` (dark-launched; whether `SLACK_ALERTS_ENABLED` is on in prod is not recorded — HYPOTHESIS), staff push (dark). Absent (CONFIRMED by grep): any uptime/synthetic check of `smarterdog.co.uk`, `/book/login`, `/stafflogin` or the Supabase API; any alert when a Vercel build or the edge deploy fails (GitHub emails only); any surfacing of `cron.job_run_details` failures — the salon depends on ~15 pg_cron jobs (reminders, SMS fallback, reapers, Slack summary, telemetry prune) and a failing one is silent.
**Recommendation.** A free external uptime monitor on three URLs with WhatsApp/SMS to the owner; a daily SQL check (`select … from cron.job_run_details where status <> 'succeeded' and start_time > now() - interval '1 day'`) wired into the existing Slack function as a "cron health" line; record Slack/Push flag state in a one-line status table.
**Difficulty** Small · **Risk** Low · **Priority** Medium · **CONFIRMED** (gaps) / **HYPOTHESIS** (Slack state).

### C8. Cost is not documented anywhere
**What I found.** No document states the Supabase plan (Free implied — see C3), the Vercel plan (the project deploys a combined build with two `npm ci`s; Hobby forbids commercial use), Anthropic spend (the agent runs on every inbound WhatsApp message), Meta conversation charges, Twilio, SendGrid, Geoapify (free tier: 3,000 credits/day, `.env.example`), or GitHub Actions minutes (`ci.yml` comments show minutes are already a constraint: "18 billed minutes per PR", "ninety billed minutes to test four commits").
**Recommendation.** A one-table `docs/services-and-costs.md` (service → plan → monthly cost → billing owner → what breaks on non-payment). It doubles as the account inventory for C6.
**Difficulty** Small · **Risk** Low · **Priority** Low · **CONFIRMED**.

### C9. Incident runbooks exist for rollouts, not for incidents
**What I found.** 12 dated rollout/cutover runbooks under `docs/superpowers/runbooks/`, an excellent `docs/meta-app-recovery.md`, Geoapify recovery in `docs/address-search.md`, and `2026-07-29-closure-integrity-rollback.md`. Nothing for: "site/portal down", "Supabase outage", "WhatsApp webhook stopped delivering", "reminders didn't go out", "Sentry spike after deploy", "staff cannot log in" (Turnstile hostname/Supabase Auth URL — both bit during the cutover).
**Recommendation.** One `docs/incidents.md` with a first-15-minutes checklist and one paragraph per scenario, each pointing at the existing deeper doc. Reuse the cutover runbook's "what went wrong" section as the seed.
**Difficulty** Small · **Risk** Low · **Priority** Medium · **CONFIRMED**.

### C10. PWA and stale tabs after a deploy
**What I found.** `vite.config.js:31-64`: `registerType: "autoUpdate"`, `skipWaiting`, `clientsClaim`, `cleanupOutdatedCaches`, SW scope `/staff/` only, `navigateFallback: app/index.html`; no `virtual:pwa-register` usage (so the plugin's default `registerSW.js` is injected); no `periodicSyncForUpdates`. No `vite:preloadError` handler, no build id/`__APP_VERSION__`, no Sentry `release` (grep: none). 21 `React.lazy` routes. Comment at line 57-58: "a single hard refresh is enough to pick up a deploy".
**Mechanics (HYPOTHESIS on exact behaviour, CONFIRMED on config).** Staff PWA: with autoUpdate the generated registration reloads the page when the new worker takes control — so a staff tab can **reload itself mid-edit** moments after a merge to `main`; conversely, SW update checks only happen on full navigations, so a tab left open all day keeps old code and old precache until a reload. Customer portal: no SW → after a deploy a stale tab that lazy-loads a renamed chunk gets a 404 from Vercel, `React.lazy` rejects, and the user sees the ErrorBoundary with a reload button (`ErrorBoundary.jsx:72`). Because there is no release tag, these show up in Sentry as generic chunk errors indistinguishable from real bugs.
**Operational consequence.** Every merge to `main` is a live deploy during salon hours; there is no "deploy window" convention in CLAUDE.md/AGENTS.md.
**Recommendation.** (1) Add `window.addEventListener('vite:preloadError', e => { e.preventDefault(); reload-once-guard })`. (2) Inject `__APP_VERSION__` = `VERCEL_GIT_COMMIT_SHA` and set Sentry `release` so stale-tab noise is filterable. (3) For staff, prefer a "new version available — refresh when ready" toast over an automatic reload (vite-plugin-pwa `registerType: 'prompt'`), since the staff app holds booking drafts. (4) Write down a soft rule: merge customer-visible changes outside 08:00–13:30 Mon–Wed unless urgent.
**Difficulty** Small · **Risk** Low · **Priority** Medium.

### C11. Expand/contract is a documented discipline with no mechanical guard
**What I found.** CLAUDE.md explains clearly that the `migrations-applied` required check forces "apply first, merge second", so a contract step cannot share a PR with the frontend change. Nothing checks that a migration arriving alongside `src/` changes is additive. The apply script's per-file transaction is a genuine safety net for partial failure, but a `DROP COLUMN` that passes review still ships before the code that stops reading it is deployed only if someone remembers.
**Recommendation.** Extend `scripts/check-migrations.mjs` (already in CI) to fail when a PR adds a migration containing `drop table|drop column|rename|alter type … drop` **and** touches `src/` or `supabase/functions/`, unless the file carries a `-- contract-phase: approved` marker.
**Difficulty** Small · **Risk** Low · **Priority** Low · **CONFIRMED**.

---

## What to DELETE, merge or archive (concrete list)

**Delete**
- `.github/workflows/website.yml` `deploy` job; secrets `BLUEHOST_FTP_HOST/USER/PASSWORD`; variable `WEBSITE_PUBLISHER_ENABLED` (A7)
- `website/htaccess_upload.txt`, `website/BUSINESS_LISTINGS_SHEET.txt`, `website/TESTING_COMPLETE.md`, `website/public/vite.svg`, `website/src/assets/react.svg`, `website/public/og-booking-2026.png` (unreferenced) (A6–A8)
- `website` deps `@emailjs/browser` (unused) and, if GA is not configured, `react-ga4` + `CookieConsent` (A4, A8)
- `archive/edge-functions/` at repo root (git history keeps it) (B4)
- `docs/private/` references in `docs/README.md` and `check-doc-links.mjs` (B2 #15)

**Archive (move to `docs/archive/`, keep links via `check:docs`)**
- The #603 programme corpus: `docs/plans/active/2026-08-09-issue-603-architecture-convergence.md`, `docs/traceability.md`, `docs/interface-capability-truth.md`, `docs/research/2026-08-*` (8 files), programme sections of `PROJECT.md`/`ROADMAP.md` (B1)
- `docs/ux/`, `docs/ux-review-assets/` (207 KB digest), `docs/ux-review-2026-06.md`, `docs/ux/captures/` (B1)
- `docs/superpowers/plans/*` and `docs/superpowers/specs/*` (all implemented or deferred) and `docs/runbooks/` → fold into one runbooks dir (B4)
- `prompts/archive/` (B4)

**Move to `docs/plans/completed/`** with corrected status: `2026-09-10-smarterdog-domain-routing.md` (after A7), `2026-09-20-daily-brief-stack.md`, `2026-09-20-brand-reskin.md` (or mark the remaining steps) (B2 #10–#12)

**Merge**
- `docs/research/2026-08-14-` + `2026-08-15-tranche-a-exit-evidence.md`; `website/TESTING.md` into `website/README.md`; `docs/migrations.md` → procedure + log (B4, C2)

**Rewrite from code**
- `README.md` Architecture / Features / Marketing website / Edge Functions / capability table (B2)
- `website/README.md`, `website/MAINTENANCE.md` Bluehost sections, `docs/README.md` website row (A7, A8)
- `website/public/llms.txt` → generated at build (A2)

---

## What is already done well

1. **Release engineering** (C1): the production-migration workflow, the required `migrations-applied` content check, drift and advisor audits, edge-deploy range diffing, and `build-combined.mjs`'s self-checks are exemplary — each control names the incident that motivated it.
2. **The cutover runbook** is honest, specific and reusable: three failures written up with root causes, an explicit "do not move nameservers" invariant, and a rollback that was tested in thought before it was needed.
3. **`CLAUDE.md` domain rules** are accurate on every point I checked (slots, 2-2-1, daily cap, gates, reason codes, flags, env names); the Gotchas section prevents real mistakes.
4. **`docs/meta-app-recovery.md`** is exactly what an incident runbook should look like; **`docs/edge-function-auth.md`** turns a diffuse security boundary into a checkable manifest.
5. **Website fundamentals**: live salon facts/open days/holiday card from Supabase with safe fallbacks (the `supabaseClient.js` comment on the silent-null failure is a model of a good comment); AVIF/WebP `srcset`; one `<h1>` per page; documented contrast ratios; axe in CI; `robots.txt` merge logic that refuses to de-index the site.
6. **Privacy by construction** in Slack alerts (typed 5-field subject), telemetry retention with a named owner and date, and `npm run dev` forced onto sample data.
7. **Honest staleness markers**: PROJECT.md/ROADMAP.md say "the baseline above is historical" — the problem is volume, not candour.

## Top 5 for this area

1. **Confirm database backups exist, and make erasure/retention real** (C3, C4). If the Supabase project is on Free, there is no backup of the salon's only customer database. Then: one `data-protection.md`, an `anonymise_human` RPC, and the 3-year rule either enforced or removed from the public policy. *Critical / Small–Medium.*
2. **Reconcile every public fact to one source** (A1, A2, A3): service names, prices, phone, email, hours; generate `llms.txt` and the sitemap at build; extend `get_public_salon_facts` with a price list. *High / Small–Medium — customers see this today.*
3. **Retire Bluehost and write the three-layer rollback page** (A7, C2): delete the deploy job and FTP secrets, pin the Supabase CLI in the edge deploy, document Vercel instant rollback and function redeploy-from-SHA. *High / Small.*
4. **Documentation diet and truth pass** (B1–B5): archive the #603 corpus and UX reviews (~110k words), fix README's four false architecture claims, move the three finished "active" plans, add a 40-line staleness check to `check:docs`. *High / Medium.*
5. **Operational envelope** (C5–C10): secrets + services/costs inventory, an uptime check on three URLs, pg_cron health in Slack, Sentry release tag + `vite:preloadError` handler, a second administrator on the three hosting accounts. *Medium / Small each.*

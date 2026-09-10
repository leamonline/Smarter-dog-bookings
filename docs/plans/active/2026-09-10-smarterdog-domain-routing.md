# Single-domain routing: /book and /stafflogin on smarterdog.co.uk

Status: Draft
Issue: [#824](https://github.com/leamonline/Smarter-dog-bookings/issues/824)
Base: `codex/smarterdog-domain-routing` off `origin/main` at `0e1b8541`
Last verified: 2026-09-10
Owners: `vercel.json`, `vite.config.js`, `src/index.jsx`, `src/components/layout/StaffRoutes.jsx`, `public/**`, `website/**` (publisher only), `.github/workflows/website.yml`
Dependencies: None in-repo. External: Vercel project domains, Bluehost DNS, Supabase Auth redirect allowlist, Cloudflare Turnstile hostname allowlist.
Related requirements: None recorded
Related ADRs: [ADR 009](../../architecture/decisions/009-independent-applications-in-one-repository.md) — the two applications stay independent; this plan changes only where they are *published*, not how they are built.

## Goal

`https://smarterdog.co.uk/book` serves the customer portal and
`https://smarterdog.co.uk/stafflogin` serves staff sign-in, with the domain
unchanged in the address bar for the whole of both journeys.
`https://smarterdog.co.uk/` continues to serve the marketing website.
`https://smarterdog.vercel.app` keeps working so links already sent to
customers do not break.

## Why

Customers are currently sent to a `vercel.app` address to book. For a local
salon whose customers arrive from Google, Facebook and WhatsApp, an unfamiliar
hosting domain in the address bar is a trust cost at exactly the moment
someone is deciding to hand over their details. Staff have the same split:
the salon is `smarterdog.co.uk`, the tool they log into is somewhere else.

A single domain also removes the standing need to explain which address is
"the real one".

## Current behaviour

Verified 2026-09-10 against `0e1b8541` unless stated otherwise.

**DNS (observed 2026-09-10 by `dig`).** `smarterdog.co.uk` uses Bluehost
nameservers `ns1.bluehost.com` / `ns2.bluehost.com`. The apex `A` record is
`50.6.153.109`; `www` resolves to `103.169.142.0`. `book.smarterdog.co.uk`
does not resolve. DNS is therefore administered at Bluehost, and the apex is
served by Bluehost shared hosting.

**`www` is currently broken (observed 2026-09-10).** The apex is healthy:
`https://smarterdog.co.uk/` returns `200` with a certificate that verifies.
`www.smarterdog.co.uk` points at a different server and is not serving the
site — `https://` fails with a TLS handshake alert (number 40, no usable
certificate for that name) and `http://` returns `409`. Anyone typing or
following a `www.` link reaches a browser security warning or an error page.
This predates the plan and is not caused by it, but the cutover is the natural
moment to fix it: `www` should be added to the Vercel project alongside the
apex, so both names serve the site with a valid certificate.

**Marketing website.** Lives at [`website/`](../../../website) as an
independent application (own `package.json`, lockfile, Vite 8 + React 19
build) per ADR 009. Since 9 September 2026 the `deploy` job in
[`.github/workflows/website.yml`](../../../.github/workflows/website.yml) is the
single live publisher, uploading `website/dist` to Bluehost `public_html/`
over FTP, gated on repository variable `WEBSITE_PUBLISHER_ENABLED`. See the
[cutover runbook](../../superpowers/runbooks/2026-09-07-website-publisher-cutover.md).

**Booking application.** Repository root; Vite 7 + React 19 SPA on Vercel at
`smarterdog.vercel.app`. Top-level routing in
[`src/index.jsx:33`](../../../src/index.jsx) is `/reset-password`,
`/customer/*` → `CustomerApp`, `/*` → staff `App`. Staff routes in
[`src/components/layout/StaffRoutes.jsx`](../../../src/components/layout/StaffRoutes.jsx)
are `/`, `/today`, `/settings`, `/humans`, `/humans/:id`, `/dogs`, `/dogs/:id`,
`/reports` (with children), `/inbox`, `/booking-workspace`,
`/whatsapp` (redirect to `/inbox`), `/needs-attention` and `/dev/*`
(development builds only).

[`vercel.json`](../../../vercel.json) rewrites `/(.*)` to `/index.html` and sets
the security headers, including a `default-src 'self'` Content-Security-Policy.

**Confirmed collisions between the two applications at a shared origin.**

| Path | Website | Booking app |
|---|---|---|
| `/assets/*` | `website/public/assets` and hashed build output | hashed build output |
| `/index.html` | SPA entry | SPA entry |
| `/manifest.json` | present | present (`vite.config.js` sets `manifest: false` to use it directly) |
| `/robots.txt` | `Allow: /` plus sitemap and AI-crawler rules | `User-agent: *` / `Disallow: /` |
| `/favicon.*` | `favicon.png` | `favicon.svg` |

The booking app additionally owns `/push-sw.js`, `/icons/`, `/fonts/`,
`/images/`, `/apple-touch-icon.png` and `/logo*.png` at root; the website
additionally owns `/sitemap.xml`, `/llms.txt` and `/vite.svg`.

**Service worker.** `vite-plugin-pwa` with `registerType: "autoUpdate"` and
`navigateFallbackDenylist: [/^\/api/, /^\/functions\//]`
([`vite.config.js:10`](../../../vite.config.js)). `public/app/manifest.json`
declares `"start_url": "/"` and root-absolute icon paths. A separate
`public/push-sw.js` backs staff Web Push.

**Password reset.** Built from `window.location.origin` at
[`LoginPage.jsx:115`](../../../src/components/auth/LoginPage.jsx) and
[`AccountSettings.jsx:67`](../../../src/components/views/settings/AccountSettings.jsx),
so it follows whichever origin the user is on. No code change is needed for
the new domain; the Supabase redirect allowlist must permit both.

**Apache configuration.** [`website/public/.htaccess`](../../../website/public/.htaccess)
provides gzip, cache expiry, `no-cache` for HTML and SPA history fallback.
Vercel ignores `.htaccess`; each behaviour must be reproduced in `vercel.json`.

*Assumption, not yet verified:* that the Vercel project builds only the
repository root (`build: vite build`) and has no existing custom domain. Both
must be confirmed in the Vercel dashboard before the cutover.

## Desired behaviour

| URL | Serves |
|---|---|
| `/` and existing marketing paths | marketing website, unchanged |
| `/book` | customer portal entrance |
| `/book/*` | customer portal routes |
| `/stafflogin` | staff sign-in |
| `/staff/*` | authenticated staff routes |
| `/reset-password` | password reset, both audiences |
| `/customer/*` | permanent redirect to the matching `/book/*` |
| `smarterdog.vercel.app/*` | keeps serving the booking app |

## Scope

- URL design and router changes in the booking app.
- Namespacing the booking app's build output and static files so the two
  applications can share one origin.
- A combined Vercel build and routing table.
- Retiring the Bluehost FTP publisher in favour of Vercel.
- The DNS cutover and its rollback.
- External configuration: Supabase Auth redirects, Turnstile hostnames,
  Edge Function CORS allowlists.

## Non-goals

- Merging the two applications' CSS, routing, auth or service workers. ADR 009
  stands; they remain independent builds.
- Removing `website/` from this repository, or reversing the September
  consolidation. Only the publish target changes.
- Moving DNS administration away from Bluehost. Nameservers and MX records stay
  where they are, so email is untouched.
- Redesigning either interface.
- Changing the capacity engine, booking rules or any database behaviour.

## Relevant code

- [`src/index.jsx`](../../../src/index.jsx) — top-level route map; the single
  place where `/customer/*` and the staff catch-all are declared.
- [`src/components/layout/StaffRoutes.jsx`](../../../src/components/layout/StaffRoutes.jsx)
  — every staff route that must move under `/staff/`.
- [`vite.config.js`](../../../vite.config.js) — build output paths, PWA and
  service-worker scope, manual chunking (a logic test pins `rollupOptions`;
  see CLAUDE.md gotchas).
- [`vercel.json`](../../../vercel.json) — rewrites and headers; sole owner of
  routing at the edge.
- [`.github/workflows/website.yml`](../../../.github/workflows/website.yml) —
  the Bluehost publisher to be disabled.
- [`public/app/manifest.json`](../../../public/app/manifest.json),
  [`public/robots.txt`](../../../public/robots.txt),
  [`public/push-sw.js`](../../../public/push-sw.js) — root-owning static files.
- [`scripts/check-sentry-live.mjs:32`](../../../scripts/check-sentry-live.mjs) —
  `DEFAULT_ORIGIN` is `https://smarterdog.vercel.app`.
- [`docs/whatsapp-flows.md:174`](../../whatsapp-flows.md) — documents a
  customer link at `smarterdog.vercel.app/customer/login`.
- [`.env.example:99,160`](../../../.env.example) — CORS allowlist examples
  already anticipate `https://book.smarterdog.co.uk`.

## Architecture

One Vercel project produces one deployment containing both applications'
build output, merged at publish time. The applications are still built
separately by their own toolchains — ADR 009 is preserved — and are combined
only as static output.

The origin becomes shared, so the trust boundary changes in one meaningful
way: the marketing site and the booking app stop being separate origins.
Anything relying on origin isolation between them no longer holds. Neither
application currently depends on that isolation, but the shared
Content-Security-Policy must be widened to cover the website's needs
(analytics and EmailJS names appear in `website/.env.example`), and widening
it necessarily widens it for the booking app too. That is the main
architectural cost of a single domain and it should be accepted knowingly.

Authority for routing moves to `vercel.json`. Static files resolve before
rewrites, so namespaced assets are served directly and only genuine
navigations fall through to an SPA entry.

## Data/database changes

None.

## API changes

No RPC, Edge Function or webhook contract changes. Configuration only:

- Edge Function CORS allowlists gain `https://smarterdog.co.uk`. The existing
  `https://smarterdog.vercel.app` entry stays for the compatibility window.
- Supabase Auth Site URL and redirect allowlist gain the new origin and the
  `/reset-password` path on it.

## UI changes

No visual change. Navigation targets change:

- Customer portal links move from `/customer/...` to `/book/...`.
- Staff navigation moves from root-level paths to `/staff/...`.
- The staff PWA's `start_url` becomes `/staff/`, so launching the installed app
  opens the dashboard rather than the marketing site.
- Old `/customer/*` URLs redirect permanently rather than 404, so existing
  bookmarks and any links already sent keep working.

## Security/privacy considerations

- **Search indexing is the largest exposure.** See Risks; the booking app's
  `Disallow: /` must never be the file served at the shared origin, and the
  booking surfaces must be explicitly disallowed instead.
- Shared origin means the CSP is shared. Widening it for the website's
  analytics also widens it for the booking app. Add only the specific hosts
  the website needs; do not fall back to a permissive policy.
- Cookies and storage become same-origin across both applications. The two
  Supabase clients already use separate auth storage keys
  (CLAUDE.md gotchas) and that separation must be preserved.
- Changing origin invalidates every existing Web Push subscription and
  installed PWA. That is a availability change for staff notifications, not a
  data exposure, but it needs scheduling.
- No secret moves. FTP credentials become unused but should be revoked at
  Bluehost rather than left live.

## Dependencies

- Owner authority for DNS record changes at Bluehost.
- Owner authority to disable `WEBSITE_PUBLISHER_ENABLED`.
- Vercel dashboard access to add the custom domain.
- Supabase dashboard access for the Auth redirect allowlist.
- Cloudflare Turnstile dashboard access for the hostname allowlist.
- Conflicts with concurrent work: none known; `website/**` and the root app are
  path-isolated in CI.

## Risks

**Deindexing smarterdog.co.uk. Low likelihood, severe impact.** The booking
app ships `public/robots.txt` containing `User-agent: *` / `Disallow: /`. If
the merged build lets that file win at `/robots.txt`, Google is instructed to
drop the entire marketing site. For a salon that depends on local search this
is a serious commercial harm and it surfaces slowly — weeks, not hours.
*Mitigation:* the website's `robots.txt` is the only one published, extended
with explicit `Disallow:` lines for `/book`, `/stafflogin` and `/staff`; a
build-time check asserts the published file contains `Allow: /` and the
sitemap line. Verify the live file immediately after cutover and again a week
later in Search Console.

**Two publishers writing to different hosts. Medium likelihood, high impact.**
Until the Bluehost publisher is disabled, a merge touching `website/**` still
FTPs to Bluehost. After DNS moves, that publish silently goes nowhere visible
and the two sources drift. *Mitigation:* disable the gate variable before the
DNS flip, as an explicit ordered step.

**Asset collision. High likelihood if unaddressed, high impact.** Both apps
emit `/assets/` with hashed names, and both ship a `manifest.json`. A merge
without namespacing produces a site that half-loads. *Mitigation:* the booking
app's output and static files move under dedicated prefixes; a test asserts no
overlapping paths between the two `dist` trees.

**Staff notifications stop. Certain, medium impact.** Origin change invalidates
push subscriptions and installed PWAs. *Mitigation:* schedule on a closed day,
tell staff in advance, and confirm each device re-opts-in.

**Password-reset links in flight. Low impact.** Links already sent point at
`smarterdog.vercel.app`. *Mitigation:* keep that domain live and allowlisted
for the compatibility window; do not remove it at cutover.

**Turnstile silently failing. Medium likelihood, high impact.** The site key
is bound to hostnames; an unlisted origin fails the captcha and blocks
customer login with an unhelpful message. *Mitigation:* add the hostname
before the DNS flip and test the customer login path on the Vercel deployment
URL first.

**Rollback window. Low likelihood.** DNS propagation means a bad cutover is not
instantly reversible. *Mitigation:* lower TTL well before the change; leave the
Bluehost `public_html/` contents untouched so re-pointing the records restores
the previous site exactly.

## Migration/rollout

Order matters; each step is separately reversible.

1. Merge the code changes with no DNS change. Verify every new path on
   `smarterdog.vercel.app`: `/book`, `/stafflogin`, `/staff/today`,
   `/customer/*` redirects, and the marketing site at `/`.
2. Add `smarterdog.co.uk` and `www.smarterdog.co.uk` as domains on the Vercel
   project. Vercel will show the exact `A` and `CNAME` values to use — take
   them from the dashboard rather than from memory or documentation.
3. Add `https://smarterdog.co.uk` to the Supabase Auth redirect allowlist,
   the Turnstile hostname allowlist and the Edge Function CORS allowlists,
   keeping the existing `vercel.app` entries.
4. Lower the TTL on the apex `A` and `www` records at Bluehost, and wait for
   the old TTL to expire.
5. Set `WEBSITE_PUBLISHER_ENABLED` to `false`. Confirm no publish is in flight.
6. Change the apex `A` and `www` records at Bluehost to the Vercel values.
   Nameservers, MX and every other record stay as they are.
7. Verify: marketing site at `/`, `/book`, `/stafflogin`, a real staff login, a
   real customer login including Turnstile, a password reset end to end, and
   `/robots.txt` served with `Allow: /`.
8. Staff re-add the app to their home screens and re-enable device
   notifications.

**Rollback.** Restore the two DNS records to `50.6.153.109` and the previous
`www` value; set `WEBSITE_PUBLISHER_ENABLED` back to `true`. Bluehost
`public_html/` is left untouched throughout, so the previous site returns as
soon as the records propagate. Code changes can stay merged — they are inert
until the domain points at Vercel.

## Implementation sequence

Each step is a reviewable pull request.

1. **Namespace the booking app's output.** `vite.config.js`: move hashed
   assets to `booking-assets/`, move `public/` files under a dedicated prefix,
   update `manifest.json` icon paths and `start_url`. Update the PWA service
   worker scope to `/staff/` and serve `push-sw.js` from the same prefix.
   Tests: extend the existing `vite.config` logic test to pin the new output
   paths; assert no path in the booking `dist` tree also exists in
   `website/dist`.
2. **Move the routes.** `src/index.jsx` and `StaffRoutes.jsx`: customer portal
   to `/book/*`, staff to `/staff/*`, `/stafflogin` as the sign-in entry, and
   permanent redirects from `/customer/*`. Update the ten `/customer` literals
   in `src/`. Tests: component tests for the redirect and for each entrance.
3. **Combined build and routing.** A build script that runs both builds and
   merges the output, the `vercel.json` rewrite table, headers reproducing the
   `.htaccess` caching behaviour, and the merged `robots.txt` with its
   build-time assertion.
4. **Documentation and stale references.** `CLAUDE.md`, `README.md`,
   `docs/whatsapp-flows.md`, `scripts/check-sentry-live.mjs`, the WhatsApp Flow
   and any message templates that link to `smarterdog.vercel.app`.
5. **Publisher retirement.** Disable the deploy job in `website.yml` (or remove
   it, keeping the runbook as history) once the cutover is accepted.

Steps 1 and 2 are serial. Step 4 can run in parallel with 3. Step 5 happens
only after acceptance.

## Testing

- `npm run lint`, `npm run typecheck`, `npm run check:migrations`,
  `npm run test`, `npm run build` — the stated CI bar.
- `npm run website:test` and `npm run website:build` — the website is
  path-isolated in CI and will not otherwise run.
- New logic test: booking and website output trees share no path.
- New logic test: published `robots.txt` allows crawling and disallows the
  three booking prefixes.
- Component tests: `/customer/*` redirects to `/book/*`; `/stafflogin` renders
  sign-in; `/staff/*` renders the dashboard shell.
- `npm run e2e` offline, covering the customer entrance at its new path.
- Manual, against the Vercel deployment URL before DNS moves: staff login,
  customer login with Turnstile, password reset, installed-PWA launch.

## Observability

- Sentry: no new errors attributable to routing after cutover; update
  `DEFAULT_ORIGIN` in `check-sentry-live.mjs` so `npm run check:sentry`
  targets the live domain.
- Google Search Console: coverage and the live `robots.txt` checked at
  cutover, at one week and at one month.
- A booking completed end to end on the new domain is the acceptance signal;
  no additional customer data is collected to prove it.

## Documentation updates

- `CLAUDE.md` — the deployment sentence and the website publisher paragraph.
- `README.md` — the website hosting section.
- The [cutover runbook](../../superpowers/runbooks/2026-09-07-website-publisher-cutover.md)
  — append a status note that the Bluehost publisher was retired, with the date
  and this plan's link. Do not rewrite its history.
- A new ADR recording that both applications are published from one Vercel
  project on one origin, superseding the hosting half of ADR 009 while leaving
  its build-independence decision intact.
- `docs/whatsapp-flows.md` and any customer-facing template copy.
- `CHANGELOG.md`.

## Definition of done

- Both entrances resolve on `smarterdog.co.uk` and the domain stays in the
  address bar through a complete customer booking and a complete staff session.
- `/customer/*` and `smarterdog.vercel.app` still work.
- `/robots.txt` on the live domain allows crawling and disallows the booking
  prefixes, confirmed in Search Console.
- The full CI bar passes, plus the website's own workflow.
- Exactly one publisher is enabled, evidenced by a `website/**` merge appearing
  on the live site through Vercel and nowhere else.
- Staff device notifications confirmed working again on at least one device per
  member of staff.
- Documentation above updated and the ADR merged.

## Open questions

1. **A GitHub issue has not been raised.** The plans standard requires one.
   Decision owner: Bleep.
2. **Service-worker scope.** This plan proposes scoping the service worker to
   `/staff/` only, which is where the installed PWA and Web Push actually
   matter, and leaving the customer portal without precaching. The alternative
   is registering the same worker twice at `/book/` and `/staff/` scopes.
   The proposal is simpler; the cost is slightly slower repeat loads for
   customers. Decision owner: Bleep.
3. ~~**Whether `www` should serve the site or redirect to the apex.**~~
   *Resolved 2026-09-10:* `www` is currently broken (see Current behaviour) and
   must be added to the Vercel project at the cutover. Whether it then serves
   the site directly or redirects to the apex is a free choice; redirecting to
   the apex is the simpler default and keeps one canonical URL for search.
4. **Content-Security-Policy scope.** The website reads
   `VITE_GA_MEASUREMENT_ID` and lists three `VITE_EMAILJS_*` names, none of
   which the current CI build passes in. If analytics or EmailJS are to work
   on the merged origin, the CSP must name those hosts — and that is a
   product decision about what runs on the site, not a routing decision.

# Brand reskin: charcoal, cream, sky and sun

Status: Draft
Issue: [#896](https://github.com/leamonline/Smarter-dog-bookings/issues/896)
Base: `main` at `87c6fe47fa44e925b65f3c9839957f69ac9378fe` (drafted against `8816f06e`; the two commits between are e2e-test-only)
Last verified: 2026-09-20
Owners: `src/index.css`, `src/customer-portal.css`, `src/components/auth/**`, `src/components/ui/**`, `src/components/layout/AppToolbar.jsx`, `public/app/**` (logos, icons, fonts, manifest), `index.html`, `.design-sync/**`, `website/src/constants/colors.js`, `website/public/assets/**`
Dependencies: None in-repo. Conflicts with concurrent work are listed under Dependencies below.
Related requirements: `REQ-A11Y-001`
Related ADRs: [ADR 009](../../architecture/decisions/009-independent-applications-in-one-repository.md) — the booking app and the marketing website stay independent, so each gets its own pull requests and its own checks.

## Goal

The booking app and the marketing website present one brand that matches the
renovated salon: charcoal ink, cream paper, sky blue and sun yellow, with the
black roundel as the main logo. Staff working screens stay light, calm and as
readable as they are today. No booking, capacity, messaging or data behaviour
changes anywhere.

## Why

The salon is being refitted with backlit sky-and-sun ceiling panels, dark
marble, wood slats and a checkerboard floor. The app still wears the previous
identity: deep purple ink, cyan, Quicksand headings and a handwriting accent.
Customers will walk out of a charcoal-and-sky room and open a purple app.

Two facts make this cheap to do now rather than later:

1. The app is already token-driven. Ink is one variable used in 137 files, so
   most of the visual change is a values edit, not a component rewrite.
2. The architecture roadmap records **`STOP`** with nothing in the "Now" column
   (`ROADMAP.md`, recorded 15 August 2026). This plan is presentational only and
   touches none of the programme invariants listed there.

## Current behaviour

Verified 2026-09-20 against `8816f06` unless stated otherwise.

**Tokens.** Tailwind v4 CSS-first config in [`src/index.css`](../../../src/index.css)
(`@theme`, 1,484 lines). Ink is `--color-brand-purple: #2D004B`, aliased by
`--color-ink`, `--color-sd-navy` and `--color-surface-header`. Counted in
`.jsx`/`.tsx`: `brand-purple` 561 uses in 137 files; `brand-teal` 304 in 93;
`brand-coral` 261 in 99; `brand-yellow` 147 in 59; `brand-cyan` 24 in 10;
`font-display` 82 in 66. Card shadows are purple-tinted (`rgba(45, 0, 75, …)`).

**Hardcoded colour.** 228 six-digit hex literals in `.jsx`/`.tsx` bypass the
tokens. Two old-cyan literals matter, and they are **not the same kind of
thing** (classified 2026-09-20, second review):

- `#10C2FC` is decorative: report section accents, the default icon colour in
  `src/components/icons/index.jsx`, one chart series. Safe to move to a token.
- `#0099BD` is **functional everywhere it appears**: the "Senior (Needs breaks)"
  alert colour in `src/constants/salon.ts:333`; the *lookup key* for that
  alert's tint in `src/components/modals/shell/alertTints.js:11`; the
  unknown-size fallback theme in `src/constants/brand.ts` and
  `BookingCardNew.jsx:33`; the untrusted-human label in
  `DogSearchSection.jsx:330`. Changing the hex in one place and not the other
  would silently drop the alert's tint. These are out of scope (see Non-goals).

Outside `.jsx`/`.tsx`, old brand hexes also live in `src/index.css`,
`src/customer-portal.css`, `src/constants/brand.ts`, `src/constants/salon.ts`,
`alertTints.js` and `website/src/constants/colors.js`.

**Fonts.** Self-hosted Montserrat (400–700) and Quicksand (500–700) in
`public/app/fonts/`; Caveat 700 via `@fontsource/caveat`. `font-handwriting` has
**zero** uses in `.jsx`/`.tsx`; Caveat is referenced only by the import and the
token in `src/index.css`. `ScribbleUnderline` is used by `LoginPage.jsx` and
`CustomerLoginPage.jsx` and is an SVG, not a font.

**Logo font mismatch.** The wordmark in every logo file is Poppins Bold. An
overlay of the lockup against candidate fonts scored Poppins Bold 0.84 and
Quicksand 0.58 (intersection-over-union; the remainder is letter-spacing and
raster edge bloat). App headings are therefore set in a different typeface from
the logo.

**Customer portal.** [`src/customer-portal.css`](../../../src/customer-portal.css)
is 1,167 lines of bespoke CSS with its own `--sd-*` variables, most of which
alias the `@theme` tokens. Page background is two radial gradients (cyan and
yellow) over paper. `--sd-lavender-tint: #F3EDFB` (past appointments) is derived
from the purple and has no token.

**Auth.** `LoginPage.jsx` (425 lines), `CustomerLoginPage.jsx` (663),
`ResetPasswordPage.jsx` (229) and `DogSilhouetteScatter.jsx` (80). Login pages
have component tests.

**Logos.** No vector logo exists in the repository; every logo is a PNG.
`AppToolbar.jsx` paints `/app/logo.png` through a CSS mask in `brand-purple`.
`CustomerDashboard.jsx` and `LoginPage.jsx` use `/app/logo.png` as an `<img>`.
The roundel is not used anywhere in the booking app. `index.html` sets
`og:image` and `twitter:image` to the 1200×300 lockup. The staff PWA icon
(`public/app/favicon.svg`, `icons/*`) is a separate royal-blue calendar-and-paw
design. `website/public/assets/logo-icon.png` is 570 KB.

**Status colours.** [`BookingStatusBadge.tsx`](../../../src/components/ui/BookingStatusBadge.tsx)
documents two load-bearing rules: the status word is always rendered, and every
tone is dark ink on a light tint, chosen for staff reading "across a wet salon
on a low-brightness screen".

**Tests.** Six component tests assert on `brand-purple` class names or the purple
hex (`PageHeader`, `PickupPersonField`, `DogsView`, `IdentityMarker`,
`ConversationListItem`, `AppToolbar`). A search of `e2e/` and `src/` for
`toHaveScreenshot` and `toMatchSnapshot` found no visual-regression assertions.

**Website.** Colours live in `website/src/constants/colors.js` (with
`colors.test.js`); `plum: '#2D004B'` is the ink. Fonts load from Google Fonts in
`website/index.html` (Quicksand, Montserrat, Caveat).

**Outside the app.** A search of `supabase/` and `whatsapp-flows/` for the three
main brand hexes found nothing. That search does not establish that email or
WhatsApp templates carry no branding; it establishes only what was searched.

**Assumptions, not yet verified.** That no dark mode exists (no `dark:` variants
were found in `.jsx`). That `.design-sync` is still in use and worth re-syncing.

## Desired behaviour

- Ink, headers and body text read as charcoal rather than purple everywhere.
- Links and informational accents use a deep sky blue that passes contrast; the
  bright sky blue appears only as a surface or illustration colour.
- The primary action stays sun yellow with dark ink, as now.
- Headings use Poppins, matching the logo. Body text stays Montserrat.
- Staff and customer sign-in use the split layout from the approved mock-up:
  brand panel (roundel, headline, marble and slats) beside a solid cream card.
- The customer portal reads as warm and bright: cream paper, sky bands, and the
  "blue skies inside" voice in **confirmed-empty** states only. Loading states
  say plainly that the app is still checking.
- Staff working screens change only in their chrome (header, buttons, cards).
  Status, size and safety colours are pixel-identical to today.
- Every logo placement uses an SVG: roundel for brand moments at 64px and above,
  small roundel below 64px, lockup for wide headers, silhouette for motifs.

### Token mapping (starting values; tune by eye in step 2)

| Token | Now | New | Note |
|---|---|---|---|
| `--color-brand-purple`, `--color-ink`, `--color-sd-navy` | `#2D004B` | `#1F1F1F` | 14.5:1 on cream |
| `--color-brand-purple-light`, `--color-sd-navy-soft` | `#5B3D80` / `#43326C` | `#4A4A4A` | |
| `--color-brand-cyan`, `--color-sd-cyan` (text, links) | `#007AAB` | `#2A62A8` | 5.4:1 on cream, 6.2:1 on white |
| `--color-brand-cyan-dark` | `#005986` | `#1F4E8C` | |
| `--color-brand-cyan-light` (surfaces only) | `#10C2FC` | `#5595DC` | sampled from the mood board; never body text |
| `--color-brand-paper`, `--color-sd-paper` | `#FAF9F6` | `#F7EFE6` | recheck `--color-sd-ink-light` |
| `--color-sd-sky-tint` | `#EAF6FF` | retune to the new sky | |
| `--shadow-sd-card*` | purple-tinted | neutral black | |
| `--sd-lavender-tint` | `#F3EDFB` | neutral cloud tint | promote to a token |
| Yellow, coral, teal, green scale, size dots, WhatsApp, status tones | — | **unchanged** | functional, tested, load-bearing |

Measured contrast that constrains the design: mood-board sky `#5595DC` as text on
cream is 2.75:1 and white on that sky is 3.13:1. Both fail WCAG AA (4.5:1 for
body text; 3:1 for large text). Hence two blues.

## Scope

- Token values in `src/index.css` and the `--sd-*` block in `customer-portal.css`.
- Display font swap: Quicksand → Poppins (self-hosted woff2, weights 600 and 700).
- Barlow Condensed (one heavy weight, self-hosted) for hero lines on auth and
  portal only.
- Staff app icon replaced with the dog (see Recorded decisions).
- A shared auth shell used by the three auth pages.
- Customer portal and booking wizard surfaces.
- Staff chrome: `AppToolbar`, `PageHeader`, `Button`, `Card`.
- SVG logo set in `public/app/` and `website/public/assets/`; `og:image`,
  `theme-color`, manifest colours, touch icons.
- Hardcoded-hex sweep, token rename, Caveat removal, `.design-sync` re-sync.
- Website: `colors.js`, font link, logo files.

## Non-goals

- No change to `BookingStatusBadge` tones, `STATUS_DISPLAY`, size colours,
  `SafetyAlertChip`, or any colour that carries operational meaning. That
  explicitly includes every use of `#0099BD` listed under Current behaviour.
- No dark or "moody" theme for staff working screens.
- No change to the Montserrat body font.
- No routes, data flow, capacity rules, permissions, RPCs, Edge Functions,
  migrations or copy that states policy.
- No restyling of the Cloudflare Turnstile widget beyond its `theme` option; it
  is a third-party iframe.
- Email, SMS and WhatsApp template branding — not authorised here; see Open
  questions.

## Relevant code

| Path | Why |
|---|---|
| `src/index.css` | All `@theme` tokens, `@font-face` rules, surface tokens (`--color-surface-*`) |
| `src/customer-portal.css` | Portal variables, gradients, top nav, lavender tint |
| `src/components/auth/LoginPage.jsx`, `CustomerLoginPage.jsx`, `ResetPasswordPage.jsx`, `DogSilhouetteScatter.jsx` | Auth shell work; the scatter is replaced |
| `src/components/auth/*.component.test.jsx` | Must stay green through the shell extraction |
| `src/components/layout/AppToolbar.jsx` (mask at lines 19–30) | Logo recolours itself on the token swap; swap PNG mask for SVG |
| `src/components/customer/CustomerDashboard.jsx` (line 220) | Portal top-nav logo |
| `src/components/ui/index.js` and the 26 barrel exports | UI kit; `.design-sync` scope |
| `src/components/ui/BookingStatusBadge.tsx` | **Do not change.** Cited as the constraint on staff surfaces |
| `src/constants/salon.ts` (line 333), `src/components/modals/shell/alertTints.js` (line 11), `src/constants/brand.ts` | **Do not change.** `#0099BD` is an alert colour, its tint lookup key and the size fallback — the step 8 sweep allowlists them |
| `vite.config.js` (line 40) | Service worker precaches `js, css, html, svg, png, woff2`. Read-only here: it explains the image-format choices in steps 3 and 5. Do not edit it in this plan (it is in the Vite 8 upgrade's blast radius) |
| `index.html` (lines 8, 26, 34) | `theme-color`, `og:image`, `twitter:image` |
| `public/app/manifest.json` | `theme_color`, `background_color`, icons |
| `.design-sync/NOTES.md`, `conventions.md` | Hand-built CSS bundle must be rebuilt when colours or fonts change; conventions name the old fonts and pairing |
| `website/src/constants/colors.js`, `colors.test.js` | Website palette and its test |
| `website/index.html` (lines 10–17) | Google Fonts link |
| `website/src/components/sections/Navigation.jsx`, `FooterSection.jsx`, `LandingPopup.jsx`, `hooks/useRouteSeo.js`, `constants/links.js` | Logo references |

## Architecture

No component boundaries change. The source of authority for colour and type
remains `@theme` in `src/index.css`; the portal's `--sd-*` variables keep
aliasing it. The website keeps its own palette file per ADR 009 — values are
aligned by hand, not shared by import.

Three surface tiers govern how much brand each screen carries:

| Tier | Screens | Treatment |
|---|---|---|
| Shopfront | Sign-in, reset, booking entry | Full brand: marble photo (desktop only), CSS slats, condensed headline, roundel |
| Reception | Customer portal, booking wizard | Cream paper, sky bands, sun actions; ceiling-grid motif as the loading skeleton and as decoration on confirmed-empty states |
| Grooming room | Staff app | Charcoal header, sun buttons; everything else light and unchanged |

Motifs are CSS wherever possible (ceiling grid, slats, checkerboard divider).
The only photographic asset is one marble image, AVIF with a JPEG fallback,
loaded at `lg` and above on auth pages, always under a solid card.

## Data/database changes

None.

## API changes

None.

## UI changes

- **Auth shell:** two columns at `lg`+, single column below with the brand panel
  collapsed to roundel and one headline line. Card is solid cream; no text sits
  directly on marble. Focus order: email, password, Turnstile, submit, forgot
  password, back link. Existing error and unavailable states keep their wording.
- **Portal:** gradients retuned to sky and sun; past-appointment tint moves to a
  neutral token.
- **Loading, empty and error are three different states and must never share
  copy.** Loading shows a skeleton (the ceiling-grid tiles may be the skeleton's
  shape) with a plain "Loading…" label for assistive technology. "Nothing
  booked. Blue skies." appears only after the request has **succeeded and
  returned zero rows**. A failed or timed-out request shows the existing error
  wording, never the empty-state copy. On a slow connection the app must not
  tell anyone "nothing booked" when it simply has not found out yet.
- **Staff chrome:** header and primary ink become charcoal through the token;
  no layout change.
- **Accessibility:** every new text/background pair is checked at 4.5:1 (3:1 for
  large text). Status continues to be communicated by word, not colour alone
  (`REQ-A11Y-001`). `prefers-reduced-motion` is respected by any ceiling-grid
  animation.

## Security/privacy considerations

No authentication, authorisation or data handling changes. New fonts are
self-hosted in the booking app, so no new third-party request is introduced
there. The website already calls Google Fonts; swapping the family list does not
change that posture. No customer data appears in any asset or screenshot
committed under `docs/ux/captures`.

## Dependencies

- **Logo SVG set** — approved 2026-09-20. Five files: roundel, small roundel,
  lockup black, lockup white, silhouette. See Recorded decisions.
- **Conflict: [domain routing plan](2026-09-10-smarterdog-domain-routing.md)**
  (Draft) owns `public/**`, `index.html` asset paths and the `/app/` prefix.
  Every step here that touches `public/**` or `index.html` — **step 3** (logos,
  icons, manifest, `theme-color`, `og:image`), **step 4** (font files) and the
  marble image in **step 5** — lands wholly before or wholly after that
  cutover; do not interleave. Step 2 is deliberately kept clear of those paths
  so it can land at any time. The website work in step 9 is sequenced with the
  domain-routing plan's own `website/**` changes in the same way.
- **Conflict: [major-version upgrades](2026-09-02-major-version-upgrades.md)**
  (Active). The Vite 8 pull request is described there as "the risky one". Do not
  have the token swap or the font swap open at the same time as it; a styling
  regression would be impossible to attribute.
- **External:** a photograph of the salon's real marble panel, taken square-on
  in even light. Until it exists, the auth shell ships with a flat charcoal panel.

## Risks

| Risk | Likelihood / impact | Detection and mitigation |
|---|---|---|
| Token value swap makes a staff screen harder to read | Low / high | Before-and-after captures of the key routes; owner reviews Today on the salon's actual device before merge |
| Cream paper drops `--color-sd-ink-light` below 4.5:1 | High / low | It was tuned to 4.53:1 on the current paper. Recompute and darken in the same pull request |
| Poppins is wider than Quicksand; headings wrap or truncate | Medium / medium | Check `PageHeader`, toolbar, modal titles and the wizard at 360px width |
| 228 hex literals leave purple or cyan islands after the swap | High / low | Step 8 sweep; grep for the old hexes must return zero in non-test source |
| Token rename breaks the six tests that assert `brand-purple` | Certain / low | Rename is its own pull request and updates those tests in the same change |
| Website and app drift apart visually during rollout | Medium / medium | Ship the website palette change in the same week as step 2 |
| Marble image hurts load time on sign-in | Medium / medium | Desktop only, AVIF, explicit dimensions, `fetchpriority="low"`; flat colour on mobile |
| Scope creep into staff-screen redesign | Medium / high | Non-goals above; stopping after step 6 is a complete, shippable state |

## Migration/rollout

Presentational only, so rollout is ordinary pull requests through the existing
checks to Vercel, one step at a time. No flags. Rollback for any step is a revert
of that pull request; step 2 is a handful of lines by design so that the revert
is trivial. The website deploys through its own workflow per ADR 009.

Approval points: the owner signs off the tuned token values at the end of step
2, and the auth shell on a real phone at the end of step 5.

## Implementation sequence

Serial unless marked. Each step is one pull request.

1. **Baseline.** Capture current screenshots of sign-in (staff and customer),
   portal home, booking wizard, Today, Dogs, Inbox and one modal at 390px and
   1440px into `docs/ux/captures/2026-09-brand-before/`. Open the GitHub issue
   and link it above. No code change.
2. **Token value swap.** Edit values only in `src/index.css` and the `--sd-*`
   block of `customer-portal.css` per the mapping table. Keep every token
   **name**, so all six class-name tests stay green. Neutralise shadows. Recheck
   `--color-sd-ink-light`. **This step touches exactly two CSS files and nothing
   under `public/**` or `index.html`**, so it cannot collide with the
   domain-routing work. *Hand-off: owner tunes values by eye.*
3. **Logo files.** Add the five master SVGs to `public/app/logos/`, on default
   caching: `/app/(fonts|icons|images)/` is `immutable` for a year and these are
   unversioned filenames we may legitimately replace. Widening that rule is
   deliberately **not** done here — `vercelRouting.test.ts` rejects nested
   capturing groups, and routing stays untouched in this step. Point
   `AppToolbar`'s mask, `CustomerDashboard` and the auth pages at them. Replace
   the calendar-and-paw app icon: white dog on a full-bleed square in the logo's
   black (`#000000`, to match the roundel, not the interface charcoal), dog
   at 80% of the canvas; regenerate `icons/*` and `apple-touch-icon.png` from it.
   The manifest's `purpose` stays **`"any"`**, as it is today, and the
   `"maskable"` entry the first draft called for is **deferred** — measured, at
   80% the dog's extremities reach 267.9px from centre against a 204.8px safe
   radius, so 9.17% of its ink falls outside the strict maskable circle. Making
   the declaration honest needs the dog at roughly 61% of the canvas, which is
   visibly smaller on a home screen, or a second render target sized for
   masking. That is a design decision, not an implementation detail; see Open
   questions. Full-bleed is load-bearing: `render-icons.mjs` screenshots with
   `omitBackground: true`, so any corner radius on the source becomes a
   transparent corner in every PNG — exactly what a maskable icon must not have.
   The browser favicon becomes a **rounded square**, not the small roundel — see
   Recorded decisions. Update `theme-color` in `index.html` and `theme_color` /
   `background_color` in `manifest.json` here, not in step 2. Note that on an
   installed iOS PWA the status bar is driven by
   `apple-mobile-web-app-status-bar-style` (`index.html:10`), not by
   `theme-color`. Confirm each SVG's path bounds sit inside its `viewBox`.
   *Domain-routing sensitive — see Dependencies.*

   **Open Graph.** The preview image moves out of `/app/`, which the published
   `robots.txt` disallows, to `website/public/og-booking-2026.png`, served at the
   deployment root. Verified by running the combined build: it survives the merge
   as a real `PNG image data, 1200 x 630` and is crawlable. It is referenced by
   absolute URL, because the booking app has no `og:url` for a relative path to
   resolve against — and gains one here.

   | Meta | Value |
   |---|---|
   | `og:url` | `https://smarterdog.co.uk/book` |
   | `og:image` | `https://smarterdog.co.uk/og-booking-2026.png` |
   | `og:image:width` | `1200` |
   | `og:image:height` | `630` |
   | `og:image:type` | `image/png` |
   | `twitter:image` | `https://smarterdog.co.uk/og-booking-2026.png` |

   `og:url` is the customer portal's canonical entry: `CUSTOMER_BASENAME` in
   `entrypoints.ts`, apex host, matching the website's own canonical. The
   filename is **versioned** because social caches are sticky — a future
   replacement becomes `og-booking-2027.png`, never an overwrite of this file.
   The name must not begin with a disallowed prefix: `robots.txt` matches by
   prefix, so `/booking-og-2026.png` would be blocked by `Disallow: /book`, which
   is the same bug in a new place.

   What this achieves, precisely — **step 3 does not fix link previews
   universally**:

   - The OG image is moved to a crawlable, correctly served root asset.
   - The OG metadata becomes internally correct and complete.
   - Platforms that fetch `/book` can now retrieve the image successfully.
   - Platforms that honour the current `Disallow: /book` may still not unfurl the
     page at all.

   `robots.txt` is **not** changed in this step. Whether `/book` should be
   crawlable is a separate decision — see Open questions.

   **Guards.** Two, both new:

   - *Dangling references.* A test resolving every asset URL in `index.html` and
     `manifest.json` against the filesystem. A wrong path does not 404:
     `vercel.json`'s catch-all rewrite returns the marketing homepage with HTTP
     200, and under `/app/(fonts|icons|images)/` that response is then cached
     `immutable` for a year at the wrong URL, unfixable at the same filename. The
     guard stops the reference being committed; it cannot change what the
     platform does with one.
   - *Icon drift.* `icons.lock.json`, written only by `render-icons.mjs`,
     recording the source SVG's SHA-256, the Chromium and Playwright versions
     used, and every output PNG's SHA-256 and dimensions. `npm run check:icons`
     verifies the source hash, each output hash and each dimension — no
     dependencies, so it runs in `lint` — and in CI, where Chromium is present
     and its build matches the recorded one, re-renders and byte-compares.
     Rendering is byte-deterministic for a fixed Chromium build (verified: three
     renders in one process and one after a restart gave an identical SHA-256).
     Be honest about the split: the hash checks are *tamper-evident*, proving
     these PNGs were recorded against this SVG by the generator; only the CI
     byte-compare *proves* the pixels depict the SVG. `render-icons.mjs`'s
     hardcoded Chromium path — and its undocumented `PW_CHROMIUM_PATH` variable —
     are fixed to fall back to Playwright's own resolution so CI can perform that
     proof.

   **Ordering inside the pull request**, because a dangling reference is
   expensive: add every new file first; rewrite `app-icon.svg` and run
   `render-icons.mjs` in the same commit; update references only once the files
   exist; delete superseded assets last.
4. **Fonts.** Add Poppins 600/700 and Barlow Condensed 800 woff2 to
   `public/app/fonts/` with their `@font-face` rules (`font-display: swap`).
   Repoint `--font-display` to Poppins and introduce `--font-hero` for Barlow
   Condensed (Tailwind v4 then provides the `font-hero` utility). Remove the
   Quicksand faces once nothing references them. The new woff2 files are
   precached by the service worker, which is wanted.
   Can run in parallel with step 3. *Domain-routing sensitive (adds files under
   `public/app/fonts/`) — see Dependencies.*
5. **Auth shell.** Extract one shell component; migrate `LoginPage`, then
   `CustomerLoginPage`, then `ResetPasswordPage`. Remove `DogSilhouetteScatter`
   when its last consumer goes. Keep `ScribbleUnderline`, recoloured sun. Hero
   lines use `font-hero`. **Marble:** if the approved salon photograph exists,
   add it as AVIF with a JPEG fallback under `public/app/images/` (neither
   format is precached by the service worker); otherwise ship the flat charcoal
   panel and add the image later as its own small pull request. *Domain-routing
   sensitive only if the image is added — see Dependencies.*
6. **Customer portal and wizard.** Retune gradients and section bands, promote
   the lavender tint to a neutral token, add the ceiling-grid loading skeleton
   and the confirmed-empty states (see UI changes for the rule separating them). **Natural stopping point: customers now see the whole brand.**
7. **Staff chrome.** `AppToolbar`, `PageHeader`, `Button`, `Card` only.
8. **Cleanup.** Hex sweep across `.jsx .tsx .js .ts .css .html` in `src/`,
   `index.html` and `website/`, moving decorative literals (`#10C2FC` and any
   stray purple) onto tokens and **leaving the `#0099BD` allowlist alone**.
   Then rename with a codemod that covers CSS as well as components
   (`--sd-navy` alone has 53 references in `customer-portal.css`), updating the
   six tests in the same change:

   | Old | New | Role |
   |---|---|---|
   | `brand-purple` | `brand-ink` | ink and dark surfaces |
   | `brand-purple-light` | `brand-ink-soft` | |
   | `brand-cyan-light` | `brand-sky` | bright sky — surfaces only, never body text |
   | `brand-cyan` | `brand-sky-text` | accessible blue for text and links |
   | `brand-cyan-dark` | `brand-sky-dark` | hover and borders |
   | `sd-navy` / `sd-navy-soft` | `sd-ink` / `sd-ink-soft` | reads as a ramp with the existing `sd-ink-light` |

   The sky family deliberately mirrors the existing teal family
   (`brand-teal`, `brand-teal-text`, `brand-teal-dark`), where `-text` already
   means "the variant that passes contrast at body size" and has 75 uses.
   Rename the **longest names first** (or match on word boundaries):
   `brand-cyan` is a substring of `brand-cyan-light` and `brand-cyan-dark`.
   Also remove
   Caveat (`@fontsource/caveat`, the import and the token) after confirming zero
   references; rebuild the `.design-sync` CSS bundle per its `NOTES.md` and
   update `conventions.md`.
9. **Website** (parallel from step 2 onwards, separate pull requests):
   `colors.js` and its test, Google Fonts family list, SVG logos in
   `website/public/assets/`, replacing the 570 KB `logo-icon.png`.

## Testing

- Every step: `npm run typecheck`, `npm run lint`, `npm test`, `npm run e2e`.
- Step 2: confirm the six `brand-purple` tests pass unchanged — that is the proof
  that only values moved.
- Step 5: `LoginPage.component.test.jsx` and `CustomerLoginPage.component.test.jsx`
  pass without weakening any assertion; keyboard-only sign-in walked by hand.
- Step 8, source: this returns nothing outside tests —
  `grep -rEi --include=*.{jsx,tsx,js,ts,css,html} -e '#(2D004B|5B3D80|43326C|10C2FC|007AAB|005986)' src index.html website/src website/index.html`
- Step 8, allowlist: `grep -rni '#0099BD' src` returns **exactly** the same six
  lines in five files as at `8816f06` (`salon.ts`, `alertTints.js`, `brand.ts`
  twice, `BookingCardNew.jsx`, `DogSearchSection.jsx`).
- Step 8, built output: after `npm run build` and `npm run website:build`, the
  same first pattern returns nothing in `dist/**/*.css` or
  `website/dist/**/*.css`. This is the check that matches the Definition of
  done; the source grep alone is weaker than the promise.
- Step 8, names: `grep -rE 'brand-(purple|cyan)|sd-navy' src website/src`
  returns nothing.
- Step 9: `npm run website:lint`, `website:test`, `website:build`.
- Contrast: recompute every changed text/background pair; record the ratios in
  the pull request description.
- Not available: automated visual regression. No screenshot assertions exist, so
  visual review is manual against the step 1 captures. Adding Playwright
  screenshot tests is a reasonable follow-up but is not part of this plan.

## Observability

Presentational change; no new telemetry. Evidence of success is the before and
after captures plus the recorded contrast ratios. Watch Sentry for a rise in
front-end errors after steps 4 and 5 (font loading and the auth shell are the
only steps that change markup on a critical path).

## Documentation updates

- `.design-sync/conventions.md` — fonts, the ink pairing, token names.
- `.design-sync/NOTES.md` — note the rebuilt bundle and removed Caveat wiring.
- `CHANGELOG.md` — one entry per shipped step.
- `CLAUDE.md` / `AGENTS.md` — only if they name the old tokens or fonts; check.
- A short `docs/ux/brand-tokens.md` recording final values, the two-blues rule,
  the three surface tiers and the logo usage rules (roundel ≥64px, small roundel
  below, lockup for wide headers, silhouette for motifs; clear space of one ear
  height). Master logo files keep explicit `#000000` / `#ffffff` fills so they
  survive email clients, printers and signage tools; the app recolours through
  CSS masks, so no `currentColor` variant is needed.

## Definition of done

- No purple or old brand-cyan value remains in non-test source or in either
  application's built CSS. The one exception is the allowlisted `#0099BD`,
  which is a functional alert and size-fallback colour, not a brand colour.
- Headings render in Poppins; the logo and headings share a typeface.
- All in-app and website logo placements use SVG; social and link previews use
  the generated 1200×630 raster artwork.
- Every changed text/background pair is recorded at or above WCAG AA.
- `BookingStatusBadge`, size, alert and safety colours are byte-identical to
  `8816f06`.
- All checks green on each merged pull request; the owner has signed off steps 2
  and 5 on real devices.
- Website and booking app show the same palette and logo.
- `.design-sync` re-synced; documentation above updated; this plan moved to
  `completed/` with links to the pull requests.

## Open questions

1. **Marble:** the mock-up shows white marble; the salon's real wall is dark grey
   with white veining. This plan assumes the real panel. Owner to confirm.
2. ~~Condensed headline face~~ — decided 2026-09-20; see Recorded decisions.
3. ~~Staff PWA icon~~ — decided 2026-09-20; see Recorded decisions.
4. **"Blue skies" copy** for empty states — owner to approve wording.
5. **`/book` crawlability — follow-up, not step 3.** The published `robots.txt`
   carries `Disallow: /book`, so platforms honouring it never fetch the page and
   never read its Open Graph tags, whatever the image path. Step 3 deliberately
   does not change `robots.txt`. Two things to settle separately: whether the
   booking landing page should be crawlable at all, and — if `/book` is
   disallowed for privacy — that **`robots.txt` is not a privacy boundary**. It
   is a request to well-behaved crawlers and protects nothing; anything relying
   on it for confidentiality needs a real control, and that rationale should be
   revisited on its own terms.
6. **Maskable app icon.** Step 3 ships the dog at 80% of the canvas with
   `purpose: "any"`, unchanged from today. A `"maskable"` entry would guarantee
   the icon survives any Android mask shape, but the safe zone is a circle of
   80% diameter and 9.17% of the dog's ink currently sits outside it. The
   options are a smaller dog (about 61% of the canvas, noticeably reduced on a
   home screen) or a second, separately-scaled render target. Owner to choose.
7. **Email, SMS and WhatsApp templates:** do any carry the old colours or logo?
   Not searched beyond `supabase/` and `whatsapp-flows/`. Needs a look before
   the brand can be called consistent; out of scope here.
8. **"Grooming Salon" subline weight** in the lockup is set in Poppins SemiBold
   as a best reading of a small, soft raster. Owner to eyeball against print.

## Recorded decisions

2026-09-20, owner:

- The black roundel is the main logo. The horizontal lockup and the bare
  silhouette are also official; use whichever fits the space.
- The SVG set is approved. No original vector exists, so the dog is a trace of
  the 894×1024 raster (50 curves, within about 0.3% of the source). Text is
  Poppins converted to outlines (SIL Open Font License).
- The dog is set **5% wider** than the traced source, and upright, identically
  in all five files. The older raster logos disagreed with each other (roughly
  5% and 7% wider, one tilted about 3°); this replaces all of them with one
  consistent drawing.
- **Hero typeface: Barlow Condensed**, one heavy weight (800), self-hosted, SIL
  Open Font License. Chosen over Anton, which ships a single weight and whose
  poster voice competes with the dog and with Poppins. Hierarchy: Poppins for
  headings, Montserrat for body and interface, Barlow Condensed for occasional
  hero lines only. A side-by-side on the real sign-in page in step 5 tunes the
  size and weight; it does not reopen the choice.
- **Staff app icon: the dog replaces the calendar-and-paw.** Only `/staff/`
  installs as an app, so there is no customer icon to confuse it with. Built as
  a white dog on a full-bleed black square (phones mask the corners, so a
  circle inside a square would waste them). ~~The small roundel stays the browser
  favicon.~~ — superseded 2026-09-22, below.

2026-09-22, owner:

- **The browser favicon is a rounded square, not the small roundel.** The circle
  costs the dog too much room at favicon size: measured, the dog is 10.2px tall
  at a 16px canvas inside the roundel (63.9% of its viewBox) against 14.0px in
  the square (87.5%). It also removes an inconsistency this plan would otherwise
  have created — `index.html` offers the SVG favicon *and* the 192/512 PNGs as
  `rel="icon"`, and those PNGs are square, so some browsers would have shown a
  circle and others a square. The small roundel keeps its other jobs.
- **Provenance of that favicon, recorded deliberately.** The file was generated
  or modified by Claude at the owner's request. It uses the same approved dog
  geometry as the five masters — verified identical, aspect ratio 0.9150 in the
  square, the roundel and the silhouette alike — scaled up and otherwise
  untouched, so the frozen-proportions rule holds. The owner approved the square
  treatment after a 16px/32px geometry comparison. The file arrived carrying an
  embedded C2PA manifest (`com.anthropic.claude.provided`); it was **stripped
  before shipping**, taking the file from 9,754 to 2,018 bytes, because no
  browser consumes it and a favicon is fetched on nearly every page load and
  precached to every installed device. This record replaces it.
- **The Open Graph image moves out of `/app/`** to a versioned, crawlable root
  asset, and `og:image` becomes an absolute URL. The old `/app/logo.png` could
  never be fetched by any crawler honouring `robots.txt`. Format is **PNG**, not
  the JPEG the first draft specified: the asset now lives in the website's
  `public/`, outside the booking app's service-worker precache, so the reason
  for avoiding PNG no longer applies.

## Revisions

**2026-09-20, after an external review of the first draft.** Previous reasoning
is preserved above where it still stands; changes are:

- *Sequencing fix.* `theme-color` and manifest colours moved from step 2 to
  step 3. The first draft warned against interleaving `public/**` and
  `index.html` changes with the domain-routing cutover, then put exactly such a
  change in step 2. The same warning now also covers step 4 (font files under
  `public/app/fonts/`) and the marble image, which the first draft missed.
- *Loading is not empty.* The first draft carried the "blue skies" voice into
  loading states. That could tell someone "nothing booked" on a slow connection
  before the data had arrived. Loading, empty and error are now separated.
- *Logo file defect fixed.* The standalone silhouette's `viewBox` was sized from
  the source's pixel bounds, but the smoothed curve bulges about 1.4 units past
  that on the left and 1.0 on the right, so the file clipped slightly. The
  artwork is now repositioned inside a canvas measured from the true curve
  bounds; the shape is unchanged. The lockups sat exactly flush to their canvas
  and now have a 0.1-unit margin. All five files are bounds-checked.
- *Recommendations recorded* for the condensed face (Barlow Condensed) and the
  staff app icon (the dog, full-bleed). **Both accepted by the owner later the
  same day** and moved to Recorded decisions; step 3 and Scope updated to match.

**2026-09-20, second external review.** Four edits and a wording fix accepted;
two were changed on the way in after checking the repository.

- *Step 4 now installs Barlow Condensed* and introduces `--font-hero`. It was in
  Scope and Recorded decisions but missing from the step that does the work.
- *Rename mapping made semantic.* The first draft renamed `brand-cyan` to
  `brand-sky`, which would have put the name "sky" on the text blue. The review
  proposed an `-ink` suffix; the repository already has a convention for this
  (`brand-teal-text`), so the sky family follows it instead of adding another
  "ink". `sd-navy` is retired as proposed.
- *Sweep widened to all source types, both applications and the built CSS*, so
  the test is as strong as the Definition of done. **Checking this found that
  `#0099BD` is not a brand colour at all**: it is an alert colour, that alert's
  tint lookup key, and the size fallback. A blind sweep would have changed a
  safety colour and could have broken the tint lookup, both against this
  plan's own non-goals. It is now allowlisted and tested as unchanged. The
  first draft's "17 old-cyan literals" lumped the two hexes together.
- *Marble is now an explicit action in step 5*, under `public/app/images/`.
- *Social preview saved as JPEG* and marble as AVIF/JPEG, because the service
  worker precaches PNGs; `vite.config.js` is deliberately not edited.
- *Definition of done* reworded: SVG for logo placements, raster for previews.

**Plan frozen after this revision.** Further changes come from discovery during
implementation, not from more review.

**2026-09-20, step 1 execution.** Three notes recorded when the baseline was
captured and this plan was committed:

- *Base updated* to `87c6fe47` (above); the plan's token counts and the
  `#0099BD` allowlist were re-verified there and match this document.
- *Sign-in captures came from production.* The offline sample-data build
  cannot render the staff login (its route guard admits the app directly),
  and its test Turnstile key prints a "for testing only" banner. Production
  deploys from `main`, so the pages are equivalent; no login was performed.
- *Portal home and the customer booking wizard are not in the baseline set.*
  The customer portal has no offline/sample-data path (`CustomerDashboard`
  fetches dogs, bookings and trusted humans internally, and the customer
  route guard has no offline allow), so those two captures need an
  authenticated customer session and follow separately.


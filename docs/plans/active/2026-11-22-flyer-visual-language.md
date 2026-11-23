# Flyer visual language for the web app

Status: Active (steps 1 and 2 merged in #1259 and #1261; step 3 in review)
Issue: [#1262](https://github.com/leamonline/Smarter-dog-bookings/issues/1262) (raised 22 November 2026, during step 2 review)
Base: `claude/vibrant-gates-wqx9lv` at `1936a62` (`main` merge of #1248) for step 1; `17a673b` for step 2
Last verified: 2026-11-22
Owners: `docs/ux/**`, `src/index.css`, `src/customer-portal.css`, `src/constants/statusPalette.ts`, `src/components/ui/**`, `src/components/customer/**`, `src/components/auth/**`, `public/app/fonts/**`, `.design-sync/**`
Dependencies: None in-repo. Builds on the [brand reskin](2026-09-20-brand-reskin.md) palette and the [design-system components and tokens](2026-10-25-design-system-components-and-tokens.md) work.
Related requirements: `REQ-A11Y-001`
Related ADRs: [ADR 009](../../architecture/decisions/009-independent-applications-in-one-repository.md). The website and the iPhone app follow in their own codebases; nothing is shared at code level.

## Goal

The staff dashboard and the customer portal share one visual language taken from
the salon's printed flyer (cream paper, charcoal, sky blue, sun yellow, the
segmented stripe, the yellow swash, the mascots and taped polaroids), at the same
level of boldness on both sides, while every screen staff work in all day stays as
readable and as fast to scan as it is today. No booking, capacity, messaging or
data behaviour changes.

## Why

The flyer and the in-salon branding have a strong, recognisable personality. The
app shares the flyer's colours and fonts after the September reskin but almost
none of its character. The owner asked for a combination of three references (the
flyer, the current staff dashboard and the current booking wizard) and settled 13
decisions in an interview on 22 November 2026. A style board with real values,
contrast checks and mock-ups was reviewed and approved the same day (private
claude.ai artifact owned by the salon owner, `B1Rb3Z36VdF2eLgZFMHhPC`).

## Approved decisions

Numbered as settled, so later changes can cite them.

1. **Equally bold.** Customer portal and staff dashboard get the same personality.
2. **Soft paper surfaces.** Cream page on every screen, the staff calendar
   included. White rounded cards with soft shadows. Buttons stay pills.
3. **Heavy type for heroes only.** Poppins 900 for sign-in, step titles,
   confirmations and empty/done states. Staff page titles stay Poppins 700.
4. **Motifs.** The segmented stripe, the yellow swash and the mascots come in.
   The checkerboard stays out.
5. **Blue as brand partner.** Yellow still means "press this" and nothing else.
   Brand blue marks the active tab, selected items and links.
6. **Statuses re-tuned.** One hue per status in the flyer's flatter, warmer print
   style. Confirmed moves to periwinkle so it can never read as "selected".
7. **Only Large stands out.** Small and Medium become neutral letter chips; Large
   gets a navy chip and a navy card edge. Small and Medium cost the same seat in
   the capacity engine; only Large changes what a slot holds.
8. **Where staff screens get bold.** Sign-in, page titles (with the swash), and
   true empty or done states. Calendar rows, day-stack strips, inbox threads and
   the side panels stay plain.
9. **Polaroids and handwriting.** A dog's own photo gets a taped polaroid frame
   where it is the hero (customer Your dogs, booking confirmed, staff dog profile
   header), never in lists. One handwritten line per hero screen, in **Caveat**
   (chosen over a brush script and three other handwriting faces).
10. **Motion only on hero moments.** The swash draws in, a polaroid settles, a
    mascot bounces once. Off under `prefers-reduced-motion`. Working screens and
    loading states never move.
11. **Copy.** Flyer wit in hero lines. Labels, instructions and errors stay plain
    and specific, as today.
12. **Scope.** Web app first; the website, the iPhone app and emails follow the
    same values afterwards.
13. **Style board first.** Done and approved.

## Current behaviour

Verified on the base commit.

- Palette tokens live in `src/index.css` `@theme`. Paper `--color-brand-paper`
  `#F7EFE6`, ink `--color-brand-ink` `#1F1F1F`, action `--color-brand-yellow`
  `#FECC13`, blues `--color-brand-cyan-light` `#5595DC`, `--color-brand-cyan`
  `#2A62A8`, `--color-brand-cyan-dark` `#1F4E8C`, sky tint `--color-sd-sky-tint`
  `#EAF4FF`.
- The selected/accent border is charcoal: `--color-border-accent:
  var(--color-brand-ink)`, asserted by `src/designTokens.a11y.test.ts`.
- Status colours have one source, `src/constants/statusPalette.ts`
  (`STATUS_TONES`, `UNKNOWN_STATUS_TONE`). `STATUS_DISPLAY` in
  `src/constants/salon.ts` adapts the same tones (`solid` = ink, `onSolid` =
  tint). Contrast is enforced in
  `src/components/ui/BookingStatusBadge.component.test.tsx` (text 4.5:1, edge
  against tint 1.8:1), and that file asserts there is no second status palette.
- Size colours: `--color-size-small` `#F5C518`, `--color-size-medium` `#2D8B7A`,
  `--color-size-large` `#E7546C`, read by `SizeDot` and `SizeTag`.
- Fonts are vendored from `@fontsource` 5.3.0 into `public/app/fonts/`: Poppins
  600 and 700, Montserrat 400 to 700, Barlow Condensed 800 (`--font-hero`). Caveat
  700 is imported from `@fontsource/caveat` but no component uses it. The PWA
  precaches every `woff2` (`vite.config.js` `globPatterns`).
- Mascot artwork exists only in the website app:
  `website/public/assets/icons/*.webp`, 250×250 raster. Bath & Brush is
  `maintenance-groom.webp`. Sharp up to about 120px on screen.
- `docs/ux/design-system.md` currently forbids checkerboard decoration, extra
  illustration and branded loading effects, freezes status and size colours, and
  calls Caveat a retained legacy token.

## Desired behaviour: exact values

All text pairs below were measured with the same formula the repository tests use.

### Palette roles (no new colours)

| Role | Token today | Value | Job after this plan |
|---|---|---|---|
| Paper | `--color-brand-paper` | `#F7EFE6` | Every page background, staff calendar included |
| Card | white | `#FFFFFF` | Anything that holds information |
| Ink | `--color-brand-ink` | `#1F1F1F` | Text, strong buttons, focus ring (unchanged) |
| Action | `--color-brand-yellow` | `#FECC13` | Lead buttons only (unchanged) |
| Brand blue | `--color-brand-cyan` | `#2A62A8` | Links, active tab, selected ring and tick. 5.4:1 on paper, 5.5:1 on sky tint |
| Sky tint | `--color-sd-sky-tint` | `#EAF4FF` | Fill behind a selected item or active tab |
| Navy | `--color-brand-cyan-dark` | `#1F4E8C` | Stripe accent and Large dogs only. White on navy 8.3:1 |
| Flyer blue | `--color-brand-cyan-light` | `#5595DC` | Stripe and mascot circles. Decoration only: 2.8:1 on paper |

Focus stays charcoal. Selection moves from charcoal to brand blue, so
`--color-border-accent` and its assertion in `designTokens.a11y.test.ts` change in
the step that moves selection.

### Booking statuses (replaces `STATUS_TONES` values in place)

| Tone | tint | ink | meta | edge | ink on tint | meta on tint | ink on white | edge on tint |
|---|---|---|---|---|---|---|---|---|
| expected | `#F1E9DC` | `#3B3226` | `#5E5242` | `#B8A68A` | 10.4 | 6.3 | 12.6 | 1.97 |
| unconfirmed | `#FFDDC9` | `#5C2408` | `#7A3410` | `#E0662B` | 9.6 | 7.1 | 12.3 | 2.69 |
| confirmed | `#E4E4FB` | `#26266A` | `#3D3D8F` | `#7C80DC` | 10.7 | 7.4 | 13.4 | 2.81 |
| reconfirmed | same as confirmed | | | | | | | |
| arrived | `#D5EFE5` | `#0F3F2E` | `#1C5E46` | `#2E9D78` | 9.8 | 6.3 | 11.9 | 2.79 |
| ready | `#FCEAB0` | `#4A3500` | `#6B4D00` | `#D49A00` | 9.7 | 6.5 | 11.7 | 2.08 |
| noShow | `#F7D9D2` | `#5C1A10` | `#80281A` | `#C4442D` | 9.8 | 7.1 | 13.0 | 3.75 |
| cancelled | same as noShow | | | | | | | |
| collected | `#ECEDEF` | `#34383E` | `#575C63` | `#8E939A` | 10.1 | 5.8 | 11.8 | 2.64 |

Every pair clears the existing test floors (text 4.5:1, edge 1.8:1). Unconfirmed
keeps its inverted pill (tint on ink, same pair). `UNKNOWN_STATUS_TONE` does not
change, so bad data still stands out. Labels, `inStack`, ordering and every
transition stay as they are.

### Dog sizes

| Size | Today | After |
|---|---|---|
| Small | yellow `#F5C518` dot | white chip, 2px ink outline, ink letter S |
| Medium | teal `#2D8B7A` dot | white chip, 2px ink outline, ink letter M |
| Large | coral `#E7546C` dot | navy `#1F4E8C` chip, white letter L, navy 3px card top edge |

The size letter is always shown, so colour is never the only signal. Calendar
cards lose the size-coloured top edge except for Large.

### Type

| Role | Face | Size | Use |
|---|---|---|---|
| Hero | Poppins 900, tracking −3.5% | 44 to 64px | Sign-in, step titles, confirmations, empty and done states |
| Page title | Poppins 700, with swash underline | 26 to 28px | Every staff page (as today) |
| Card title | Montserrat 700 | 16px | Unchanged |
| Body | Montserrat 500 | 15px | Unchanged |
| Label | Montserrat 700 uppercase | 12px | Unchanged |
| Handwriting | Caveat 700 | 24 to 38px | One line per hero screen, blue or ink, rotated about −3° |

Poppins 900 is vendored from `@fontsource/poppins` 5.3.0 (`poppins-latin-900-normal`
7,632 bytes, `poppins-latin-ext-900-normal` 5,380 bytes; the same package's 700
files are byte-identical to the ones already in `public/app/fonts/`). Once heroes
use Poppins 900, Barlow Condensed (two files, 37,012 bytes) has no remaining use and is
removed.

### Motifs

- **Stripe.** Nine rounded segments copied from the flyer: blue, blue (double),
  yellow, blue, navy, blue (double), blue, blue, yellow. 16px tall on hero
  screens, 7px across the top of every staff and customer screen. Decorative,
  `aria-hidden`. Never inside content.
- **Swash.** Yellow brush underline under page and step titles; yellow
  highlighter behind one or two words on hero moments. Never behind a figure
  staff act on, never shaped like a button.
- **Polaroid.** White frame (10px sides, 34px foot), soft lift shadow, 2 to 4
  degree tilt, translucent yellow or blue tape (`--color-sd-tape-yellow` exists).
  Hero dog photos only.
- **Mascots.** One per bookable service: Full Groom (`full-groom`), Bath & Brush
  (`maintenance-groom`), Bath & De-shed (`deshedding`), Puppy Groom
  (`puppy-intro`). White 4px ring and soft shadow. Walk-in mascots (nail trim, ear
  clean, anal glands) appear only on the walk-in note, because walk-ins are not
  booked.
- **Handwriting.** Caveat 700. Never carries information a person needs: no
  names, dates, prices or instructions.

### Motion

| Move | Duration | Easing |
|---|---|---|
| Swash draws in | 420ms | `cubic-bezier(.3,.7,.4,1)` |
| Polaroid drops and settles | 520ms | `cubic-bezier(.2,.9,.3,1.25)` (slight overshoot) |
| Mascot bounces once | 600ms, starting at 260ms | `cubic-bezier(.3,.6,.3,1)` |

Only on hero moments, all three together at most. Every animation is removed
under `prefers-reduced-motion: reduce`; the finished frame shows instead.
Skeletons and loading states stay neutral and still.

## Scope

Web app only: staff dashboard (`/staff`) and customer portal (`/book`), the
design-system rules, tokens, fonts and shared UI components.

## Non-goals

- No change to booking, capacity, pricing, messaging, notifications or data.
- No dark mode.
- No checkerboard anywhere.
- No change to the safety colours (`SafetyAlertChip` and day-card safety words).
- No decoration inside calendar rows, day-stack strips, inbox threads or side
  panels.
- The marketing website, the iPhone app and email templates are later,
  separately planned work (decision 12). This plan does not authorise changes to
  `website/`, `ios/` or `supabase/functions/`.

## Relevant code

- `src/index.css`: tokens, fonts, `--font-hero`, `--color-border-accent`.
- `src/customer-portal.css`, `src/components/customer/booking/booking-wizard.css`:
  portal and wizard surfaces, the existing title underline.
- `src/constants/statusPalette.ts`, `src/constants/salon.ts` (`STATUS_DISPLAY`),
  `src/components/ui/BookingStatusBadge.tsx`: status colours.
- `src/components/ui/SizeDot.jsx`, `SizeTag`: size colours.
- `src/components/ui/EmptyState.jsx`: `mark="dog"` empty states.
- `src/components/layout/AppToolbar.jsx`: staff header, where the stripe and blue
  active tab go.
- `src/components/auth/**`: staff and customer sign-in.
- Tests: `src/designTokens.a11y.test.ts`, `src/designTokens.integrity.test.ts`,
  `src/components/ui/BookingStatusBadge.component.test.tsx`, the design-system
  ratchets under `src/designSystemHealth/`.

## Architecture

Pure presentation. Tokens stay in `src/index.css`; status colours stay in their
one file; new motifs become small shared components in `src/components/ui/`
(stripe, swash, polaroid, mascot) so no screen hand-rolls them. Staff and portal
CSS stay separate, as the design-system rules require.

## Data/database changes

None.

## API changes

None.

## UI changes

Described under Desired behaviour. Accessibility rules that must hold:

- The status word and the size letter are always rendered.
- Every text pair stays at or above 4.5:1; the existing tests enforce it.
- Decorative motifs (stripe, swash, polaroid tape, mascots next to a service
  name) are `aria-hidden` or have empty `alt`.
- Handwriting and hero lines never carry information that exists nowhere else.
- Motion respects `prefers-reduced-motion`.
- Focus stays the charcoal outline; selection must not rely on colour alone (the
  tick remains).

## Security/privacy considerations

None beyond the existing rule that mock-ups, screenshots and fixtures use the
offline sample data (`src/data/sample.js`), never real customers.

## Risks

- **Staff relearning status colours.** The colours were frozen because staff read
  them at a glance. Mitigation: tell the team before step 3 ships; the words do not
  change.
- **Blue "selected" beside periwinkle Confirmed.** Check on the salon's own screen
  at low brightness during step 3 review.
- **Flyer blue used as text.** It fails contrast. Mitigation: it has no text role
  in the rules, and the integrity test can pin it as decoration-only.
- **Poppins 900 re-weights existing 800 headings.** CSS font matching picks the
  next heavier face for a requested 800, so adding a 900 face moves any
  `font-display` text set at 800 from 700 to 900. Found on the base commit: the
  `RemindersModal` title (`font-display font-extrabold`) and three
  rules in `src/index.css`: `.human-directory-card__name`,
  `.human-pack-roster__label` and `.human-directory-card__profile > button`. Search again and decide each one deliberately in step 2. Montserrat 800 requests are unaffected because no
  heavier Montserrat face exists.
  **Resolved in step 2 (22 November 2026).** The search found about fifteen
  staff headings set to `font-extrabold` or `font-black` on Poppins, not four.
  Rather than edit each, Poppins 900 is registered under its own family name,
  `Poppins Black`, which only `--font-hero` names. The `Poppins` family keeps
  its 600 and 700 faces, so none of those headings changes;
  `src/designTokens.integrity.test.ts` pins both halves.
- **Mascot resolution.** 250px files are only sharp to about 120px. A larger use
  needs the original artwork from the owner.
- **Release risk.** `main` deploys the booking app and the marketing site
  together, so every step merges only after the full CI bar.

## Migration/rollout

No flags. Each step is its own pull request off `main`, merged only after the
full CI bar and the owner's review of screenshots. Rollback is a Vercel instant
rollback or a revert ([rollback](../../rollback.md)).

## Implementation sequence

### Step 1: rules and values (merged, #1259)

- Rewrite the rules in `docs/ux/design-system.md` and `docs/ux/warm-colours.md`
  that the approved language contradicts, marked with the step that ships each.
- Record the exact values and their contrast evidence in this plan.
- No code, token or screen changes.

**Change from the original outline.** The style board said step 1 would also add
the tokens. Discovery showed that doing so now would either change screens (a
Poppins 900 face re-weights existing 800 headings, see Risks) or break a
repository rule (a second, unused status palette next to `STATUS_TONES`, which
`BookingStatusBadge.component.test.tsx` guards against). Each value therefore
lands with its first use, in place, in the step below that ships it.

### Step 2: customer portal

- Vendor Poppins 900, point hero lines at it, remove Barlow Condensed; resolve the
  800-weight knock-on.
- Shared components: stripe, swash, polaroid, mascot; motion keyframes with the
  reduced-motion guard.
- Copy the four service mascots into `public/app/` (the website keeps its own
  copies, per ADR 009).
- Portal: stripe frame, hero titles, mascots in the service picker, selected
  state in blue, polaroids, the booked moment, Caveat lines, hero copy.

**As built (22 November 2026).** Decisions and findings during the build, added
here rather than rewriting the outline above:

- `BrandStripe`, `ServiceMascot` and a `draw` option on `ScribbleUnderline` are
  shared components in `src/components/ui/`; their styles and the three motion
  keyframes live at the end of `src/index.css` so step 3 can reuse them. The
  existing taped polaroid and title underline were reused, not rebuilt.
- **Polaroids.** The dashboard's dogs card is a list, so its photo avatars stay as
  they are (decision 9: never in lists). The dog's own photo becomes a polaroid on
  the booked moment.
- **A bug found on the way.** The wizard copied only some of each dog's fields,
  so the booked screen could never have shown the dog's photo. It now carries
  `photoPath`, with a regression test that fails without the fix
  (`BookingWizard.bookedMoment.component.test.tsx`).
- **Motion.** The loop of floating paws on the booked and waitlist screens is
  removed: the approved motion is three single moves, and nothing keeps going.
  The sign-in page's slowly drifting silhouettes stay: the owner chose to keep
  them moving (22 November 2026), a deliberate exception for that screen. They
  already stand still under reduced motion.
- **Progress dots.** Done steps in the wizard's stepper move from yellow to brand
  blue: they show progress, not something to press.
- **Hero copy, signed off by the owner on 22 November 2026.** "Book your groom
  online" in Caveat on sign-in (first shipped as "Come scruffy. Leave
  gorgeous."; the owner chose the flyer's other line), the salon slogan in
  Caveat on the dashboard, and "See you soon!" on the booked moment. Existing
  titles are unchanged.

### Step 3: staff dashboard

- Status values swapped in place in `statusPalette.ts`; size colours; Large navy
  edge; selection to brand blue (`--color-border-accent`).
- Stripe header and blue active tab in `AppToolbar`, title swash, staff sign-in,
  empty and done states, cream page on the calendar.
- Tell the team about the new status colours before merge.

**As built (22 November 2026).** Added here rather than rewriting the outline:

- Status values swapped in place in `statusPalette.ts`; the pinned-value test
  now pins the approved palette and also checks Confirmed stays off every brand
  blue.
- Sizes: `SizeDot` (white chip, charcoal outline and letter for S and M; navy
  for L), `SIZE_THEME` (one neutral theme for S and M, navy for L; `primary`
  and `gradient` stay fills under white text, because Reschedule and Chain
  booking put text on them), the calendar card's top edge (Large only), and
  the `--color-size-*` tokens. Reports charts get an ordered blue scale, since a
  chart must tell all three sizes apart.
- Selection: `--color-border-accent` and `ToggleChip`'s default pressed tone are
  brand blue; focus stays charcoal.
- Chrome: the stripe above the desktop toolbar; on phones a 4px stripe drawn
  inside the top bar's own bottom padding, because an extra 13px pushed the day
  stack's Check out button under the undo toast (`e2e/day-stack.spec.ts`,
  #1001). The active tab is blue on desktop and phone.
- Cream page: `body` and `--color-surface-page` are paper on every staff screen.
- Staff sign-in: the hero stripe and Poppins Black titles. No new copy.
- Empty states: `EmptyState mark="mascot"` (puppy mascot, hero title) on the
  true-empty Dogs and Customers directories.
- **Not done in this step, for a follow-up:** the swash under staff page titles
  (the calendar's date title component was not changed), the mini calendar's
  yellow "Selected" date, and other hand-written selected states outside the
  shared controls. Some staff panels keep a cool slate-50 fill on the cream
  page.

### Step 4: website, iPhone app, emails

**iPhone progress (23 November 2026):** customer Home, sign-in, the stripe on every screen and the four service mascots are in `ios/` (PR #1265 and its follow-up). Still to do on the iPhone: staff screens and the booked moment (polaroid) when booking arrives.

Separate plans in their own codebases, reusing these values.

## Testing

- Step 1: `npm run check:docs` (links). No code changed.
- Steps 2 and 3: the full CI bar (`lint`, `check:docs`, `typecheck`,
  `check:migrations`, `test`, `build`), the existing contrast tests updated to the
  new values, `npm run check:design-system`, and Playwright screenshots at
  desktop and phone width with sample data for owner review.

## Observability

None needed: no runtime behaviour changes. Sentry continues to report render
errors as today.

## Documentation updates

- Step 1: `docs/ux/design-system.md`, `docs/ux/warm-colours.md`, this plan.
- Step 2: `.design-sync/conventions.md` (fonts), `docs/ux/radius-and-elevation.md`
  if the polaroid shadow becomes a token.
- Step 3: `.design-sync/conventions.md` (size semantics), the status rationale
  comment in `statusPalette.ts`.

## Definition of done

- Every approved decision is visible in the web app, matching the values above.
- All contrast tests pass with the new values; no ratchet rises.
- The owner has reviewed desktop and phone screenshots of each step.
- The design-system rules describe what renders.
- The plan links each merged pull request and moves to `completed/`.

## Open questions

- Original mascot artwork at higher resolution, if a hero larger than about 120px
  is wanted. Owner to supply.
- Final hero copy lines (about 20 to 30) need the owner's sign-off in step 2 and 3
  reviews.

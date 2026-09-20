# Changelog

## Unreleased — changed specs run on tablet and mobile at PR time (#895)

- Run the Playwright specs a pull request changes on the `tablet` and
  `mobile` Chromium projects in `pr-production-smoke`, in a third invocation
  after the desktop and WebKit ones. A spec was only exercised on narrow
  viewports after merge, so one written against the desktop layout could pass
  its own pull request and then fail `e2e` on `main` for every merge that
  followed; #894 fixed one that had done so for seven merges. The selection
  (merge base with the base branch, deletions dropped; a Playwright config or
  e2e helper change selects every spec) lives in the merged workflow, and the
  projects come from the full matrix every branch already carries, so no
  PR-smoke config change was needed. A pull request that changes no spec sees
  no new work.
- Let `scripts/assert-playwright-pr-smoke-results.mjs` accept viewport-gated
  skips when `PR_SMOKE_ALLOW_SKIPPED=1`, set by that run only; the desktop
  and WebKit steps still fail on any skip. A guard test executes the selection
  step's script with a stubbed `git` and checks the assertion in both modes.

## Unreleased — Daily Brief appointment stack (#891)

- Overlap future appointment cards at the bottom of the available scrollport,
  with fixed-height headers and reserved welfare-warning space.
- Animate selection and tie card separation directly to pull-to-refresh distance;
  retain readable tap targets, long-day scrolling and reduced-motion support.
- Preserve appointment actions and expose complete safety notes in the existing
  details area without changing header dimensions.

## Unreleased — mobile Inbox composer (#884)

- Keep multi-line replies and Send reachable when a phone keyboard reduces the
  visible viewport. Remove duplicate mobile thread navigation, compact the
  header and allow draft/header content to yield space to the composer.
- Correct textarea padding/border sizing and add visual-viewport clipping checks
  alongside existing draft, focus and navigation continuity tests.
- Hide the phone toolbar and nav strip while the on-screen keyboard is up and a
  text field has focus, so the conversation being replied to keeps most of its
  height instead of collapsing under chrome that cannot scroll away. Measure the
  Inbox shell before first paint so it no longer flashes at content height.
- Re-read the viewport a few times after any keyboard event, because iOS
  reports the visual viewport as the keyboard starts to move and not when it
  lands: measured once, the reply box sat exactly under the keyboard on a real
  iPhone. Re-pin the message log to the newest message as it shrinks, and keep
  the status-bar inset while the toolbar is hidden.
- Add an opt-in viewport readout (`?vvdebug=1`, staff shell only, geometry
  only) that shows — and reports to Sentry — the visual-viewport, scroll and
  composer numbers under a real phone keyboard, so the next report of the
  reply box hiding comes with figures rather than a screenshot to infer from.
  (Shipped to production in #888 on 20 September 2026. Superseded — removed
  the same day, see below.)
- Suppress iOS Safari's automatic zoom on field focus with `maximum-scale=1`,
  applied at boot on iOS only. A real iPhone zoomed ~1.18× on tapping the
  reply box despite every field computing at 16px; once zoomed, no layout
  keeps the composer above the keyboard. iOS keeps pinch-zoom regardless;
  Android, which would lose it, is untouched.
- Wrap long unbroken URLs inside WhatsApp message bubbles. A customer-portal
  link is one ~90-character word; as a flex item the bubble's minimum width was
  its min-content width, so the bubble ran off the right of a phone screen.
  `overflow-wrap: anywhere` (not `break-word`, which leaves min-content alone)
  plus `min-w-0` keep every message inside the thread.
- Remove the opt-in viewport readout and the three pieces that existed only
  for it: the `captureMessage` Sentry helper, the build-SHA `define` in the
  Vite config, and the `?vvdebug` flag. #889 fixed the iOS focus zoom the
  readout was there to measure and the salon confirmed the fix on the device,
  so nothing needed the figures any more. No effect on staff or customers:
  the overlay rendered only when the flag was set.

This changelog records meaningful completed product, architecture and operational changes from 9 August 2026 onwards. Earlier history remains available in Git and the repository's dated plans and runbooks; it has not been reconstructed as release history.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) where useful. The project does not currently publish numbered releases, so entries are grouped under `Unreleased` until a release convention is adopted.

## Unreleased

### Added

- A 90-day retention rule for measurement telemetry. `booking_funnel_events`
  and `booking_denials` rows older than 90 days are deleted daily by
  `prune_measurement_telemetry()`
  (`20260909150000_telemetry_retention_90_days.sql`), the period the
  measurement owner set on 9 September 2026 and recorded in the
  [measurement catalogue](docs/specifications/measurement-catalogue.md#privacy-and-retention),
  which now names an owner for all ten metrics (#612). The longest report
  window is 90 days, so nothing a report can read is removed.

- The marketing website (`leamonline/smarter-dog-website`) now lives under
  `website/` as an independent application, imported with its full history
  (129 commits, source `c55617b`, tree byte-identical, no squash) per
  [ADR 009](docs/architecture/decisions/009-independent-applications-in-one-repository.md)
  (#784). Root lint, test and build discovery exclude it; `website:*` npm scripts wrap
  `npm --prefix website`; `.github/workflows/website.yml` runs its checks for
  `website/**` changes and workflow edits. Existing required repository checks
  still run for website-only PRs. The Bluehost
  publisher was imported dark behind the `WEBSITE_PUBLISHER_ENABLED`
  repository variable; the
  [cutover runbook](docs/superpowers/runbooks/2026-09-07-website-publisher-cutover.md)
  was executed and the `deploy` job became the single publisher on
  9 September 2026 (first publish: run 34359840293 on the #811 merge; the
  8 September attempt on #810 had skipped `deploy` because the variable was
  not yet set). No hosting, Vercel or database change; the deployment
  secrets and gate variable moved to this repository.

- An awaiting-approval queue on Humans, with a responsive review panel for
  all dog sizes, save-for-later and save-and-approve actions. The queue is
  independent of directory search; stale or failed size saves stop approval,
  and the welcome-message outcome is shown separately (#782).

- An advisor baseline. `supabase/advisors/baseline.json` records every accepted
  Supabase security and performance advisor finding by the linter's stable
  `cache_key` (111 + 106 on 2 September 2026; refreshed to 118 + 107 on 9 September 2026 after the first scheduled audit flagged the holiday-notice, change-deadline and pending-signup RPCs, all accepted with reasons), `npm run check:advisors` diffs the
  live advisors against it through the Management API (new or escalated
  findings fail; resolved ones ask for a `--update`), and the weekly
  `check-advisors-drift` workflow runs the same diff as an alarm. The reasons
  behind each accepted category are in `docs/supabase-advisors.md`.

### Security

- Login CAPTCHA verification is now enforced on the production Supabase
  project. On 14 September 2026 the owner enabled CAPTCHA protection
  (Turnstile provider) in Authentication → Attack Protection, completing the
  owner action that PR #850 prepared for; `npm run check:captcha` reports
  `ENFORCED` (an invalid token and a missing token are both refused with HTTP
  400 before the password check). Before this the widget issued and solved
  challenges that nothing verified. The Turnstile implementation plan moves to
  `docs/plans/completed/` with a completion record; the remaining owner-side
  checks are tracked in the
  [enablement runbook](docs/superpowers/runbooks/2026-09-11-login-captcha-enablement.md#outcome).
  Verifying the token inside the phone-on-file Edge Function stays deferred
  (#852).
- Pin `search_path` on `public.slots_are_hhmm(text[])` and
  `public.deposit_reference_for(uuid, date)`, closing the last two Supabase
  security-advisor findings that were not deliberate. Both are SECURITY
  INVOKER, so this is defence in depth rather than a privilege-escalation
  fix, and behaviour is unchanged — neither body references a table, view or
  user-defined function, only `pg_catalog` built-ins. Applied to production
  before merge, per the repository's database workflow; the advisor now
  reports 111 findings rather than 113, with the `function_search_path_mutable`
  category gone entirely and nothing new appearing.
- Classify every `bookings` column that travels in a notification payload, and
  close out the data-exposure audit's only finding by rejecting its obvious
  fix. The audit flagged `resend-booking-notification`'s `select("*")`;
  acting on it surfaced that the Postgres triggers forward the identical row
  (`row_to_json(NEW)`, all 46 columns) on every status change, so narrowing the
  one manual path would have reduced exposure by almost nothing while making
  the two payload shapes diverge. What the enumeration did earn is a guard: all
  46 columns are classified, the 14 consumed ones are recomputed from the
  consuming sources so the classification cannot drift, and adding a column to
  `bookings` — or narrowing one path alone — now fails the build. No runtime
  behaviour changes; the silent forwarding of new columns is what got fixed.
- Add runtime gate tests for `calendar-ics`, completing runtime coverage of
  the feed-token family. Same serve()-shim split, handler unchanged; five Deno
  tests (no database, no network) prove the method and missing-parameter gates
  reject before any lookup — including when a token is supplied, so guessing a
  booking id reaches nothing — and that an unvalidatable token never yields an
  .ics, nor a `text/calendar` content type. Its 403 ownership gate (a customer
  token may read only that customer's booking) is documented as deliberately
  out of scope: reaching it needs a real token row and booking, the same class
  of gap as the one criterion left open on the Edge Function auth audit.
- Add runtime gate tests for `customer-phone-on-file` — the third and final
  shortlist entry, and the odd one out: a deliberately public pre-auth login
  helper whose only defences are an origin allowlist and a two-tier rate
  limit, answering at most two booleans. Same serve()-shim split, handler
  unchanged; five Deno tests (no database, no network) prove the method,
  JSON and phone-shape gates reject before anything is counted or queried,
  and pin the property that makes a public enumeration oracle safe to
  operate: the rate limiter fails CLOSED — an unreachable rate-limit store
  yields 429, never an `on_file`/`has_password` answer.
- Add runtime auth-gate tests for `calendar-feed` — a URL-borne token guards
  every customer's bookings (staff feeds include owner names), so its gate is
  the second shortlist entry. Same serve()-shim split, handler unchanged; four
  Deno tests prove the method and missing/empty-token refusals precede any
  lookup, and that an unvalidatable token — including when the token store is
  unreachable — never yields calendar data: a database outage must degrade to
  refusal, not to an open feed.
- Add runtime auth-gate tests for `apply-customer-confirm` — the
  highest-blast-radius internal-secret endpoint, whose check is the only gate
  on the autonomous booking path. `index.ts` becomes a `serve()` shim with the
  unchanged handler exported from `handler.ts` (the whatsapp-agent pattern);
  six Deno tests prove missing, wrong, near-miss and empty credentials are
  refused, and the correct one advances to body validation, all before any
  Supabase client exists — no database, no network. New functions must now be
  born in this shape (`docs/edge-function-auth.md` § Adding a function).
- Strengthen the Edge Function auth-contract guard (`check:edge-auth`) from
  substring matching to verdict-flow analysis: each required auth primitive is
  now parsed and its result must reach an if-guard that returns or throws —
  directly, through a captured variable, or through a named helper returned to
  a guarded call site. A check whose result is discarded, a guard that no
  longer exits, or a mention that survives only in a comment now fails the
  build; shapes the analysis cannot follow fail closed. `buildAllowedOrigins`
  is the declared `flowOnlyPrimitives` exception — its verdict becomes CORS
  headers, not an early exit. All 27 deployable functions pass; the audit that
  accompanied the change found no decorative check in production.

### Removed

- Remove the human merge-control attestation entirely: the publisher workflow,
  the evaluator script, its three test suites, the pull-request template block
  and every instruction to use it. **No merge gate replaces it** — `main` is
  unprotected and auto-deploys to production, so merge authority is now CI
  evidence plus the judgement of whoever merges. The runbook and design are kept,
  marked retired, because dated evidence packs link to them.

### Changed

- Two more register seams, so the only debt rows still moving the wrong way
  (Debt 7 and Debt 9) move the right way. `HumanCardModal.jsx` drops to 451
  lines: the discard / delete / archive confirms are
  `human-card/HumanCardConfirmDialogs.jsx` and the phone-only New-booking
  bar is `MobileNewBookingBar.jsx`. `BookingDetailModal.jsx` drops to 472:
  the close-attempt/Escape guard is `booking-detail/useBookingDetailClose.ts`
  and the optimistic reminder-sent flip (confirmed always wins) is
  `useReminderSentOverride.ts`. All four are pure moves with their own tests;
  the existing modal suites pass unchanged, and `debtSizeRatchet.test.ts`
  budgets drop to 465 and 485.

- Route the staff calendar-feed settings through a data hook (Debt #12
  burn-down, fourth slice): `views/settings/CalendarSettings.jsx` no longer
  imports the Supabase client. The calendar-feed implementation is now one
  client-agnostic core (`calendarFeedActions`) shared by
  `useCustomerCalendarFeed` and a new `useStaffCalendarFeed`, with each hook
  binding its own client so the two auth sessions stay separate. Same
  truthful-state improvement as the customer modal: with no client the staff
  tab shows its "Unable to generate feed URL" state instead of loading
  forever. ESLint burn-down allowlist 22 → 21.
- Route the customer calendar-feed actions through a data hook (Debt #12
  burn-down, third slice): `AddToCalendarButton.tsx` and
  `CalendarSubscribeModal.tsx` no longer import the Supabase client — token
  fetch, Edge-Function URL construction and token revocation live in a new
  `useCustomerCalendarFeed` hook. One truthful-state improvement: with no
  Supabase client the subscribe modal now shows its "Unable to generate
  calendar link" state instead of spinning forever. ESLint burn-down
  allowlist 24 → 22; the whole customer dashboard folder is now client-free.
- Route customer dog create/edit through the repository layer (Debt #12
  burn-down, second slice): `DogsSection.jsx` and `booking/AddDogInline.tsx`
  no longer import the Supabase client — both write through a new
  `useCustomerDogActions` hook over `dogsRepo`, where the snake_case↔camelCase
  mapping for `update_customer_dog` now lives (`updateForCustomer` returns a
  deliberate partial so fields the RPC doesn't return, like the pregnancy
  flag, survive an edit). `TrustedHumansSection.jsx`, which had no client
  usage left, also came off the ESLint burn-down allowlist (27 → 24). No
  behaviour change for customers.
- Route the customer dashboard's data access through the repository layer
  (Debt #12/#13 burn-down): `CustomerDashboard.jsx` and `BookingCard.jsx` no
  longer import the Supabase client or hand-build snake_case queries in JSX.
  A new `useCustomerDashboardData` hook owns dogs, the 180-day booking window,
  older pages, trusted contacts and contact-detail saves over
  `dogsRepo`/`bookingsRepo`; BookingCard cancels via
  `useCustomerBookingActions` and reads deposit bank details via
  `useCustomerDepositSettings`. Bookings now cross the boundary as app-shaped
  `CustomerBookingSummary` objects (camelCase, joined dog snapshot), so a
  Postgres column rename can no longer silently break the portal, and both
  files left the ESLint `no-restricted-imports` burn-down allowlist. No
  behaviour change for customers.
- Record every confirm click that produced no booking in the database, with a
  governed failure code (#708). The 21 unexplained confirm failures were
  reported only through `logger.error`, which reaches nothing in production
  until Sentry is enabled — while the funnel table demonstrably works there,
  being how #708 was measured in the first place. The wizard now logs a
  `confirm_failed` funnel event on every failure path, on the same session id
  as the `confirm` it explains, carrying one of six observable categories
  (`gate_rejected`, `reschedule_rule`, `slot_taken_recheck`, `network_failed`,
  `server_error`, `unknown`) plus a truncated structured diagnostic. The set is
  governed by a CHECK mirroring `CONFIRM_FAILURE_CODES`, with a test pinning
  the two; the RPC drops unrecognised values to null rather than raising. A
  confirm with neither `booked` nor `confirm_failed` remains possible and
  remains a finding — navigation away, or network loss too total to log — so
  #708's Sentry criterion stands; this narrows the residue rather than
  replacing it. Migration `20260830223000`; no booking write-path change.

- Record **why** a booking-wizard step could not be completed, on the two
  steps that lose the most people. Measured against the clean window (after
  the per-attempt session fix on 23 August), the largest two drops are both
  at the front of the wizard, before anyone sees a price or a slot:
  `started → select_dogs` and `select_dogs → select_date`. The funnel could
  say where people left but never why.

  The new `blocked_reason` is written **only** when the wizard had nothing to
  offer — no dogs on file, every dog ineligible, or a first calendar page with
  no open day. It is never written to explain someone who had a usable choice
  and left anyway, because that is not observable and inventing it would put
  guessed intent into a table people will trust. An abandoned attempt with no
  reason is itself the finding: the customer had options and still went away.

  The vocabulary is governed by a CHECK constraint mirroring
  `FUNNEL_BLOCKED_REASONS`, with a test pinning the two together, so a typo
  cannot quietly invent a fourth category. The RPC drops an unrecognised value
  to null rather than raising — this is fire-and-forget telemetry, and a stale
  client must never cost a customer their booking; the CHECK is the backstop.
  Reasons are claimed once per attempt, because the blockers are evaluated on
  render and would otherwise bury their own signal in repetition.

- Rescope B3 (#623) from *canonical capacity evaluator and reason contract* to
  **guard capacity parity across runtimes**, on the evidence of the 129-case
  measurement: the capacity semantics do not diverge, PostgreSQL was correct in
  every case including the one the engine got wrong, and the single real defect
  was a TypeScript preflight ordering bug fixed in one function. The
  authoritative evaluator, any booking-spine migration and any change to the
  database capacity architecture are now explicitly out of scope, and the parity
  harness becomes the deliverable rather than a stepping stone. Rejection-reason
  alignment moves out entirely to its own issue (#665), specified but not
  started, because it is presentation rather than correctness and the
  customer-facing wording wants a product decision. B3 is also decoupled from
  B1/B2 — that serialisation existed because the migration spine is serial, and
  the rescoped B3 carries no migration; verified against the deliverable's
  actual imports and the pre-existing tables its database half touches. B4
  remains stopped behind the `RA-001` STOP. ADR 001 is reaffirmed, not
  superseded: PostgreSQL stays the capacity authority.

- Add a default-`HOLD`, exact-SHA human merge-control attestation and operator
  runbook for pull requests while `main` lacks native GitHub protection,
  including explicit migration disposition and post-merge check monitoring.
  (Superseded — removed 18 August 2026, see above.)

### Changed

- The staff app is now a fixed-height shell rather than a scrolling document.
  `AppFrame` is a `100dvh` flex column: the banners, toolbar and nav strip are
  pinned above it, and `<main>` takes the remainder and does the scrolling. The
  document itself no longer scrolls at all.

  This replaces guesswork with arithmetic the browser already does. Nothing
  above `<main>` knew about the viewport before, so the chrome scrolled away
  with the content and any view wanting to fill the window had to measure the
  viewport in JavaScript to work out what was left. Now CSS owns height and
  `useFillViewportHeight` is reserved for the one case CSS cannot see — the
  on-screen keyboard, which shrinks the visual viewport without resizing the
  layout viewport. It moves to `src/hooks/`, its CSS variables lose their
  `--inbox-` prefix, and it watches its ancestors rather than `document.body`
  (under a fixed-height shell a wrapping toolbar takes height *from* the
  workspace instead of adding it to the page, so the body never changes size
  and the old observer would never have fired).

  The content track is raised from 1536px to 1800px, so a 1920 monitor no
  longer keeps ~260px of dead gutter down each side.

  Navigating to a different section sends the workspace back to the top;
  opening and closing a profile, or changing a filter or Reports tab, keeps
  your place. The rule keys on a new stable `sectionKeyFor()` rather than the
  section's display title, so renaming a nav item cannot quietly change
  scrolling behaviour; `sectionTitleFor()` is now derived from that key.

- The calendar reads as a schedule with two quiet margins, rather than three
  columns of equal weight. The left rail is reference furniture — a month grid
  and two read-only measurements — but it wore the same white card, border and
  lift as the day's bookings, so nothing on the page claimed to be the main
  thing. It keeps the card and loses the shadow, leaving the schedule the only
  raised surface.

  The day's status was set in 11-12px beside two buttons of equal prominence,
  so the controls row read as three controls rather than an answer followed by
  two actions. The Open/Full/Closed pill and the `7/14` count are now the
  weight of the row, and the pill sizes to its label instead of a fixed width.

  `DayHeader.jsx` is deleted. It was never mounted anywhere and survived only
  as a comment in `HumanHeader.jsx` pointing at it as a visual reference.

- Three leftovers from moving the scrollbar into `<main>`. The A-Z rail in the
  Dogs and Humans directories stuck 96px down, an offset that used to clear
  chrome which scrolled with the page and now just leaves a gap. Needs
  Attention nested its own centred, padded container inside the shell's, so
  its vertical padding doubled up. And pull-to-refresh guarded on a wrapper
  that never scrolls, so its "only pull at the top" check had never refused
  anything — a pull part-way down the schedule still triggered a refresh; it
  now asks the touched element for its nearest real scroller.

  A sweep of Daily Brief, Reports and Settings at 360x880, 700x850 and
  768x1024 found nothing else: no horizontal page overflow and no unexpected
  clipping at any of them.

- The staff calendar adapts to tablets and folding phones, and the breakpoints
  are measured rather than guessed.

  **Two seats side by side from `md` instead of `lg`.** A seat card is 291px
  wide at `lg` on a 1024 window — the width that has always shipped. At 768,
  with no sidebar yet and the 80px time column removed, two-up gives each seat
  300px, so the pair is no tighter than desktop. Between 768 and 1023 the
  schedule used to run one seat per row across a 704px column, wasting half of
  it. At 700 two-up would give 274px, narrower than anything that ships, so a
  folding phone's unfolded screen stays single-column and wins its space back
  from the chrome instead.

  **A `short:` variant for windows with little height.** The chrome costs
  125px below `lg` — a mobile toolbar and a nav strip, stacked — against 61px
  above it, where one desktop bar does both jobs. On a 620px-tall window that
  is a fifth of the screen gone before the first booking, and on a near-square
  850 it is still 15%. `short:` (52rem and under) trims the toolbar, the nav
  strip and the date row. Named rather than arbitrary, for the same reason
  `--breakpoint-wide` is.

  **One capacity card.** It was rendered twice — in the left rail and again as
  an `xl:hidden` footer — so between 1024 and 1279, where the rail was already
  visible and the footer had not yet hidden, the same card was on screen
  twice. There is now a single instance whose grid order moves it beneath the
  schedule below `lg`.

  **Touch targets.** Seven controls sat under the 44px the project's own modal
  standard requires: the "Next available" row was 294x20, and the day arrows,
  Today, Month view, Day settings, Message day and the shared `Button` were all
  36-40px. They now meet 44px under `pointer-coarse:`, so a thumb gets the
  bigger target and mouse density is untouched.

  Pinned by a new browser suite (`e2e/adaptive-layout.spec.ts`) running on six
  viewport projects, including two folding-phone shapes and a 1920 desktop —
  nothing else in the matrix was wide enough to exercise the 1800px ceiling.

- The staff calendar fills the window instead of stopping where the sidebar
  ends. `DashboardShell` used to measure the left rail with a `ResizeObserver`
  and cap the other two columns to whatever it found, so all three ended level
  with the *sidebar* — and since the rail's content (mini-calendar, capacity,
  revenue) is shorter than a desktop window, the day's schedule was trimmed to
  match it and everything below was dead space. On a 1920x1080 window the
  schedule clipped part-way through the 11:00 row with roughly a third of the
  screen empty.

  Nothing is measured now. The shell is a fixed-height flex column, so the
  browser already knows what is left after the chrome; `h-full` inherits it
  and each of the three columns scrolls its own overflow. The left rail
  becomes a scroller like the other two rather than the thing that dictates
  everyone else's height, so a short window scrolls the rail instead of
  shortening the schedule. The sticky positioning went too — nothing scrolls
  underneath those columns any more.

  #834's guarantee is kept and is why every height utility is `lg:`-scoped:
  below that breakpoint the left column is `display:none` and measures 0, and
  a constraint derived from it outlived its layout and clipped the grid on
  phones. There is no longer any measurement to go stale and no max-height at
  any width.

- The chrome bars' full-bleed margins read a single `--app-gutter` token
  instead of hard-coding `-mx-4 sm:-mx-6` against a frame padded
  `px-4 sm:px-6 md:px-8`. Five components carried that duplicate, and from
  `md` up every one of them was 8px narrower than the frame it was meant to
  span.

### Fixed

- Staff home-screen app launches at `/staff/` now have an explicit booking-shell route, preventing the public website’s 404 page from opening instead.

- Staff account settings now explain how to request a password reset through the protected sign-in flow, replacing the button that could not supply a CAPTCHA token (#851).

- Customer dashboard shows all upcoming appointments and every dog in each booking group, with per-dog services, times and outstanding deposits. Change and cancellation confirmations name the affected dogs (#854).

- Stop the capacity and revenue measurements running out of their cards on the
  staff calendar. Both rail cards laid a metric out as one flex row — label
  `truncate` on the left, value and caption `shrink-0` on the right — inside a
  grid track of 240px at `xl` and 220px at `lg`. A caption like "36 of 56 seats
  booked this week", set in 11px uppercase with letter-spacing, is wider than
  the 208px/188px that leaves, and because the right-hand cluster refused to
  shrink the label collapsed to "T…" while the cluster overflowed the card.

  The two near-identical `CapacityBar` and `RevenueBar` copies are now one
  presentational `MetricBar` primitive (`src/components/ui/MetricBar.jsx`) that
  stacks the row: label and figure, then the track, then the caption on its own
  line in sentence case. The caption wraps rather than truncating — it is the
  measurement itself, not decoration. `MetricBar` owns layout only; capacity
  keeps its open/closed state and `utilisationColor`, revenue keeps its loading
  skeleton and its own colour scale, and capacity figures still come from
  `src/engine/utilisation.js`.

  The same inversion is corrected in three Reports charts
  (`CapacityPreventedReport`, `FunnelReport`, `CollectedByMethodReport`), where
  a fixed-width label was `shrink-0` and the figure beside it was not — so the
  expendable text held its ground and squeezed the bar while the number itself
  could clip. The label may now yield and truncate; the figure is protected and
  set in `tabular-nums`.

- Keep the staff Inbox and calendar usable across a changing viewport
  ([#834](https://github.com/leamonline/Smarter-dog-bookings/issues/834)).
  Four separate ways an open session came apart when the window changed size:

  - The Inbox pushed a history entry so the hardware Back button could step
    back through the stacked panes, then popped it from an effect cleanup.
    That cleanup ran on every crossing of the 767px breakpoint **and on
    unmount**, so `history.back()` fired for reasons the staff member had
    nothing to do with. On a phone with a thread open it made every other nav
    item unreachable — tapping Dogs bounced straight back into the Inbox,
    losing the reply being typed. The entry is now consumed only by a
    deliberate Back, and the listener that answers it no longer comes and goes
    with the breakpoint.
  - The booking/customer context kept its focus trap at `wide` (90rem), where
    it is not an overlay at all but the workspace grid's permanently docked
    third column — so a keyboard user was held inside a pane they could see
    straight past. Containment and Escape-to-dismiss now follow the overlay,
    releasing when it docks and returning when the window narrows.
  - The Inbox reserved 72px at the bottom on phones for a fixed navigation bar
    that no longer exists (the staff mobile nav is a strip under the top
    chrome), and rounded short windows up to a 360px minimum they could not
    honour — pushing the composer out of a pane that clips its own overflow.
    It now measures what is genuinely available, and re-measures when the
    chrome above it changes height without a window resize (a banner
    appearing, the toolbar wrapping).
  - The calendar mirrored its left sidebar's measured height onto the schedule
    and workflow columns as an inline `max-height`. Inline styles apply at
    every width, but the sidebar exists only from `lg` up and reports zero when
    hidden, so the last desktop measurement went on capping the schedule in the
    single-column phone layout. The cap is now published as a custom property
    applied by an `lg:`-scoped utility, so it cannot outlive the layout that
    produced it.

  Covered by focused component regressions and a new `viewport-continuity`
  Playwright spec, which the pull-request gate runs on desktop Chromium and on
  mobile WebKit alongside the smoke journeys.

- Repair mis-encoded characters in production's `validate_booking_capacity()`.
  Seven sequences were double-encoded — UTF-8 decoded as Latin-1 at some point
  in that function's hand-apply history — of which **three are `raise
  exception` messages that reach callers**, so any surface showing the raw
  database message showed `â` where an em dash belonged. No committed
  migration has ever contained the corruption: it entered through a manual
  production apply, and the repository has always held the correct text —
  `035_capacity_behaviour.test.sql` already asserts the clean string with
  `throws_ok`. Proven text-only rather than asserted: production's body,
  once both sequences are normalised, hashes identically to the definition
  local-from-migrations and staging both carry (`2aaa6590…`, 13086
  characters on all three). The migration derives the repair from the
  deployed definition by character substitution instead of retyping the
  348-line body, so "no logic change" is a property of the mechanism, not a
  promise, and it refuses rather than guesses on any unrecognised sequence or
  drifted body. Client behaviour is unchanged either way — `mapDenialReason()`
  matches on substrings that never span the corrupted character, and the
  wizard maps on `error.code`. No stored `booking_denials` row was affected,
  and this was the only affected function in the database.

- Stop the booking wizard offering a slot pair the database refuses
  ([#664](https://github.com/leamonline/Smarter-dog-bookings/issues/664)). Two
  large dogs booked together could be offered the 08:30 drop-off, and the
  capacity trigger then rejected the write — a journey that dead-ended after
  the interface said yes. The rule was not missing: `findGroupedSlots()`
  already checked every placement through `canBookSlot()`. It validated them
  **incrementally against a partial day**, while the large-dog conditional is
  **directional** — booking 09:00 inspects 08:30, but booking 08:30 does not
  inspect 09:00 — so placing the pair 09:00-first passed step by step and
  produced a finished allocation that was invalid. PostgreSQL never had the
  problem, because its trigger evaluates the whole day on every insert. The fix
  re-checks each completed allocation as a whole, reusing the existing rules, so
  it can only remove offers the database would have rejected; no rule, policy or
  schema changes. Applied to the browser engine and its Deno mirror, with the
  trigger untouched. Found and proven closed by the parity harness, and pinned
  by a regression test asserting the general property rather than the one slot
  pair.

### Testing

- Close the three coverage gaps the rescoped B3 named, taking the capacity
  parity harness from 129 cases to **162** — blocked seats against large dogs,
  and grouped allocation onto blocked-seat, extra-slot and mixed-size days.
  **All 162 agree.** A hypothesis went in and came out wrong, which is the
  useful part: the two runtimes reach the blocked-seat answer by different
  routes — PostgreSQL subtracts blocked seats generically *before* the
  large-dog branch, while the engine floors a slot at two seats and handles
  large-dog rules in a separate pass — and since #664 was an ordering defect,
  a 12:30 large dog against one blocked seat looked like a strong candidate for
  divergence. It is not; the arithmetic agrees throughout. One asymmetry did
  surface and belongs to #665 rather than here: with **both** seats blocked,
  PostgreSQL refuses from `validate_booking_calendar()` while the engine
  refuses on capacity — same verdict, different gate, so the reason space spans
  all three `BEFORE INSERT` gates.
- Add `scripts/generate-capacity-parity-cases.ts`, so the pgTAP half of the
  harness is generated rather than hand-written. It takes the engine's answer
  from `src/engine/capacity.ts` and **observes** PostgreSQL's by attempting the
  insert in a rolled-back transaction, so a `throws_ok` records what the
  database actually did instead of what anyone assumed; it reports a divergence
  rather than quietly encoding one. The file's own comments already said
  "regenerate the SQL" with nothing in the repository able to do it.

- Add a cross-runtime capacity parity harness and measure the divergence
  between the browser engine and PostgreSQL — the one leg of the three-way
  capacity duplication nothing had ever compared. 43 scenarios yield **129
  cases**: 26 single-booking verdicts that must match, and 15 grouped
  multi-dog scenarios yielding 103 cases where the question is stronger and
  directional — *every allocation `findGroupedSlots()` offers must be one the
  database accepts*. Coverage spans per-slot seats, the 2-2-1 window,
  large-dog seat cost and adjacency, early close, blocked seats, extra slots,
  the daily cap, and grouped allocation across all three dog sizes onto empty,
  partly-full, cap-constrained and block-constrained days.

  The deeper coverage earned its keep immediately: it found the ordering defect
  fixed above, which 17 scenarios had missed. **All 129 cases now agree** —
  26/26 singles and 101/101 grouped offers. It also produced a correction worth
  recording: an apparent second divergence (the engine offering nothing for five
  small dogs while the database would accept 2+2+1) was **not** a defect.
  Grouped booking is a documented 1–4 dog journey and the wizard enforces it, so
  a customer cannot select a fifth; the fixture was asking a question the
  product forbids, and the database has no concept of a booking group to compare
  against. It was replaced with the real four-dog boundary.

  An empty divergence register remains, so a future disagreement has to be
  recorded deliberately rather than absorbed silently. Immediate slots and staff
  overrides are excluded with reasons stated. Measurement, limits and what it
  means for #623 are in
  `docs/research/2026-08-19-capacity-parity-measurement.md`.
- Refactor the local PostgreSQL concurrency gates around one guarded,
  reusable real-session driver with tracked client PIDs and portable bounded
  TERM-to-KILL cleanup, while preserving the accepted WhatsApp and capacity
  race scenarios.
- Add focused PostgreSQL capacity behaviour coverage and genuine local
  same-slot and daily-cap race gates, preserving PostgreSQL as the final
  booking authority.

### Documentation

- Close out the two stale active plans whose issues completed on 10 August
  2026: the issue #614 shared PostgreSQL concurrency-driver follow-up
  (delivered by PRs #629 and #632) and the issue #618 hosted Supabase target
  guard (delivered by PR #628). Both files move from `docs/plans/active/` to
  `docs/plans/completed/` unrewritten, gaining a completion record with exact
  head and merge SHAs, the database-gate runs that first failed and then
  passed, and a fresh re-verification against current `main`. The only
  remaining active plan is the issue #603 programme plan.

- Add a `SessionStart` hook that provisions the local database-test stack for
  Claude Code on the web: Node 24 on `PATH` (the container defaults to 22, so
  `npm ci` fails on `engines.node` before doing anything useful), npm
  dependencies, the Docker daemon, the Supabase CLI, and a pre-pull of the
  Postgres and `pg_prove` images. Without it a fresh web container cannot run
  `supabase/tests/*.test.sql` at all — pgTAP ships inside the Supabase Postgres
  image rather than as a host package — so an agent had to fall back to a hosted
  project, which is slower, less reproducible and touches a shared environment.
  The CLI is installed from npm because the agent proxy returns 403 for
  `api.github.com`, making the usual release-tarball route unavailable.
  The daemon step also clears a stale `containerd` left by an earlier session —
  `dockerd` finds the orphan, cannot use it and times out — and retries once.
  It deliberately does **not** start `containerd` itself: this sandbox drops
  `cap_sys_resource`, so a shell-started `containerd` makes every container fail
  with `error setting rlimit type 7: operation not permitted`. Verified both
  ways; the comment in the hook says so, because the tidier-looking version is
  the broken one.

- Establish a repository project-memory system with a North Star, dependency-aware roadmap, product requirements, current architecture, decision records, planning standard, agent guidance, reusable prompt library and GitHub contribution templates.

## Scheduled holiday notices (pending release)

Settings → Holidays can schedule advance and away notices while closing the actual diary dates atomically. Existing appointments are flagged for rearrangement. Customers see verified reopening dates in date selection; the website card is delivered through its existing repository. No holiday is activated by deployment. Follow-up: a reopening date that is a normal open weekday no longer needs a diary row first, and the Holidays screen uses the standard staff buttons, alerts and a fuller preview.

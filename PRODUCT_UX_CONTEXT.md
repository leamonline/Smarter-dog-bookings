# Product UX Context

## 1. Analysis scope and version

- **Review target:** The current Daily Brief (`/today`) three-lane status board — header, active lanes, Home-today history, Daily-progress footer and conditional advisory notes — for a single selected date.
- **Product, repository, or project:** `leamonline/Smarter-dog-bookings`.
- **Branch and commit:** `main` at `6d73281a5010737725c60bc6f24bfdf7536f26e6` (merge commit for PR #596; unrelated to this surface).
- **Date of analysis:** 2026-08-05.
- **Product surfaces inspected:** Repository onboarding (`CLAUDE.md`), the canonical Today/Reports doc, the live `TodayView.jsx` composition and every child component it renders, the pure `dailyBrief`/`today` engine modules, routing and navigation config, the shared modal standard, two generations of design/spec documents for this surface, recent commit history, an import-graph trace for superseded components, and one user-supplied screenshot.
- **Production behaviour observed:** No live authenticated session or dev server was used. The single piece of directly observed rendered behaviour is the user-supplied screenshot (see E20).
- **Inaccessible or incomplete areas:** The authenticated running application, production analytics, Figma source files beyond the link named in one spec document, live salon observation, assistive-technology test results, and desktop/tablet viewport screenshots.
- **Potentially outdated sources:** `docs/plans/2026-07-14-daily-brief-design.md` remains in `docs/plans/` (not archived) but its card-composition prescription was superseded six days later; `docs/ux-review-2026-06.md` pre-dates both redesigns of this surface and never names it directly.

**Evidence:** E1-E22.

## 2. Evidence map

| Evidence ID | Source and version | Currency | What it demonstrates | Limitations or conflicts |
| --- | --- | --- | --- | --- |
| E1 | `CLAUDE.md`, `main@6d73281a` | Current repository guidance | Staff-vs-customer product split, domain rules (14/day cap, capacity engine, Mon-Wed open days), tech stack, and that `App.jsx` implements the staff auth gate | Self-flags possible staleness; cross-checked against code throughout |
| E2 | `docs/today-command-centre.md`, `main@6d73281a` | Current canonical doc | `/today` is "the default staff landing screen"; engine-module map; explicit Europe/London time handling | Self-flags staleness; its literal section table (e.g. "Summary strip") is a looser description than the current card/lane anatomy, cross-checked against code |
| E3 | `src/components/views/TodayView.jsx`, `main@6d73281a` | Current implementation | Composition root: selected-date state, engine wiring, component assembly, mutation path (`patch`/`updateStatus`/`onJourneyAction`), permission-based scroll, remote-move announcement, loading/error/empty states | Static inspection only, not executed |
| E4 | `src/engine/dailyBrief.ts`, `main@6d73281a` | Current implementation | Pure lane derivation (`buildDailyBriefBoard`), per-lane sort rules, `buildJourneyActions`/`paymentVisual`, `requiresCareSkipConfirmation`, `buildMiniInvoicePatch` validation | Logic only |
| E5 | `src/components/views/today/StatusBoard.jsx`, `main@6d73281a` | Current implementation | The actual rendered lane grid and card (lane titles, `CardActions` per lane, lane warnings, Home-today history, unknown-status recovery panel) — matches the screenshot line for line | Static inspection; confirms this file, not E15's components, is what is composed |
| E6 | `src/components/views/today/TodayHeader.jsx`, `main@6d73281a` | Current implementation | Header composition: date label, Salon open/closed pill, availability label, operational-status grid, secondary totals, Choose date/Manage availability actions | Page `<h1>` title is screen-reader-only |
| E7 | `src/components/views/today/TodaySummaryStrip.jsx`, `main@6d73281a` | Current implementation | "Daily progress" footer: Arrived/Ready/Collected counts, takings by method | — |
| E8 | `src/components/views/today/TodayBriefNotes.jsx`, `main@6d73281a` | Current implementation | Two conditional advisory notes (unpaid fortnight, due-back retention); renders nothing when a source is offline or zero | — |
| E9 | `src/engine/today.ts` (L145-220, L883-951) + `LiveArrivalDivider.jsx`, `main@6d73281a` | Current implementation | Grounds "Due to arrive in X mins" copy, live-focus selection order, and the exact "Needs confirmation" gating rule | — |
| E10 | `src/App.jsx` (~L530-540, ~L1156-1186), `main@6d73281a` | Current implementation | `/today` route wiring; an explicit, commented once-per-tab-session redirect from `/` to `/today` described in-code as "the post-auth entry point" | — |
| E11 | `src/components/layout/navConfig.jsx`, `main@6d73281a` | Current implementation | Nav entry labelled "Daily Brief" with a sun icon, shared by desktop nav and the mobile icon strip | — |
| E12 | `docs/plans/2026-07-14-daily-brief-design.md` ("Approved on 14 July 2026") | Mixed: partially current, partially superseded | Rename Today→Daily Brief, `?date=` contract, split header, and an appointment-sentence + 8-icon journey-row card design | Header/date-selector decisions still reflected in code (E6); the card design was superseded 6 days later by E13/E5 and is now dormant (E15) — the document was never moved to `docs/archive/`, unlike its siblings |
| E13 | `docs/archive/.../2026-07-20-daily-brief-three-lane-status-board-implementation-brief.md` ("Approved for implementation on 20 July 2026") | Approved and implemented | Full three-lane board contract: lane derivation, sort rules, card anatomy, named outcome actions, unpaid-collection confirmation, realtime rules, responsive rules, accessibility rules | A plan/spec document; cross-checked against E5/E4/E16 and found faithfully implemented in every point checked |
| E14 | `git log`, `main@6d73281a` (2026-08-05) | Current release evidence | `StatusBoard.jsx` added 2026-07-20 ("Add Daily Brief status board" + same-day polish/density commits); surface last touched 2026-07-26 | Command-line history only, not a hosted PR review |
| E15 | Repository-wide grep for `BookingFeed`/`BookingJourneyRow`/`JourneyIconButton`/`TodayKpiRow` imports | Current implementation (by absence) | None of these four files are imported by `TodayView.jsx` or `StatusBoard.jsx`; only referenced by each other and by test files | Grep-based; the test suite itself was not executed |
| E16 | `docs/modal-standard.md` + confirmed `ModalShell` imports in `MiniInvoiceModal.jsx`/`UnpaidCollectionModal.jsx`/`AvailabilityModal.jsx`, `main@6d73281a` | Current, strongly established | The canonical modal contract genuinely applies to this surface's three modals; `UnpaidCollectionModal.jsx`'s rendered copy matches E13's prescription exactly | — |
| E17 | `src/constants/salon.ts` + `src/engine/utilisation.ts`, `main@6d73281a` | Current implementation | `LATE_ARRIVAL_GRACE_MINUTES=5`, `IMMEDIATE_CUTOFF_MINUTES=30`, `DAY_CAPACITY=14` — grounds "7/14 capacity" and lateness timing | — |
| E18 | `src/index.css` (~L62-76), `main@6d73281a` | Current implementation | Only one custom breakpoint exists (Inbox-specific, 90rem); Tailwind v4 defaults (sm640/md768/lg1024/xl1280) govern this surface's responsive classes | — |
| E19 | `docs/ux-review-2026-06.md` (19 June 2026) | Legacy, pre-dates this surface's current form | A prior cross-cutting staff-dashboard UX review (iPad nav gap, touch-target debt) | Dated before both the 14 July and 20 July redesigns; scores a "Bookings / daily schedule" area, never names "Today"/"Daily Brief" — treated as legacy context only |
| E20 | User-supplied screenshot (this conversation) | Observed rendered behaviour; no device/viewport metadata declared | The direct visual evidence for the entire card/lane/header/notes anatomy described throughout; single-column lane stacking is consistent with a sub-768px CSS viewport (E18) | No EXIF/environment data; plausibly genuine operational data (specific names, non-round prices) rather than seeded sample data |
| E21 | `package.json`, `main@6d73281a` | Current implementation metadata | React 19.2.8, Vite 7.3.6, Tailwind 4.2.2, Vitest 4.1.10 | Technology context only |
| E22 | `today.component.test.jsx` + `StatusBoard.component.test.jsx` (test titles), `main@6d73281a` | Current automated coverage | Test titles corroborate documented state handling (closed-date heading, load-failure vs empty distinction, cached-error retains rows, unpaid-balance warns without blocking collection, scroll-once behaviour) | Only test titles were read, not full assertions; suite was not executed |

## 3. Executive summary

Smarter Dog Bookings is an operational booking and salon-management platform for a single dog-grooming business, with separate staff and customer interfaces. This review's target is the staff Daily Brief (`/today`) — the default landing screen after login — specifically its current three-lane status board, which turns the selected date's bookings into four lanes (Arriving, With us, Ready to go, Home today) plus a header of live operational counts and two conditional advisory notes.

The primary users are authenticated salon staff running the physical day: checking dogs in as they arrive, progressing them through the groom, taking payment and marking them collected. The supplied evidence is a phone-width screenshot showing a live instance of this board — 7 dogs due, 6 needing a confirmation chase, one flagged 73 minutes from arrival by a live marker, and £306 still unpaid against £306 expected for the day.

The most important design implication is that the board is a thin, carefully-ordered presentation layer over the existing booking-status model: it invents no new statuses, keeps payment strictly independent of lane, and requires an explicit, specifically-worded staff confirmation before any care stage is skipped or an unpaid dog is collected anyway. The most important contextual finding is that an earlier, still-undeleted design document (14 July 2026) describes a different card composition (an icon-only journey row) that a later, approved brief (20 July 2026) superseded; the earlier document was never moved to the repository's archive, and its component code still exists — unused by the live page, but still present and still unit-tested — so it would be easy to mistake for current behaviour without checking git history and the import graph, as this discovery did.

**Confidence:** Confirmed fact for the rendered board and its underlying engine logic (cross-checked against the supplied screenshot line by line); strong inference for usage frequency and physical/operational pressures, since no live observation, analytics or research was available.

**Evidence:** E1-E5, E9, E12, E13, E15, E20.

## 4. Review target and boundaries

- **Exact review unit:** The current Daily Brief (`/today`) three-lane status board — header, Arriving/With us/Ready to go lanes, Home-today history, Daily-progress footer and the two conditional advisory notes — for a single selected date.
- **Included:** Landing on the board (today, or via Choose date), the live-focus marker and per-card timing copy, all four lane states and their empty states, the Need-action filter, each card's primary/secondary/More actions and their confirmation dialogs, the three modals this surface opens (mini invoice, unpaid-collection, availability), loading/error/empty/closed-date states, and realtime remote-move/announcement behaviour, as evidenced by E3-E9, E13 and E20.
- **Neighbouring surfaces required for context:** the shared booking-update path and its DB-enforced gates (calendar/capacity/pregnancy, per E1), the weekly calendar (`/`) as the other primary staff landing, the Inbox deep link used by "Message"/"Call", the Reports page linked from the two advisory notes, and the global app shell (top nav, "+ New booking", hamburger menu) visible in the screenshot but owned outside this component tree.
- **Excluded:** the weekly calendar's own UI, the six Reports decision-reports themselves, the WhatsApp inbox thread UI, the customer portal entirely, the dormant icon-journey card composition (documented as a contradiction, not reviewed as live UI), and desktop/tablet visual judgement beyond what current code structurally implies.
- **Alternative scope interpretations:** The review unit could instead be scoped narrowly to "the mobile viewport only," since that is the sole directly observed instance. This discovery treats the whole current status-board implementation as the target, because it is one responsive component rather than separate builds — while explicitly marking tablet/desktop claims as code-inferred, not observed, throughout (see §7).
- **Confidence:** Confirmed fact for what the board currently renders and contains; the scope choice itself is a reasoned default, not an evidenced fact — flagged here rather than hidden.
- **Evidence:** E3-E6, E13, E20.

## 5. Product

### Concise review value

An operational booking and day-of-visit management platform for a single dog-grooming salon, joining bookings, dogs, customers, capacity and payment state so staff can run the actual physical day, not just the diary.

### Expanded description

Smarter Dog Bookings serves two audiences from one codebase: a staff dashboard (this review's home) and a separate customer self-service portal. The Daily Brief is the staff dashboard's operational work-queue — it turns the day's bookings into a status board answering "what needs attention right now?", distinct from the weekly calendar (`/`), which remains the scheduling tool. Without it, staff would have to infer each dog's real-world stage (arrived? in the bath? waiting? paid?) from the same booking records used for scheduling, with no default "what's outstanding today" view.

### Confidence and evidence

**Classification:** Confirmed fact.

**Evidence:** E1, E2, E10.

## 6. Users and affected people

### Concise review value

Primary users are authenticated salon staff running day-of operations. Customers and their dogs are directly affected by the accuracy of the status changes staff make here.

### Primary users

| Attribute | Context |
| --- | --- |
| Role | Authenticated salon staff operating the selected date's bookings |
| Goal | Move each dog accurately through arrival → in-salon → ready → collected, resolving confirmation/welfare/payment exceptions |
| Frequency | Plausibly continuous through the salon's Mon-Wed open hours — a 60-second re-tick, "at a glance" framing and default-landing placement all imply repeated reference (strong inference, E2, E3, E10); not directly measured |
| Product expertise | Experienced internal users; training level unstated |
| Pressures | A short (~4.5-hour) open window, real customers waiting on accurate status, and — per the screenshot — a meaningful unpaid balance (£306) alongside live arrivals |
| Cost of errors | A wrongly-progressed or unprogressed card could send a dog home unpaid unnoticed, leave a genuinely late arrival unchased, or treat an unconfirmed booking as certain |

### Secondary or affected users

- Customers being called, messaged, or whose confirmation/collection status is tracked here.
- Dogs whose welfare alerts, pregnancy flag and notes surface on the card (`getWelfare` in E3, rendered via `WelfareChips` in E5) — the chip's own visual treatment was not independently inspected.
- Other staff viewing and updating the same shared, realtime board concurrently (E13).

### Confidence and evidence

**Classification:** Confirmed fact for roles and workflow; strong inference for frequency and pressure specifics.

**Evidence:** E1-E3, E13.

## 7. Devices, platforms and input methods

### Concise review value

A responsive staff web application; the phone layout is the only viewport directly observed in this discovery, via the supplied screenshot. Actual real-world device priority is unknown — no analytics, research or explicit decision was available.

| Device or platform | Priority | Viewport or orientation | Primary input | Expected usage | Limitations | Optimisation level | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Wide desktop | Unknown real-world priority | ≥1280px (`xl`) — 3-column lane grid | Pointer and keyboard | All lanes visible together, each with independent overflow scroll | Not observed live; code-inferred only | Purpose-built current layout | E5, E13, E18 |
| Tablet | Unknown real-world priority | 768-1279px (`md`/`lg`) — 2-column lane grid, Ready to go may span | Touch and pointer | Same board, two lanes per row | Not observed live; code-inferred only. A legacy, pre-redesign review (E19) flagged a wider-app nav gap in this band, not re-verified for this surface | Purpose-built current layout | E5, E13, E18 |
| Phone | The only viewport with direct observed evidence | <768px — single stacked column, lanes in fixed order | Touch | Scanning a stacked list of cards and tapping named per-card actions, exactly as in E20 | 44px minimum targets are prescribed (E13) but not independently measured against the screenshot | Purpose-built current layout, directly observed | E5, E13, E18, E20 |

## 8. Environment of use

### Concise review value

A time-boxed, real-data operational environment in which several staff may update the same shared board concurrently, entirely within the salon's own short opening window.

### Confirmed environmental factors

- The board only ever operates within the salon's own open days/hours (Mon-Wed, canonical 08:30-13:00, extendable by staff-added extra slots) — E1.
- It handles real customer data (names, phone numbers, prices); the repository repeatedly calls out production-data caution — E1.
- A Supabase realtime booking subscription can move a card between lanes live from another device; the surface must announce this without stealing focus — E13, E3.
- Time-sensitive copy re-computes every 60 seconds against an explicit Europe/London wall clock rather than the device clock — E2, E9.

### Inferred environmental factors

- The screenshot plausibly shows genuine operational data rather than seeded sample data, given specific dog/owner names and non-round prices (strong inference, not confirmed).
- Staff plausibly consult this between grooming and front-of-house tasks, i.e. interruption-prone use (tentative inference; no direct observation or research).
- Given the business is a single-site salon (E1's business context), the "other staff" concurrency case is bounded, not large-team scale (strong inference).

### Confidence and evidence

**Classification:** Confirmed fact for data sensitivity, opening hours and realtime behaviour; tentative inference for interruption and shared-device dynamics.

**Evidence:** E1-E3, E9, E13, E20.

## 9. Primary outcome and success criteria

### Concise review value

Staff need to see, at a glance, which dogs still require action today (or on a chosen date) and move each one accurately through arrival → in-salon → ready → collected while resolving confirmation, welfare and payment exceptions — without the board ever mis-stating a dog's real-world status.

### Task anatomy

- **Trigger:** Staff open the Daily Brief tab, or land there automatically once per browser tab after login (E10), for today or a date chosen via "Choose date".
- **Entry prerequisites:** an authenticated staff session (E1's App.jsx auth gate) and that date's bookings loaded (or offline sample data, per E1, if disconnected).
- **First meaningful decision:** which lane or card needs the next action — read off the live "Due to arrive in X mins" marker, a lane's "late"/"to confirm" warning, or the header's Need-action count.
- **Required information:** booking status, slot time, confirmation state, welfare alerts, payment state, and a valid phone number to contact the owner.
- **Commitment point:** tapping a card's primary outcome button (`Check in` / `Start groom` / `Ready for collection` / `Mark collected`), which calls the same booking-update path the rest of the app uses.
- **Completion signal:** the card moves lane in the same render, a toast and `aria-live` announcement confirm it, and the header's counters recompute.
- **Final system state:** `bookings.status` (and `checkedInAt`/`readyAt` where relevant) is updated in Postgres; there is no separate Daily Brief data model.
- **Real-world result:** the physical whereabouts and financial state of every dog booked that day are accurately reflected for the whole team.
- **Consequence of failure:** a wrongly-progressed or unprogressed card could send a dog home unpaid unnoticed, leave a genuine late arrival unchased, or treat an unconfirmed booking as certain.

### Observable success criteria

- Every non-cancelled booking for the selected date appears in exactly one of the four lanes; unknown statuses are excluded and separately flagged rather than silently dropped (E4, E5).
- The live marker and per-card timing copy stay accurate to the minute without reordering the page under the user (E3, E9, E13).
- A dog with an outstanding balance can always be identified and paid, or explicitly deferred, in any lane, without blocking collection (E5, E13).
- A remote change from another device appears as one announced lane move, preserving focus and scroll (E3, E13).
- No card can be silently marked a no-show or skipped past a care stage without an explicit staff confirmation naming the skipped stage (E4).

**Evidence:** E3, E4, E5, E9, E13.

## 10. Primary user scenario

### Concise review value

A staff member opens the Daily Brief to run the physical day: checking dogs in, chasing confirmations, progressing grooms and clearing payment where it's outstanding.

### Scenario narrative

A staff member opens the Daily Brief on a phone. Several dogs are due to arrive, most still needing a confirmation chase, and a live marker flags one due in just over an hour. As dogs physically arrive, the staff member taps `Check in`; for anyone whose confirmation is still outstanding, they tap `Call` (or `Contact`, if no valid number is on file) straight from the card. Through the morning, dogs move from Arriving into With us as grooming starts, then into Ready to go once finished — at which point the board either records payment or, for a dog whose balance is still due, presents an explicit choice to take payment now or collect anyway and keep the balance visible. Throughout, the header's counts of late/on-site/ready/needs-action dogs, capacity, unpaid total and expected revenue stay current, and the two advisory notes quietly surface unrelated but genuinely due follow-ups (unpaid grooms from the past fortnight, dogs overdue a rebook).

### Confidence and evidence

**Classification:** Confirmed fact, directly grounded in the supplied screenshot and the code paths it exercises.

**Evidence:** E3, E4, E5, E9, E20.

## 11. Primary workflow

| Stage | User intention | System response | Required information | Likely friction | Error or recovery |
| --- | --- | --- | --- | --- | --- |
| 1. Trigger or first decision | Open the Daily Brief for today or a chosen date | Loads that date's board (row-shaped skeleton while loading); shows header stats, lanes and notes | Authenticated session; that date's bookings | Deciding which of several due arrivals to act on first | Load failure shows a banner with Retry without blanking previously confirmed rows (E3, corroborated by E22) |
| 2. Essential context or selection | Scan lane headers/warnings and the live marker; optionally toggle Need-action | Lane counts and warnings (e.g. "6 to confirm"); one live divider attached to the current focus card | Reminder/confirmation state, lateness, welfare alerts | A dense run of near-identical same-time cards on a narrow phone (as in E20's three 10:00 arrivals) | The filter offers a one-tap reset and never persists across dates (E13, E3) |
| 3. Evaluation, configuration, or choice | Decide the next outcome for one dog | Card exposes exactly one primary action plus a bounded secondary/More set per lane | A valid phone number for `Call`; amount due for `Take payment` | A late/unconfirmed dog with no phone number needs a fallback, not a dead link | `Contact` replaces `Call` when no valid number exists (E5) |
| 4. Confirmation or consequential action | Tap the primary action | Writes status through the shared update path; Ready-for-collection saves before any optional message; an unpaid Mark-collected opens an explicit three-way dialog | Current booking id/status | A confirmation prompt could feel like unnecessary friction if shown too often | It only appears when a care stage would genuinely be skipped, naming that stage (E4) |
| 5. Completed state and real-world result | See the dog reflected correctly for the rest of the team | Card moves lane in one render; `aria-live` and a toast announce the move; header counters recompute | — | A remote move must not steal focus mid-edit elsewhere on the page | Local-vs-remote echo de-duplication avoids a duplicate toast for the user's own action (E3) |

## 12. Primary focal area and hierarchy

### Primary focal area

The one dog/card that currently needs the next action, surfaced structurally through the live divider and lane warnings rather than through a single dedicated "now" panel separate from the lanes (E9, E13).

### Intended hierarchy

1. **Primary focus:** the next actionable dog, live-marked when the selected date is today.
2. **Secondary focus:** the three active lane groupings and their running counts/warnings.
3. **Supporting controls:** Choose date, Manage availability, the Need-action filter, and each card's own secondary/More actions.
4. **Tertiary information:** the Daily-progress footer and the two advisory notes, deliberately placed after the lanes and Home today.

### Current conflicts and evidence

None observed. The screenshot's visual order (lanes → Home today → Daily progress → notes) matches this intended order exactly, and the component's JSX composition confirms it structurally.

**Classification:** Confirmed fact for the structural order; strong inference that this ordering is a deliberate hierarchy rather than incidental, since no separate hierarchy decision record exists beyond E13's own non-negotiable rules.

**Evidence:** E3, E5-E9, E13, E20.

## 13. Constraints and decision status

| Area | Constraint or decision | Classification | Evidence | Confidence | Consequence of changing | Owner confirmation |
| --- | --- | --- | --- | --- | --- | --- |
| Lane model | Exactly four lanes, derived only from existing `bookings.status`; no new DB columns or migration | Explicitly approved and implemented | E4, E13 | High | A new lane or DB-backed lane field would break the "no migration" acceptance criterion and the three-way capacity-engine sync discipline (E1) | Yes, before adding any lane |
| Payment | Payment state is independent of lane and never blocks a status transition | Explicitly approved and implemented | E4, E5, E16 | High | Coupling them would contradict "payment never blocks status" and could trap a dog on-site over an unpaid balance | No |
| No-show | No automatic no-show; only a person can choose "Didn't show" | Explicitly approved and implemented | E13, E1 (no no-show status) | High | Auto-labelling would misrepresent a dog that simply hasn't arrived yet | No |
| Ready sequencing | "Ready for collection" saves status before any optional collection message; a failed/declined message never un-readies the dog | Explicitly approved and implemented | E13, E3 | High | Reordering could leave a ready dog invisible if messaging fails | No |
| Time authority | UI shows an explicitly computed Europe/London wall clock (not device clock); the database remains the booking-cutoff authority | Entrenched, current | E1, E2, E9 | High | A device-clock read could desync "late"/"due in" copy from reality | No |
| Modal chrome | Every modal on this surface builds on `ModalShell`/`AccessibleModal` (focus trap, ESC, scroll-lock, 44px targets) | Strongly established, implemented | E16 | High | A bespoke modal would likely regress keyboard/focus behaviour | No, unless deliberately deviating |
| Dormant code | `BookingFeed`/`BookingJourneyRow`/`JourneyIconButton`/`TodayKpiRow` remain in the tree, still tested, but unused by the live composition | Implemented but explicitly flagged for a later cleanup commit | E13 (rollout sequence), E15 | High | A reviewer or future change could mistakenly cite or edit the dormant files instead of `StatusBoard.jsx` | Only if removal is in scope |
| Filter scope | The Need-action filter must not persist across dates, must reset in one tap, and must never change lane assignment or totals | Explicitly approved and implemented | E13, E3 | High | A persistent or lane-altering filter would contradict "default board shows every active booking" | No |
| Capacity numbers | The daily cap (14) and capacity engine are shared, not reimplemented for this view | Entrenched | E1, E17 | High | A local reimplementation would risk drifting from the authoritative DB trigger | No |

## 14. Workflow branches

There are four genuine branches, each keyed to the state of the selected date; the E20 screenshot is an instance of Branch 1.

### Branch 1: Selected date is today (current)

- **Trigger:** Default landing, or Choose date → today.
- **Intention:** Operate the live day.
- **Required controls:** Live relative timings, minute re-tick, one live-focus marker.
- **Successful outcome:** The board reflects real-time salon state.
- **Exceptions:** A closed-today date still shows any existing bookings; a load failure keeps cached rows visible with Retry.
- **Evidence:** E13 ("Today"), E3, E9.

### Branch 2: Future selected date

- **Trigger:** Choose date → a date after today.
- **Intention:** Pre-plan or check a coming day.
- **Required controls:** Same lanes; due ordered by appointment time only.
- **Irrelevant controls:** Lateness calculation and the live marker are both suppressed.
- **Evidence:** E13 ("Future date").

### Branch 3: Past selected date

- **Trigger:** Choose date → a date before today.
- **Intention:** Review what actually happened.
- **Required controls:** Stored final statuses only.
- **Irrelevant controls:** No fabricated lateness from the current clock; an unresolved still-`Booked` record stays visibly unresolved rather than being hidden.
- **Evidence:** E13 ("Past date").

### Branch 4: Closed selected date

- **Trigger:** Any date the salon has marked closed.
- **Intention:** Confirm nothing is expected, or handle an existing exception booking.
- **Required controls:** The header's closed state stays authoritative; existing bookings, if any, still show in their lanes.
- **Irrelevant controls:** Urgency framing collapses to one calm empty state on a closed day with no bookings, rather than three empty lane panels.
- **Evidence:** E13 ("Closed date").

## 15. Contextual explanation vocabulary

| Situation | Explanation pattern | Evidence or rationale |
| --- | --- | --- |
| Reminder sent, not yet confirmed | "Needs confirmation" | Only shown when a reminder was actually sent (E9) — never flags a booking that was never asked |
| Lane has overdue arrivals | "{n} late" | Lateness always takes precedence over the confirmation count in the lane warning (E5) |
| No phone number for a late/unconfirmed dog | "Contact {first name}" instead of a dead `tel:` link | E5 |
| Skipping a care stage | "{dog} has not {stage}. Continue anyway?" | Names the specific skipped stage rather than a generic warning (E4, E3) |
| Marking an unpaid dog collected | "£{amount} is still due for {dog}", then Cancel / Mark collected anyway / Take £{amount} | Explicit line: "Collection and payment are separate. Continuing will not mark this booking paid." (E16) |
| Empty lane | "No dogs in this lane" | E5 |
| Nobody sent home yet | "No dogs have gone home yet." | Deliberately distinct copy from the other lanes' empty state (E5) |
| No bookings at all that date | "No bookings on this date" | E3 |
| Remote status change | "{dog} moved from {lane} to {lane}." — one toast plus one `aria-live` announcement | E3, E13 |
| Advisory, non-urgent facts | Soft framing (e.g. "worth a tidy at cash-up"), shown only when the underlying count is genuinely greater than zero | E8 |

## 16. Pressure, failure and recovery conditions

| Condition | Likelihood | Impact | Affected workflow | Required design response | Evidence |
| --- | --- | --- | --- | --- | --- |
| Several same-status, same-time bookings look near-identical on a narrow phone | Observed directly (three 10:00 arrivals in E20) | Medium | Choosing the right card | Dog name as headline, plus a stable ID tie-break in sort order | E20, E4 |
| Minute re-tick while staff are mid-action | High (every 60s the page is open) | Medium if mishandled | Any lane | Timing copy updates without reordering the page or moving scroll/focus | E3, E13 |
| Remote update from another device | Medium | High if it steals focus or hides a card | Any lane | Single announced move; focus/scroll preserved; local-echo de-duplication | E3, E13 |
| Booking load fails after a prior successful load | Medium | High (must not look empty) | Whole board | Keep last confirmed board plus a failure banner and Retry | E3, E13, E22 |
| Booking load fails on first load (nothing cached) | Medium | High | Whole board | Board-level error and Retry; must not also claim the date is empty | E3, E13 |
| Dog has no valid phone number but is late/unconfirmed | Medium | Medium | Contacting the owner | Labelled `Contact` action rather than a dead `tel:` link | E5 |
| Money still owed at the collection moment | Medium-high (E20 shows £306 unpaid against 7 booked dogs) | High if mishandled | Ready to go | Explicit three-way choice; balance stays visible afterwards | E13, E16 |
| Unknown or legacy booking status reaches the board | Low | High (a dog could be invisible) | Whole board | Excluded from active lanes/counts but surfaced in a dedicated recovery panel with a "Fix booking" action | E5, E3 |
| Interrupted attention on a phone mid-shift | Strong inference (salon context; no direct observation) | Medium | Whole board | Stable lane order; explicit state text rather than colour-only cues | E13; not directly observed |
| Offline or sample-data mode | Confirmed as a supported mode; real-world frequency unknown | Medium | Whole board | Renders identically off sample data; a quiet "Offline preview" line replaces any claim of live accuracy | E3, E1 |

## 17. Accessibility and inclusion context

- Each lane and the Home-today history are labelled regions with a heading and a live count; each card is an `article` labelled by dog name, time and lane (E5).
- Card movement between lanes is announced through one `aria-live="polite"` region rather than multiple competing announcements (E3, E13).
- Icon-only controls (time chip, message bubble) carry `aria-label`s describing the destination and current state, not just the icon (E5, E9).
- Primary/secondary actions and cards target a documented 44px minimum, consistent with the shared modal standard's touch-target rule (E13, E16).
- Colour is supplementary: lateness, confirmation and payment states are always paired with written text ("late", "Needs confirmation", "£X due"), never colour alone (E5, E13).
- The three modals on this surface inherit focus trap, ESC-to-close, scroll-lock and focus restoration from the shared modal primitives rather than reimplementing it (E16).
- Reduced-motion preferences are respected for the one scripted scroll-into-view this surface performs (E3).
- Skipping a care stage or collecting an unpaid dog requires an explicit, plain-language confirmation naming the specific consequence, rather than relying on implied state (E4, E16).
- Not independently verified in this discovery pass: actual screen-reader output, real keyboard-only traversal, zoom/text-scaling behaviour, and measured colour contrast — each needs running-application testing.

**Classification:** Confirmed fact for implemented semantic/announcement/focus patterns; supported interpretation for the wider product-specific accessibility needs.

**Evidence:** E3, E5, E9, E13, E16.

## 18. Contradictions and unresolved questions

| Topic | Evidence A | Evidence B | Why it matters | Current interpretation | Decision required |
| --- | --- | --- | --- | --- | --- |
| Which design doc governs the card | E12 (14 July, still in `docs/plans/`) prescribes an appointment-sentence plus 8-icon journey row | E13 (20 July, archived) prescribes named-button lane cards; E5/E20 show the latter live | Reading only E12 would describe a card that no longer renders | E13/E5 is current; E12's card prescription is superseded, though its header/rename decisions remain valid | No — resolved via git history (E14) and an import-graph trace (E15) |
| Dormant components | `BookingFeed.jsx`/`BookingJourneyRow.jsx`/`JourneyIconButton.jsx`/`TodayKpiRow.jsx` still exist and are still unit-tested (E22) | None is imported by `TodayView.jsx` or `StatusBoard.jsx` (E15) | A reviewer could mistake their tests or JSX for describing the live surface | They are dormant implementation, not current behaviour; E13 itself anticipated this as a deferred cleanup step | No, unless cleanup is in scope |
| Lane naming | E13's spec calls the first lane "Due and late" throughout | The rendered/live label is "Arriving" (E5, E20) | Citing the spec's exact wording would misquote the live UI | "Arriving" is current truth for rendered-experience claims; no explicit rename decision record was found, only the shipped code | No — code/rendered evidence outranks the spec's wording for this claim type, but flagged in case the rename was unintentional drift |
| Whether the June 2026 review still applies | E19 flags iPad nav gaps and touch-target debt for the wider staff dashboard | E19 pre-dates both Daily Brief redesigns and never names a "Today"/"Daily Brief" area | Carrying E19's specific scores into a review of the current Daily Brief would misattribute pre-redesign findings | Treat E19 as legacy cross-cutting context only, not as evidence about the current Daily Brief specifically | No for this discovery; a later review should re-observe rather than reuse E19's scores |
| Real vs sample data in the screenshot | The screenshot's names/prices read as genuine operational data | No environment/account metadata was supplied with it | Affects whether this document, and anything built on it, is handling real customer data | Treated as possibly real customer data; this discovery avoided reproducing more of it than each claim needed | No for discovery; a later reviewer should confirm before further reuse |

## 19. Questions for the product owner

No material questions remain for reviewing the current Daily Brief three-lane status board as bounded above (§4).

A later review that wants confirmed — not code-inferred — desktop or tablet visual judgement should first gather screenshots or a live walkthrough at those widths. That is an evidence-gathering step, not a product decision, so it is not raised as a question here.

## 20. UX review handoff

### UX Review Handoff

Context version: 2026-08-05, `main@6d73281a5010737725c60bc6f24bfdf7536f26e6`

Review target: The current Daily Brief (`/today`) three-lane status board for a selected date, as implemented; the phone viewport is the only directly observed instance (via the supplied screenshot), while desktop/tablet layout rests on code inspection only

Product: Operational salon booking and day-of-visit management platform joining bookings, dog/customer records, capacity rules and payment state for a single dog-grooming salon

Primary users: Authenticated salon staff running day-of operations — checking dogs in, tracking who's on-site, collecting and taking payment — on whichever date they select, most often today

Secondary or affected users: Customers who are called or messaged about confirmation or collection, dogs whose welfare alerts and status are tracked, and other staff viewing/updating the same shared board concurrently

Primary device and input: Responsive staff web app; the observed phone layout stacks four lanes in one continuous touch-scrolled column, while tablet/desktop code shows 2-up and 3-up lane grids respectively (not independently observed)

Environment of use: Live, time-boxed daily operation within the salon's own Mon-Wed open hours, with real customer data, concurrent staff and realtime cross-device updates; direct physical/interruption observation was not performed

Primary outcome: See, at a glance, which dogs need action today (or on a chosen date) and move each one accurately through arrival → in-salon → ready → collected, resolving confirmation, welfare and payment exceptions without ever mis-stating a dog's real status

Success criteria: Every active booking sits in exactly one correct lane; live/relative timing stays accurate without reordering the page; an unpaid balance is always visible and actionable without blocking collection; a remote change produces one announced, focus-preserving lane move; no stage or no-show is ever set without an explicit, specific staff confirmation

Primary scenario: A staff member opens the Daily Brief on a phone, sees several dogs due to arrive (several still needing a confirmation chase) and one flagged as due imminently by the live marker, checks dogs in as they arrive or calls owners whose confirmation is outstanding, then progresses each through With us → Ready to go → Home today — taking payment or explicitly choosing to collect anyway where money is still owed — while the header's counts and the day's totals stay current throughout

Primary workflow:

1. Open the Daily Brief for today or a chosen date
2. Scan lane warnings, the live "due to arrive" marker, and optionally the Need-action filter to find who needs attention
3. Choose the next outcome for one dog — check in, call/contact, start groom, mark ready, take payment, or mark collected
4. Confirm the action; a stage-skip or unpaid-collection prompt appears only when it genuinely applies
5. See the card move lane with one announcement, and the header/footer counts update to match

Primary focal area: The single dog/card that most needs the next action right now, surfaced through the live divider and lane warnings rather than a separate "now" panel

Intended hierarchy:

1. The next actionable dog (live-marked when the date is today)
2. The three active lane groupings and their counts/warnings
3. Date/availability/filter controls and each card's own secondary actions
4. The Daily-progress footer and the two advisory notes

Must preserve:

- Lanes are derived only from existing booking status; no new lane/status data model
- Payment stays independent of lane and never blocks a status transition
- No automatic no-show; only an explicit staff choice
- Ready-for-collection saves before any optional collection message, and a failed/declined message never un-readies the dog
- A skipped care stage or an unpaid collection always asks an explicit, specific confirmation
- Remote/realtime lane moves announce once and preserve focus and scroll

Challenge only with strong evidence:

- The current lane set and ordering (Arriving / With us / Ready to go / Home today) and their per-lane sort rules
- The existing responsive structure (stacked phone column; 2-up tablet; 3-up desktop grid)
- The shared modal chrome used by this surface's three modals

Open to refinement:

- Card density, wording and scanability on a narrow phone with several same-time bookings, as in the observed screenshot
- Whether/how the dormant icon-journey components should finally be removed
- Visual treatment of the header's operational-status grid and secondary totals

Workflow branches:

- Today (selected date = today): live timings, lateness and one live marker
- Future selected date: same lanes, no lateness/live marker, due ordered by time only
- Past selected date: stored final statuses only, no fabricated lateness
- Closed selected date: header's closed state stays authoritative; existing bookings still show in their lanes

Contextual explanations:

- "Needs confirmation"
- "{dog} has not {stage}. Continue anyway?"
- "£{amount} is still due for {dog}" / "Mark collected anyway" / "Take £{amount}"
- "No dogs in this lane" / "No dogs have gone home yet." / "No bookings on this date"

Accessibility priorities:

- Labelled lane/card regions, one `aria-live` move announcement, 44px targets, colour-supplementary state text, and full focus-trap/ESC/scroll-lock behaviour on every modal

Pressure test:

A phone-width board with several near-identical same-time, same-status cards, a minute re-tick, a possible remote update from another device, and a still-outstanding balance on a dog about to be collected — all while the underlying booking data must never be shown inaccurately

Known unresolved decisions:

- None for this discovery pass; a later review wanting confirmed (not code-inferred) tablet/desktop visual judgement should gather screenshots or a live walkthrough at those widths first

Evidence available to the reviewer:

- E1 `CLAUDE.md`
- E2 `docs/today-command-centre.md`
- E3 `TodayView.jsx`
- E4 `engine/dailyBrief.ts`
- E5 `StatusBoard.jsx`
- E6 `TodayHeader.jsx`
- E7 `TodaySummaryStrip.jsx`
- E8 `TodayBriefNotes.jsx`
- E9 `engine/today.ts` + `LiveArrivalDivider.jsx`
- E10 `App.jsx` routing
- E11 `navConfig.jsx`
- E12 `docs/plans/2026-07-14-daily-brief-design.md` (superseded card design)
- E13 `docs/archive/.../2026-07-20-daily-brief-three-lane-status-board-implementation-brief.md`
- E14 `git log`
- E15 dead-import trace for the dormant icon-journey components
- E16 `docs/modal-standard.md` + modal imports
- E17 `constants/salon.ts` + `engine/utilisation.ts`
- E18 `index.css` breakpoints
- E19 `docs/ux-review-2026-06.md` (legacy)
- E20 user-supplied screenshot
- E21 `package.json`
- E22 `today.component.test.jsx` + `StatusBoard.component.test.jsx` (titles)

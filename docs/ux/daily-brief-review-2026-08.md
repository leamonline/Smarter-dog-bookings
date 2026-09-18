# Daily Brief (`/today`) — UX review and redesign strategy, August 2026

> **Scope.** The staff Daily Brief at `/today` — the screen the salon is run from.
> Analysis only: no `src/` change was made in this pass.
> **Branch/commit under review:** `claude/daily-brief-redesign-pw04cf` at `9817fe8`.
> **Date:** 2026-08-24. **Reviewer harness:** [`captures/2026-08/daily-brief-review.spec.ts`](captures/2026-08/daily-brief-review.spec.ts).

## 1. Analysis scope and how it was produced

Every rendered state came from the offline sample dataset, never production. The app was
built and served with `VITE_FORCE_OFFLINE=1`, then driven by Playwright with a fixed clock,
copying the harness of `e2e/daily-brief.spec.ts` — since replaced by
[`e2e/day-stack.spec.ts`](../../e2e/day-stack.spec.ts) when the four-zone board became the
time-ordered day stack.

```bash
VITE_FORCE_OFFLINE=1 npm run build
VITE_FORCE_OFFLINE=1 npx vite preview --port 4173 --strictPort &
npx playwright test --config docs/ux/captures/2026-08/pw.config.ts
```

**Harness fix required (environment, not product).** This container has Playwright browser
build 1194; `@playwright/test@1.62.1` looks for 1234 and aborts. The review config sets
`launchOptions.executablePath` to the pre-installed `/opt/pw-browsers/chromium`. The repo's
own [`playwright.config.ts`](../../playwright.config.ts) was **not** modified.

**The offline fixture calendar.** [`src/data/sample.js`](../../src/data/sample.js) is keyed by
*weekday*, mapped onto the visible week by
[`useOfflineState.ts`](../../src/hooks/useOfflineState.ts). So:

| Fixture day | Date used | Contents |
| --- | --- | --- |
| `mon` | **2026-07-13** | 7 bookings — every lane populated, 1 unknown-status row |
| `tue` | **2026-07-14** | 3 bookings, all `Booked` |
| `wed` | **2026-07-15** | 1 *cancelled* booking → renders as an empty day |

A single-dog day does not exist in the fixtures; it was **produced through the UI** by
marking two of Tuesday's three dogs "Didn't show" (which writes `Cancelled` +
`cancel_reason='No-show'` — see invariant 3). An over-capacity day is **not producible**:
the largest fixture day is 7 dogs against a cap of 14.

### 1.1 State × width matrix

| State | Status | How produced / why not |
| --- | --- | --- |
| Populated live day | ✅ observed at 390 / 1024 / 1440 | Mon 2026-07-13, clock 11:00 BST (E13–E15) |
| Empty day | ✅ observed at 390 / 1440 | Wed 2026-07-15 (E18) |
| Single-dog day | ✅ observed at 1440 | Tue 2026-07-14, two dogs no-showed via the More menu (E19) |
| Nothing arrived yet (08:30 analogue) | ✅ observed at 1024 and 1440 | Tue 2026-07-14, clock 06:30 (E17, E21) |
| **Over-capacity day** | ❌ **code-read** | Max fixture day is 7/14. `SecondaryTotals` has **no** `dogsBooked > capacityTotal` branch (E7) |
| **Loading** | ❌ **code-read** | `useBookings` L107 short-circuits to `setLoading(false)` when `!supabase`; the skeleton can never mount offline (E9) |
| **Failed fetch** | ❌ **code-read** | `setError` is only reachable on the live Supabase path (E9) |
| Keyboard traversal | ✅ observed at 1024 | 45 Tab presses recorded, plus an empty-day control (E22) |
| Focus-visible rings | ✅ observed at 1024 | Per-control computed styles (E23, E16) |
| 200% browser zoom | ✅ observed | 1440×900 at 2× = 720×450 CSS px (E20) |
| `prefers-reduced-motion` | ✅ observed at 1440 | `emulateMedia({reducedMotion:"reduce"})` (E24) |
| `AwaitingDepositsCard`, `MissingSizeNotice`, `TodayBriefNotes` | ❌ **code-read** | All three return `null` on the offline fixtures (no unpaid deposits, no size-less dogs, no retention data). Not in any capture (E10) |

## 2. Evidence map

| ID | Source and version | Currency | What it demonstrates | Limitations |
| --- | --- | --- | --- | --- |
| E1 | [`TodayView.jsx`](../../src/components/views/TodayView.jsx) (691 L) @`9817fe8` | Current | Composition root: header → optional deposits card → `StatusBoard` → `MissingSizeNotice` → `TodaySummaryStrip` → notes. Owns the auto-scroll effect (L566-604) and the `patch`/`updateStatus` write path | Static read |
| E2 | `src/components/views/today/StatusBoard.jsx` (584 L) @`9817fe8` — **removed 2026-08-25**, replaced by [`board/SalonBoard.jsx`](../../src/components/views/today/board/SalonBoard.jsx) | Historical | `LANE_META`, `StatusBookingCard`, `CardActions`, `laneWarning`, `HomeToday`, `UnknownStatusRecovery`. **`successTone` (L237-239) tints every *progressed* card emerald and leaves `Booked` — including late — plain white** | Static read |
| E3 | `src/components/views/today/ArrivingSlotGroup.jsx` @`9817fe8` — **removed 2026-08-25** with the card lanes | Historical | The Arriving lane's separate card + action implementation. `needsContact` gates Message; `showCall` gates Call. Arriving cards carry a chevron, not a slot chip | Static read |
| E4 | [`engine/today.ts`](../../src/engine/today.ts) (1,034 L) @`9817fe8` | Current | `buildTodayFeed` `actionReasons` = late \| confirmation \| collection \| **payment (`rank>=1 && owes`)**; `buildDaySummary` (`arrived` cumulative, `ready`/`collected` current); `entryOpStatus` ranked mapping | Static read |
| E5 | [`engine/dailyBrief.ts`](../../src/engine/dailyBrief.ts) @`9817fe8` | Current | `buildDailyBriefBoard` lane assignment + sort; `boardTimingLabel` returns `null` for non-today active lanes | Static read |
| E6 | `grep` for `entryOpStatus\|OpStatusChip\|RAIL_TONE_CLASS\|CHIP_TONE_CLASS` across `src/**`, executed 2026-08-24 | Current, executed | **Zero rendered consumers.** The only hits are `engine/today.ts` (definition), `engine/today.test.ts` (12 assertions) and a *comment* in `parts.jsx` L112 | Proves absence of import, not absence of intent |
| E7 | [`TodayHeader.jsx`](../../src/components/views/today/TodayHeader.jsx) @`9817fe8` | Current | `OperationalFact` renders `value` above `label` with **no coupling** — `value={lateCount > 0 ? lateCount : "On time"}` under `label="Late"`. `SecondaryTotals` prints `{dogsBooked}/{capacityTotal}` with one unconditional class | Static read |
| E8 | `grep` importers for `TodayKpiRow`, `BookingFeed`, `BookingJourneyRow`, `JourneyIconButton`; `grep` for their symbols in `dist/assets/*.js` after a production build | Current, executed | **All four are dead.** No non-test importer; `buildJourneyActions`/"Being groomed" absent from the built bundle | — |
| E9 | [`useBookings.ts`](../../src/supabase/hooks/useBookings.ts) L96-144 @`9817fe8` | Current | `if (!supabase \|\| !weekStart) { setLoading(false) }` and `setError` only inside the fetch path — the loading and error branches of E1 are unreachable offline | Static read |
| E10 | [`AwaitingDepositsCard.jsx`](../../src/components/views/today/AwaitingDepositsCard.jsx), [`MissingSizeNotice.jsx`](../../src/components/views/today/MissingSizeNotice.jsx), [`TodayBriefNotes.jsx`](../../src/components/views/today/TodayBriefNotes.jsx) @`9817fe8` | Current | Each early-returns `null` with no data; explains their absence from every capture | Static read |
| E11 | [`docs/today-command-centre.md`](../today-command-centre.md) vs code, 2026-08-24 | **Stale** | Documents `TodayNowStrip.jsx`, `selectNowNext`, `DUE_SOON_MINUTES` and six sections ("Immediate attention", "Dogs due in", "In salon now", "Payments & handover"). **None exist.** [`docs/archive/superpowers/plans/2026-07-15-daily-brief-live-arrivals.md`](../archive/superpowers/plans/2026-07-15-daily-brief-live-arrivals.md) L139/L319 is the deletion order that was carried out and never back-documented | Where doc and code disagree, code wins |
| E12 | `grep` of `buildImmediateAttention`, `buildCollectionQueue`, `buildPaymentsList`, `buildArrivalsBySlot`, `buildInSalonList`, `dedupeConcernSections`, `splitArrivalGroups`, `countDogsPerOwner` in `src/components/**` | Current, executed | **Zero component consumers** for all eight — the engine behind E11's deleted sections is still built and tested | Engine-to-engine use is unaffected |
| E13 | [`E-mon-1440-full.png`](captures/2026-08/E-mon-1440-full.png) (full page) and [`E-mon-1440-top.png`](captures/2026-08/E-mon-1440-top.png) (scrolled to top) · `/today?date=2026-07-13`, clock `2026-07-13T11:00+01:00`, 1440×900 | Observed 2026-08-24 | The whole populated live day: header, unknown-status alert, three lanes, Home today, Daily progress. [`E-header-mon-1440.png`](captures/2026-08/E-header-mon-1440.png) is the header alone, showing the populated `1 / LATE` case | Offline sample data; the "Demo data" banner is offline-only chrome |
| E14 | [`E-mon-1024-fold.png`](captures/2026-08/E-mon-1024-fold.png) · same, 1024×1366 | Observed | The tablet case: the entire day fits with **zero** scroll (`scrollHeight` 1366 = viewport). 2-column grid, Ready spanning both | — |
| E15 | [`E-mon-390-fold.png`](captures/2026-08/E-mon-390-fold.png) · same, 390×844. Companions: [`E-mon-390-top.png`](captures/2026-08/E-mon-390-top.png) (forced to top) and [`E-mon-390-full.png`](captures/2026-08/E-mon-390-full.png) (full page) | Observed | The phone on arrival: the viewport opens **inside Max's card** — no date, no lane title, no counts. The `-top` shot is what the groomer would see if the page did not scroll itself | — |
| E16 | Deference + geometry audit over `<main>`, 1440×900, Mon 11:00 | Measured 2026-08-24 | **13** distinct text colours · **17** background fills · **13** border declarations (10×1px, 3×4px) · **32** controls in `<main>`, **29** in viewport · **35** numeric tokens in viewport. Per-control boxes and font metrics | Counts exclude the app nav (outside `<main>`); numeric tokens split "2 hrs 30 min" into `2` and `30` |
| E17 | [`E-header-calm-1440.png`](captures/2026-08/E-header-calm-1440.png) · `/today?date=2026-07-14`, clock `06:30+01:00`, 1440×900, header element shot | Observed | **"On time" over the label "LATE"; "All calm" over "ACTION"; `£130 unpaid £130 expected`** | — |
| E18 | [`E-empty-1440-fold.png`](captures/2026-08/E-empty-1440-fold.png), [`E-empty-390-fold.png`](captures/2026-08/E-empty-390-fold.png) · `?date=2026-07-15` | Observed | The empty day: 2 controls, 6 numeric tokens, 8 text colours. Calm and correct | — |
| E19 | [`E-singledog-1440-fold.png`](captures/2026-08/E-singledog-1440-fold.png) · Tue, two dogs no-showed via More → "Didn't show" | Observed | One-dog day: 7 controls, 16 numeric tokens; the three-column shell is unchanged | Derived state, not a fixture |
| E20 | [`E-zoom200-720-fold.png`](captures/2026-08/E-zoom200-720-fold.png) · 720×450 CSS px | Observed | 200% zoom reflows to one column, **no horizontal overflow** (`scrollWidth <= clientWidth`). WCAG 1.4.10 passes | Viewport emulation of zoom, not a real browser zoom gesture |
| E21 | The calm morning, Tue 2026-07-14 clock 06:30: captured at 1440×900 ([`E-calm-1440-fold.png`](captures/2026-08/E-calm-1440-fold.png)) and at 1024×1366 ([`E-earlymorning-1024-fold.png`](captures/2026-08/E-earlymorning-1024-fold.png)) | Observed | Nothing arrived: 3 identical yellow "Check in" buttons; two empty lanes each rendering a full card to say "No dogs in this lane"; the "Due to arrive in 2 hrs" pill painted in **`brand-yellow`, the action colour**. **§5's "calm morning" deference counts are from the 1024 run**, the captures from both | The two widths differ in layout (2-col vs 3-col), so the counts describe 1024 only |
| E22 | Tab-order trace (45 presses, 1024×1366) + empty-day control | Measured | Populated day: Tab 1 = "Open Max's dog file". Empty day: Tab 1 = "Skip to content". Skip-link, nav, header filter, Choose date, Manage availability and Fix booking land at stops **29–44** | Chromium under Playwright; the causal mechanism is inferred |
| E23 | Focus-ring probe, 1024, plus [`E-focusring-1024-fold.png`](captures/2026-08/E-focusring-1024-fold.png) (`Check in Max` focused) | Measured | Every Daily Brief control gets `outline: 2px solid` + `2px` offset (global `:focus-visible` in [`index.css`](../../src/index.css) L366). Dog-name target **35×23**, owner-name **71×15**; card primaries and More all **44** high | — |
| E24 | Reduced-motion audit scoped to `<main>`, 1440, under `emulateMedia({reducedMotion:"reduce"})` | Measured | **0** keyframe animations; 14 transition declarations, all colour/`transform` at 0.15s. The skeleton uses `motion-safe:animate-pulse`; the auto-scroll switches to `behavior:"auto"` under reduce (E1 L601) | **No capture stored on purpose:** the render is byte-identical to [`E-mon-1440-fold.png`](captures/2026-08/E-mon-1440-fold.png) (verified by MD5), which *is* the result |
| E25 | Contrast probe (canvas-resolved colours, alpha-composited), Mon + Tue, 1440 | Measured | 24 probes over two days; 30 elements resolved. **Every text token measured passes WCAG AA 1.4.3** — lowest 4.68:1 (`Daily progress` stat label) and 4.76:1 (`OperationalFact` label). One **non-text** measurement is sub-threshold: the Arriving card's `ChevronRight` at **2.63:1**, against WCAG **1.4.11**'s 3:1 for UI components — a different criterion from text contrast | Tailwind v4 emits `oklch()`; naive rgb parsing gives nonsense, hence the canvas resolver. Some probes resolve on only one of the two days (e.g. the ACTION cell is absent when nothing needs action) |
| E26 | Auto-scroll offset probe; [`E-mon-1440-fold.png`](captures/2026-08/E-mon-1440-fold.png) is the resulting first paint at 1440 | Measured | On load, Mon 13 Jul: **683px** at 390×844, **0px** at 1024×1366, **254px** at 1440×900; **208px** on the calm Tue at 1440. In the 1440 capture the header is fully off screen | — |
| E27 | `grep` of every `parts.jsx` export against non-test `src/**` | Current, executed | Dead to the screen: `WaitBadge`, `waitTone`, `WAIT_AMBER/RED_MINUTES`, `RAIL_TONE_CLASS`, `CHIP_TONE_CLASS`, `OpStatusChip`, `BookingStatusLine`, `ActionTile`, `PaymentMethodChooser`, `MarkPaidAction`, `formatMinutes`, `formatLondonTime` | `SectionCard`/`EmptyState`/`StatusPill` are used by *other* views |

## 3. Executive summary

This screen is better built than it looks. Every text token I measured passes WCAG AA (E25);
it reflows at 200% zoom with no horizontal overflow (E20) and declares no keyframe animation
under reduced motion (E24). Every primary action is 44px tall, uses the right verb for the
dog's actual state, and pairs with a real safeguard — "Mark collected" on a dog that owes
money routes through a confirmation (E2). The confirmation model is scrupulous: a recorded
`reminder_confirmed_at` tick and a derived "Confirmed in chat" chip stay distinct. On a tablet
at 1024px the whole day fits in one screen with zero scrolling (E14). Leave that alone.

What it is not is *ranked*. The engine that ranks operational urgency — `entryOpStatus`, nine
states deep, unit-tested — **has no rendered consumer at all** (E6); its tone maps are exported
and never imported. The card takes its colour from `successTone` instead, which tints every
*progressed* dog emerald and leaves a `Booked` dog — including one 2.5 hours overdue — plain
white (E2, E13). The most urgent card on the board is its least emphasised, and the two calmest
cards are the only tinted ones. Five yellow buttons of equal weight then say five different
things.

**The single highest-value change is to connect `entryOpStatus` to the card.** It needs no new
data, no migration and no new component — the mapping, the tones and the tests already exist.
It turns an unranked board into a ranked one in one diff.

*Confidence: confirmed for everything above. Salon reality — device, staffing, lighting —
is unmeasured and lives in §11, not in the findings.*

## 4. The disagreement table

Built from E13/E16 (1440×900, Mon 13 Jul 2026, 11:00 BST): one dog 2h30 overdue, two mid-groom,
one waiting for collection, one gone home, one with a broken status. Visual weight ranks
painted salience (area × type size × weight × fill saturation, measured in E16). Operational
urgency ranks what a groomer must act on next. Δ = urgency rank − visual rank; **negative =
under-weighted relative to its urgency**.

| Element | Visual rank | Urgency rank | Δ | Note |
| --- | ---: | ---: | ---: | --- |
| Max's card — 2h30 overdue | 11 | **1** | **−10** | Plain white, `border-brand-paper-line`, identical chrome to Rex who is due in an hour. Its only cues are three ≤12px coral text runs |
| Milo — unknown status, in no lane | 5 | 2 | −3 | Coral alert panel, top of the board. **Broadly correct** |
| Luna — ready, waiting for collection | 9 | 3 | −6 | Emerald-tinted card, "Waiting" at 12px, `Mark collected` in the same yellow as everything else |
| Bella — arrived 08:30, groom not started at 11:00 | 8 | 4 | −4 | Emerald tint reads as *done*, not *waiting on you* |
| Charlie — in bath, ready to mark ready | 7 | 5 | −2 | As above |
| Five yellow primary buttons (identical) | **4** | 1–6 | — | One fill, one size, one weight for six different urgencies |
| Rex — due 12:00, nothing to do | 12 | 6 | −6 | Correctly quiet |
| Lane titles (`Arriving` / `With us` / `Ready to go`) | 6 | 7 | −1 | Fine |
| Lane column shells (3 × white card, 4px top accent) | **1** | — | **+∞** | 198k/143k/78k px². The heaviest thing on screen is furniture |
| `Monday 13 July` | 2 | 12 | +10 | 27px/900. Orientation, not action — and it scrolls away anyway (E26) |
| Operational fact grid (`1 LATE / 3 ON SITE / 1 READY / 4 ACTION`) | 3 | 8 | +5 | 16px/900 numbers. "1 Late" names no dog and only `ACTION` is tappable |
| `Daily progress` strip (4 / 1 / 1 + takings) | 10 | 11 | +1 | Correctly below the fold |
| `Home today` collapsed row | 13 | 10 | +3 | Correctly quiet |
| `7/14 capacity · £199 unpaid · £303 expected` | 14 | 9 | +5 | 11px, least prominent row. Correct for 7/14; **wrong if it were 15/14** (E7) |
| `Salon open` pill + `No online slots available` | 15 | 13 | +2 | Two different kinds of fact, one line, one register |

**The pattern.** Emphasis tracks *lifecycle progress* (later status → greener, calmer) and
*container structure* (lanes and headers), not *urgency*. Findings F-1 to F-4 all trace here.

## 5. Deference counts (E16, 1440×900, Mon 11:00, scoped to `<main>`)

| Measure | Populated day | Calm morning (E21) | Empty day (E18) |
| --- | ---: | ---: | ---: |
| Distinct text colours | 13 | 11 | 8 |
| Distinct background fills | 17 | 12 | 7 |
| Distinct border declarations | 13 (10×1px, 3×4px) | 10 | 3 |
| Controls in `<main>` | 32 | 17 | 2 |
| Controls **visible at once** | **29** | 17 | 2 |
| Numeric tokens visible at rest | **35** | 25 | 6 |

Six dogs produce 29 simultaneously visible controls and 35 numbers. A resting Arriving card
carries **5** tappable elements (dog name, owner name, chevron, primary, More); a late one
carries **7**. The empty day, by contrast, is exemplary — 2 controls, 6 numbers, 8 colours.
The screen is calm when there is nothing to do and loud when there is.

## 6. Findings, ranked by severity × assumed frequency

> Frequency is **not measured anywhere** — no analytics, no session recording, no research.
> Every frequency below is a stated assumption with a falsifier.

---

**F-1 · The overdue dog is the only untinted card on the board; the two calmest dogs are the only tinted ones.**
**Severity:** causes error · **Frequency:** every day a dog is late — assumed near-daily for a
walk-in-culture salon; falsified by a week's `booking_events` showing <1 late arrival/day ·
**Confidence:** confirmed · **Evidence:** E2, E13, E14, E15
**Observed:** 1440/1024/390, populated live day. `successTone` (StatusBoard L237-239) applies
`border-emerald-200 bg-emerald-50/45` when `reminderConfirmedAt || status !== BOOKED`. Max
(Booked, 150 min overdue) therefore renders `border-brand-paper-line bg-white`, pixel-identical
to Rex (Booked, due in an hour). Bella and Charlie, both mid-groom with nothing outstanding,
are the two green cards.
**Cost:** the glance lands on green; finding the overdue dog means reading three ≤12px coral
text runs. Assume 3–6 s and a full read, versus ~0 s.
**Change:** delete `successTone`; derive the card's border, tint and a left accent rail from
`entryOpStatus(entry).tone` through the existing `RAIL_TONE_CLASS`/`CHIP_TONE_CLASS` maps, and
render `OpStatusChip` in the card head. Emerald then means *ready*, coral *late*, `muted`
*finished*.
**Touches:** `src/components/views/today/StatusBoard.jsx`, `src/components/views/today/ArrivingSlotGroup.jsx`, `src/components/views/today/parts.jsx`
**Verify:** extend `StatusBoard.component.test.jsx` — a late Booked entry must carry the coral
rail class and an in-bath entry must not; add a Playwright assertion that the card with
`data-action-reason="late"` has the highest-saturation border on the board.
**Risk:** green currently doubles as the *recorded-confirmation* cue alongside `ConfirmedMark`.
Invariant 4 (recorded vs derived confirmation) forbids collapsing those. Keep `ConfirmedMark`
and `ChatConfirmedChip` exactly as they are; only the card *surface* changes owner.

---

**F-2 · `entryOpStatus` — the ranked mapping the docs call the single source of on-screen urgency — has no rendered consumer.**
**Severity:** slows work (root cause of F-1, F-3) · **Frequency:** constant · **Confidence:** confirmed · **Evidence:** E6, E11, E12, E27
**Observed:** all widths and states. `grep` across `src/**` returns the definition, its unit
tests, and a comment. `RAIL_TONE_CLASS`, `CHIP_TONE_CLASS` and `OpStatusChip` are
exported and never imported. Eight further engine builders (`buildImmediateAttention`,
`buildCollectionQueue`, `buildPaymentsList`, …) likewise have zero component consumers — they
power the six sections `docs/today-command-centre.md` still describes and the board no longer has.
**Cost:** urgency is re-derived ad hoc in two places instead — `CardActions` (StatusBoard) and
`ArrivingCardActions` (ArrivingSlotGroup). Every future urgency change costs two edits and
risks a third disagreement.
**Change:** make `entryOpStatus` the card's single input for tone, chip and primary-action
selection, replacing both branch sets. Then correct `docs/today-command-centre.md`.
**Touches:** `src/components/views/today/StatusBoard.jsx`, `src/components/views/today/ArrivingSlotGroup.jsx`, `docs/today-command-centre.md`
**Verify:** a test asserting that for each of the nine `OpStatusKind` values the rendered chip
label equals `OP_STATUS[kind].label` — i.e. the card cannot disagree with the engine.
**Risk:** `entryOpStatus` ranks `paymentDue` at urgency 1, above `unconfirmed`. Wire it
*after* F-5 re-scopes what counts as a payment action, or every mid-groom dog turns coral.

---

**F-3 · The header scrolls itself off screen on load; the phone glance starts inside a card with no date, no lane and no counts.**
**Severity:** causes error · **Frequency:** every load of a populated day at phone and desktop
widths — assumed dozens of times a day; falsified if the tablet is wall-mounted at 1024 and
never reloads · **Confidence:** confirmed · **Evidence:** E15, E26, E1
**Observed:** measured auto-scroll on load: **683px** at 390×844, **254px** at 1440×900, **0px**
at 1024×1366. At 390 the first thing visible is the middle of Max's card. `TodayView` L566-604
calls `scrollIntoView({block:"start"})` on `#today-card-<liveFocusId>`.
**Cost:** the date is the guard against acting on the wrong day — `/today?date=` accepts any
date and renders the same board for a past one. Losing it costs a scroll-up, or rarely a status
written against the wrong day.
**Change:** keep the intent, drop the eviction. Give `article[id^="today-card-"]` a
`scroll-margin-top` equal to the header height, and scroll only when the target is genuinely
below the fold. Better still, land it under the pinned Now bar of §11 and stop scrolling.
**Touches:** `src/components/views/TodayView.jsx`, `src/components/views/today/StatusBoard.jsx`
**Verify:** Playwright — after load at 390 and 1440, `[data-testid="daily-brief-date"]` is in
the viewport **and** the live-focus card is in the viewport.
**Risk:** the same effect is what currently drops keyboard focus onto the urgent card (F-14).
Changing one changes the other; fix them together.

---

**F-4 · Five identical yellow primaries; the action colour never says which action is next.**
**Severity:** slows work · **Frequency:** constant · **Confidence:** confirmed · **Evidence:** E13, E16, E21
**Observed:** 1440, Mon. `Check in Max` (79×44), `Check in Rex` (79×44), `Start Bella's groom`
(100×44), `Mark Charlie ready` (149×44), `Mark Luna collected` (117×44) — all
`bg-brand-yellow #FECC13`, 12px/700, 44 high. On the calm day (E21) three identical `Check in`
buttons sit above one another. Worse, the passive `Due to arrive in 2 hrs` marker is painted
in the *same* `brand-yellow`, so the action colour also means "nothing to do yet".
**Cost:** the button that answers "what now?" is indistinguishable from four that don't, so
the groomer reads dog names to choose — the exact reading the five-second test forbids.
**Change:** at most one card per board carries the filled yellow primary — the one
`selectLiveFocus` already picks. Every other primary demotes to the existing outlined
`secondaryClass`, unchanged in size and label. Repaint the arrival marker slate; yellow means
*do this*. On a non-today date `liveFocusId` is `null`, so **no** card is yellow — correct:
nothing on a past or future day is happening now.
**Touches:** `src/components/views/today/StatusBoard.jsx`, `src/components/views/today/ArrivingSlotGroup.jsx`, `src/components/views/today/LiveArrivalDivider.jsx`
**Verify:** Playwright asserts at most one element matching
`[data-primary-action="true"][class*="bg-brand-yellow"]` per board, inside the `liveFocusId`
card; and zero on `?date=` a past day. Existing E2E name-based assertions are unaffected —
labels don't change.
**Risk:** none to the domain. The demoted buttons keep their 44px targets, labels and handlers;
only the fill changes. Watch that the outlined variant still reads as pressable at arm's length.

---

**F-5 · The ACTION count treats routine pay-at-pick-up as urgent — half the count on the reference day is dogs mid-groom with nothing to do.**
**Severity:** causes error (the count cries wolf) · **Frequency:** every day, all day — every
arrived dog that hasn't paid is counted for the whole of its groom; falsified if most
bookings are prepaid · **Confidence:** confirmed · **Evidence:** E4, E13, E14
**Observed:** 1440/1024, Mon. Header reads `4 ACTION`. `buildTodayFeed` pushes `"payment"`
whenever `rank >= 1 && owes` — i.e. from the moment a dog is checked in. Bella and Charlie are
both mid-groom, both `Deposit Paid` with a balance, and both counted. The lane header says
`With us · 2 dogs · 2 unpaid` in coral. Two of the four "actions" are "this dog will pay
later, as normal".
**Cost:** the number staff would most like to trust is the one they learn to ignore. On a
14-dog day nearly every arrived dog qualifies — the mechanism behind a header reading 13 while
three things need doing.
**Change:** split the reason set. `late`, `confirmation` and `collection` are *now*; `payment`
is *owed*. The header reads `3 now · £199 owed`, and the `With us` lane warning drops "unpaid"
(the per-card `£32 due` carries it). `payment` rejoins *now* only at `READY_FOR_PICKUP`, when
money is genuinely due.
**Touches:** `src/engine/today.ts` (`NeedActionReason` partition — additive), `src/components/views/today/TodayHeader.jsx`, `src/components/views/today/StatusBoard.jsx` (`laneWarning`)
**Verify:** `today.test.ts` — a `CHECKED_IN` booking that owes money is `needsAction:false` for
the *now* count and present in the *owed* total; a `READY_FOR_PICKUP` one is in both.
**Risk:** `showNeedsActionOnly` filters on `entry.needsAction`; re-scoping changes what the
filter hides. Keep the filter on the union so no dog can be filtered *out* of view, and change
only the counters. Money is never hidden — invariant-safe, but check `AwaitingDepositsCard`
still surfaces deposit expiry independently.

---

**F-6 · `OperationalFact` renders value and label as a mismatched pair — "On time" under the label "LATE".**
**Severity:** causes error · **Frequency:** every calm day, and every morning of every day —
assumed the majority of all viewing time · **Confidence:** confirmed · **Evidence:** E7, E17
**Observed:** 1440, Tue 06:30, header element shot. Cell 1 reads `On time` / `LATE`; cell 4
reads `All calm` / `ACTION`. `OperationalFact` positions `value` above `label` unconditionally,
and `TodayHeader` substitutes a *reassurance string* into the value slot when the count is zero.
Read top-to-bottom at 12px it says the opposite of what it means. The same header also prints
`3/14 capacity` with a single unconditional class — there is **no** `dogsBooked > capacityTotal`
branch anywhere in `SecondaryTotals`, so `15/14` would render in exactly the same 11px slate
as `3/14`.
**Cost:** a two-word misread at the top of the screen, on the fact that governs whether anyone
needs chasing. Low per instance, near-total frequency.
**Change:** (a) when a count is zero, render the *whole cell* as one calm statement ("Nobody
late", "All calm") instead of a value/label pair. (b) In `SecondaryTotals`, branch on
`dogsBooked > capacityTotal` to `text-brand-coral-text` and append "over cap".
**Touches:** `src/components/views/today/TodayHeader.jsx`
**Verify:** component test — with `lateCount={0}` the accessible text contains "Nobody late"
and does **not** contain a standalone "Late" label; with `dogsBooked={15}` the capacity token
carries the coral class.
**Risk:** invariant 1 — `15/14` is the flat 14-dogs/day cap, **not** the 2-2-1 seat rule. The
copy must say "over the daily cap", never "overbooked", and must not be merged with any
seat-level warning. E2E asserts `"2/14 capacity"` and `"11/14 capacity"` textually; both stay
under cap and are unaffected.

---

**F-7 · Three equal columns for three unequal queues.**
**Severity:** slows work · **Frequency:** most days — falsified if arrivals are genuinely even
across the day · **Confidence:** confirmed (measured); the 8-dog overflow case is code-read ·
**Evidence:** E13, E16, E2
**Observed:** 1440, Mon. `grid-cols-3` with `items-start`. Measured column heights: Arriving
451px, With us 325px, Ready 176px — the Ready column leaves **61%** of its row unused while
Arriving is the tallest. At `xl` each populated lane takes
`max-h-[min(66vh,44rem)] overflow-y-auto`, so a heavier Arriving lane scrolls *inside itself*,
below a viewport that is 61% empty to its right, with no fade or scroll cue — a card can be
clipped mid-row. (The clipping case needs ≥6 Arriving dogs; the fixtures cap at 2, so that half
is code-read, corroborated by `e2e/daily-brief.spec.ts` asserting `overflowY: "auto"` and lane
height ≤ 67vh on desktop.)
**Cost:** dogs hidden inside a scroll region on a screen with visible empty space — worst
exactly when the day is busiest.
**Change:** at `xl`, size columns by content
(`minmax(0,1.6fr) minmax(0,1fr) minmax(0,1fr)`) and drop the per-lane `max-h`/`overflow-y`, so
the page scrolls once rather than three panes scrolling independently. Below `xl` the existing
layouts already behave.
**Touches:** `src/components/views/today/StatusBoard.jsx`
**Verify:** Playwright at 1440 with a 6-dog Arriving lane — no element inside a lane body has
`scrollHeight > clientHeight`, and no card's bounding box is clipped by its lane. Update the
existing `laneOverflow` assertion in `e2e/daily-brief.spec.ts`, which currently *requires*
`auto`.
**Risk:** removing lane scroll makes a very heavy day taller. Acceptable: one scrollbar the
groomer already understands beats three they don't.

---

**F-8 · Empty lanes each spend a full card to say "No dogs in this lane" — at 08:30 that is two-thirds of the board.**
**Severity:** slows work · **Frequency:** every morning and every quiet day — assumed the
single most common state of this screen · **Confidence:** confirmed · **Evidence:** E21, E2
**Observed:** 1440, Tue 06:30. `With us` and `Ready to go` each render a full bordered card,
a 4px accent, a title, `0 dogs`, and a body reading "No dogs in this lane" — roughly half the
above-fold width to communicate nothing. `MobileEmptyLaneSummary` already solves this
elegantly *below* `md` (`mobileHidden` collapses empty lanes into one summary line); the fix
simply doesn't extend upward.
**Cost:** the calmest moment of the day looks as busy as the fullest, and the dogs that *do*
need attention get a third of the width instead of all of it.
**Change:** apply the mobile treatment at every width — an empty lane collapses to one
`CompactZeroState` line ("With us · nobody yet"), and populated lanes take the freed columns
via F-7's grid.
**Touches:** `src/components/views/today/StatusBoard.jsx`, `src/components/views/today/MobileEmptyLaneSummary.jsx`
**Verify:** component test — with `withUs: []` at desktop width, no `region` named
`With us, 0 dogs` renders and the summary line names it instead. `e2e/daily-brief.spec.ts`
asserts these regions **are** visible on a day where all three are populated, so it still passes.
**Risk:** a lane that vanishes could read as a bug. Keep the named summary line always
present so the lane is still accounted for, never silently absent.

---

**F-9 · "Unpaid" and "Expected" are the same number every morning.**
**Severity:** slows work · **Frequency:** every day until the first payment is recorded —
i.e. the whole first half of every day · **Confidence:** confirmed · **Evidence:** E17, E13, E4
**Observed:** 1440, Tue 06:30: `£130 unpaid  £130 expected`. Same day, Mon 11:00 after one
payment: `£199 unpaid  £303 expected`. These are genuinely different quantities —
`unpaidTotal` sums `paymentOf(b).amountDue` over entries where `owes`; `expectedRevenue` is
`computeRevenue` over all countable bookings — but they are numerically identical whenever
nothing has been paid, which is every morning. Not a coincidence and not a duplication: a
structural collision.
**Cost:** two adjacent 11px figures that look like a rendering bug. A groomer either ignores
the row or stops to work out why.
**Change:** show one money figure in the header — `£303 expected` — and express the unpaid
part as a fraction of it only once it diverges (`£199 of £303 still to collect`). Below
divergence, print `£303 expected`, nothing else.
**Touches:** `src/components/views/today/TodayHeader.jsx`
**Verify:** component test — `unpaidTotal === expectedRevenue` renders exactly one money
token; `unpaidTotal < expectedRevenue` renders the fraction.
**Risk:** invariant — "Paid in Full" is a booking status, not a till reading
(`buildTakingsByMethod` is the till). Keep "expected" and "taken" in different regions and
never sum them.

---

**F-10 · Lateness is stated three times inside 60 vertical pixels.**
**Severity:** slows work · **Frequency:** whenever a dog is late or is next — most days ·
**Confidence:** confirmed · **Evidence:** E13, E16, E3
**Observed:** 1440, Mon, Arriving lane: `08:30 · 1 dog · 2 hrs 30 min late` (slot heading),
then `NEXT ARRIVAL`, then a coral pill `2 hrs 30 min overdue` (`LiveArrivalDivider`), then the
card — which itself carries an `sr-only` "Late arrival". Two visible statements of one
duration in two different wordings, plus a label for a card directly beneath it. `1 dog` also
appears in every slot heading including single-card groups.
**Cost:** three of the 35 visible numeric tokens (E16) restate one fact. Nothing is learned
past the first.
**Change:** delete `LiveArrivalDivider` and the `NEXT ARRIVAL` label from the Arriving lane —
the slot heading already carries the duration and, once F-4 lands, the single yellow primary
already marks *which* card is next. Suppress `· N dog` when `group.entries.length === 1`.
**Touches:** `src/components/views/today/ArrivingSlotGroup.jsx`, `src/components/views/today/LiveArrivalDivider.jsx` (delete), `src/components/views/today/StatusBoard.jsx`
**Verify:** `e2e/daily-brief.spec.ts` currently asserts `getByTestId("live-arrival-divider")`
has count 1 and that "Next arrival" is visible — both must be inverted, and the assertion that
lateness lives on the slot heading (`dueLane` contains "45 min late", the card does not) kept.
**Risk:** the divider is the only cue distinguishing the focused group when several slots are
overdue at once. F-4's single-yellow-primary rule must land in the same phase, or the marker
is lost before its replacement exists.

---

**F-11 · The card's non-primary affordances fall below two WCAG minimums, and the card body itself isn't tappable.**
**Severity:** slows work · **Frequency:** every time staff open a dog or human file — assumed
many times a day · **Confidence:** confirmed (measured) · **Evidence:** E23, E25, E16
**Observed:** 1024, Mon. Dog-name button **35×23**, owner-name button **71×15** — both below
WCAG 2.5.8's 24×24 minimum on height. The Arriving card's chevron, the only "open booking"
affordance on that lane, measures **2.63:1** against white (`text-slate-400`), below WCAG
1.4.11's 3:1 for UI components. The 44×44 hit area around it is invisible. Nothing else on the
card opens the booking, and the card body is inert.
**Cost:** wet hands aiming at a 23px-tall target beside a 44px one; a miss opens the wrong
thing or nothing. (WCAG 2.5.8's inline exception plausibly covers the owner name, which sits in
a text line; it covers the dog-name heading far less comfortably.)
**Change:** give the dog name `min-h-11` inside the same 18px type (the card grows ~8px), and
replace the Arriving chevron with the purple slot chip the other two lanes already use — the
time *and* the open-booking control, 52×44, at 17.3:1.
**Touches:** `src/components/views/today/ArrivingSlotGroup.jsx`, `src/components/views/today/StatusBoard.jsx`
**Verify:** Playwright — every control inside `article[data-booking-id]` has
`boundingBox().height >= 24`, and no card affordance resolves below 3:1. Extend the existing
44px assertion in `e2e/daily-brief.spec.ts`.
**Risk:** taller cards mean fewer above the fold. Offset by F-8 and F-10, which remove more
height than this adds. Do not compensate by shrinking the 44px primaries — invariant 7.

---

**F-12 · The definition of "Need action" is unreachable on the salon's touch tablet without changing the view.**
**Severity:** slows work · **Frequency:** whenever staff question the count — occasional but
recurring · **Confidence:** confirmed · **Evidence:** E7, E14
**Observed:** 1024. `NEEDS_ACTION_DEFINITION` reaches the user through exactly two channels: a
`title` attribute (hover only — unavailable on touch) and an `aria-describedby` sr-only string
(screen readers only). A sighted touch user can only read it by *activating the filter*, which
changes what the board shows. On the calm day the `ACTION` cell isn't even a button (E17), so
there is no route at all.
**Cost:** a number nobody can interrogate is a number nobody trusts — compounding F-5.
**Change:** print the definition as a persistent 11px line beneath the fact row whenever
`actionCount > 0`. After F-5 it is short enough to fit: "late, unconfirmed, or waiting to be
collected".
**Touches:** `src/components/views/today/TodayHeader.jsx`
**Verify:** component test — with `actionCount > 0` the definition is in the accessible text
tree without any interaction, at both mobile and desktop header variants.
**Risk:** one more line in a header this review is otherwise trying to thin. It pays for itself
only if F-5 lands first and makes the sentence short and true.

---

**F-13 · Keyboard entry is set by a side effect of `scrollIntoView`; the skip-link and every header control come last.**
**Severity:** slows work (accessibility) · **Frequency:** every keyboard session — assumed rare
in a salon, common in support/admin use · **Confidence:** confirmed for the behaviour, strong
inference for the mechanism · **Evidence:** E22, E1
**Observed:** 1024, Mon. First Tab lands on "Open Max's dog file" — inside the live-focus card.
"Skip to content" is stop **29**; the nav is 31–40; the Need-action filter, Choose date, Manage
availability and Fix booking are **41–44**. Control: on the empty day (no `scrollIntoView`
call) the first Tab is "Skip to content", correctly. `window.scrollY` was 0 in both, so
scrolling is not the cause — the `scrollIntoView` on the `tabIndex={-1}` article is moving
Chrome's sequential-focus navigation starting point.
**Cost:** the skip link — the accepted remedy for exactly this — is unreachable by the one
gesture meant to reach it, and "Choose date" takes 42 presses.
**Change:** make it deliberate. Call `focus({preventScroll:true})` on the live-focus article
(it already has `tabIndex={-1}`) so the entry point is intended and testable, and order the
skip target before the board so Shift+Tab from stop 1 reaches it.
**Touches:** `src/components/views/TodayView.jsx`
**Verify:** the E22 trace as a spec: on a populated day stop 1 is inside the live-focus card;
Shift+Tab from there reaches "Skip to content" within 3 stops; on an empty day stop 1 is the
skip link.
**Risk:** a programmatic `focus()` on load can be disorienting for screen-reader users mid-task.
Fire it only on the initial date load — the condition `TodayView` already uses for the scroll —
never on refetch or filter change.

---

**F-14 · "Salon open" and "No online slots available" share one line and one visual register.**
**Severity:** cosmetic · **Frequency:** constant · **Confidence:** confirmed · **Evidence:** E13, E17
**Observed:** 1440, top right. A tinted pill with a status dot ("Salon open") sits immediately
beside plain 12px bold slate ("No online slots available"). One is an ambient fact about the
day; the other is a *bookability constraint* that is a normal, healthy state on a full day and
a problem on an empty one. Adjacency implies they are the same kind of thing.
**Cost:** small — mostly it spends the pill, the header's strongest ambient signal, on the
fact least likely to change.
**Change:** keep the pill for open/closed; move the availability line onto the `Manage
availability` button as a sub-label, where it is that button's own state.
**Touches:** `src/components/views/today/TodayHeader.jsx`
**Verify:** the `aria-label="Availability"` text stays in the accessible tree; the existing
E2E `Manage availability` / `Availability` name assertions still resolve.
**Risk:** none. Both mobile and desktop header variants must change together — the mobile
variant renders this line separately.

## 7. Seed disposition

| # | Seed | Disposition |
| --- | --- | --- |
| 1 | Header stat reads `On time / LATE` | **Promoted → F-6.** Confirmed and worse than stated: cell 4 shows `All calm / ACTION` by the same mechanism (E17) |
| 2 | `15/14` shows an exceeded cap in the same muted grey | **Partly confirmed → folded into F-6's change.** The grey is *not* a contrast problem (`9.90:1`, comfortably AA — E25). But there is genuinely **no** over-cap branch in `SecondaryTotals` (E7), so 15/14 would render identically to 3/14. **Code-read**: the fixtures cap at 7 dogs |
| 3 | `£676 unpaid` and `£676 expected` are the same figure twice | **Promoted → F-9,** with the mechanism corrected. Not a coincidence and not a duplication: two genuinely different quantities that collide whenever nothing has been paid. Reproduced exactly (`£130 / £130`, E17) and separated on the same fixtures once one payment exists (`£199 / £303`, E13) |
| 4 | `13 ACTION` vs far fewer act-now items | **Partly confirmed → F-5 + F-12.** The *arithmetic* claim is **refuted** on reproducible data: header `4 ACTION` equals the lane warnings exactly (1 late + 2 unpaid + 1 waiting). The *substance* is confirmed and is the real defect — `payment` fires from check-in, so 2 of those 4 are dogs mid-groom with nothing to do (E4, E13). On a 14-dog day that mechanism produces 13 |
| 5 | Arriving holds 8 and overflows past the fold while the other lanes leave ~60% empty | **Promoted → F-7.** The imbalance is measured (Ready column 61% unused at 1440, E16). The 8-dog clipping half is **code-read**: `xl:max-h-[min(66vh,44rem)] xl:overflow-y-auto` per lane, corroborated by the existing E2E assertion. The fixtures cap Arriving at 3 |
| 6 | `6 to confirm` out of 8 arriving — one action or six? | **Refuted as a defect.** `ArrivingSlotGroup` counts *per slot group*, not per lane, so "N to confirm" always describes dogs sharing one arrival time — and there is no bulk-chase path anywhere in the code (E3). It is six actions, and the UI never implies otherwise. Additionally, `needsConfirmation` deliberately never resends a reminder; chasing routes to the inbox thread. Correct by design |
| 7 | `Salon open` beside `No online slots available` — two facts, one register | **Confirmed → F-14,** but rated cosmetic. They are adjacent and same-line; the registers differ slightly (tinted pill + dot vs plain bold slate) (E13, E17) |
| 8 | Every card renders three controls at rest (~20 buttons on screen) | **Partly confirmed, and the count is low.** "Three at rest" is **refuted**: `needsContact` gates Message to late/unconfirmed cards only, so a resting card's action row is primary + More (E3). But the *total* is higher than 20 — a resting card carries **5** tappable elements and a late one **7**, giving **29 simultaneously visible controls** on a six-dog day (E16) |
| 9 | Daily progress `(7/2/3)` restates counts the lanes already show | **Partly confirmed → deletion list.** `Ready` and `Collected` are byte-identical to the `Ready to go` and `Home today` lane counts. `Arrived` is **not** a restatement — `buildDaySummary` counts it cumulatively (`rank >= 1`), so it includes dogs already sent home; on the reference day `Arrived 4` against a `With us` lane of 2 (E4, E13). Delete two of the three stats, keep `Arrived` and the takings line |

## 8. Score, with anchors

| Dimension | 3 = | 6 = | 9 = | Score | What caps it |
| --- | --- | --- | --- | ---: | --- |
| **Glanceability under interruption** | You must read the screen to find the next thing | The next thing is findable in one scan but not pre-eminent | The next thing is unmissable in <1s without reading | **4** | F-1 (the urgent card is the least emphasised), F-3 (header evicted on load), F-4 (five equal primaries). Credit for lane order and the auto-scroll's intent |
| **Action affordance** | The right action needs a menu or a modal | One visible primary per card with the correct verb, unranked | The single next action is the largest control on screen, one tap | **7** | F-4, F-11. Genuinely strong: contextual verbs per state, 44px, the unpaid-collection safeguard, "Take £N payment" promoting itself |
| **Information honesty** | Numbers without provenance, or false precision | Honest but ambiguously labelled | Every number labelled, distinguishable, degrading honestly | **7** | F-5, F-6, F-9. Genuinely strong: recorded vs derived confirmation never collapsed; "Paid in Full is a status, not a till"; unknown-status recovery instead of silent dropping |
| **Touch / mobile fit** | Sub-44px targets, horizontal overflow | 44px primaries, clean reflow | Every target ≥44px, thumb-reachable, no context loss | **6** | F-3 (390 opens mid-card), F-11 (23px and 15px targets). No horizontal overflow at any width tested |
| **Accessibility** | Colour-only status, no focus rings, AA failures | AA text contrast, focus rings, labelled regions | Plus target sizes, predictable focus order, non-text contrast | **7** | F-11 (2.63:1 chevron; sub-24px targets), F-13 (accidental focus entry). Every text token measured passes AA 1.4.3; 200% reflow passes 1.4.10; live regions; sr-only lane purposes; no keyframe animation under reduce |
| **Visual restraint** | >20 colours, competing fills, decoration | Coherent palette, too many simultaneous elements | Every element earns its pixels | **5** | F-7, F-8, F-10, and E16's raw counts: 13 text colours, 17 fills, 29 controls, 35 numbers for six dogs. The empty day scores far higher than the busy one |

**Mean 6.0.** The spread matters more than the mean: the screen is well *made* (7s in
affordance, honesty, accessibility) and poorly *ranked* (4 in glanceability). That is a
prioritisation problem, not a craft problem — which is why Phase 1 is small.

## 9. Deletion list

| Delete | What is lost | Verdict |
| --- | --- | --- |
| `LiveArrivalDivider` + the `NEXT ARRIVAL` label | A second wording of a duration the slot heading already gives, and a marker for the card directly beneath it | Take it — but only once F-4's single yellow primary marks the focused card |
| Empty-lane cards at `md`+ ("No dogs in this lane") | A persistent reminder that the lane exists | Take it. `MobileEmptyLaneSummary` already carries the name; extend it upward |
| `· 1 dog` in single-entry slot headings | Nothing — one card is visible directly beneath | Take it |
| `TodaySummaryStrip`'s `Ready` and `Collected` stats | Nothing — byte-identical to the `Ready to go` and `Home today` lane counts | Take it. **Keep `Arrived`** (cumulative, genuinely new) and the takings line |
| `1 collected` in the `Daily progress` header | Nothing — it duplicates the `Collected` stat 40px below it | Take it |
| `Expected` from the header's secondary row | Expected day value above the fold | Take it — move to `Daily progress`, where money already lives. It is never actionable at 08:30 (see F-9) |
| The `ChevronRight` on Arriving cards | A redundant "open booking" affordance that fails 1.4.11 at 2.63:1 | Take it — replaced by the purple slot chip the other lanes already use |
| `TodayKpiRow.jsx`, `BookingFeed.jsx`, `BookingJourneyRow.jsx`, `JourneyIconButton.jsx` | Nothing on screen — none is in the built bundle (E8) | Take it. **Cost:** deletes `parts.component.test.jsx`'s `TodayKpiRow` block and `today.component.test.jsx`'s `BookingFeed` block. Do it in its own commit |
| `parts.jsx`: `WaitBadge`, `waitTone`, `WAIT_AMBER/RED_MINUTES`, `BookingStatusLine`, `ActionTile`, `PaymentMethodChooser`, `MarkPaidAction`, `formatMinutes`, `formatLondonTime` (E27) | Nothing rendered. `formatLondonTime` is silently reimplemented as `formatConfirmedAt` in StatusBoard | Take it — after Phase 1. **Keep `RAIL_TONE_CLASS`, `CHIP_TONE_CLASS`, `OpStatusChip`**: F-1 and F-2 bring them back into use |
| `buildImmediateAttention`, `buildCollectionQueue`, `buildPaymentsList`, `buildArrivalsBySlot`, `buildInSalonList`, `dedupeConcernSections`, `splitArrivalGroups`, `countDogsPerOwner` (E12) | Nothing rendered — the engine for six sections the board no longer has | **Do not delete yet.** Decide deliberately: they are the only implementation of "immediate attention" ranking, and the redesign may want `buildImmediateAttention` back. Document them as unused first (E11's correction) |

## 10. Hierarchy proposal

Level 1 = readable in five seconds without focusing. Level 2 = one tap. Level 3 = buried
(another screen, or a disclosure). Every element currently on screen appears exactly once.

| Level | Element | Justification against the five-second test |
| --- | --- | --- |
| **1 — glance** | The single most urgent dog: name, what is wrong, how long | The one thing the test asks for |
| | Its one action, as the only filled yellow control | The tap must not require a choice |
| | The date | The guard against acting on the wrong day (F-3) |
| | Lane titles + counts (`Arriving` / `With us` / `Ready to go`) | Shape of the day in three numbers |
| | Lane warnings (`1 late`, `1 waiting`) | The lane's own exception, at the lane |
| | Arriving slot-group heading: time + countdown | Orders the queue; the one place lateness should be stated (F-10) |
| | `N to confirm` on a slot group | An exception on a group of dogs sharing one arrival time |
| | Per-card: dog name, slot chip, timing label, primary action | The card's irreducible content |
| | `ConfirmationException` ("Needs confirmation") | An action reason — it must not be a tap away from its own count |
| | `UnknownStatusRecovery` alert | A dog in no lane can be forgotten entirely — already correctly weighted |
| | Salon open/closed pill | Ambient, cheap, one word |
| | `N now` action count (post-F-5) | Only once it means something |
| **2 — one tap** | Owner name → human file; dog name → dog file | Needed *after* you know which dog, never before |
| | Slot chip → booking detail | Same |
| | Payment amount + `Take £N payment` | Genuinely urgent only at collection; the amount stays visible, the action is on the card |
| | `Call` / `Message` | Correct as-is: appears only when late or unconfirmed |
| | `More` (Open booking, Didn't show, Cancel, Reschedule) | Correctly demoted already |
| | Welfare chips, `ConfirmedMark`, `ChatConfirmedChip`, `OnTheWayChip` | Read at the card, not across the room. **Never** hide welfare behind a tap |
| | `Manage availability` (+ availability line as its sub-label, F-14) | A deliberate act, not a glance |
| | `Choose date` | Same |
| | `Home today` header, count, warning and `Show` toggle | Correct today — collapsed, named, expandable |
| | `AwaitingDepositsCard` | Time-boxed but not this-minute |
| | Need-action filter toggle | Changes what the board shows; never the first thing read |
| **3 — buried** | `Daily progress`: `Arrived` + takings by method | End-of-day facts. Keep on the page, below everything |
| | `£303 expected` | Never actionable during service (F-9) |
| | `7/14 capacity` | Only actionable when exceeded — then it promotes itself to coral (F-6) |
| | `On site` / `Ready` header facts | Restate the lane counts already at Level 1 |
| | `MissingSizeNotice` | Background tidying — its own source comment says so |
| | `TodayBriefNotes` | Already correctly behind a "Later" disclosure |
| | `NEEDS_ACTION_DEFINITION` | Level 3 *content* at Level 1 *reachability* — a persistent 11px line, not a tooltip (F-12) |
| **Deleted** (see §9) | `LiveArrivalDivider` + `NEXT ARRIVAL`; empty-lane cards; `· 1 dog` on single-card groups; `Daily progress` `Ready`/`Collected`; `1 collected`; header `unpaid`; Arriving chevron | Assigned to no level because they leave the screen — listed here so nothing is silently dropped |
| *Offline only* | "Demo data" banner, "Sample data preview" footer | Not production chrome; excluded from every count in §5 |

The three demotions that need defending: **`On site` and `Ready`** duplicate lane counts a
groomer will read anyway, so they buy nothing at 16px/900; **`Expected`** cannot be acted on
before the day ends; **`Ready`/`Collected` in Daily progress** are literally the same integers
as two lane headers. None of them is hidden — all three stay on the page, lower down. Nothing
urgent is moved behind a tap.

## 11. The redesigned screen

The organising move is a **pinned Now bar** replacing the auto-scroll: the header stays put,
and the one dog that matters is always in the same place. This borrows the *Lock Screen
widget* behaviour specifically — a fixed rectangle whose position never changes so the eye
learns where to look, with content that changes underneath. It is not a new pane: it replaces
the `LiveArrivalDivider`, the `NEXT ARRIVAL` label and the scroll effect, and it is fed by
`selectLiveFocus` + `entryOpStatus`, both of which already exist.

The second move is *content-weighted* lanes (F-7, F-8) rather than three equal columns —
Reminders' Today list, where sections collapse to a line when empty rather than reserving space.

### Tablet, 1024×1366 (the likely salon device)

```
┌──────────────────────────────────────────────────────────────┐
│ Monday 13 July            ● Salon open       [Choose date]   │  ← header stays put
│ 3 now · £199 owed · 7/14                  [Manage avail. ▾]  │
├──────────────────────────────────────────────────────────────┤
│ ▌ MAX  ·  2 hrs 30 min overdue          08:30  Bath & Brush  │  ← pinned Now bar
│ ▌ Dave Smith · ⚑ Bites / Nips                                │    coral rail (entryOpStatus)
│ ▌            [ Check in ]  [ Call Dave ]         [ More ▾ ]  │    the ONLY yellow on screen
├──────────────────────────────────────────────────────────────┤
│ ⚠ 1 booking needs its status fixed — Milo · 10:00  [Fix]     │
├───────────────────────────────────┬──────────────────────────┤
│ Arriving · 2 · 1 late             │ With us · 2              │  ← 1.6fr : 1fr
│  12:00 — due in 1 hr              │  ▌08:30 Bella   £32 due  │
│  ▏ Rex   Bath & De-shed  £55 due  │  ▌ Start groom    More ▾ │
│  ▏ Mark Johnson    [Check in] ▾   │  ▌09:00 Charlie £32 due  │
│                                   │  ▌ Ready for coll. More ▾│
├───────────────────────────────────┴──────────────────────────┤
│ Ready to go · 1 · 1 waiting                                  │
│  ▌09:00 Luna · waiting 41 min · Paid   [Mark collected] ▾    │
├──────────────────────────────────────────────────────────────┤
│ Home today · 1                                        Show ▾ │
│ Arrived 4 · Taken today £84 (cash £84)                       │
└──────────────────────────────────────────────────────────────┘
```

Max appears once — in the Now bar, not also in Arriving. `▌` is the accent rail, coloured by
`entryOpStatus`. Every non-focus primary is outlined purple.

### Phone, 390×844

```
┌────────────────────────────┐
│ Mon 13 July    ● Open  📅  │ ← never scrolls away
│ 3 now · £199 owed          │
├────────────────────────────┤
│ ▌ MAX                      │
│ ▌ 2 hrs 30 min overdue     │ ← sticky; the whole
│ ▌ 08:30 · Dave Smith       │   bar is one 88px
│ ▌ ⚑ Bites / Nips           │   target
│ ▌ [  Check in  ] [ Call ]  │
├────────────────────────────┤
│ Arriving 2 · With us 2 ·   │ ← lane counts as one
│ Ready 1 · Home 1           │   strip, tap to jump
├────────────────────────────┤
│ 12:00 — due in 1 hr        │
│ ▏ Rex  £55 due  [Check in] │
│ …                          │
└────────────────────────────┘
```

### Through the day

- **08:30, nothing arrived.** Now bar reads `First in: Coco · 08:30 · due in 2 hrs` with **no**
  primary button — nothing to do yet, so nothing yellow. `With us` and `Ready to go` collapse to
  one line ("Nobody yet"). Header shows `0 now`. The screen is nearly empty, deliberately.
- **11:00, peak.** As drawn. Now bar holds the overdue dog; both middle lanes populated; one
  yellow control on screen.
- **16:00, winding down.** Now bar holds the longest-waiting collection, or — if nothing is
  outstanding — `All dogs home · £84 taken · 2 unpaid to chase` with a link to `/reports`,
  never an empty rectangle.

### Component disposition

**Survive unchanged:** `MiniInvoiceModal`, `UnpaidCollectionModal`, `AvailabilityModal`,
`MoreMenu`, `WelfareChips`, `ConfirmedMark`, `ChatConfirmedChip`, `OnTheWayChip`,
`UnknownStatusRecovery`, `HomeToday`, `MissingSizeNotice`, `AwaitingDepositsCard`,
`TodayBriefNotes`.
**Modified:** `TodayHeader` (fact grid → two-fact strip; availability moves to the button),
`StatusBoard` (weighted grid, collapsing empty lanes, tone from `entryOpStatus`),
`StatusBookingCard` + `ArrivingCard` (rail, chip, slot chip, taller name target),
`TodaySummaryStrip` (two stats deleted).
**Replaced:** the `TodayView` scroll effect → the pinned Now bar (a new ~60-line component
composing existing parts).
**Deleted:** `LiveArrivalDivider`, plus the dead modules in §9.

**Engine selectors that do not exist and would be needed:**

1. `selectNowNextPair(entries, now)` — NOW plus the following item, so the bar can show
   "then: Rex 12:00". `selectLiveFocus` returns one entry only. *(Note: `docs/today-command-centre.md`
   claims a `selectNowNext` exists. It does not — it was deleted in the July 2026 live-arrivals
   work, E11.)*
2. `partitionActionReasons(entries)` → `{ now, owed }` — F-5's split.
3. `laneWeights(board)` → relative column fractions, so the grid template is engine-decided and
   testable rather than hard-coded in Tailwind.

All three are pure functions over data the feed already carries. None needs a migration.

## 12. Phasing

| Phase | Contents | Effort | Invariants touched | What could go wrong | Validation |
| --- | --- | --- | --- | --- | --- |
| **1 — Rank what is already there.** Diff-only: no migration, no new data, no new dependency, no new component | F-1, F-2 (wire `entryOpStatus` → rail/chip/tint), F-4 (one yellow primary), F-6 (paired facts + over-cap branch), F-9 (one money figure), F-10 (delete divider + `1 dog`), F-14 (availability → button sub-label) | **3–4 dev-days** | **4** (recorded vs derived confirmation — `ConfirmedMark`/`ChatConfirmedChip` must survive the `successTone` deletion untouched). **1** (over-cap copy says "daily cap", never "overbooked") | Removing `successTone` silently drops the only cue that a reminder was confirmed on a `Booked` card. Mitigate: `ConfirmedMark` already renders independently — assert it in a test *before* deleting the tint | `npm run lint && npm run typecheck && npm run test && npm run build`; the E2E rewrites named in F-4/F-10; a new test that card chip label == `entryOpStatus` label for all nine kinds |
| **2 — Give the day its shape.** Layout + the Now bar | F-3 (stop evicting the header), F-5 (`now` / `owed` split), F-7 (weighted columns), F-8 (collapsing empty lanes), F-11 (target sizes), F-12 (visible definition), F-13 (deliberate focus entry), the pinned Now bar, selectors 1–3 | **4–5 dev-days** | **7** (denser cards: the Now bar's primary stays 44px minimum; the dog name *grows* to 44, nothing shrinks). **3** (the Now bar's More menu keeps "Didn't show" writing `Cancelled` + `cancel_reason='No-show'` — no new status). **5** (the bar's primary reuses `onJourneyAction`, so `booking_events` still fire; **no** optimistic or auto-advance transition is introduced) | The Now bar duplicates a card that also appears in a lane. Mitigate: suppress the focused entry from its lane while the bar holds it, and assert exactly one `[data-booking-id="X"]` per board | Re-run this review's harness at all three widths and diff the counts in E16; assert one visible instance per booking; re-run the E22 tab trace as a spec |
| **3 — Remove what nothing renders.** Cleanup | Delete `TodayKpiRow`, `BookingFeed`, `BookingJourneyRow`, `JourneyIconButton` and their test blocks; delete the dead `parts.jsx` exports (§9); correct `docs/today-command-centre.md` against code | **2–3 dev-days** | None | Deleting a component deletes real test coverage; a future reader assumes the feature never existed | `npm run test` (expect a lower test count — record the delta in the commit message); `npm run check:docs`; a `grep` in CI that fails if `docs/today-command-centre.md` names a file that does not exist |

Phase 1 touches only existing components with existing engine exports. It needs no schema
change, no new query, and no package.

## 13. Feature proposals (4)

Each must reduce what the groomer has to *remember*.

1. **Split the action count into `N now` and `£N owed`.** *Remembers for them:* which flagged
   things are urgent versus merely outstanding. *Data:* exists — `actionReasons` already carries
   the distinction (E4). *(This is F-5; listed here because it is the one change that makes the
   header's number worth reading.)*
2. **The pinned Now bar.** *Remembers for them:* which dog is next, in a fixed screen position,
   so the answer survives an interruption. *Data:* exists — `selectLiveFocus` + `entryOpStatus`
   + `liveFocusContext`.
3. **Quiet-period line.** When the next arrival is more than 45 minutes away, the Now bar says
   `Nothing until 12:00` instead of a countdown. *Remembers for them:* that they may safely stop
   looking at the screen. *Data:* exists — `minutesUntilSlot`.
4. **Overdue escalation.** Past ~30 minutes beyond the grace window, the late card's primary
   becomes `Call Dave` rather than `Check in` — a dog that has not arrived cannot be checked in,
   so the current primary is the wrong verb. *Remembers for them:* the point at which waiting
   becomes chasing. *Data:* exists — `minutesOverdue` and `display.ownerPhone` (E3 already
   renders a Call link when a phone resolves; only the ranking changes).

Nothing here adds a pane, a mode or a metric. Three of the four *remove* something.

## 14. Open questions for the salon owner

None of these can be answered from the codebase, and each would change a recommendation:

1. **What device is `/today` actually on, and is it shared?** The 1024 tablet case is by far the
   best today (E14 — zero scroll) and the 390 phone case the worst (E15, E26). If the salon is
   phone-first, F-3 moves to Phase 1.
2. **Is the tablet handheld, or fixed?** A fixed screen read from 2–3 m needs the Now bar's type
   at ~24px, not 18px. A handheld one does not.
3. **How many groomers work at once?** A single-groomer salon has exactly one "next thing" and
   the Now bar is unambiguous. Two groomers may need two, which changes the design.
4. **Does the screen sleep between interactions?** If it does, "first paint" happens dozens of
   times a day and F-3 is far more costly than assumed.
5. **Are unpaid balances chased during the day, or only at pick-up?** F-5's demotion of
   `payment` out of "now" assumes the latter.
6. **Lighting and glare.** Every contrast measurement here (E25) is a computed sRGB ratio, not a
   reading taken in a wet, bright, steamy room.
7. **What is a normal dog count?** The fixtures cap at 7; the screenshot that seeded this review
   suggested 15. F-7's overflow case and F-5's inflated count both scale with that number.

---

*Word count, both readings. **≈615 words** of prose under the brief's stated exemptions
(tables, wireframes, evidence map and finding-block field lines excluded). **≈4,550 words**
if every line of the fourteen finding blocks is counted as prose — those blocks are ~3,900 of
it, averaging 280 words each. The brief exempts them; the larger figure is stated so the real
reading burden is not hidden behind a technicality. Sections §3, §5, §11 and §14 carry the
narrative load and total under 1,500 words between them.*

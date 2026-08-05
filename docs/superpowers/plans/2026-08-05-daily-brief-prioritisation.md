# Daily Brief mobile prioritisation — implementation plan

**Status:** Implementing directly (product direction pre-approved; no open product contradiction found).
**Scope:** `/today` (Daily Brief) three-lane status board only. No schema, RLS, capacity, status-meaning, notification, payment-calculation, deposit, date-selection, or offline/error-state changes.
**Base:** `main@080b7a78` (after PR #598). Branch: `feat/daily-brief-prioritisation`.

## 0. What the current code already solves — do not duplicate

Fresh inspection of `main` found two pieces of this brief already built as pure, tested engine functions but **not wired into the live UI**:

- `groupFeedBySlot(entries: TodayFeedEntry[]): FeedSlotGroup[]` (`src/engine/today.ts:735`) already groups a chronological feed by `booking.slot`, preserves order, and puts missing/unparseable slots in a trailing `Unscheduled` group — exactly requirement #2's grouping rules. Tested in `today.test.ts` (`describe("groupFeedBySlot")`, ~L836), but only referenced there. `board.due` (`DailyBriefBoardEntry[]`) structurally extends `TodayFeedEntry[]`, so it can be fed straight in.
- `CompactZeroState` (`src/components/views/today/parts.jsx:100`) is a generic "one-line reassurance row" already used elsewhere and already has a test (`today.component.test.jsx:1346`). This is the right primitive for requirement #7's zero-progress line and requirement #5's empty-lane summary row — no new component needed for the visual shell.
- `StatusLane`'s existing live-marker logic already finds the divider position by **matching `slotMinutes`, not booking id** (`markerIndex` in `StatusBoard.jsx:331`), so same-slot bookings already group for divider placement. This is reused, not rebuilt, for the new slot-heading marker.

I will use `groupFeedBySlot` and `CompactZeroState` as-is rather than writing parallel logic. `buildArrivalsBySlot`/`splitArrivalGroups`/`isGroupSettled` (also in `today.ts`, also dormant) are a *different*, older grouping shape (built from raw `Booking[]` + `activeSlots`, used previously for a "morning brief" layout that was never wired in) — not reused, left untouched.

## 1. Compact duration grammar (requirement #3)

Two existing formatters both violate the approved grammar and must become one:

- `durationLabel()` in `dailyBrief.ts:261` emits `"73 mins"` / `"1 hr 13 mins"` (always pluralises `mins`).
- `liveMinutes()` in `today.ts:928` emits `"73 mins"` (the brief's own bad example, verbatim).

**Change:** add one exported pure function `formatDuration(minutes: number): string` in `today.ts` (`8 min`, `1 hr`, `1 hr 13 min`, `2 hrs 5 min` — hours pluralise normally, minutes never do). Export it from `today.ts`; `dailyBrief.ts` imports and uses it instead of its private `durationLabel`; `today.ts`'s `liveMinutes` becomes a thin wrapper (or is replaced by direct calls) so every duration string in the Daily Brief — slot countdowns, lateness, on-site time, ready-wait, live-focus text, checked-in-ago — goes through the one function.

**Test-string fallout to update** (found by reading the current suites, not guessed):
- `dailyBrief.test.ts`: `"1 hr 15 mins late"` → `"1 hr 15 min late"`, `"Due in 45 mins"` → `"Due in 45 min"`, `"On site 1 hr 45 mins"` → `"On site 1 hr 45 min"`, `"Ready 1 hr 15 mins"` → `"Ready 1 hr 15 min"`.
- `StatusBoard.component.test.jsx`: `"1 hr 15 mins late"` → `"1 hr 15 min late"`.
- `e2e/daily-brief.spec.ts`: `"45 mins late"` → `"45 min late"`, `getByLabel("Teddy — 15 mins overdue")` → `"...15 min overdue"`.
- Fixture-literal strings passed directly as props in tests (e.g. `StatusBoard.component.test.jsx`'s `liveContext: { text: "Due to arrive in 45 mins", ... }`) are test *inputs*, not derived output — left alone; the component must render whatever `liveContext` it's given regardless of grammar, so these don't need to change, only real derived output does.

## 2. Arriving grouped by slot (requirement #2)

**New file:** `src/components/views/today/ArrivingSlotGroup.jsx`.

**Architecture:** `StatusLane` (`StatusBoard.jsx`) keeps its shared section/header/`data-testid="{lane}-lane-body"` wrapper for *all four* lanes unchanged (this is what the e2e suite and several component tests query directly). Only its **body** branches: for `lane === "due"`, it groups `entries` via `groupFeedBySlot` and renders one `ArrivingSlotGroup` per group instead of a flat card list; every other lane renders exactly as today. This avoids a second copy of the section/header/aria-label/testid plumbing (the "duplicated mobile/desktop logic drifting apart" trap named in the brief's self-review checklist) — one component, one lane-body contract, branching only on content.

**`ArrivingSlotGroup` renders, per group:**
- A heading: `{slot label} · {n} dog[s]` + (today only) a countdown/lateness word built from `formatDuration` + (if any entries in the group need confirmation) `{n} to confirm`.
- If this group contains the live-focus entry (matched by `slotMinutes`, mirroring the existing `markerIndex` tolerance — not by exact booking id, so a shared slot's marker still reads correctly): a compact **"Next arrival"** treatment inside/beside the heading. This reuses `LiveArrivalDivider`'s `data-testid="live-arrival-divider"` and `context.ariaLabel`/`text` (unchanged contract) so `getAllByTestId("live-arrival-divider")` stays at 1 and `getByLabel(context.ariaLabel)` keeps matching in both component and e2e suites — only the visual shell shrinks from a full inter-card divider to a compact marker anchored at the group heading, and it always sits before the group's first card (satisfying the existing "before the complete same-time group" test).
- Each booking in the group as an "Arriving card": same content as `StatusBookingCard` (dog name → `Open {dog}'s dog file`, service, owner, welfare, payment, actions) **minus** the repeated time chip/countdown — replaced by a 44×44 chevron button (`aria-label="Open {slot} booking"`) that calls the same `onOpenBooking`. Dog name stays its own separate button (direct route to the dog record, not the same control as "open booking" — no nested-in-nested-button issue, they're siblings). No card is itself a `<button>` (it stays `role="article"`, as today) — only the interactive pieces inside it are controls, per "do not wrap the whole card in a button."
- Works at every declared date branch: on non-today dates the group heading omits the countdown (no `formatDuration`/`isLate` call at all — mirrors `buildFutureDayFeed`'s existing "hard zero" time-relative fields, so nothing is fabricated), and the live-focus marker never renders (`liveFocus`/`liveContext` are already `null` for non-today in `TodayView.jsx`).
- Applies at every viewport — no `md:hidden`/mobile-only branch. The brief is explicit that grouping "is not only a mobile data transformation."

## 3. Compact mobile header (requirement #1)

`TodayHeader.jsx`: compute the shared derived values once (date label, availability label, calm/action states, warning text) at the top of the component, then render **two markup blocks** from the same values — `<div className="md:hidden">…compact 3-row layout…</div>` and the existing richer block wrapped `<div className="hidden md:block">…</div>`. Tailwind's `hidden` is `display:none`, so only one side is ever in the accessibility tree at a given viewport — no duplicate/hidden controls, no new JS viewport-reading.

Compact layout:
- Row 1: a button (`aria-label="Choose date, {dateLabel}"`, calls the existing `onOpenDatePicker`) showing the date, plus the existing open/closed pill.
- Row 2: `{dogsBooked} booked` · Need-action control (button when `actionCount>0` with `aria-pressed`, "Showing {n} · Clear" when the filter is active, calm non-interactive "All calm" text when 0) · `{expectedRevenue} expected`. Never both unpaid and expected — unpaid total is dropped from this row entirely (still available in the richer `md:` header).
- Row 3: availability label text + a `min-h-11 min-w-11` "Availability" button calling the existing `onManageAvailability`.

No separate "Choose date" button renders in this block (the date button *is* the date-open control) — satisfies "remove the separate Choose date button on mobile."

## 4. Contact-action hierarchy (requirement #4)

`StatusBoard.jsx`'s `CardActions`, `lane === "due"` branch only. Replace the current `needsContact ? (phone ? <Call> : <Contact>) : null` with three explicit states, using the data already on the entry (`entry.isLate`, `entry.actionReasons.includes("confirmation")`) — no new fields, no schema:

1. Unconfirmed, not late → `Check in`, `Message` (calls the existing `onMessageOwner` → `/inbox?human=`), `More`.
2. Late + valid phone → `Check in`, `Call`, `Message`, `More`.
3. Ordinary confirmed/on-time → `Check in`, `More` only.

If messaging is unreachable (`onMessageOwner` falls back to a toast already, per `TodayView.jsx`), the button still renders and degrades exactly as `onMessageOwner` already does today — no new fallback logic needed, reusing the existing one. `Message owner` (already labelled `Message {contactName}`), `Open booking`, `Didn't show`, `Cancel booking`, `Reschedule booking` stay in `More` unchanged. Buttons wrap (`flex-wrap`, already present) and stay `min-h-11`.

## 5. Collapse empty mobile lanes (requirement #5)

**New file:** `src/components/views/today/MobileEmptyLaneSummary.jsx` — a `CompactZeroState`-styled row, `md:hidden`, with one `aria-label` describing which stages are empty (e.g. `"With us 0, Ready to go 0, Home today 0 — nothing waiting"`).

In `StatusBoard.jsx`'s top-level `StatusBoard` component (not per-lane): for each of `withUs`, `ready`, and `home`, if its entries are empty, wrap its existing render in `hidden md:block` (or `md:grid`/`md:contents` as needed to not disturb the grid) instead of removing it — desktop is untouched. Collect the empty ones' labels/counts and render one `MobileEmptyLaneSummary` (itself `md:hidden`) listing exactly those. A populated lane always renders its normal full card/list at every width and is never also named in the summary. `UnknownStatusRecovery` is rendered before this logic runs and is never touched by it, so it stays visible regardless of lane emptiness. `due`/Arriving is excluded from this collapsing rule — it's the primary lane and always shown in full, per the brief's own mobile hierarchy reference.

## 6. Payment follows the journey (requirement #6)

- **Arriving:** already correct — `rank >= 1 && owes` is the only path to `actionReasons.includes("payment")` in both `buildTodayFeed` and the future-day branch of `buildDailyBriefFeed`, so a `rank === 0` (Arriving) booking never gets `isPaymentAction`. `PaymentState` already renders `£46 due` at a small, neutral (amber, not coral) weight for these. No behaviour change; verified by an explicit test rather than assumed.
- **With us:** `PaymentState` currently sets the `data-action-reason="payment"` attribute but does **not** change its own visual weight on it — the gap to close. Change `PaymentState` to use a stronger (coral) tone only when `actionReason` is true, and a neutral (slate) tone when it's false-but-present, so "actionable" is actually visually stronger, not just attribute-flagged.
- **Ready to go:** in `CardActions`'s ready branch, when `amountDue > 0` the **primary** button becomes `Take £{amount} payment` (opens the existing invoice flow directly, i.e. `onOpenInvoice`), with `Mark collected` demoted to a visible **secondary** button (not buried in `More`) so the existing safeguard (`onRequestCollected` → `UnpaidCollectionModal` when money is still due) stays one tap away, not zero. When there's no balance due, primary reverts to `Mark collected` alone, exactly as today. No pricing/invoice/collection-status logic changes — only which existing handler is wired to the primary vs. secondary slot, and only after the *existing* payment figure says money is due.

## 7. Zero-value Daily progress (requirement #7)

`TodaySummaryStrip.jsx`: when `summary.arrived === 0 && summary.ready === 0 && summary.collected === 0 && (!takings || takings.total === 0)`, render `<CompactZeroState>Progress: no dogs have arrived yet</CompactZeroState>` instead of the full panel. Same `summary`/`takings` props, same call site in `TodayView.jsx` — no new selectors.

## 8. "Later" disclosure for the two notes (requirement #8)

`TodayBriefNotes.jsx` keeps its existing hooks/gating (`useUnpaidFortnight`, `useRetentionData`, "render nothing unless a source is genuinely available and non-zero") untouched, and keeps being mounted only after `notesReady` in `TodayView.jsx` (unchanged — the deferred-mount contract lives one level up and this plan doesn't touch it). Inside the component, once `showUnpaid`/`showDueBack` are known, wrap the existing note(s) in a native `<details>` with a `<summary>` (`min-h-11`, custom chevron matching `HomeToday`'s) reading `Later` / `{n} thing{s} worth reviewing` (correct singular/plural). Still returns `null` outright when neither source qualifies. No additional queries — the count is `[showUnpaid, showDueBack].filter(Boolean).length`, computed from data already fetched.

## 9. Typography and affordance pass (requirement #9)

- `TodayHeader.jsx`'s `OperationalFact` label (`Late`/`On site`/`Ready`/`Action`) is currently `text-[9px] font-bold uppercase ... min-[390px]:text-[10px]` — raise to a flat `text-[12px]`, drop the two-tier scaling.
- Per-card countdown/lateness (`StatusBookingCard`'s `displayTiming`, currently `text-[11px]`) and `ConfirmationException` (`text-[11px]`) — raise to `text-[12px]`/`13px`.
- Dog name (`font-display text-[18px]`) unchanged — already the prominent element.
- Keep `tabular-nums` everywhere it's already used (times, money); don't remove it anywhere touched.
- Keep visible focus rings (`focus-visible:ring-2 focus-visible:ring-brand-purple`) on every control this plan adds or edits — no control introduced without one.
- New controls (chevron, Message button, mobile date/availability buttons, `Later` summary) get the same `hover:`/`focus-visible:` treatment as their neighbours so they read as interactive without relying on hover (which doesn't exist on touch).

## 10. Files touched

| File | Change |
| --- | --- |
| `src/engine/today.ts` | add `formatDuration`; `liveMinutes`/duration call sites use it |
| `src/engine/today.test.ts` | duration-grammar assertions updated |
| `src/engine/dailyBrief.ts` | `durationLabel` replaced by `formatDuration` |
| `src/engine/dailyBrief.test.ts` | duration-grammar assertions updated |
| `src/components/views/today/StatusBoard.jsx` | grouped due-lane body, contact hierarchy, payment tone, ready primary/secondary, empty-lane collapsing wiring, typography |
| `src/components/views/today/ArrivingSlotGroup.jsx` | **new** |
| `src/components/views/today/MobileEmptyLaneSummary.jsx` | **new** |
| `src/components/views/today/StatusBoard.component.test.jsx` | duration strings + new grouped/contact/payment/empty-lane tests |
| `src/components/views/today/TodayHeader.jsx` | compact mobile header, label typography |
| `src/components/views/today/today.component.test.jsx` | new `TodayHeader` mobile-layout tests |
| `src/components/views/today/TodaySummaryStrip.jsx` | zero-value `CompactZeroState` branch |
| `src/components/views/today/TodayBriefNotes.jsx` | `Later` disclosure wrapper |
| `e2e/daily-brief.spec.ts` | duration strings; new viewport/grouping/contact/payment assertions |

`TodayView.jsx`, `LiveArrivalDivider.jsx` (contract reused, not rewritten), engine capacity/pricing/RLS/migrations: untouched.

## 11. Test-driven sequence

Engine first (pure, fast): `formatDuration` → `groupFeedBySlot` wiring assumptions confirmed by existing tests → `dailyBrief.ts` duration swap. Then component tests written failing, then implementation, per section above, committing each logical unit (roughly: duration grammar → slot grouping/Next-arrival → contact hierarchy → empty-lane collapse → payment emphasis → zero-progress/Later → mobile header → typography sweep → e2e updates). Full suite + build + e2e + responsive screenshots at the end, per the brief's verification section.

## 12. No open product contradiction

Nothing here requires stopping for approval: the two "already solved" pieces are additive re-use, not a redesign; the duration-grammar fix is fully specified by the brief's own examples; the payment/empty-lane/header rules map onto existing engine fields without new ones. Proceeding straight to implementation.

# Today view — morning-brief redesign

**Date:** 2026-07-10
**Status:** Approved direction (approach A: brief layout + expandable rows)
**Scope:** `/today` staff view only. No engine-rule, DB, RLS, or booking write-path changes.

## Why

The Today command centre works as an operational queue, but Bleep wants it to read like the
Smarter Dog "morning brief" artifact: calm, brand-warm (cream / purple `#2D004B` / yellow
`#FECC13`), a KPI card row, a slot-grouped diary with small status chips, and warm notes at the
bottom. Actions may move one tap deeper; no behaviour is removed. Additionally, when today is
closed the page must show the brief for the **next open day** instead of a dead "salon closed"
state — the salon runs Mon–Wed, so this makes /today useful four days a week.

## What stays exactly as-is

- The Today engine (`src/engine/today.ts`) rules: feed building, `entryOpStatus`,
  `selectNowNext`, payment state. Only a new **pure** `groupFeedBySlot` selector is added
  (unit-tested, no rule changes).
- All booking actions and their handlers in `TodayView.jsx` (mark arrived / start groom /
  mark ready / collected / paid / didn't show / hide until tomorrow / message owner).
- The sticky Now strip's behaviour (restyled only).
- The availability modal, per-day hides, jump-to-card highlight, offline sample-data mode.

## Layout (open day)

1. **Header** — unchanged content (date line, "N need action / all calm", unpaid total,
   Manage availability button, next online slot), restyled: purple display heading, cream page
   background behind everything (new `--color-brand-cream: #FAF9F6` token, applied by the
   /today container only).
2. **KPI row** — three white cards, like the artifact:
   - **Dogs in** — `summary.dogsBooked`
   - **Expected** — `formatMoney(summary.expectedRevenue)`, hint "if all paid"
   - **Capacity** — `dogsBooked / DAY_CAPACITY` with a yellow progress bar
   The expected-revenue line is removed from the daily-progress footer (no double-telling).
3. **Now strip** — kept, restyled to brand purple/yellow.
4. **Slot-grouped diary** — one white card. Feed entries grouped by `booking.slot`
   (time-ordered, via the new pure selector). Each slot: bold purple time column on the left,
   dog rows on the right.
   - **Collapsed row:** dog name (purple, bold) + size-letter badge; meta line
     "breed · service · owner"; chips right-aligned. Chips are engine-decided:
     red "N min overdue", amber "Payment due", amber welfare-alert chip (first two alerts),
     blue "Large dog", neutral "Two dogs, one owner" (same owner twice today), and the
     unconfirmed chip. Collected rows muted with a tick. The `isNext` row keeps a soft teal
     tint. Row ids stay `today-card-${id}` so jump-to keeps working (jump also expands).
   - **Expanded row (tap, `aria-expanded` button):** the status line (wait minutes,
     on-the-way signal, pickup-by, booking notes), welfare detail, and the same contextual
     action set as today — one primary, one secondary, Mark paid where owed, More menu.
5. **Warm notes** — brief-style notes under the diary:
   - Amber: "N grooms in the last fortnight aren't marked paid — worth a tidy at cash-up."
     New `useUnpaidFortnight` hook: one count query (`bookings` where `paid_at is null`,
     status not cancelled, `booking_date` in `[today−14, today)`). Taps through to /reports.
   - Calm: "N dogs due back with no booking — see the retention report." Reuses
     `useRetentionData` (`overdueCount`), mounted after first paint so it never delays the
     landing render. Taps through to /reports (2D).
   - A note renders only when its data is available; offline renders neither.
6. **Daily-progress footer** — kept (five lifecycle counters + takings by method), minus the
   expected-revenue line.

## Closed-day mode (new)

When `dayOpenState[todayStr] === false` (or today resolves closed):

- Lavender banner: "Closed today — here's your next open day." with a link to that day on
  the calendar.
- New `useNextOpenDayBrief` hook resolves the next open day by looking ahead up to 10 days:
  `day_settings.is_open` override first, else the weekday default (`getDefaultOpenForDate`),
  matching the trigger's own precedence. It then fetches that day's non-cancelled bookings
  (one query, transformed through the existing repository mapping). Constraint driving this:
  `useBookings` only loads the current week, so next Monday is usually outside the window.
- The page renders the target day's **read-only brief**: header shows the target date,
  KPI row + slot-grouped diary for that day. No Now strip, no lifecycle footer, rows do not
  expand into actions (the global open-booking modal can only find bookings in the loaded
  week). Warm notes still render — they aren't day-specific.
- Offline: resolve from weekday defaults only; no bookings → the calm empty state.
- No open day found in 10 days: honest empty state ("No open days in the next ten days").

## Component plan

- `TodayView.jsx` — orchestrates open vs closed-day mode; passes grouped feed down.
- `TodayHeader.jsx` — restyle; accepts an optional target-date label for closed-day mode.
- new `TodayKpiRow.jsx` — the three KPI cards.
- `BookingFeed.jsx` → slot-grouped rendering; `BookingFeedCard` becomes an expandable row
  (collapsed summary + expanded detail/action block; same handlers, same `MoreMenu`).
- `TodayNowStrip.jsx` — restyle only.
- new `TodayBriefNotes.jsx` — the two warm notes.
- `TodaySummaryStrip.jsx` — drop the expected-revenue line.
- new hooks: `useUnpaidFortnight.ts`, `useNextOpenDayBrief.ts` (both follow the
  `useRetentionData` pattern: staff client, AbortController, honest `available:false` on
  error/offline).
- engine: `groupFeedBySlot` in `today.ts` + tests.

## Testing & bar

- Unit: `groupFeedBySlot` (ordering, grouping, empty).
- Component: update `today.component.test.jsx` / `parts.component.test.jsx` for the
  expandable-row pattern — including that every existing action still fires from an expanded
  row, chips render per state, closed-day mode shows the banner + read-only diary and hides
  the Now strip/footer, and notes render/hide on data availability.
- The bar is full CI: `lint → typecheck → check:migrations → test → build`.
- Branch: `feat/today-brief-look`. No migrations involved.

## Explicitly out of scope

- Customer portal, calendar view, reports content.
- Any change to capacity/booking rules or write paths.
- The WhatsApp brief artifact itself (it stays a separate Cowork surface).

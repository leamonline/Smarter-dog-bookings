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
     blue "Large dog", neutral "Two dogs, one owner", and the unconfirmed chip. Collected
     rows muted with a tick. The `isNext` row keeps a soft teal tint. Row ids stay
     `today-card-${id}` so jump-to keeps working.
   - **Same-owner detection** uses the stable customer identifier (`_ownerId`), never the
     display-name string, and counts only non-cancelled entries in the displayed day's feed.
   - **Chip density on narrow screens:** the dog name and meta line are never truncated or
     crowded out. Chips wrap to their own line below the meta on narrow widths, and beyond
     two chips collapse to the highest-priority two plus a "+N" overflow chip (full set
     visible when the row is expanded).
   - **Slots that are missing or don't parse** as a known time still render, grouped last
     under an "Unscheduled" heading — a bad slot value must never hide a dog from the diary.
   - **Expanded row:** the status line (wait minutes, on-the-way signal, pickup-by, booking
     notes), welfare detail, and the same contextual action set as today — one primary, one
     secondary, Mark paid where owed, More menu.
   - **Disclosure markup:** the toggle is a real `<button>` with `aria-expanded` +
     `aria-controls` pointing at the detail region. The button wraps only the static summary
     content — chips, menus, and action buttons live outside it, so no interactive control is
     ever nested inside another.
   - **Jump-to from the Now strip:** expands the target row, scrolls to it, applies the
     brief highlight, and moves keyboard focus to the row's toggle button.
5. **Warm notes** — brief-style notes under the diary:
   - Amber: "N grooms in the last fortnight aren't marked paid — worth a tidy at cash-up."
     New `useUnpaidFortnight` hook: one count query over `booking_date` in `[today−14, today)`.
     The unpaid predicate must match the app's canonical payment semantics — the same fields
     `paymentState` reads and the same set of payable statuses (a cancelled or no-show booking
     is not "unpaid"; the implementation plan pins the exact columns from `paymentState`
     rather than assuming `paid_at`). Taps through to /reports.
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
- **One-date rule (the critical invariant):** everything date-specific on the page — the
  header date, every KPI figure, the capacity bar, the diary, the empty state — derives from
  a single `briefDate` + its booking list, chosen once at the top of `TodayView`. Today's
  figures and the target day's diary must never mix. Enforced by construction (one
  `briefDate`/`briefBookings` pair passed down; no component reads `todayStr` for display in
  closed-day mode) and by a component test asserting the KPI counts match the target day's
  bookings, not today's.
- **No time-relative state on future days:** a future-day diary is built without `now`-derived
  flags — no overdue, no waiting minutes, no `isNext`, no on-the-way signals, no unconfirmed
  chasing. Only date-stable chips render (welfare alerts, large dog, two-dogs-one-owner,
  payment-due where genuinely recorded). Enforced in the selector layer (future-day grouping
  path skips the time-state computation entirely), with a test.
- Offline, or when the target day's bookings fail to load: the diary area says plainly that
  bookings couldn't be loaded for that day ("Couldn't load the diary for Monday 14 July"),
  with a retry — it must never assert an empty diary it hasn't verified.
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

- Unit: `groupFeedBySlot` (ordering, grouping, empty, missing/invalid slot → "Unscheduled"),
  and the future-day grouping path (no time-relative flags emitted).
- Hooks: dedicated tests for `useNextOpenDayBrief` and `useUnpaidFortnight` covering
  boundaries (open day found on day 1 vs day 10 vs not at all; fortnight window edges),
  `day_settings` override beating the weekday default, offline (`supabase` null), query
  error, and abort-on-unmount.
- Component: update `today.component.test.jsx` / `parts.component.test.jsx` for the
  expandable-row pattern — every existing action still fires from an expanded row; disclosure
  markup is valid (button + `aria-expanded`/`aria-controls`, no nested interactive controls);
  jump-to expands + focuses the target row; chips render per state and overflow to "+N"
  without hiding dog name/meta; closed-day mode shows the banner + read-only diary, hides the
  Now strip/footer, shows target-day KPIs (not today's), and shows the couldn't-load state on
  fetch failure; notes render/hide on data availability.
- The bar is full CI: `lint → typecheck → check:migrations → test → build`.
- Branch: `feat/today-brief-look`. No migrations involved.

## Explicitly out of scope

- Customer portal, calendar view, reports content.
- Any change to capacity/booking rules or write paths.
- The WhatsApp brief artifact itself (it stays a separate Cowork surface).

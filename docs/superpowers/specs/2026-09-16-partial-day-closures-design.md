# Partial-day closures — design

**Date:** 16 September 2026
**Status:** approved by the owner in conversation, not yet implemented
**Decision:** closures are a staff-facing layer written *on top of* the existing
both-seats-blocked mechanism; enforcement does not change.

## The need

Staff need to close the shop for part of a day in half-hour steps — a late start
or early finish for a doctor's appointment, say — and see it on the weekly
bookings calendar as one large coral card reading **Closed for [reason]** that
spans every covered slot (2 slots for an hour, 4 for two hours, and so on).

## What already exists

Blocking both seats of a slot already means "closed" everywhere that matters:

- `day_settings.overrides` holds `{ "<slot>": { "0": "blocked", "1": "blocked" } }`.
- `validate_booking_calendar()` refuses any non-staff booking for a slot with both
  seats blocked (reason code `seat_blocked`). `validate_booking_capacity()`
  subtracts blocked seats. Staff can still book over it.
- The customer wizard (`get_blocked_seats`), the public availability calendar,
  the WhatsApp Flow and agent availability functions, and the Today board all
  read those blocks and hide the slot.
- The slot's clock menu offers "Block this timeslot", which sends both seats in
  one `handleOverride(slot, [0, 1], "blocked")` call (`SlotRowMenu.jsx`,
  `useDaySettings.setOverride`).

Missing: a reason, a one-shot range, and a single spanning card instead of a
column of grey "Blocked" cells.

## Approaches considered

1. **Closures on top of blocks (chosen).** A new JSON column lists closures; saving
   one also blocks both seats on every covered slot in the same row update.
   Enforcement stays exactly as it is today.
2. Make the database gates and availability functions read closures directly.
   Touches the capacity engine in three places and five RPCs, for no
   customer-visible gain. Rejected.
3. Store the reason inside `overrides` next to the seat keys. Six database
   functions parse that object assuming numeric seat keys. Rejected as fragile.

## Data

Migration `supabase/migrations/20260916120000_day_settings_closures.sql`:

```sql
alter table public.day_settings
  add column if not exists closures jsonb not null default '[]'::jsonb;
alter table public.day_settings drop constraint if exists day_settings_closures_is_array;
alter table public.day_settings add constraint day_settings_closures_is_array
  check (jsonb_typeof(closures) = 'array');
comment on column public.day_settings.closures is
  'Staff-facing partial-day closures: [{id, from, to, reason}]. Display + convenience only; enforcement is the both-seats-blocked entries these write into overrides.';
```

Idempotent, additive, no new functions (so no grant/revoke block is needed).
`day_settings` is already staff-only under RLS, and every customer-facing RPC
projects explicit columns, so the reason text never leaves the staff app.
`src/supabase/database.types.ts` gains `closures: Json` on the row types.

Entry shape (TypeScript `DayClosure` in `src/types/index.ts`):

```ts
{ id: string; from: "HH:MM"; to: "HH:MM"; reason: string }
```

`from` is the first covered slot; `to` is the exclusive end time. Covered slots
are every active slot `s` with `from <= s < to`. A closure 09:00–10:30 covers
09:00, 09:30 and 10:00. Extra slots after 13:00 can be covered like any other.

Validation (pure, in the engine):

- `from` and `to` are on the half-hour grid; `from` is an active slot on that
  date; `to > from`; `to` is at most the last active slot plus 30 minutes.
- `reason` trimmed, non-empty, at most 60 characters.
- No overlap with another closure on the same date (refuse, do not merge).

## Engine — `src/engine/closures.ts` (pure TS, no React)

- `slotsCoveredBy(closure, activeSlots): string[]`
- `validateClosure(candidate, existing, activeSlots): { ok: true } | { ok: false; reason: string }`
- `applyClosure(overrides, closure, activeSlots)` → new overrides with seats 0
  and 1 set to `"blocked"` on every covered slot.
- `releaseClosure(overrides, closure, activeSlots)` → new overrides with seats 0
  and 1 removed on every covered slot (empty slot objects dropped). This also
  clears any single-seat block that predates the closure in that range; that is
  accepted and documented.
- `buildCalendarRows(activeSlots, closures)` → ordered rows of
  `{ type: "slot", slot }` or `{ type: "closure", closure, slots }`, so the grid
  can collapse covered rows into one.
- `closureLabel(closure)` → `"Closed for " + reason` exactly as typed.
- `bookingsInClosure(bookings, closure, activeSlots)` → non-cancelled bookings
  whose slot is covered.

All of it unit-tested in `src/engine/closures.test.ts`.

## Data hook — `useDaySettings`

`DaySettings` gains `closures: DayClosure[]`. `fromRow`, `mergeSetting`,
`changedColumns` and the insert fallback in `persistDaySetting` carry the new
column. Three new mutations, all via the existing `upsertSetting` so a closure
and its blocks land in **one** column-scoped update:

- `addClosure(dateStr, { from, to, reason })` — validates, appends the entry
  (client-generated UUID), applies blocks. Returns the existing
  `DaySettingResult` shape.
- `removeClosure(dateStr, id)` — removes the entry, releases blocks.
- `updateClosureReason(dateStr, id, reason)` — reason only.

`useOfflineState` mirrors all three synchronously for sample-data mode and E2E.
`useBookingActions` exposes them online/offline like `handleOverride`, and the
staff shell threads them to `WeekCalendarView` → `BookingMainPanel` →
`SlotGrid`, following the existing `onOverride` path. Realtime already streams
whole `day_settings` rows, so a closure made on one device appears on another.

## Calendar rendering — `SlotGrid.jsx`

`rows` is built by `buildCalendarRows`. A closure row renders:

- Left column: the covered slots' clock boxes stacked (plain, not interactive),
  so the time gutter still lines up with the rest of the day.
- Right column: one coral card (`bg-brand-coral`, white text) whose height
  naturally spans the stacked boxes. Bold heading `Closed for [reason]`; under
  it the range in the existing slot format, e.g. `9:00 – 10:30 · 3 slots`.
  Pressing the card opens a small menu: **Edit reason**, **Reopen these times**.
  Reopening shows the same undo toast pattern as blocking.
- **Bookings inside the range** (owner decision): each renders inside the coral
  card, below the heading, as its normal `BookingCardNew` wrapped in a
  `NeedsAttentionFrame`: a thick yellow-and-black diagonal-striped border that
  flashes (opacity pulse, roughly 1 s cycle), with a large black-on-yellow tag
  reading **NEEDS ATTENTION** pinned to its top-left corner. The card stays
  draggable so staff can move it to a free slot. `prefers-reduced-motion`
  turns the flash off and keeps the static stripes. Screen readers get
  "Needs attention: booked during a closure".

A `ClosureCard.jsx` and `NeedsAttentionFrame.jsx` live in
`src/components/booking/`. The new colour work uses existing tokens
(`--color-brand-coral`, `--color-brand-yellow`) plus one keyframe in
`src/index.css`.

## Creating a closure — `CloseTimesDialog.jsx`

One dialog (`src/components/modals/CloseTimesDialog.jsx`, built on the existing
modal/dialog primitives) reached from two places:

1. The slot's clock menu gains **Close from here…** (offered whenever the slot
   is not already inside a closure). Opens the dialog with *From* prefilled.
2. `DaySettingsDrawer` gains a **Close part of the day** button beside the
   existing close/open-day control. Opens the dialog with *From* on the first
   active slot.

Fields:

- **From** — select of that day's active slots.
- **To** — select of half-hour end times after *From*, up to last slot + 30 min.
  A helper line shows the count: "3 slots".
- **Reason** — text input (max 60) with quick chips that fill it:
  `doctor's appointment`, `late start`, `early finish`, `appointment`.
- Live preview line: **Closed for doctor's appointment** · 9:00 – 10:30.
- If bookings sit in the range, an inline notice: "2 bookings sit in these
  times. They'll be flagged NEEDS ATTENTION on the calendar until you move or
  cancel them." Saving is allowed.
- Errors from `validateClosure` show inline; the save button is disabled until
  valid.

The whole-day case stays with the existing "Close this day" flow; this dialog
never sets `isOpen`.

## Error handling

Mutations return `DaySettingResult`; on `{ ok: false }` the dialog keeps its
state and shows the error, and the calendar's optimistic state rolls back the
way seat blocks already do. Malformed entries in `closures` (missing fields,
bad times) are dropped by `fromRow` with a logged warning rather than crashing
the grid.

## Out of scope (deliberate)

- Reminders and confirmations still go out for a booking left inside a closure;
  the NEEDS ATTENTION card is the prompt to act. Auto-rearrangement is the
  existing whole-day closure flow and is not wired to partial closures.
- The Today board shows a booking inside a closure as a normal token.
- Customers are told nothing new; the slot is simply unavailable, as blocked
  slots already are.
- Multi-day closures: one closure per date; a two-day late start is two closures.

## Testing

- Engine: coverage, validation (grid, overlap, bounds, reason), apply/release
  round-trip, row building, label text.
- Hook: `useDaySettings` add/remove/update write both `closures` and
  `overrides` in one payload; offline mirror parity.
- Component: `SlotGrid` collapses covered rows, shows the coral card with the
  exact label, renders a clashing booking with the NEEDS ATTENTION frame;
  dialog validation and prefill from both entry points.
- Database: a pgTAP test that the column exists, defaults to `[]`, rejects a
  non-array, and that `get_blocked_seats` still returns the blocks a closure
  writes.
- E2E (offline sample data): create a 1.5-hour closure from the slot menu,
  see one card spanning three slots, reopen it, see the slots return.
- Docs: `docs/partial-day-closures.md` (short) linked from `docs/README.md`;
  a line in `CLAUDE.md` domain rules pointing at it.

## Rollout

Additive migration applied to staging then prod **before** merge (the front
end writes the new column). Merge deploys the front end only; no Edge Function
changes.

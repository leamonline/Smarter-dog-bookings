# Today view — icon action bar for diary rows

**Date:** 2026-07-14
**Status:** Approved (option B of three mocked-up layouts)

## Problem

An expanded diary row on `/today` can show up to four controls — the teal
primary, a grey secondary, sometimes a "Mark paid" secondary, and a "More"
dropdown pushed right with `ml-auto`. Each sizes to its own text, so on a
phone they wrap into ragged rows of different widths and "More" ends up
orphaned on its own line. The sticky Now strip already solves this with
equal-width (`flex-1`) buttons; the diary rows never got the same discipline.

## Design

Presentation-only change in `src/components/views/today/` — the engine
(`entryOpStatus`), handlers, and all booking logic are untouched.

### Shape of every expanded row

1. **Primary** — unchanged: one full-width teal button carrying the
   state-driven next step ("Send collection message", "Mark arrived",
   "Start groom"…). `w-full` instead of sizing to text.
2. **Tile bar** — a single row of equal-width tiles (CSS grid,
   `grid-flow-col auto-cols-fr` or `grid-cols-N`), each an outline icon
   above a short text label. Same height for every tile, min 44px tap
   target. No control ever floats right.

### Tile sets per state

No new actions, none removed — the existing action sets re-dressed:

| State | Primary (full-width) | Tiles |
|---|---|---|
| Booked / due | Mark arrived | Message · Booking · More |
| Late | Mark arrived | Message · Booking · More |
| Unconfirmed | Chase confirmation | Arrived · Booking · More |
| Checked in | Start groom | Ready · Message · Booking · More |
| In bath | Mark ready | Message · Booking · More |
| Ready, collection message not sent | Send collection message | Collected · Paid\* · Message · More |
| Ready, message sent | Mark collected | Resend · Paid\* · Message · More |
| Collected, owes | Mark paid | Message · Booking |
| Collected, paid | — (quiet row) | Booking · Message |

\* Paid tile only when `entry.owes && stage !== "booked"` — the same
`owesNow` rule as today.

### More stays for the rare and the risky

"Didn't show" and "Hide until tomorrow" never get a tile — they stay behind
the More tile (which reuses the existing `MoreMenu` popup) so a wet-handed
mis-tap can't trigger them. When a state has no overflow items, the More
tile doesn't render. "Hide until tomorrow" keeps its existing eligibility
rule (`stage === "booked" && !owes`).

### Safeguards untouched

- **Mark collected** keeps its two-step confirm: tapping the tile swaps the
  action area into the confirm state (full-width "Confirm collected"
  primary + Cancel), exactly as the buttons do now.
- **Mark paid** keeps the payment-method chooser (`MarkPaidAction`); the
  tile triggers the same chooser so the method fact is never dropped.

### Icons

Inline outline SVGs in the style of the existing check/Chevron glyphs in
`parts.jsx` (no icon library dependency):

Message = speech bubble · Paid = banknote · Collected = tick ·
Booking = document · Ready = bell · Arrived = door/paw ·
Resend = circular arrow · More = three dots.

Every tile keeps its visible text label — icons support the words, never
replace them (matches the page's "never colour/icon alone" accessibility
bar).

### Out of scope

- The Now strip (`TodayNowStrip.jsx`) stays as-is — already balanced and
  space-starved.
- Read-only (closed-day) mode renders no actions, unchanged.

## Components

- New `ActionTile` in `parts.jsx` (icon + label, equal-width grid cell,
  same slate secondary palette as `SecondaryButton`).
- `MoreMenu` gains a tile-shaped trigger variant (or `ActionTile` wraps
  it); menu popup behaviour unchanged.
- `RowDetail` in `BookingFeed.jsx` rewired to emit primary + tile list per
  state instead of primary/secondary/moreItems ad hoc.

## Testing

- Existing component tests assert on accessible button labels — update
  where labels shorten ("Mark collected" → "Collected" etc.) while keeping
  `aria-label`s explicit ("Mark collected") so tests and screen readers
  stay unambiguous.
- New assertions: rare actions ("Didn't show", "Hide until tomorrow") are
  inside the More menu, not the tile bar; Paid tile renders only when owed;
  two-step confirm and payment-method chooser still gate their writes.
- CI bar: lint + typecheck + check:migrations + test + build.

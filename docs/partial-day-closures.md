# Partial-day closures

Staff close part of a day in half-hour steps — a late start or early finish for
a doctor's appointment, say — and the weekly calendar shows it as one coral card
reading **Closed for [reason]** spanning every covered slot.

Closing a *whole* day is a different thing and stays where it was: the
open/close control in the Day settings drawer, which also creates rearrangement
tasks. This feature never touches `day_settings.is_open`.

## The key point: this does not enforce anything

`day_settings.closures` holds `[{id, from, to, reason}]` and is **display and
authoring only**. Saving a closure also writes
`{"<slot>": {"0": "blocked", "1": "blocked"}}` into `day_settings.overrides` for
every covered slot, and **those blocks are the enforcement** — the same
both-seats-blocked mechanism staff have always had:

| Reader | What it does with the blocks |
|---|---|
| `validate_booking_calendar()` | Refuses a non-staff insert, `DETAIL = seat_blocked` |
| `validate_booking_capacity()` | Subtracts blocked seats from the slot's max |
| `get_blocked_seats()` | Hides the slot in the customer booking wizard |
| `get_small_medium_availability()` | Hides it from the WhatsApp Flow and agent |
| Public availability calendar | Same |
| `/today` board | Treats the slot as unbookable |

None of those were changed. A closure is a label and a grouping written over a
mechanism that was already live and tested. Staff can still book over it, as
they always could over a blocked seat.

Nothing customer-facing reads the closure record, so the reason text never
leaves the staff app: `day_settings` is staff-only under RLS and every
customer-facing RPC projects explicit columns.

**A closure and its blocks are written in one update payload.** Two writes to
one row race, and the loser silently undoes the winner — which here would leave
a card saying "Closed" over slots a customer could still book. See the comment
on `setOverride` in [`useDaySettings.ts`](../src/supabase/hooks/useDaySettings.ts)
for the original bug this pattern exists to avoid.

## Times

`from` is inclusive, `to` is exclusive. A closure of **09:00–10:30 covers 09:00,
09:30 and 10:00** — not 10:30. Both ends sit on the half-hour grid, `from` must
be an active slot on that date, and `to` can reach one slot-length past the last
slot so the final slot of the day can be covered. Staff-added extra slots after
13:00 are ordinary grid members and are covered like any other.

Overlapping closures are **refused, not merged**: two reasons cannot share a
slot, and quietly swallowing one would lose it. The reason is trimmed and capped
at 60 characters, and is rendered verbatim after "Closed for " — never re-cased
or re-worded.

## Creating one

Two entry points, both opening the same dialog:

1. **"Close from here…"** on a slot's clock menu, with the start prefilled to
   that slot.
2. **"Close part of the day"** in the Day settings drawer, with the start
   prefilled to the first slot of the day.

The dialog offers quick reason chips, counts the slots the range covers, and
previews the exact card text. Editing an existing closure's reason reuses the
dialog with the times locked — to change the times, reopen and close again.

## NEEDS ATTENTION

A booking already in the diary when those times are closed is **kept, not moved
or cancelled**. It renders inside the coral card wrapped in a flashing
yellow-and-black hazard frame tagged **NEEDS ATTENTION**, and stays draggable so
staff can move it to a free slot. `prefers-reduced-motion` keeps the stripes and
drops the flash.

The dialog warns how many bookings are in the range but does not block the save.
That is deliberate: the salon would rather record the closure and see the clash
than be stopped from recording it.

**Reminders and confirmations still send** for a booking left inside a closure.
Nothing is rescheduled automatically and no customer is told anything new. The
flagged card is the prompt for staff to act.

## Reopening

Removing a closure frees both seats on every slot it covered. This also clears a
single-seat block that predated the closure in that range — accepted and
documented: the closure blocked the whole slot, so reopening it reopens the whole
slot. Staff re-block a seat if they still want it capped. The toast offers an
undo that restores the same closure, reason and all.

## Where the code lives

- [`src/engine/closures.ts`](../src/engine/closures.ts) — pure coverage maths,
  validation, apply/release, calendar row building. No React.
- [`useDaySettings.ts`](../src/supabase/hooks/useDaySettings.ts) —
  `addClosure` / `removeClosure` / `updateClosureReason`, mirrored offline in
  [`useOfflineState.ts`](../src/hooks/useOfflineState.ts).
- [`ClosureCard.jsx`](../src/components/booking/ClosureCard.jsx),
  [`NeedsAttentionFrame.jsx`](../src/components/booking/NeedsAttentionFrame.jsx),
  [`CloseTimesDialog.jsx`](../src/components/modals/CloseTimesDialog.jsx).
- Migration `20260916120000_day_settings_closures.sql` — one additive column
  plus a JSON-array check. Apply to production by hand before merging.

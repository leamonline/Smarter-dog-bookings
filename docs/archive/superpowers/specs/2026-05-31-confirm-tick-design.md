# Confirm-tick on bookings — design

## Summary

Show a small green tick on a booking when the customer has tapped the
**Confirm** Quick Reply button on their WhatsApp reminder. The tick is a
visual acknowledgement for staff scanning the day view — it isn't an
audit feature.

## Trigger

Reminders go via the `appointment_reminder` Meta template, which renders
two Quick Reply buttons: **Confirm** and **Reschedule**.

When the customer taps **Confirm**, Meta delivers an inbound webhook
event with `messages[0]` shaped:

```json
{
  "type": "button",
  "button": { "text": "Confirm", "payload": "Confirm" }
}
```

This is a *template button reply* (`msg.button.text`), not an
*interactive button_reply* (`msg.interactive.button_reply`) — so it's a
separate code path from the existing `<uuid>:yes|no` router that handles
proposed-booking confirms (`apply-customer-confirm`).

**Reschedule taps are out of scope** for this feature; they continue to
flow into the WhatsApp inbox like any other inbound for staff to action.

## Data model

Add a single nullable column to `bookings`:

```sql
alter table bookings
  add column reminder_confirmed_at timestamptz;

create index idx_bookings_reminder_confirmed_at
  on bookings (reminder_confirmed_at)
  where reminder_confirmed_at is not null;
```

- Null until the customer taps Confirm; then `now()` at write time.
- Never cleared — re-taps are idempotent (first one wins via WHERE
  clause).
- Partial index keeps the index tiny since most rows are null.
- No channel/`via` column — confirmation can only happen via WhatsApp
  Quick Reply buttons; SMS/email reminders have no equivalent affordance.
- RLS unchanged: bookings policies already cover staff and customer
  access, and the new column inherits them.

## Detection (webhook)

**Location:** `supabase/functions/whatsapp-agent/index.ts`, in the
inbound-handling loop, as a parallel branch to the existing
`<uuid>:yes|no` interactive button-reply router (currently around line
2012). Place the new branch immediately after it, before the Claude
draft path.

**Match rule:**

```js
if (msg.button?.text === "Confirm") { ... }
```

Literal string match. The Quick Reply label is hard-wired in the
`appointment_reminder` template, so the contract is reliable. We do not
also match free-text "confirm" — that would risk false positives from
casual replies, and the design here is button-tap specific.

**Booking lookup:** for the inbound conversation's `human_id`, find all
bookings where:

- `bookings.human_id = <conversation.human_id>` (joined via
  `dogs.human_id` — bookings link to dogs, dogs link to humans).
- A `notification_log` row exists for the booking with
  `trigger_type = 'reminder'`, `channel = 'whatsapp'`,
  `status = 'sent'`, and `sent_at >= now() - interval '36 hours'`.
  The `channel = 'whatsapp'` filter prevents an SMS/email reminder for
  one booking from being stamped because of a WhatsApp Confirm tap that
  was actually for a different booking in the same window.
- `bookings.reminder_confirmed_at is null` (idempotency).
- `bookings.status not in ('Cancelled', 'Completed')`.

**Write:**

```sql
update bookings
set reminder_confirmed_at = now()
where id in (<matched ids>);
```

The bookings realtime channel propagates the change to all open
dashboards automatically — no extra plumbing.

**Flow control:** after a successful Confirm match, `continue` the loop
so we skip the Claude draft path. The tap is a quiet acknowledgement,
not a conversation.

**Error handling:** if the lookup or update throws, log a warning and
fall through to the Claude path. A DB hiccup must not swallow the
customer's message entirely; worst case the tick is missed and staff see
the reply in the inbox as before.

## UI

### 1. `BookingCardNew.jsx` — day-view card

Add the tick on row 1, in the existing flex line that already hosts
`Over`, `Paid`, and `£amount` badges:

```jsx
{booking.reminderConfirmedAt && (
  <span
    role="img"
    aria-label={`Customer confirmed at ${formatConfirmedAt(booking.reminderConfirmedAt)}`}
    title={`Confirmed via WhatsApp at ${formatConfirmedAt(booking.reminderConfirmedAt)}`}
    className="self-center inline-flex items-center justify-center w-5 h-5 rounded-full text-emerald-700 bg-emerald-50 border border-emerald-200 shrink-0"
  >
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  </span>
)}
```

Colours mirror the existing `Paid` badge palette
(`emerald-50`/`emerald-200`/`emerald-700`) so the tick reads as part of
the same visual family.

Place the tick **before** the right-aligned price/Paid badge in the JSX
so that when both render, the tick sits to the left of the price block.

### 2. Booking client shape

`dbBookingsToArray` (or whichever DB→client transform `useBookings`
runs) maps `reminder_confirmed_at` → `reminderConfirmedAt`. No other
client-side normalisation needed.

### 3. `TomorrowRemindersCard.jsx` — dashboard reminders card

`useTomorrowReminders` already fetches the day's bookings. Extend the
`select` to include `reminder_confirmed_at`. In
`groupRemindersByCustomer`, derive:

```js
confirmed: group.some(b => b.reminder_confirmed_at)
```

and surface it on the row alongside the existing "sent" indicator. No
new query, no new realtime channel — the existing bookings subscription
in the hook covers updates.

### 4. Booking detail modal

Add a single plain-text line under the booking metadata, only when
`reminder_confirmed_at` is set:

> Customer confirmed via WhatsApp at *Mon 1 Jun, 15:53*

No icon — the tick on the card is the at-a-glance signal; the modal is
where staff get context. UK locale formatting, matching how the modal
formats other timestamps today.

## Edge cases

- **Multi-dog same day** — one tap stamps every matching booking in the
  window. Already covered by the lookup (no per-booking filter).
- **Two taps** — second tap matches zero rows because of
  `reminder_confirmed_at is null` in the WHERE. No-op.
- **Confirm on a cancelled or completed booking** — excluded by
  `status not in ('Cancelled', 'Completed')` in the lookup.
- **Confirm with no recent reminder** — e.g. customer scrolled back and
  tapped a 2-week-old reminder. The 36h window on `notification_log.sent_at`
  filters this out. Update affects zero rows.
- **Reminder went via SMS/email** — impossible to tap Confirm there (no
  Quick Reply buttons). The button.text="Confirm" event can only come
  from a WhatsApp template tap.
- **Unknown sender (`human_id` null on conversation)** — skip the
  lookup; a cold customer has no outstanding reminder.
- **Backfill** — out of scope. Replies prior to ship date do not get a
  retroactive tick.

## Testing

- **Deno unit tests** (`supabase/functions/whatsapp-agent/`):
  - happy path: `button.text === "Confirm"` from a known conversation
    stamps the matched bookings.
  - no recent reminder → no rows updated.
  - cancelled booking excluded.
  - idempotent: second tap is a no-op.
  - unknown sender → skipped cleanly.
- **Vitest component** (`BookingCardNew.test.jsx`):
  - With `booking.reminderConfirmedAt` set, the green tick renders with
    the right `aria-label` and tooltip.
  - Without it, no tick.
- **Vitest integration** (`useBookings`):
  - When a bookings UPDATE arrives via realtime with
    `reminder_confirmed_at` set, the booking object exposes
    `reminderConfirmedAt` to consumers.
- **Skip** — webhook end-to-end and Meta-side template wiring. The
  crypto path is covered by `scripts/test-flow-endpoint.mjs`; the agent
  branch is covered by the unit tests above.

## Out of scope

- Reschedule button tap handling.
- SMS / email confirmation paths.
- Backfilling historical Confirm replies.
- Surfacing the tick on `BookingHistoryCard` (history is for past
  visits, not relevant to a reminder-confirm signal).
- Notifying staff in any other channel when a Confirm arrives — the
  realtime UI update is the notification.

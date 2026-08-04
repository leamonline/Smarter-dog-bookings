# Booking-detail reminder card — send + honest status — design

## Summary

The reminder card on the booking-detail modal
(`src/components/modals/booking-detail/ReminderCard.jsx`) currently has a
**Send / Resend** button that is a stub — it only toasts *"Reminders are
sent from the dashboard reminders panel for now."* — and its status line
can only ever read `none` or `confirmed`, never `sent`.

This feature does two things:

1. **Send** — the button actually sends a reminder for the booking, by
   reusing the dashboard's existing `SendReminderModal` (channel pills +
   WhatsApp / SMS / Email composers) which already drives the proven
   `reminder-send` edge function.
2. **Honest status** — the card reflects the real lifecycle
   `none → sent → confirmed`, derived by joining `notification_log` onto
   the booking. `confirmed` (customer tapped the WhatsApp Confirm button)
   always wins over `sent`.

It is **entirely front-end** — no database migration, no edge-function
change. `notification_log`, its FK to `bookings`
(`notification_log_booking_id_fkey`, the only FK between the two tables,
so the PostgREST embed is unambiguous), the staff-select RLS policy, and
the table's presence in the realtime publication (proven by the existing
dashboard hooks) all already exist.

## Locked decisions

- **Reuse `SendReminderModal`** rather than build a new composer.
- **Status from `notification_log`** via a PostgREST embed on the
  bookings read + derivation in the transform — matching the existing
  TODO at `src/supabase/transforms.ts:349`.
- **No resend.** Once a reminder has successfully gone out the card is
  read-only (status text, no button), matching the dashboard and the
  `reminder-send` function's deliberate idempotency. A *failed* send is
  still retryable and surfaces in the separate Delivery Failure card.
- **No "read" state.** Nothing captures a WhatsApp read receipt, so the
  `read` branch in `STATE_CONFIG` stays defined but never triggers.

## Part 1 — Honest status (read path)

### 1a. Embed the reminder log in the bookings read

Every place the app SELECTs bookings for the calendar/booking objects
must embed the reminder log so the status is correct on first paint. The
primary path is `fetchBookingsWeek()` in
`src/supabase/queries/bootQueries.js` (currently
`.from("bookings").select("*")`). Change to:

```js
.from("bookings")
.select("*, notification_log(trigger_type, status, sent_at, channel)")
```

**Plan must also cover the boot-prefetch path** (`useBookings` can be
seeded by a boot prefetch). Any prefetch SELECT of bookings needs the
same embed, otherwise prefetched bookings show `none` until the first
realtime refetch. Audit for all `from("bookings").select(` reads that
feed `dbBookingsToArray`.

RLS: the staff app authenticates as staff; `notification_log` has a
staff-only select policy, so the embed resolves. (Customers can't read
it, but this is the staff app.)

### 1b. Derive `reminderState` in the transform

In `dbBookingsToArray` (`src/supabase/transforms.ts:300`), replace the
hard-coded reminder fields (lines 346–355) with a derivation from the
embedded rows:

```ts
const reminderLog = (row.notification_log ?? []) as Array<{
  trigger_type: string; status: string; sent_at: string | null; channel: string | null;
}>;
// Latest successfully-sent reminder, if any.
const sentReminder = reminderLog
  .filter((n) => n.trigger_type === "reminder" && n.status === "sent")
  .sort((a, b) => (b.sent_at ?? "").localeCompare(a.sent_at ?? ""))[0] ?? null;

const reminderState: Booking["reminderState"] = row.reminder_confirmed_at
  ? "confirmed"
  : sentReminder
    ? "sent"
    : "none";
```

Set on the returned object:

- `reminderState` — as above. **`confirmed` beats `sent`** (a confirmation
  implies a reminder went out and is the stronger signal).
- `reminderSentAt: sentReminder?.sent_at ?? null`
- `reminderChannel: sentReminder?.channel ?? null` — **new field**.
- `reminderReadAt: null` — unchanged, no read receipt source.
- `reminderConfirmedBy: null` — unchanged, out of scope.
- `reminderConfirmedAt: row.reminder_confirmed_at ?? null` — unchanged.

A `failed` or `pending` reminder row does **not** produce `sent` — only
`status === "sent"` counts. Failures are owned by the Delivery Failure
card, not this one.

### 1c. Types

- `src/types/index.ts` (~lines 106–109): add
  `reminderChannel: "whatsapp" | "sms" | "email" | null` to the `Booking`
  type alongside the existing `reminder*` fields (reuse an existing
  channel union type if one is already defined there).
- The `DbBookingRow` type: add an optional
  `notification_log?: Array<{ trigger_type: string; status: string; sent_at: string | null; channel: string | null }>`.

## Part 2 — Send action (write path)

### 2a. Booking → reminder-row adapter

`SendReminderModal` is shaped for a dashboard reminder *row*, so add a
small pure adapter (e.g.
`src/components/modals/send-reminder/bookingToReminderRow.js`) mapping an
app `Booking` (+ its owner human) onto that shape:

| Row field | Source |
|---|---|
| `anchorBookingId` | `booking.id` |
| `customerKey` | `booking._ownerId` (human id) — drives the modal's human fetch + channel availability |
| `bookingIds` | `[booking.id]` (modal uses these only for service-name display; the edge fn gathers the customer's whole day itself) |
| `customerName` | `booking.owner` |
| `dogNames` / `dogNamesDisplay` | `[booking.dogName]` / `booking.dogName` |
| `slot` / `slots` | `booking.slot` / `[booking.slot]` |
| `reminderStatus` | `"sent"` when `booking.reminderState === "sent"`, else `undefined` |
| `reminderChannel` | `booking.reminderChannel` |
| `reminderSentAt` | `booking.reminderSentAt` |

`targetDate` passed to the modal = `booking._bookingDate`.

When `_ownerId` is null (orphan booking, no linked customer) the modal's
existing `isOrphan` path shows *"link a customer first"* — no special
handling needed. When `reminderStatus === "sent"`, the modal opens in its
existing read-only *"Reminder already sent"* view — which is exactly the
no-resend behaviour we want.

### 2b. Wire the card and host the modal

- `ReminderCard.jsx`: remove the stub `handleReminderAction`; the
  `none`-state button calls a new `onSendReminder()` callback prop.
- `BookingDetailModal.jsx`: holds `const [showSendReminder, setShowSendReminder] = useState(false)`,
  passes `onSendReminder={() => setShowSendReminder(true)}` into the card,
  and renders `<SendReminderModal row={bookingToReminderRow(booking, ownerHuman)} targetDate={…} onClose={…} onSent={…} />`
  as an overlay. Mount it alongside the other booking-detail overlays
  (`BookingDetailOverlays.jsx`) for consistency.

## Part 3 — Live refresh after send

A send writes to `notification_log`, **not** `bookings`, so the existing
`useBookings` realtime subscription (which watches only `bookings`,
`src/supabase/hooks/useBookings.js:93`) would not refresh the card.

Add a `notification_log` `postgres_changes` listener to the same channel
(mirroring `useTomorrowReminders` / `useDeliveryFailures`, which already
subscribe to that table — confirming it's in the realtime publication).
On a relevant event (a `reminder` row whose `booking_id` is within the
currently-loaded window), trigger a **debounced refetch of the loaded
window** so `reminderState` re-derives. `notification_log` changes are
infrequent (a handful of reminders a day), so a window refetch is
acceptable; a scoped single-booking refetch+patch is an optional
optimisation for the plan.

`SendReminderModal.onSent` already fires on success — wire it to close the
overlay. The realtime refetch is the source of truth that flips the card
to `sent`; an optimistic local patch is optional polish, not required.

## Part 4 — Card states

`STATE_CONFIG` in `ReminderCard.jsx`:

- `none` — `action: "send"` → button *"Send reminder"* → `onSendReminder()`.
- `sent` — change `action` from `"resend"` to **`null`**. Status only:
  *"Reminder sent · {time}"* (optionally *"· via {channel}"* using the new
  `reminderChannel`). No button.
- `read` — unchanged (`action: null`); never reached.
- `confirmed` — unchanged (`action: null`): *"Confirmed by {client}"*.

The separate pick-up *"Message …"* SMS action is untouched.

## Data flow

```
Staff opens booking
  → card reads booking.reminderState (embedded notification_log)
  → taps "Send reminder"
  → SendReminderModal (channel pills, server-validated availability)
  → reminder-send edge fn  → notification_log row → status 'sent'
  → realtime (notification_log) → useBookings window refetch
  → transform re-derives reminderState='sent'
  → card shows "Reminder sent · {time}"
Customer later taps WhatsApp Confirm
  → reminder_confirmed_at set (existing confirm-tick flow)
  → realtime (bookings) → card shows "Confirmed"
```

## Edge cases

- **Already sent** — adapter sets `reminderStatus: "sent"` → modal opens
  read-only; backend idempotency (`23505` → `{ ok: true, skipped }`)
  agrees. Card shows status only, no button.
- **Failed send** — no `sent` row, so card stays `none`; the failure
  shows in the Delivery Failure card (`useBookingDeliveryFailure`), not
  here. Staff can retry from there.
- **Orphan booking (no linked customer)** — `_ownerId` null → modal's
  existing "link a customer first" path.
- **Channel unavailable / opted out** — pills disabled with the reason,
  via the modal's existing `computeAvailability` (mirrors the server).
- **Multi-dog same day** — the edge fn gathers the customer's whole day
  and logs one reminder per booking in the group; each booking's card
  independently derives `sent`.
- **Confirmed without a visible sent row** (e.g. reminder sent by the
  nightly cron before this feature, then confirmed) — `confirmed` wins
  regardless, so the card is still correct.

## Testing

- **Vitest — `transforms`** (`dbBookingsToArray`):
  - embedded `reminder`/`sent` row → `reminderState: "sent"`,
    `reminderSentAt` + `reminderChannel` populated.
  - `reminder_confirmed_at` set **and** a sent row → `confirmed` (wins).
  - only `failed`/`pending` reminder rows → `none`.
  - no `notification_log` → `none`.
- **Vitest — adapter** (`bookingToReminderRow`):
  - field mapping for a normal booking.
  - orphan booking (`_ownerId` null) → `customerKey` falsy.
  - already-sent booking → `reminderStatus: "sent"`.
- **Vitest — component** (`ReminderCard.test.jsx`, replacing the
  stub-toast assertion):
  - `none` → renders *"Send reminder"*, click calls `onSendReminder`.
  - `sent` → renders *"Reminder sent · …"* and **no** button.
  - `confirmed` → status only (unchanged).
- **Skip** — the `reminder-send` edge fn (unchanged, already covered) and
  `SendReminderModal` internals (unchanged). A light
  `BookingDetailModal` test that the overlay opens on `onSendReminder`
  is optional.

## Out of scope

- Resend after a successful send (idempotent by design).
- "Read" state / WhatsApp read receipts.
- `reminderConfirmedBy` derivation.
- The nightly cron reminder path (`notify-booking-reminder`) — untouched.
- The human-card modal actions — already fully wired in `App.jsx`.

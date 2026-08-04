# WhatsApp cancel & reschedule (Flow C) — design

## Context

The WhatsApp booking entry + multi-dog Flow ships new bookings end-to-end.
Cancelling and rescheduling were deliberately deferred. Today a recognised
customer who types/replies "cancel" or "reschedule" (or taps a `Cancel` /
`Reschedule` quick-reply on a confirmation/reminder template) gets **no
response** — `guessIntentFromText` maps it to `booking_cancel` /
`booking_change`, which isn't in the booking-entry fast-path, so it falls
through to the "known customer waits for staff" gate. With no staff watching,
it sits silently (observed live: a customer replied "cancel" at 3am, nothing
happened).

This is "Flow C": let a recognised customer cancel or reschedule their
upcoming visit on WhatsApp, self-service, reusing the existing confirm/apply
machinery and the booking Flow.

## Decisions (settled with Bleep)

- **Granularity:** whole visit. Cancel/reschedule act on the whole booking
  group (all dogs sharing a `group_id`), matching how they booked.
- **Reschedule UX:** reuse the booking Flow — pre-loaded with the same dogs +
  services, opening on the date screen; pick a new slot only.
- **Reschedule keeps the same service** (no service change mid-reschedule).
- **24h cut-off:** within 24h of the appointment, no self-service — warm
  holding reply + flag for staff. Matches the salon's existing booking rules.
- **Triggers:** both the template `Cancel`/`Reschedule` quick-reply buttons
  **and** typed/quote-replied "cancel"/"reschedule" intent. The typed path is
  the important one (we don't rely on the templates carrying buttons).
- **Multiple upcoming visits:** send a WhatsApp **list** to pick which.
- Gated behind a new sibling flag `WHATSAPP_MANAGE_BOOKING_ENABLED` (default
  off) for a dark rollout, separate from `WHATSAPP_BOOK_ENTRY_ENABLED` so
  cancel/reschedule can be enabled independently of new-booking entry.

## Shared entry (whatsapp-agent)

A "manage booking" path runs for a recognised customer (known `human_id`)
when **either**:
- they tap a `Cancel` / `Reschedule` template quick-reply (`msg.button.text`),
  alongside the existing `Confirm` handler, **or**
- `guessIntentFromText(text)` is `booking_cancel` or `booking_change`.

It then:
1. **Resolve upcoming visits** — `resolveUpcomingGroups(human_id)`: bookings
   for the customer's dogs with `status='Booked'` and `booking_date >= today`,
   grouped by `group_id` (a single-dog booking is a group of one). Each entry:
   `{ key, date, slot, dogs[], services[], groupId|bookingId }`.
   - **0 upcoming** → warm reply ("you've nothing booked in just now — want to
     get booked in? 🐾"). Ends here.
   - **1 upcoming** → use it.
   - **>1 upcoming** → send a WhatsApp **list** ("Which booking?") with a row
     per visit; the row id encodes `action:key`. A `list_reply` tap resumes
     with the chosen visit.
2. **24h cut-off** — if the visit start (`date`+`slot`) is `< now + 24h` →
   no self-service: warm holding reply + handoff-flagged draft (existing
   pattern). Otherwise branch to cancel or reschedule.

## Cancel path (reuses confirm-buttons + apply-customer-confirm)

1. Stage a `cancel` action for the group in `whatsapp_booking_actions`
   (existing `saveBookingAction`), then send confirm buttons (existing
   `dispatchConfirmButtons`): *"Cancel Alfie & Tipi's groom on Wed 24 Jun?
   [Yes, cancel] [No, keep it]"*.
2. Customer taps **Yes** → existing `apply-customer-confirm` cancel path runs.
   **Extension:** cancel must act on the **whole group** (all rows sharing the
   `group_id`), not a single row — via a shared `cancel_whatsapp_booking_group`
   RPC (see below). Ack: "All sorted — that groom's cancelled. 🐾" **No** →
   "No worries, left as it is."

## Reschedule path (reuses the Flow)

1. Send the booking Flow in **reschedule mode** (`whatsapp-send` flow mode
   extended with an `initial_state` + `initial_screen`): the session is
   pre-seeded with the group's `dog_ids`, `dog_meta`, `services`, and the old
   `reschedule_group_id`, opening on **SELECT_DATE** (skips pet + service
   screens).
2. Customer picks a new day + time → **CONFIRM** → the endpoint:
   a. creates the **new** group via `create_whatsapp_booking_group`, then
   b. cancels the **old** group via `cancel_whatsapp_booking_group(old, human)`.
   Order is new-first-then-cancel-old (the portal's proven pattern), so a
   failure never loses the original booking. SUCCESS + ack.
3. Capacity race on the new slot → existing slot-taken retry screen.

## New code (small, mostly wiring)

- **DB migration:** `cancel_whatsapp_booking_group(p_group_id uuid,
  p_human_id uuid)` — service-role, owner passed explicitly (mirrors
  `create_whatsapp_booking_group`); cancels all `Booked` rows in the group
  owned by `p_human_id` (sets `status='Cancelled'`, a cancel reason); the
  existing cancel notification trigger fires. `grant execute to service_role`
  only. Also accept a single `booking_id` form (resolve its group) so the
  typed-cancel path can reuse it.
- **whatsapp-agent:** handle `Cancel`/`Reschedule` template-button taps and
  typed `booking_cancel`/`booking_change` for known customers; the
  `resolveUpcomingGroups` helper; the multi-visit list message + `list_reply`
  routing; the 24h cut-off; branch to cancel (confirm buttons) vs reschedule
  (Flow). Gated by the rollout flag.
- **whatsapp-send flow mode + whatsapp-flow-endpoint:** accept a reschedule
  pre-seed (`initial_state`: dog_ids/dog_meta/services/reschedule_group_id;
  `initial_screen=SELECT_DATE`), persisted into the flow session; on CONFIRM,
  after the new group is created, cancel `reschedule_group_id`.
- **apply-customer-confirm:** point its cancel branch at
  `cancel_whatsapp_booking_group` so a confirm-buttons cancel removes the
  whole group.

## Reused as-is

`apply-customer-confirm` (cancel/reschedule execution, ownership, <4h guard),
`whatsapp_booking_actions` staging + `saveBookingAction` +
`dispatchConfirmButtons`, the booking Flow + `create_whatsapp_booking_group`,
`confirm_buttons` send mode, the handoff-draft pattern, `guessIntentFromText`,
the 2-2-1 capacity engine + triggers.

## Error handling

- **Ownership:** every path re-checks the dog/booking belongs to the session's
  `human_id` server-side (RLS-bypassing service role can't trust the client).
- **No upcoming booking:** warm "nothing booked" reply.
- **<24h race:** entry cut-off plus `apply-customer-confirm`'s existing <4h
  guard as the backstop.
- **Reschedule slot taken:** existing SELECT_TIME_RETRY screen.
- **Cancel-old fails after new created (reschedule):** surfaced for staff
  (rare duplicate), exactly as the portal handles it.
- **Debounce:** reuse/extend the booking-entry debounce so a repeated
  "cancel" tap doesn't double-stage.

## Testing

- Unit (Vitest, pure logic): `resolveUpcomingGroups` grouping; 24h cut-off
  boundary; reschedule payload build (new group items from the old group);
  list-vs-single branching.
- Reuse existing capacity-parity + group-booking tests.
- Live e2e on a test number: book → reply "cancel" → confirm → row(s)
  `Cancelled`; book → "reschedule" → Flow on the date screen → new slot →
  new group `Booked` + old group `Cancelled` (shared/!= group_ids verified).

## Out of scope (later)

- Per-dog cancel/reschedule (splitting a group).
- Changing service during reschedule.
- Cancel/reschedule for bookings created outside WhatsApp beyond what
  ownership allows (handled the same — any of the customer's own bookings).

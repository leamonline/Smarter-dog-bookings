# Booking Pane Actions — Design Spec

**Status:** approved, not yet implemented
**Date:** 2026-08-04
**Scope:** the Booking section of the inbox context pane (`/inbox` → third column / drawer)

## Why

The Booking pane shipped as a read-only preview. It renders a diary and a "draft
offer" chip list, but its only action is *Insert into reply*, and it contains a
disabled button labelled "Sending is not enabled yet". There is no booking
creation path anywhere in the inbox.

It also gates itself behind a text heuristic (`isActiveAppointmentRequest`) and
auto-guesses a **single** dog from conversation text. When that guess fails,
`size` resolves to `null`, capacity cannot be computed, and every slot renders
"No space" / "Size needed to check" — which is what staff currently see.

This spec replaces that with two explicit staff-driven actions.

## Vocabulary

| Term | Meaning |
| --- | --- |
| **Offer** | A proposed set of 1–3 appointment times sent to the customer as a message. Writes nothing to `bookings`. |
| **Booking** | Real rows in `bookings`, created through the staff pathway. |
| **Allocation** | The engine's per-dog slot assignment derived from one drop-off time. |
| **Drop-off time** | The slot staff select; the group's start. Individual dogs may be assigned later slots. |

---

## User flows

### Entry

The pane opens with two actions where "Choose a request first" currently sits:

- **Available appointments?** → offer flow (Phase 1)
- **Let's book!** → booking flow (Phase 2)

Neither action requires the message classifier. `isActiveAppointmentRequest`
survives **only** as the advisory "Booking suggested" badge on the pane header —
it never gates, opens, or blocks anything. Where it *has* confidently matched a
dog and service, those values prefill the pickers.

### Shared step — dogs and services

1. Load **all** dogs belonging to the conversation's linked customer.
2. Multi-select. Each row shows: **name**, **breed**, **size**, and **last
   service** where one exists.
3. Each selected dog gets a service selector, defaulting to its **most recent
   service**, falling back to **Full Groom**. Staff may override per dog.
4. A dog with **no size on file** renders with a "Size needed" tag and cannot be
   selected. Capacity is safety-critical; the size is never guessed or inferred
   from conversation text.

Only sizes present on the canonical `dogs` record drive the capacity engine.
Conversation- and AI-derived sizes are ignored, matching today's
`buildBookingRequest` behaviour.

### Flow A — "Available appointments?"

1. Dogs + services selected (above).
2. The diary shows slots that fit the selected dogs, computed from the real dog
   array via `findGroupedSlots`.
3. Staff select **minimum 1, maximum 3** slots. Slots may span different dates;
   the draft model already keys choices on `dateStr + slot`.
4. **Add to reply** generates the draft message and inserts it into the existing
   composer, appended to anything already typed. Focus returns to the composer.
5. Nothing is sent. Staff review and send through the normal path, which already
   enforces the WhatsApp 24-hour reply-window / approved-template rules.

Draft message shape:

```
Hi Steve, we have availability for Alfie on:
• Monday 17 August at 11:00
• Tuesday 18 August at 12:30
• Wednesday 19 August at 09:30
Let us know which works best.
```

Multiple dogs are named naturally ("for Alfie and Tipi"). Wording follows the
salon's warm house voice.

### Flow B — "Let's book!"

1. Dogs + services selected (above).
2. The diary shows drop-off times. Staff select **exactly one**.
3. **Allocation preview** renders before anything is written:

```
Booking preview

Monday 17 August

11:00
• Alfie → 11:00
• Bella → 11:30

Deposit: required (£10, ref SMI-1708)
```

4. **Book** calls the existing staff booking pathway (`addBookingGroup` →
   `create_staff_booking_group`). The write is atomic: a rejection on any dog
   rolls back every dog.
5. On success the pane resets, a toast confirms, and the new bookings appear in
   the diary.

**No notification function is called from the frontend.** See below.

---

## Customer notifications — the trigger owns this

`AFTER INSERT ON bookings` → `notify_booking_confirmed_trigger` →
`notify-booking-confirmed`
([migration 20260505202745](../supabase/migrations/20260505202745_booking_status_notification_triggers.sql)).

Every booking row — from the customer wizard, the staff New Booking modal, or
this pane — already fires a confirmation automatically.

**The booking flow must never call a notify-* function, edge function, or send
path directly.** Doing so double-messages the customer. A guard test asserts
this (see Test plan). This is the single most important constraint in this spec.

> **Known pre-existing behaviour, not introduced here:** the trigger is
> per-row, so a 2-dog group booking sends 2 confirmation messages. This is
> already true of the staff New Booking modal. Deliberately out of scope —
> changing it means changing messaging behaviour for every existing booking
> path, which deserves its own spec.

## Deposits — informational in Phase 2

`stamp_booking_deposit()` is a `BEFORE INSERT` trigger that sets
`deposit_required := true` unconditionally whenever the dog's owner has
`humans.deposit_required = true`, then derives the reference and due-by
([migration 20260714120000](../supabase/migrations/20260714120000_human_booking_rules_and_deposits.sql)).
It **overwrites whatever the client sends**.

A "Bypass deposit" control is therefore **not implementable in the frontend** —
the database would re-stamp the row and the button would silently do nothing.

**Phase 2 ships the deposit panel as read-only**: when the customer is
deposit-tagged, the preview states that a deposit will be required, with the
amount. Staff are informed, never asked to choose something that cannot be
honoured.

Supporting a real bypass requires a migration giving the trigger an explicit
staff-override path. That is a live money-handling change applied to prod by
hand, and is tracked as a **separate decision outside this spec**.

---

## Data flow

```
UI (DogServicePicker, BookingPane)
  → useBookingComposer          per-conversation state
  → bookingComposerModel        pure derivation
  → engine/capacity             findGroupedSlots, canBookSlot   [preflight only]
  → render

Book action:
  addBookingGroup
  → create_staff_booking_group (RPC)
  → BEFORE INSERT gates: calendar, capacity, pregnancy, deposit stamp
  → AFTER INSERT: notify-booking-confirmed
```

**The database is authoritative.** Frontend availability is preflight only — it
exists to stop staff wasting a click, never to decide whether a booking is
legal. The three `BEFORE INSERT` gates all raise `P0001`; `friendlyBookingError`
maps them to staff-readable text.

State lives in `useBookingComposer`, keyed per conversation, held **above** the
responsive layout switch so it survives re-layout (see Responsive).

---

## Component responsibilities

| File | Responsibility | Notes |
| --- | --- | --- |
| `bookingComposerModel.js` | Pure derivation, no React. `availableSlotsFor(dogs, day)`, `allocationFor(dogs, dropOffSlot)`, `seatOccupancy(slot, dayBookings)`, `buildOfferText(dogs, choices)`, `defaultServiceFor(dog)` | All hard logic lives here; unit-tested without rendering |
| `useBookingComposer.js` | Per-conversation state: mode, selected dog ids, service per dog, slot choices, current stage (iPhone). Derived allocation memoised. | Resets **only** on conversation change, explicit cancel/clear, or successful booking |
| `DogServicePicker.jsx` | Dog multi-select + per-dog service selector + "Size needed" disabled state | Reusable across both flows |
| `BookingPane.jsx` | The diary. Slot rows with occupancy + booked dogs. | Modified, not rewritten: `request` (single dog) → `dogs` array |

Business rules stay out of components. `InboxWorkspaceController.jsx` is already
789 lines and gains only wiring, not logic.

### Slot row content

Each slot shows time, remaining capacity, current bookings, and whether the
selected dogs fit:

```
11:00
2 spaces
Booked:
• Alfie (Cockapoo)
• Bella (Cocker)

[Offer this time]
```

```
11:00
1 of 2 spaces available
Booked:
• Alfie

[Offer this time]
```

**Existing bookings stay visible when a slot is selected.** Today, selecting a
slot replaces its label with the date/time and hides who is already in it —
precisely when staff most want to check. This is fixed.

Selected state is conveyed by **icon or checkmark plus border and label**, never
colour alone.

---

## Failure cases

| Case | Behaviour |
| --- | --- |
| Dog has no size | Listed, not selectable, tagged "Size needed". Never guessed. |
| Customer has no dogs on file | Empty state pointing at adding a dog |
| Slot taken between render and Book (race) | Atomic rollback; inline error "that time has just gone", diary refreshes, selection preserved where still valid |
| Capacity / calendar / pregnancy rejection (`P0001`) | Inline error next to the slot list via `friendlyBookingError`, not a bare toast |
| Pregnant dog | **Bookable.** The trigger bypasses on `is_staff()` — clinical judgement. Picker shows a warning chip, does not block |
| Offline | Book and Add to reply disabled with explanation |
| Double submission | Action disabled immediately on press, re-enabled only on settled result |
| Availability load failure | Skeleton → explicit error with retry; never silent blank space |

---

## Responsive

Breakpoints are width-based. No device or user-agent detection.

`InboxWorkspaceShell` **already provides** the layout frame: static three-column
at `wide` (90rem), tablet drawer at `md`/`lg` with scrim + Escape + focus
containment, full-screen slide-in on mobile with a back control, and
`useFillViewportHeight` for on-screen keyboard handling. This work adapts the
pane's *content* within that frame.

### Wide (MacBook, iPad landscape ≥ 90rem)

Three columns retained: conversation list · thread · booking pane. Pane keeps a
sensible min/max width so dog names are not needlessly truncated, service
selectors stay usable, and primary actions do not wrap. The pane scrolls
independently with a **sticky action footer**; page nav and composer are never
pushed off screen.

### Tablet / iPad portrait

Booking tool is a slide-over drawer over the thread, available at any time from
the active conversation. Sticky header (mode title, customer, close control),
sticky footer (primary action), middle content is the only scrolling region.
Opening preserves customer, dogs, services, dates, slots and draft text.

### iPhone

Full-screen staged flow, not a compressed desktop pane:

1. Choose action
2. Choose dogs and services
3. Choose times
4. Review offer / booking

Compact step indicator with descriptive headers ("Choose dogs", "Choose times",
"Review offer"). Backwards navigation never loses selections. One date or small
range at a time; slots as stacked cards, never horizontal tables; existing
booking context retained. Primary action fixed above the safe-area bottom inset.
Nested scrolling avoided. Selecting a slot must not jump the page or lose date
position.

### Orientation and resize

Selections survive rotation, window resize, sidebar toggling, and iPad
split-screen changes. State resets **only** on conversation change, explicit
cancel/clear, or successful booking — never because the layout changed.

### Input and safe areas

Touch, mouse/trackpad and keyboard all supported. Safari (iOS/iPadOS/macOS) and
Chrome (macOS). Zoom to 200% and larger dynamic text. Safe-area insets keep
controls clear of the notch, Dynamic Island, home indicator and Safari's bottom
toolbar. Minimum ~44×44 CSS px touch targets. **No essential information or
action depends on hover**, right-click, drag-and-drop or precise pointing.

---

## Accessibility

Every control has an accessible name. Semantic `button`, `label`, `fieldset`,
and status elements throughout — usable with VoiceOver, keyboard, and switch
control.

Availability changes, booking success and booking failure announce through an
appropriate live region.

Focus is intentional:

- opening the booking tool moves focus to its heading
- closing returns focus to the control that opened it
- errors move focus to, or direct focus at, the relevant message
- successful completion moves focus to the confirmation or the composer

Focus is **contained** in the mobile sheet and tablet drawer while open, and
**released** on close. The static wide-layout pane never traps focus.

---

## Performance

Derived availability is memoised; full diary availability is not recomputed on
every incidental render. Only the dates and bookings for the visible diary range
are loaded. Skeletons stand in for loading, never blank space. Actions disable
on press to prevent double submission.

---

## Test plan

**Logic project (`*.test.js`) — `bookingComposerModel`:**

- multi-dog availability, including a large dog forcing a full-slot takeover
- allocation spreading across consecutive slots
- seat occupancy maths (empty / partially full / full)
- offer text for one dog, multiple dogs, and slots across different dates
- service defaults: most recent service, Full Groom fallback

**Component project (`*.component.test.jsx`):**

- multi-dog selection
- missing dog size → not selectable, "Size needed" shown
- service defaults and per-dog service override
- maximum 3 offered slots enforced; minimum 1 required to send
- exactly 1 slot in booking mode
- occupancy display and booked dogs remaining visible when a slot is selected
- deposit panel renders for a deposit-tagged customer
- booking failure surfaces inline and refreshes the diary
- **guard: booking mode never calls a notification/send path** — the trigger
  owns confirmations, so this prevents a future duplicate-message regression
- stage navigation on narrow layouts preserves selections going backwards
- selections survive a simulated resize across the layout breakpoints
- accessible names and focus order

**End-to-end / responsive** at the six reference viewports:

```
iPhone SE portrait:       375 × 667
Modern iPhone portrait:   390 × 844
iPhone landscape:         844 × 390
iPad portrait:            768 × 1024
iPad landscape:          1024 × 768
MacBook:                 1440 × 900
```

Covering: both modes at every major layout; opening/closing the tool;
selection preservation across resize and orientation; sticky footer scrolling;
on-screen keyboard behaviour; long customer and dog names; a customer with four
dogs; three offer slots across different dates; inline validation and booking
errors; VoiceOver labels and keyboard focus order; no clipped, overlapping or
unreachable controls.

Screenshots captured at all six viewports and **visually inspected** before the
work is considered complete. Rendering without error is not the bar — the pane
must be easy to scan and operate one-handed on iPhone, by touch on iPad, and by
keyboard or pointer on a MacBook.

**Gate:** `lint`, `typecheck`, `check:migrations`, `test`, `build` all green
before commit.

---

## Delivery

**Phase 1 — `feat: add inbox appointment offer flow`**
Entry actions, dog picker, service selection, slot picker with occupancy, 1–3
slot offers, draft-into-composer. No database writes, no new send path.

**Phase 2 — `feat: add inbox booking action flow`**
Single-slot selection, allocation preview, informational deposit panel, Book via
`addBookingGroup`, failure handling.

No database migration is required for either phase. Both use the existing
`create_staff_booking_group` RPC and existing triggers.

# 02 — Staff daily operations: the diary and the day

Audit of the staff-facing operational surfaces of Smarter Dog Bookings (`/staff`): the `/today` day stack, the week calendar (`/`), the new-booking drawer, the booking detail modal, the Booking Desk preview, the Needs Attention backlog, and the Postgres triggers they all write through. Read-only review at commit `850cad7` (2026-10-12). Every claim marked **CONFIRMED** was traced in code; **HYPOTHESIS** means the code strongly suggests it but it was not executed.

Method: walked the Monday-morning journeys (sign in → land → arrivals → groom → ready → collected/paid → no-show → new/multi-dog/recurring booking → move → cancel → extra slot → immediate slot → block → closure → reminder → park/resume → offline → two devices → stale tab) from UI → hooks → repositories/RPC → migrations, rather than file by file.

---

## Summary

The core of the day — `/today` → `useBookingActions.patch` → `useBookings.updateBooking` → one `UPDATE bookings` row with the lifecycle, completion, payment-history and notification triggers behind it — is well designed and honestly implemented: one write path, awaited saves, optimistic rollback with Retry, Undo on reversible moves, collection+payment as one write, no customer message ever sent implicitly. The problems are at the *edges* of that path: the week calendar and the reschedule/drag flows pre-date the discipline and still toast success before (or regardless of) the database answer; the same booking can be moved three different ways with three different behaviours; "confirmed" is represented three ways; a reschedule never tells the customer although a template for exactly that exists and is unused; and roughly 2,300 lines of flagged-off legacy board plus an owner-only "Booking Desk" preview with no-op handlers are still shipped. Concurrency between two tills is handled by realtime only — writes carry the whole row and no version check, so a stale device can silently undo a colleague's payment or move.

---

## Findings

### F1. Drag-and-drop move on the week calendar reports success even when the database rejected it — **CONFIRMED**

**What I found.** `SlotGrid.handleMoveBooking` awaits `onMoveBooking(booking, targetSlot)` and then unconditionally toasts `Moved X to HH:MM`. `onMoveBooking` is `handleUpdate` = `useBookings.updateBooking`, which **returns `null` on failure and never throws** (it rolls the optimistic row back and calls `onError`). The `catch` in `handleMoveBooking` is therefore unreachable for a DB rejection.

**Evidence.** `src/components/booking/SlotGrid.jsx:80-93` (`await onMoveBooking(...); toast.show(\`Moved ...\`, "success")`), `src/supabase/hooks/useBookings.ts:559-571` (`return null` on `err || !data`), `src/components/layout/WeekCalendarView.jsx:331-339` (passes `handleUpdate` straight through). The frontend preflight `canDropAt` runs with `staffOverride: true` (`SlotGrid.jsx:56-70`) but the drop does **not** stamp `staff_capacity_override`, so a 2-2-1 rejection by `validate_booking_capacity()` (`supabase/migrations/20260919090200_capacity_trigger_no_show.sql`) is a realistic late failure, and so is a seat-block race.

**Why it matters.** The card snaps back (rollback) while a green toast says it moved. On a busy morning staff believe a dog is at 10:30 when the diary says 10:00.

**Recommendation.** Treat `null`/`false` as failure (as `useBookingActions.patch` already does), show the gate's reason (`mapDenialReason` on `DETAIL`), and offer the override confirm the Reschedule modal already has. Better: route the drop through the same `patch` wrapper the stack uses. Benefit: truthful feedback on the most-used scheduling gesture. Difficulty **Small**. Risk **Low**. Priority **High**.

---

### F2. Reschedule modal toasts "Booking rescheduled" and closes without checking the result — **CONFIRMED**

**What I found.** `BookingDetailOverlays` → `RescheduleModal.onConfirm`: `await onUpdate(updated, oldDateStr, newDateStr); setShowReschedule(false); toast.show("Booking rescheduled", "success", undo…); onClose();` — no check of the returned value.

**Evidence.** `src/components/modals/booking-detail/BookingDetailOverlays.jsx:150-172`.

**Why it matters.** Same class as F1 but on the cross-day move: a capacity rejection (the modal lets staff pick a "full" slot and sends `staff_capacity_override`, but blocked seats, the closed-day guard `SCL03`, the daily cap for non-overridden moves, or a duplicate-dog index can still refuse) produces a success toast, the detail modal closes, and the booking is silently back on the old day.

**Recommendation.** Check `result === null` → keep the modal open and show the reason (the modal already has a footer for errors). Difficulty **Small**. Risk **Low**. Priority **High**.

---

### F3. Calendar card status picker fires-and-forgets and toasts "Marked as …" immediately — **CONFIRMED**

**What I found.** `BookingCardNew.applyStatusChange` calls `onUpdate(...)` without awaiting and immediately toasts `Marked as <label>` with an Undo. The Today stack and the detail modal's `BookingStatusBar` both await and suppress the toast on `null`. The calendar card also uses its own "skip" rule (`nextIdx - prevIdx >= 2` over `BOOKING_STATUSES`) while Today uses `requiresCareSkipConfirmation` (which deliberately does *not* treat Reconfirmed as a care step) — so Booked → Arrived asks "Skip ahead?" on the calendar but not on `/today`.

**Evidence.** `src/components/booking/BookingCardNew.jsx:168-186` vs `src/components/modals/booking-detail/BookingStatusBar.jsx:66-95` and `src/components/views/today/useBookingActions.ts:109-150`; `src/engine/dailyBrief.ts:156-170`.

**Why it matters.** Three status controls, two feedback contracts and two skip rules for the same transition. The calendar one lies on failure and nags on the commonest action.

**Recommendation.** Either remove the inline status listbox from the calendar card (status work belongs on `/today`; the detail modal still offers arbitrary corrections) or make it call the shared `changeStatus`/`patch` helper. Difficulty **Small**. Risk **Low**. Priority **Medium**.

---

### F4. Whole-row booking updates with no version check — a stale till can silently undo a colleague's payment or move — **CONFIRMED (mechanism) / HYPOTHESIS (frequency)**

**What I found.** `useBookings.updateBooking` always writes `booking_date, slot, service, addons, pickup_by_id, payment, deposit_amount, payment_method, paid_amount, price_override, status, cancel_reason, confirmed` from the **in-memory** booking object, with `.eq("id", …)` as the only predicate. There is no `updated_at`/version guard. Pressing "Mark ready" on device B after device A took payment will, if B's row is stale, rewrite `payment = 'Due at Pick-up'`, `paid_amount = null`, `payment_method = null` — and the payment-history trigger will faithfully record that as a staff change. Likewise a status tap on a stale tab re-asserts the old `booking_date`/`slot` after a colleague rescheduled.

**Evidence.** `src/supabase/hooks/useBookings.ts:452-520` (payload), `:528-545` (`.update(updatePayload).eq("id", id)`), `supabase/migrations/20260927160000_booking_payment_history.sql` (records the regression). Mitigations that exist: realtime UPDATE replaces the local row (`useBookings.ts:230-252`), `registerResume` refetches on wake (`src/supabase/refreshOnResume.js`). Mitigation that does not exist: any server-side conflict detection.

**Why it matters.** Two staff devices on one booking is the stated normal operating mode (iPad at the till, phone in the back). The window is small when realtime is healthy and wide when a backgrounded PWA has a dropped websocket (iOS Safari suspends it). The symptom is "the payment disappeared" with no error anywhere.

**Recommendation.** (a) Status-only actions should send status-only patches: `patch()` already knows which fields changed, so build the payload from `changes` plus the write-only markers rather than from the whole booking. (b) Add an optimistic-concurrency predicate: `.eq("updated_at", booking.updatedAt)` and treat 0 rows as a conflict → refetch and show "This booking changed on another device — reloaded". A trigger-level alternative: refuse an UPDATE whose `payment` regresses from `Paid in Full` unless an explicit `_undoPayment` marker column is set. Benefit: removes the only silent data-loss path in the daily flow. Difficulty **Medium**. Risk **Medium** (touches the one write path; needs the parity tests). Priority **Critical**.

---

### F5. "Confirmed" is represented three ways and offered twice on the same card — **CONFIRMED**

**What I found.** For a Booked dog whose reminder has been sent, `tokenActions` pushes **both** `reconfirm` ("Reconfirmed" → writes `status = 'Reconfirmed'`, no stamp) and `confirm` ("Confirm booking" → `_confirmArrival` writes `reminder_confirmed_at`/`_source = 'staff'` *and* `status = 'Reconfirmed'`). Both produce the same card; only the second is counted by reports and clears `needsConfirmation`. Underneath, `bookings.confirmed` (legacy boolean) is still written on every update as a third representation.

**Evidence.** `src/engine/salonBoard.ts:577-582` and `:610-617`; `src/components/views/today/useBookingActions.ts:466-477` (`reconfirm`) vs `:287-304` (`confirmArrival`) and `useBookings.ts:479-502` (`_confirmArrival`); `useBookings.ts:468` (`confirmed`); `src/engine/today.ts:135` (`needsConfirmation` keys on `reminderState`/`confirmationChannel`, not on status).

**Why it matters.** Staff see two buttons that mean the same thing; one of them records nothing the reports can see.

**Recommendation.** Drop the bare `reconfirm` action; make "Confirm booking" the one path (it already advances the status). Schedule the `confirmed` column for removal. Difficulty **Small**. Risk **Low**. Priority **Medium**.

---

### F6. A staff reschedule never tells the customer — and the template for it already exists, unused — **CONFIRMED**

**What I found.** Rescheduling (drag, Reschedule modal, or edit-mode date/slot) is a plain `UPDATE`. The DB emits a `rescheduled` `booking_events` row and `reset_reminder_on_reschedule()` clears the old reminder so the *next nightly reminder* goes out for the new date — but nothing messages the customer at the time of the move. There is no `notify-booking-rescheduled` function; `booking_changed_v1` is defined in `src/constants/whatsappTemplates.js:90` and referenced nowhere else in `src/` or `supabase/functions/`.

**Evidence.** `supabase/functions/` listing (confirmed/cancelled/ready/reminder/welcome/staff/waitlist only); `supabase/migrations/20260706120000_reset_reminder_on_reschedule.sql`; `supabase/migrations/20260520250000_booking_events.sql` (event only); grep for `booking_changed_v1` → template file only.

**Why it matters.** Moving a 9:00 to 10:30 on Monday for a Tuesday appointment is routine; the owner finds out from the day-before reminder at best, or turns up at 9:00 at worst.

**Recommendation.** After a successful move, open a "Tell the owner?" prompt exactly like `CollectionNoticeModal` (opt-in, shows preview, uses `booking_changed_v1`, never implicit). Difficulty **Medium**. Risk **Low** (additive; mirrors an existing pattern). Priority **High**.

---

### F7. Cancelling from the detail modal messages the customer automatically, the dialog does not say so, and Undo cannot recall it — **CONFIRMED**

**What I found.** `BookingActions` requires cause + reason, then writes `status = 'Cancelled'`. `notify_booking_cancelled_trigger` → `notify-booking-cancelled` sends WhatsApp → SMS → email to the owner for every cancellation except the two reschedule cancel-reasons. The confirm dialog copy ("The booking stays on file. Customer-requested late cancellations are recorded…") never mentions a message. The success toast offers Undo, which re-books (through the capacity re-validation) but the customer has already been told it is cancelled. The edge function does not branch on `cancellation_cause`, so a salon-initiated cancellation gets the same wording as a customer one.

**Evidence.** `src/components/modals/booking-detail/BookingActions.jsx:118-170`; `supabase/migrations/20260505202745_booking_status_notification_triggers.sql` (trigger, re-guarded in `20260916120000`); `supabase/functions/notify-booking-cancelled/index.ts:44-89` (`bookingCancellationSkipReason` only skips reschedule reasons).

**Recommendation.** State in the dialog "The owner will be messaged" (with a "don't message" option mirroring `ConfirmationMethodDialog`), and make Undo say "the cancellation message has already gone". Consider cause-specific wording. Difficulty **Small**. Risk **Low**. Priority **Medium**.

---

### F8. Three ways to move a booking, three different behaviours, none touch-capable on the calendar — **CONFIRMED**

**What I found.** Same-day drag (desktop mouse only — `useSlotDragAndDrop` is HTML5 DnD; its own header says "Touch devices need a separate path… See follow-up task"), the Reschedule modal (cross-day, offers overbook), and edit mode in the detail modal (date picker + slot grid, with its own capacity-override confirm). The edit-mode path additionally appends `[Booking moved by Staff from … to …]` to the **dog's permanent `groom_notes`** every time a date or slot changes.

**Evidence.** `src/hooks/useSlotDragAndDrop.ts:30-33`; `src/components/modals/RescheduleModal.jsx`; `src/hooks/useBookingSave.ts:145-154` (stamp) → `onUpdateDog(..., { groomNotes: finalNotes })` at `:200-203`; `src/hooks/useBookingEditState.ts:103` (`groomNotes` initialised from `dogData.groomNotes`).

**Why it matters.** On the tablet/phone the salon actually uses, drag does nothing; staff reach for the modal. The groom-notes stamp pollutes a welfare/handling field with scheduling history that `booking_events` already records.

**Recommendation.** Make the Reschedule modal the one move affordance (open it from the slot-row menu and the stack card), drop the drag or add a pointer-events implementation, and stop stamping `groom_notes` (the `rescheduled` event is the audit trail). Difficulty **Medium**. Risk **Low**. Priority **Medium**.

---

### F9. Recurring series from the New Booking drawer: silent skips, 52 parallel inserts, misleading all-or-nothing error, and no series link — **CONFIRMED**

**What I found.** `recurringWeeks` → `floor(52 / weeks)` occurrences (52 for weekly). For `i > 0`, a closed or full date is **silently skipped** (code comment: "i > 0: silently skip (today's behaviour)"). `commitBookingList` fires every date in parallel with `Promise.all` and returns `ok = results.every(...)`, so 3 failures out of 52 produce "Couldn't save the booking — please try again" while 49 bookings exist. No `group_id` is assigned, so the "Part of recurring series — View all" button and `RecurringBookingModal` are unavailable for these series; only `DogChainBooking`/`ChainBookingModal` (from the dog card) links a series.

**Evidence.** `src/components/modals/NewBookingModal.jsx` (`buildBookingsForOverride`, `occurrences`, the skip comment); `src/hooks/useStaffAppData.ts:196-225`; `supabase/migrations/20260701230000_staff_booking_group_rpc.sql:48-49` ("group_id is deliberately NOT assigned"); `src/components/modals/dog-card/DogChainBooking.jsx:45-59`.

**Recommendation.** Preview the series before saving (dates kept / dates skipped and why), save sequentially or batch with per-date results, report partial success honestly, and assign one `group_id` so the series is manageable afterwards. Consider merging `ChainBookingModal` into this flow — two series builders is one too many. Difficulty **Medium**. Risk **Low**. Priority **Medium**.

---

### F10. The legacy four-zone board is ~2,300 lines behind a build-time flag that cannot be flipped in anger — delete it — **CONFIRMED**

**What I found.** `src/components/views/today/board/` is 2,325 lines (SalonBoard, BoardZone, DogToken*, DogActionMenu/Sheet/List, useTokenDrag, useTokenFlip, NeedsAttentionSummary, CompletedDogs, UnknownStatusRecovery). `TodayView` still builds the board tokens, zone counts, FLIP, the per-zone announcement effect and a `BoardSkeleton` for both branches. The flag is `VITE_LEGACY_SALON_BOARD`, inlined at build; docs and `features.ts` both say a flip "needs a redeploy… an instant Vercel rollback is the faster path". One commit has touched the directory since 15 Sept.

**Evidence.** `src/constants/features.ts:11-32`; `src/components/views/TodayView.jsx` (board branch at `:565-600`, token/zone plumbing throughout); `docs/today-command-centre.md` ("expected to be removed once the stack has run through a few trading days").

**Why it matters.** Dead UI that still shapes the live component's data flow, doubles the test surface, and the rollback it protects is better served by Vercel.

**Recommendation.** Keep `engine/salonBoard.ts` (`tokenActions`, `zoneForStatus`, `reverseStatusFor` are the stack's law). Move `NeedsAttentionSummary`, `UnknownStatusRecovery`, `EndOfDayFacts` out of `board/`; delete the rest and the `useLegacyBoard` branch; simplify `TodayView` to build `tokensById` without the full board. Difficulty **Medium**. Risk **Low**. Priority **Medium**.

---

### F11. "Booking Desk" is a flagged, owner-only preview whose every action is a no-op — finish it or delete it — **CONFIRMED**

**What I found.** `/booking-workspace` renders the inbox shell with `onSend={noopAsync}`, `onResolve={noopAsync}`, `onOpenHuman={noop}`, etc.; header says "Draft choices only". Gated by `FEATURE_FLAGS.booking_workspace_enabled` (on in dev, off in prod unless `VITE_BOOKING_WORKSPACE_ENABLED=1`) and `isOwner`. Last substantive PR #882.

**Evidence.** `src/components/views/booking-workspace/BookingWorkspaceView.jsx:52-57, 174-200, 217-224`; `src/constants/features.ts:8-9`; `src/components/layout/navConfig.jsx:34-44` (nav entry).

**Why it matters.** It is a fourth "day" surface in the nav for the owner, duplicating `/inbox`, that cannot do anything. Its one real idea — insert 1–3 proposed slots into a reply — belongs in `/inbox`'s context pane.

**Recommendation.** Move `BookingPane`'s slot-proposal into the inbox customer-context rail and delete the route, flag and nav item. Difficulty **Medium**. Risk **Low**. Priority **Medium**.

---

### F12. "Needs attention" means three different things, and the backlog route is hidden in a tools menu — **CONFIRMED**

**What I found.** (1) Today header strip "2 late · 1 to confirm · 3 waiting · £88 due" (`NeedsAttentionSummary`); (2) the hazard-striped `NeedsAttentionFrame` around a booking inside a partial-day closure; (3) the `/needs-attention` route — a 30-day backlog of previous days' unresolved bookings — reachable only from the tools (hamburger) menu and a Reports link, not from the primary nav or from `/today`.

**Evidence.** `src/components/views/today/TodayHeader.jsx`, `src/components/booking/NeedsAttentionFrame.jsx`, `src/components/views/NeedsAttentionView.jsx`, `src/components/layout/AppToolbar.jsx:202,345`, `src/components/views/reports/BookingHealth.jsx:93`; `navConfig.jsx` PRIMARY_NAV has no entry.

**Why it matters.** The one that most needs surfacing — yesterday's dog still "Ready", a completed groom with no payment record — is the least visible. The engine (`buildNeedsAttention`) is sound; it is the placement.

**Recommendation.** Surface the previous-days count as one line on the `/today` header ("3 things from earlier this week") linking to the backlog, rename the closure frame to "Inside closed hours", and keep the strip. Then the route can stay or fold into Today. Difficulty **Small**. Risk **Low**. Priority **Medium**.

---

### F13. Four day-oriented views; two is the right number — **CONFIRMED (structure) / recommendation**

**What I found.** Week calendar `/` (nav label "Bookings"), Today `/today` (nav label "Daily Brief", docs say "Today"/"day stack"), Booking Desk (F11), Needs Attention (F12). Today's `AvailabilityModal` and the calendar's `SlotRowMenu` both toggle immediate slots and start bookings; extra slots and seat blocks exist only on the calendar; status changes exist on Today, the calendar card and the detail modal.

**Evidence.** `navConfig.jsx:9-30`, `TodayHeader.jsx` (`title="Daily Brief"`), `StaffRoutes.jsx`.

**Recommendation.** Two surfaces with clear roles: **Today** (running the day: status, money, same-day availability) and **Diary** (scheduling: book, move, block, extra slots, closures, reminders). Remove status controls from calendar cards (F3), remove Booking Desk (F11), fold the backlog count into Today (F12), and use one name per surface in nav, header and docs. Difficulty **Medium** (mostly deletion). Risk **Low**. Priority **Medium**.

---

### F14. Walk-ins have no home: no service, no booking type, no till entry — **CONFIRMED (absence) / HYPOTHESIS (business impact)**

**What I found.** CLAUDE.md says walk-ins "are not booked at all". That is true of the code: `SERVICES` has four groom services, the staff booking drawer can book today's past slots (the picker filters only on capacity), but there is no nail-clip/ear-clean service, so a walk-in cannot be recorded, and `buildTakingsByMethod`/the cash-up read bookings only — walk-in cash is invisible to `/today`'s till figure and to Reports. The WhatsApp agent tells customers to "pop in", so the demand is real.

**Evidence.** `src/constants/salon.ts:28-33`; `src/components/modals/new-booking/TimeSlotPicker.jsx:64-76`; `src/engine/today.ts` (`buildTakingsByMethod` over bookings); `supabase/functions/_shared/agentRisk.ts` (per CLAUDE.md).

**Recommendation.** Confirm with the owner whether walk-in money should appear in the day's takings. If yes: a "Walk-in" quick entry on `/today` (dog optional, service from a small walk-in list, amount, method) writing a non-seat-occupying row or a separate `walk_ins` table that `buildTakingsByMethod` includes. If no: document the decision in `docs/today-command-centre.md` so the till figure is understood to be "booked grooms only". Difficulty **Medium**. Risk **Low**. Priority **Low** until the owner answers.

---

### F15. Booking-level notes are shown on Today but neither shown nor editable in the detail modal — **CONFIRMED**

**What I found.** `bookings.notes` (customer-written handover notes) is transformed (`transforms.ts:443-445`) and rendered on the stack card (`StackCard.jsx` "booking.notes"). The detail modal shows and edits `dog.groom_notes` under the "notes" label; `useBookings.updateBooking`'s payload has no `notes`, and no staff path writes it.

**Evidence.** `src/supabase/transforms.ts:443-445`; `src/components/views/today/stack/StackCard.jsx:308-316`; `src/components/modals/booking-detail/AppointmentDetailsCard.jsx:145,176` (groomNotes only); `src/supabase/hooks/useBookings.ts:452-520`.

**Why it matters.** A customer's "please don't use the dryer today" is visible on the till but cannot be corrected or added to by staff, and is absent from the place staff look for details.

**Recommendation.** Show `booking.notes` read-only in `AppointmentDetailsCard` labelled "From the customer", and add a staff "This visit" note field that writes `notes` (keeping `groom_notes` for the dog). Difficulty **Small**. Risk **Low**. Priority **Medium**.

---

### F16. Dead payment chooser on the calendar card; two mark-paid paths still write the gross on deposit visits — **CONFIRMED**

**What I found.** `BookingCardNew` keeps `payChooserOpen` state and a `markPaid` handler, but `setPayChooserOpen(true)` is never called — the chooser cannot render. `PaymentStateSection.markPaid` passes `settledTotal` (gross) as the amount; `MiniInvoiceModal` likewise writes gross (#874, acknowledged in docs). The stack's check-out chain correctly records the balance handed over.

**Evidence.** `src/components/booking/BookingCardNew.jsx:161,240,481` (only `false` writes); `src/components/modals/booking-detail/PaymentStateSection.jsx:169-186`; `docs/today-command-centre.md` ("The mini-invoice path still writes the gross — issue #874").

**Recommendation.** Delete the dead chooser; make `buildMarkPaidPatch` callers pass `pricing.amountDue` so "Paid £32 · card" means what was taken. Difficulty **Small**. Risk **Low**. Priority **Medium**.

---

### F17. "Didn't show" is one quiet tap with no confirm and no Undo on the toast; docs say otherwise — **CONFIRMED**

**What I found.** `runTokenAction("didntShow")` calls `patch()` with no `successAction`; nothing wraps it in `ConfirmDialog`. Recovery exists only via the card's "They turned up" (hidden for grouped visits because `SDC03` would refuse). `docs/today-command-centre.md` states "a cancellation ('Didn't show') is confirmed, never quietly undone".

**Evidence.** `src/components/views/today/useBookingActions.ts:490-503`; `src/engine/salonBoard.ts:560-565, 635`; `src/components/views/today/stack/StackCard.jsx:325-333` (direct `onAction`).

**Recommendation.** Either add Undo to the toast (cheap, consistent with every other move) or the confirm the doc promises; fix the doc either way. Difficulty **Small**. Risk **Low**. Priority **Low**.

---

### F18. A production deploy during trading hours may reload every open staff tab and lose the in-progress booking draft — **HYPOTHESIS**

**What I found.** `VitePWA({ registerType: "autoUpdate", workbox: { skipWaiting: true, clientsClaim: true } })` with the default injected register script; no `virtual:pwa-register` usage in `src/`, so no "update available" prompt. In autoUpdate mode the injected script reloads on `controllerchange`, and skipWaiting + clientsClaim make the new worker claim open tabs immediately after a merge to `main`. The new-booking drawer's draft (`useBookingSession`, dog entries, date/slot, parked state) lives only in React state.

**Evidence.** `vite.config.js:32,59-60`; `src/hooks/useBookingSession.ts`; `.github` CI deploys on merge to `main` (CLAUDE.md).

**Why it matters.** The opposite of a stale tab: a surprise reload mid-booking. Needs a test (merge during a dev:live session with the drawer open).

**Recommendation.** If confirmed, switch to `registerType: "prompt"` with a quiet "New version — reload when convenient" toast, or persist the drawer draft to `sessionStorage`. Difficulty **Small**. Risk **Low**. Priority **Medium** (pending verification).

---

### F19. Offline mid-action is handled honestly on Today, dishonestly elsewhere — **CONFIRMED**

**What I found.** `NetworkOfflineBanner` warns; buttons stay enabled. On `/today`, `patch()` awaits, rolls back and toasts an error with Retry — correct. On the calendar card (F3), drag (F1) and reschedule (F2) the user sees success while the write failed. There is no offline write queue (acceptable: the DB gates must decide).

**Evidence.** `src/components/ui/NetworkOfflineBanner.jsx`; `useBookingActions.ts:109-150`; F1–F3 locations.

**Recommendation.** Fixing F1–F3 closes this; optionally disable write controls while `useOnlineStatus()` is false. Difficulty **Small**. Risk **Low**. Priority folded into F1–F3.

---

### F20. Day-closure confirm copy says "to-do items will be created" for completed bookings excluded elsewhere, and slot removal confirm uses a different dialog component — **CONFIRMED (minor)**

**What I found.** `WeekCalendarView` computes `bookingsNeedingRearrangement` (non-Completed) for the copy but passes `dayBookings.length` (all) to the drawer's "N bookings would need rearranging". Two `ConfirmDialog` components exist (`modals/ConfirmDialog.jsx` used by Today, `shared/ConfirmDialog.jsx` used by the calendar) with different prop names (`body`/`onClose` vs `message`/`onCancel`).

**Evidence.** `src/components/layout/WeekCalendarView.jsx:149-155, 441` vs `:584-590`; imports at `TodayView.jsx:44` and `WeekCalendarView.jsx:9`.

**Recommendation.** Pass the filtered count; consolidate the two dialogs. Difficulty **Small**. Risk **Low**. Priority **Low**.

---

### F21. Lifecycle stamps and completion events do not survive an Undo round-trip cleanly — **CONFIRMED (minor)**

**What I found.** `set_booking_lifecycle_timestamps()` clears `checked_in_at` on any regression below rank 2, so Undo of a mis-tapped "Ready" (→ Arrived) keeps the stamp but Undo of "Arrived" (→ Booked) loses the arrival time if the dog had in fact arrived earlier; `on_booking_completed_change()` emits a second `completed` booking_event when a collection is undone and redone (events are never retracted — documented).

**Evidence.** `supabase/migrations/20260919090000_expand_booking_statuses.sql` (trigger body); `supabase/migrations/20260627160000_booking_completion.sql:112-140`.

**Recommendation.** Acceptable; note in docs. If owner timelines show duplicate "completed" lines, dedupe on read. Difficulty **Small**. Risk **Low**. Priority **Low**.

---

## What is already done well

- **One write path for the day.** `useBookingActions.patch` → `useBookings.updateBooking` → table-level `BEFORE` gates (`validate_booking_capacity`, `enforce_booking_calendar`, `enforce_dog_not_pregnant`), lifecycle stamps, completion side-effects, payment-history evidence and guarded outbound-notification triggers. Any new route inherits all of it. The gates emit stable `DETAIL` reason codes and the client maps them (`denials.ts`).
- **Truthful saves on Today and in the booking drawer.** Awaited inserts (`commitBookingList`), atomic multi-dog groups (`create_staff_booking_group`), optimistic rows keyed by client-generated ids so realtime echoes cannot duplicate, rollback on failure with a Retry action.
- **The check-out chain.** Collection and payment as one `UPDATE`, amount-handed-over semantics, price editable before payment only, Undo restoring both facts, the #878 guard against wiping a prepaid booking. `money()` as the single renderer of a figure.
- **Marking ready sends nothing.** `CollectionNoticeModal` is explicit, opt-in, previewed, recipient-by-recipient, and reuses the inbox send path. The stale `notify_booking_ready_trigger` was dropped (20260526120000) and the function guarded anyway (20260916120000).
- **Status rename done as expand → deploy → contract** with a dual-vocabulary lifecycle trigger (20260919090000/120000), and `No-show` as a first-class, non-occupying status with capacity revalidation on revival.
- **Partial-day closures.** Closure record and seat blocks written in one payload; enforcement reused rather than re-implemented; column-scoped `day_settings` writes so two devices editing one date commute; whole-slot blocks sent as one call.
- **Staff confirmation with "customer wins"**: filtered unconfirm (`.eq("reminder_confirmed_source","staff")`), typed-reply detection folded into the board, each transition emitting an attributed event.
- **Resume-on-wake refetch** (`refreshOnResume.js`) backstopping dropped realtime; the `/today` landing-once-per-tab rule; the date always on screen as the guard against working on the wrong day.
- **Accessibility and touch discipline on the stack**: status as a word, 44px targets everywhere including quiet actions, `inert` drawers, whole-sentence accessible names, `prefers-reduced-motion` honoured, guarded by `e2e/day-stack.spec.ts`.
- **Park & resume** for the new-customer cold start, and the New Client wizard's write-at-end with idempotent retry.

## Top 5 for this area

1. **F4 — Whole-row updates without a version check.** Send field-level patches and add an `updated_at` predicate (or a trigger refusing a `Paid in Full` regression without an explicit marker). The only silent data-loss path in daily use.
2. **F1 + F2 + F3 — Three surfaces toast success without checking the result.** Make drag, Reschedule and the calendar status picker use the same awaited `patch` contract Today uses (or remove the calendar picker). Small changes, high trust payoff.
3. **F6 — Tell the customer when staff move a booking.** Opt-in prompt after a successful move using the already-approved `booking_changed_v1` template, modelled on the collection notice.
4. **F10 + F11 + F13 — Delete the legacy board and the Booking Desk preview; settle on Today + Diary.** ~2,300 + ~300 lines of dead or no-op UI, two flags, one nav item, and a simpler `TodayView`.
5. **F5 + F9 — One way to confirm, one way to build a series.** Drop the bare "Reconfirmed" action; give recurring series a preview, honest partial results and a `group_id`.

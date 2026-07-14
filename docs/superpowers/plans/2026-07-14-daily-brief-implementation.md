# Daily Brief Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current Today command centre with the approved, date-selectable Daily Brief, including the compact icon journey and existing-model mini invoice.

**Architecture:** Keep `/today` and the existing week-scoped data hooks, but make `useWeekNav`'s query-selected date the single date source for the view. Put journey, payment-icon and invoice derivation in pure TypeScript helpers; keep React components responsible for rendering, focus and calling existing mutation paths. Reuse the shared modal shell, booking/dog/human destinations, Inbox deep link, collection template and pricing rules.

**Tech Stack:** React 19, React Router 7, TypeScript 6, Tailwind CSS 4, Lucide React 1.23, Vitest, Testing Library and Playwright.

## Global Constraints

- Navigation and heading copy is `Daily Brief`; the backwards-compatible route remains `/today`.
- The selected date is represented by `?date=YYYY-MM-DD` and every selected date remains operational, including closed, past and future dates.
- Journey controls are icon-only, at least 44 × 44px, chronological, keyboard accessible and labelled on hover and focus.
- Before collection readiness, distribute eight control centres equally; after readiness, merge the two collection choices and redistribute seven centres with no empty track.
- Use Caveat at weight 700 for the centred appointment sentence, with `cursive` as its fallback.
- Use only the current booking price, add-on, deposit and final-payment fields. Do not add a migration, payment ledger, deposit method or split-payment model.
- An edited final payment amount may only mark the booking `Paid in Full` when it exactly settles the outstanding balance.
- A collection message marks the booking ready only after WhatsApp reports a successful send; cancelling or failing the send leaves the stage unchanged.
- Preserve existing modal focus trapping, Escape handling, focus restoration and background scroll lock through `ModalShell`.
- Keep existing brand tokens and UI primitives; do not introduce a parallel design system.

---

## File structure

### Create

- `src/engine/dailyBrief.ts` — selected-date feed selection, journey actions, payment visual state, care-stage skip detection and mini-invoice patch construction.
- `src/engine/dailyBrief.test.ts` — exhaustive pure-logic coverage for the new engine contract.
- `src/components/views/today/JourneyIconButton.jsx` — accessible icon control with hover/focus label pill.
- `src/components/views/today/BookingJourneyRow.jsx` — one booking's appointment sentence, time control and responsive journey grid.
- `src/components/views/today/MiniInvoiceModal.jsx` — compact desktop modal/mobile sheet for price, add-ons, deposit and final payment.
- `src/components/views/today/MiniInvoiceModal.component.test.jsx` — invoice rendering, validation, submission and retained-error tests.
- `src/components/modals/DatePickerModal.component.test.jsx` — selected-date and closed-day selection coverage.
- `src/components/modals/collection-notice/CollectionNoticeModal.component.test.jsx` — successful-send callback and failure behaviour.
- `e2e/daily-brief.spec.ts` — desktop, tablet and mobile acceptance path for the new surface.

### Modify

- `package.json` and `package-lock.json` — add self-hosted `@fontsource/caveat@5.2.8`.
- `src/index.css` — import Caveat 700 and expose `--font-handwriting`.
- `src/types/index.ts` — add the transient `_skipCollectionPrompt` booking flag used only by the ready-without-message path.
- `src/components/layout/navConfig.jsx` — rename Today navigation/context copy to Daily Brief.
- `src/App.jsx` — stop forcing real today, pass selected-date/profile callbacks, host invoice/collection request state and render the date picker for closed dates.
- `src/hooks/useModalState.ts` — distinguish normal ready prompts from message-then-ready requests.
- `src/components/modals/DatePickerModal.jsx` — allow the Daily Brief to select closed dates without changing calendar usage elsewhere.
- `src/components/modals/shell/ModalShell.jsx` — add an opt-in mobile bottom-sheet presentation while preserving the existing full-screen default.
- `src/supabase/hooks/useBookings.js` and its component test — suppress the automatic collection prompt only for the explicit ready-without-message write.
- `src/components/modals/collection-notice/CollectionNoticeModal.jsx` — report the first successful send to the caller exactly once.
- `src/components/views/today/TodayHeader.jsx` — render the split Daily Brief/date/availability header.
- `src/components/views/today/BookingFeed.jsx` — render one `BookingJourneyRow` per booking and remove disclosure/detail controls.
- `src/components/views/today/TodayNowStrip.jsx` — keep live context and row navigation, but remove its duplicate journey mutations.
- `src/components/views/TodayView.jsx` — use the selected date throughout, wire all row destinations/actions, confirmations and invoice state, and stop substituting the next open day.
- `src/components/views/today/today.component.test.jsx` — replace expandable-row expectations with the approved header and journey behaviour.

---

### Task 1: Establish the Daily Brief route and selected-date contract

**Files:**
- Modify: `src/components/layout/navConfig.jsx`
- Modify: `src/App.jsx`
- Modify: `src/components/modals/DatePickerModal.jsx`
- Test: `src/components/modals/DatePickerModal.component.test.jsx`

**Interfaces:**
- Consumes: `useWeekNav(): { currentDateObj, currentDateStr, handleDatePick }` and the existing `DatePickerModal` props.
- Produces: `DatePickerModal({ currentDate, onSelectDate, onClose, dayOpenState, allowClosedDates?: boolean })`; `TodayView` receives `selectedDateObj`, `selectedDateStr`, `onOpenDatePicker`, `onOpenDog` and `onOpenHuman`.

- [ ] **Step 1: Write the failing date-picker component tests**

```jsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DatePickerModal } from "./DatePickerModal.jsx";

describe("DatePickerModal closed-date selection", () => {
  const currentDate = new Date(2026, 6, 14);
  const dayOpenState = { "2026-07-16": false };

  it("keeps closed dates disabled for existing calendar callers", () => {
    render(<DatePickerModal currentDate={currentDate} dayOpenState={dayOpenState} onSelectDate={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Thursday 16 July 2026, salon closed/i })).toBeDisabled();
  });

  it("lets Daily Brief select a closed date", () => {
    const onSelectDate = vi.fn();
    render(<DatePickerModal currentDate={currentDate} dayOpenState={dayOpenState} allowClosedDates onSelectDate={onSelectDate} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Thursday 16 July 2026, salon closed/i }));
    expect(onSelectDate).toHaveBeenCalledWith(new Date(2026, 6, 16));
  });
});
```

- [ ] **Step 2: Run the focused test and verify the new prop is not implemented**

Run: `npm run test:component -- src/components/modals/DatePickerModal.component.test.jsx`

Expected: FAIL because the closed date remains disabled when `allowClosedDates` is true.

- [ ] **Step 3: Add the opt-in closed-date behaviour**

```jsx
export function DatePickerModal({
  currentDate,
  onSelectDate,
  onClose,
  dayOpenState,
  allowClosedDates = false,
}) {
  const canSelect = (dateStr) => allowClosedDates || isDateOpen(dateStr, dayOpenState);
}
```

Use `canSelect(todayStr)` in the Today footer. In each day cell, retain `const isOpen = isDateOpen(dateStr, dayOpenState)`, set `const disabled = !allowClosedDates && !isOpen`, and call `onSelectDate(cellDate)` whenever `disabled` is false.

Retain `, salon closed` in the accessible date label even when selection is allowed, so staff understand the day state before opening it.

- [ ] **Step 4: Make the query-selected day authoritative on `/today`**

In `src/App.jsx`, remove the effect that calls `rawDatePick(new Date())` whenever `/today` is open. Pass the existing week-navigation values and profile callbacks:

```jsx
<TodayView
  selectedDateObj={currentDateObj}
  selectedDateStr={currentDateStr}
  onOpenDatePicker={() => setShowDatePicker(true)}
  onOpenDog={handleOpenDog}
  onOpenHuman={handleOpenHuman}
/>
```

Add these six props to the current `TodayView` call without removing its bookings, settings or mutation props.

Render the shared picker with closed-day selection enabled when it was opened from Daily Brief:

```jsx
<DatePickerModal
  currentDate={currentDateObj}
  onSelectDate={handleDatePick}
  onClose={() => setShowDatePicker(false)}
  dayOpenState={dayOpenState}
  allowClosedDates={location.pathname === "/today"}
/>
```

Change `PRIMARY_NAV[0].label` and `sectionTitleFor("/today")` from `Today` to `Daily Brief`; leave `to: "/today"` unchanged.

- [ ] **Step 5: Run the focused tests and type checks**

Run: `npm run test:component -- src/components/modals/DatePickerModal.component.test.jsx && npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit the route/date slice**

```bash
git add src/App.jsx src/components/layout/navConfig.jsx src/components/modals/DatePickerModal.jsx src/components/modals/DatePickerModal.component.test.jsx
git commit -m "feat: add Daily Brief date navigation"
```

---

### Task 2: Add pure journey and selected-date feed logic

**Files:**
- Create: `src/engine/dailyBrief.ts`
- Create: `src/engine/dailyBrief.test.ts`

**Interfaces:**
- Consumes: `Booking`, `BOOKING_STATUS`, `buildTodayFeed`, `buildFutureDayFeed` and `londonDateStr`.
- Produces: `buildDailyBriefFeed`, `buildJourneyActions`, `paymentVisual` and `requiresCareSkipConfirmation` with the exact signatures below.

- [ ] **Step 1: Write the failing engine tests**

```ts
import { describe, expect, it } from "vitest";
import { BOOKING_STATUS } from "../constants/index";
import {
  buildDailyBriefFeed,
  buildJourneyActions,
  paymentVisual,
  requiresCareSkipConfirmation,
} from "./dailyBrief";

const booking = (overrides = {}) => ({
  id: "b1", dogName: "Jack", breed: "Springer Spaniel", size: "small",
  service: "full-groom", owner: "David Law", status: BOOKING_STATUS.BOOKED,
  slot: "09:00", addons: [], pickupBy: "", payment: "Due at Pick-up",
  confirmed: true, dogNameSnapshot: null, breedSnapshot: null,
  ownerNameSnapshot: null, whatsappConversationId: null, whatsappMessageId: null,
  ...overrides,
});

describe("Daily Brief journey", () => {
  it("shows two collection alternatives before readiness and one waiting action afterwards", () => {
    expect(buildJourneyActions(booking()).map((action) => action.id)).toEqual([
      "checkIn", "startGroom", "ready", "messageCollection", "collected", "paid",
    ]);
    expect(buildJourneyActions(booking({ status: BOOKING_STATUS.READY_FOR_PICKUP })).map((action) => action.id)).toEqual([
      "checkIn", "startGroom", "waiting", "collected", "paid",
    ]);
  });

  it("marks only the next incomplete care action as next while keeping payment available", () => {
    const actions = buildJourneyActions(booking({ status: BOOKING_STATUS.CHECKED_IN }));
    expect(actions.find((action) => action.id === "startGroom")?.next).toBe(true);
    expect(actions.find((action) => action.id === "paid")?.next).toBe(false);
  });

  it("maps paid methods to the approved visuals", () => {
    expect(paymentVisual(booking())).toEqual({ visual: "unpaid", label: "Record payment" });
    expect(paymentVisual(booking({ payment: "Paid in Full", paidAmount: 42, paymentMethod: "bank_transfer" }))).toEqual({
      visual: "bankTransfer", label: "Paid £42 by bank transfer",
    });
  });

  it("confirms care-stage skips but never early payment", () => {
    expect(requiresCareSkipConfirmation(BOOKING_STATUS.BOOKED, BOOKING_STATUS.IN_BATH)).toEqual("been checked in");
    expect(requiresCareSkipConfirmation(BOOKING_STATUS.CHECKED_IN, BOOKING_STATUS.IN_BATH)).toBeNull();
  });

  it("uses live urgency only for real today", () => {
    const now = new Date("2026-07-14T11:00:00+01:00");
    expect(buildDailyBriefFeed([booking()], "2026-07-14", now)[0].isLate).toBe(true);
    expect(buildDailyBriefFeed([booking()], "2026-07-15", now)[0].isLate).toBe(false);
  });
});
```

- [ ] **Step 2: Run the engine test and verify the module is absent**

Run: `npm run test:logic -- src/engine/dailyBrief.test.ts`

Expected: FAIL with `Cannot find module './dailyBrief'`.

- [ ] **Step 3: Implement the pure journey model**

```ts
import { BOOKING_STATUS, paymentMethodLabel } from "../constants/index";
import type { Booking } from "../types/index";
import { buildFutureDayFeed, buildTodayFeed, londonDateStr } from "./today";

export type JourneyActionId = "checkIn" | "startGroom" | "ready" | "messageCollection" | "waiting" | "collected" | "paid";
export type PaymentVisual = "unpaid" | "cash" | "card" | "bankTransfer";

export interface JourneyAction {
  id: JourneyActionId;
  label: string;
  completed: boolean;
  next: boolean;
}

const CARE = [
  BOOKING_STATUS.BOOKED,
  BOOKING_STATUS.CHECKED_IN,
  BOOKING_STATUS.IN_BATH,
  BOOKING_STATUS.READY_FOR_PICKUP,
  BOOKING_STATUS.COMPLETED,
] as const;

const indexOfStatus = (status: string | null | undefined) => Math.max(0, CARE.indexOf(status as (typeof CARE)[number]));

export function buildJourneyActions(booking: Booking): JourneyAction[] {
  const index = indexOfStatus(booking.status);
  const paid = booking.payment === "Paid in Full";
  const action = (id: JourneyActionId, label: string, completed: boolean, next: boolean): JourneyAction => ({ id, label, completed, next });
  return [
    action("checkIn", index >= 1 ? "Checked-in" : "Check-in", index >= 1, index === 0),
    action("startGroom", index >= 2 ? "Being groomed" : "Start groom", index >= 2, index === 1),
    ...(index >= 3
      ? [action("waiting", "Waiting to be collected", true, false)]
      : [
          action("ready", "Ready for collection", false, index === 2),
          action("messageCollection", "Message for collection", false, false),
        ]),
    action("collected", index >= 4 ? "Complete" : "Collected", index >= 4, index === 3),
    action("paid", paymentVisual(booking).label, paid, false),
  ];
}

export function paymentVisual(booking: Booking): { visual: PaymentVisual; label: string } {
  if (booking.payment !== "Paid in Full") return { visual: "unpaid", label: "Record payment" };
  const amount = Number(booking.paidAmount || 0).toLocaleString("en-GB", { maximumFractionDigits: 2 });
  const method = paymentMethodLabel(booking.paymentMethod) || "unrecorded method";
  const visual: PaymentVisual = booking.paymentMethod === "cash" ? "cash" : booking.paymentMethod === "card" ? "card" : "bankTransfer";
  return { visual, label: `Paid £${amount} by ${method.toLowerCase()}` };
}

export function requiresCareSkipConfirmation(currentStatus: string | null | undefined, targetStatus: string): string | null {
  const current = indexOfStatus(currentStatus);
  const target = CARE.indexOf(targetStatus as (typeof CARE)[number]);
  if (target <= current + 1) return null;
  return CARE[current + 1] === BOOKING_STATUS.CHECKED_IN ? "been checked in"
    : CARE[current + 1] === BOOKING_STATUS.IN_BATH ? "started the groom"
    : CARE[current + 1] === BOOKING_STATUS.READY_FOR_PICKUP ? "been marked ready for collection"
    : "been collected";
}

export function buildDailyBriefFeed(bookings: Booking[], selectedDateStr: string, now: Date) {
  return selectedDateStr === londonDateStr(now) ? buildTodayFeed(bookings, now) : buildFutureDayFeed(bookings);
}
```

- [ ] **Step 4: Run the engine tests**

Run: `npm run test:logic -- src/engine/dailyBrief.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the engine slice**

```bash
git add src/engine/dailyBrief.ts src/engine/dailyBrief.test.ts
git commit -m "feat: model Daily Brief journey states"
```

---

### Task 3: Make collection messaging and ready-without-message distinct

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/hooks/useModalState.ts`
- Modify: `src/App.jsx`
- Modify: `src/supabase/hooks/useBookings.js`
- Modify: `src/supabase/hooks/useBookings.component.test.jsx`
- Modify: `src/components/modals/collection-notice/CollectionNoticeModal.jsx`
- Test: `src/components/modals/collection-notice/CollectionNoticeModal.component.test.jsx`

**Interfaces:**
- Consumes: the existing `onReadyForPickup` callback and `CollectionNoticeModal({ booking, onClose })`.
- Produces: `CollectionNoticeRequest = { booking: Booking; markReadyOnSend: boolean }`, booking flag `_skipCollectionPrompt?: boolean`, and `CollectionNoticeModal({ booking, onClose, onSent? })`.

- [ ] **Step 1: Add failing tests for prompt suppression and successful-send notification**

Add this case to `src/supabase/hooks/useBookings.component.test.jsx` using its existing render helper and mocked update response:

```jsx
it("does not open the automatic collection prompt for ready-without-message", async () => {
  const onReadyForPickup = vi.fn();
  const { result } = renderBookingsHook({ onReadyForPickup });
  await act(() => result.current.updateBooking(
    { ...bookedFixture, status: "Ready for pick-up", _skipCollectionPrompt: true },
    "2026-07-14",
    "2026-07-14",
  ));
  expect(onReadyForPickup).not.toHaveBeenCalled();
});
```

Create the modal test around the existing Supabase mock pattern:

```jsx
it("calls onSent once after the first successful recipient send", async () => {
  const onSent = vi.fn().mockResolvedValue(undefined);
  render(<CollectionNoticeModal booking={bookingFixture} onClose={vi.fn()} onSent={onSent} />);
  await screen.findByText("Owner");
  fireEvent.click(screen.getByRole("button", { name: /Send WhatsApp/i }));
  await waitFor(() => expect(onSent).toHaveBeenCalledTimes(1));
  expect(onSent).toHaveBeenCalledWith(bookingFixture);
});
```

- [ ] **Step 2: Run the two test files and verify failure**

Run: `npm run test:component -- src/supabase/hooks/useBookings.component.test.jsx src/components/modals/collection-notice/CollectionNoticeModal.component.test.jsx`

Expected: FAIL because `_skipCollectionPrompt` is ignored and `onSent` is never called.

- [ ] **Step 3: Suppress only the explicit ready-without-message prompt**

Add to `Booking` in `src/types/index.ts`:

```ts
/** Transient UI instruction; never persisted to the bookings table. */
_skipCollectionPrompt?: boolean;
```

Gate the central callback in `useBookings.js` without adding the flag to `updatePayload`:

```js
if (
  !updatedBooking._skipCollectionPrompt &&
  prevRow?.status !== BOOKING_STATUS.READY_FOR_PICKUP &&
  persisted.status === BOOKING_STATUS.READY_FOR_PICKUP
) {
  onReadyForPickupRef.current?.(persisted);
}
```

- [ ] **Step 4: Notify the caller exactly once after a successful send**

In `CollectionNoticeModal.jsx`, accept `onSent`, add `useRef`, and run the callback after the WhatsApp invocation has succeeded:

```jsx
const readyNotifiedRef = useRef(false);

setSentIds((prev) => new Set(prev).add(recipient.id));
toast.show(`Collection notice sent to ${displayName(recipient)}.`, "success");
if (!readyNotifiedRef.current) {
  readyNotifiedRef.current = true;
  try {
    await onSent?.(booking);
  } catch {
    toast.show("Message sent, but the booking could not be marked ready. Mark it ready manually.", "error");
  }
}
```

Include `onSent` and `booking` in the callback dependency list. A failed WhatsApp call never reaches this block; sending to a second recipient cannot call `onSent` again.

- [ ] **Step 5: Distinguish collection request intent in modal state and App**

```ts
interface CollectionNoticeRequest {
  booking: Booking;
  markReadyOnSend: boolean;
}

collectionNotice: CollectionNoticeRequest | null;
setCollectionNotice: (request: CollectionNoticeRequest | null) => void;
```

Wire `useBookings` and the modal in `App.jsx`:

```jsx
onReadyForPickup: (booking) => setCollectionNotice({ booking, markReadyOnSend: false }),

<TodayView
  onSendCollection={(booking) => setCollectionNotice({ booking, markReadyOnSend: true })}
  onOpenBooking={handleOpenBooking}
/>

<CollectionNoticeModal
  booking={collectionNotice.booking}
  onClose={() => setCollectionNotice(null)}
  onSent={async (booking) => {
    if (!collectionNotice.markReadyOnSend) return;
    const date = booking._bookingDate || currentDateStr;
    const saved = await handleUpdate(
      { ...booking, status: BOOKING_STATUS.READY_FOR_PICKUP, _skipCollectionPrompt: true },
      date,
      date,
    );
    if (!saved) throw new Error("Ready update failed");
  }}
/>
```

- [ ] **Step 6: Run focused tests and type checks**

Run: `npm run test:component -- src/supabase/hooks/useBookings.component.test.jsx src/components/modals/collection-notice/CollectionNoticeModal.component.test.jsx && npm run typecheck`

Expected: PASS.

- [ ] **Step 7: Commit the collection-flow slice**

```bash
git add src/types/index.ts src/hooks/useModalState.ts src/App.jsx src/supabase/hooks/useBookings.js src/supabase/hooks/useBookings.component.test.jsx src/components/modals/collection-notice/CollectionNoticeModal.jsx src/components/modals/collection-notice/CollectionNoticeModal.component.test.jsx
git commit -m "feat: separate ready and collection message actions"
```

---

### Task 4: Build the existing-model mini invoice

**Files:**
- Modify: `src/engine/dailyBrief.ts`
- Modify: `src/engine/dailyBrief.test.ts`
- Modify: `src/components/modals/shell/ModalShell.jsx`
- Create: `src/components/views/today/MiniInvoiceModal.jsx`
- Create: `src/components/views/today/MiniInvoiceModal.component.test.jsx`

**Interfaces:**
- Consumes: `computeBookingPricing`, `validateDepositAmount`, `AVAILABLE_ADDONS`, `PAYMENT_METHODS` and `ModalShell`.
- Produces: `buildMiniInvoicePatch(input)`, `ModalShell({ mobilePresentation?: "full" | "sheet" })` and `MiniInvoiceModal({ booking, dog, configPricing, onSave, onClose })`.

- [ ] **Step 1: Add failing invoice-rule tests**

```ts
describe("buildMiniInvoicePatch", () => {
  const input = {
    booking: booking({ service: "full-groom", size: "small" }),
    basePrice: 42,
    addons: [],
    depositAmount: 10,
    paymentReceived: 32,
    paymentMethod: "card",
  };

  it("stores the appointment total, final method and retained deposit", () => {
    expect(buildMiniInvoicePatch(input)).toEqual({
      ok: true,
      subtotal: 42,
      amountDue: 32,
      patch: {
        priceOverride: 42, addons: [], payment: "Paid in Full",
        depositAmount: 10, paymentMethod: "card", paidAmount: 42,
      },
    });
  });

  it("does not mark a partial final payment as paid", () => {
    expect(buildMiniInvoicePatch({ ...input, paymentReceived: 20 })).toEqual({
      ok: false,
      error: "Enter the full £32 balance or update the deposit amount",
    });
  });

  it("saves deposit-only state without a payment method", () => {
    expect(buildMiniInvoicePatch({ ...input, paymentReceived: 0, paymentMethod: null })).toMatchObject({
      ok: true,
      patch: { payment: "Deposit Paid", depositAmount: 10, paymentMethod: null, paidAmount: null },
    });
  });
});
```

- [ ] **Step 2: Run the engine test and verify the export is missing**

Run: `npm run test:logic -- src/engine/dailyBrief.test.ts`

Expected: FAIL because `buildMiniInvoicePatch` is not exported.

- [ ] **Step 3: Implement the invoice patch builder**

```ts
import { computeBookingPricing, validateDepositAmount } from "./bookingRules";
import type { BookingPricingInput } from "./bookingRules";

export interface MiniInvoiceInput {
  booking: BookingPricingInput;
  basePrice: number;
  addons: string[];
  depositAmount: number;
  paymentReceived: number;
  paymentMethod: string | null;
}

export function buildMiniInvoicePatch(input: MiniInvoiceInput) {
  const basePrice = Number(input.basePrice);
  if (!Number.isFinite(basePrice) || basePrice <= 0) return { ok: false as const, error: "Enter a base price above £0" };
  const pricingInput = { ...input.booking, priceOverride: basePrice, addons: input.addons };
  const subtotal = computeBookingPricing(pricingInput).subtotal;
  const deposit = Number(input.depositAmount || 0);
  const depositError = deposit > 0 ? validateDepositAmount("Deposit Paid", deposit, subtotal) : null;
  if (depositError) return { ok: false as const, error: depositError };
  const amountDue = Math.max(0, subtotal - deposit);
  const received = Number(input.paymentReceived || 0);
  if (!Number.isFinite(received) || received < 0) return { ok: false as const, error: "Payment received cannot be negative" };
  if (received > 0 && !input.paymentMethod) return { ok: false as const, error: "Choose Cash, Card or Bank transfer" };
  if (received > 0 && Math.round(received * 100) !== Math.round(amountDue * 100)) {
    return { ok: false as const, error: `Enter the full £${amountDue.toLocaleString("en-GB", { maximumFractionDigits: 2 })} balance or update the deposit amount` };
  }
  const settled = received > 0;
  return {
    ok: true as const,
    subtotal,
    amountDue,
    patch: {
      priceOverride: basePrice,
      addons: input.addons,
      payment: settled ? "Paid in Full" as const : deposit > 0 ? "Deposit Paid" as const : "Due at Pick-up" as const,
      depositAmount: deposit > 0 ? deposit : null,
      paymentMethod: settled ? input.paymentMethod : null,
      paidAmount: settled ? subtotal : null,
    },
  };
}
```

- [ ] **Step 4: Write the failing modal tests**

```jsx
it("prefills the outstanding balance and submits the selected method", async () => {
  const onSave = vi.fn().mockResolvedValue({ id: "b1" });
  render(<MiniInvoiceModal booking={{ ...bookingFixture, payment: "Deposit Paid", depositAmount: 10 }} dog={dogFixture} configPricing={null} onSave={onSave} onClose={vi.fn()} />);
  expect(screen.getByLabelText("Payment received")).toHaveValue(32);
  fireEvent.click(screen.getByRole("radio", { name: "Card" }));
  fireEvent.click(screen.getByRole("button", { name: "Save payment" }));
  await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ payment: "Paid in Full", paymentMethod: "card", paidAmount: 42 })));
});

it("keeps edited values and shows an inline error when the save fails", async () => {
  const onSave = vi.fn().mockResolvedValue(null);
  render(<MiniInvoiceModal booking={bookingFixture} dog={dogFixture} configPricing={null} onSave={onSave} onClose={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("Base groom price"), { target: { value: "46" } });
  fireEvent.click(screen.getByRole("radio", { name: "Cash" }));
  fireEvent.click(screen.getByRole("button", { name: "Save payment" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Payment could not be saved");
  expect(screen.getByLabelText("Base groom price")).toHaveValue(46);
});
```

- [ ] **Step 5: Implement `MiniInvoiceModal` with existing primitives**

Import `SERVICES`, `AVAILABLE_ADDONS` and `PAYMENT_METHODS` from the existing constants module. Use `computeBookingPricing` once to derive the initial base/subtotal/balance, controlled number inputs for base/deposit/payment, checkboxes for `AVAILABLE_ADDONS`, and radio inputs for `PAYMENT_METHODS`. Submit through the pure helper and keep local state on failure:

```jsx
const submit = async (event) => {
  event.preventDefault();
  setError("");
  const result = buildMiniInvoicePatch({
    booking: { ...booking, customPrice: dog?.customPrice ?? null, configPricing },
    basePrice, addons, depositAmount, paymentReceived, paymentMethod,
  });
  if (!result.ok) return setError(result.error);
  setSaving(true);
  const saved = await onSave(result.patch);
  setSaving(false);
  if (!saved) return setError("Payment could not be saved. Check your connection and try again.");
  onClose();
};

const serviceName = SERVICES.find((service) => service.id === booking.service)?.name || booking.service;
```

Render it through:

First extend `ModalShell` without changing its default presentation:

```jsx
export function ModalShell({ mobilePresentation = "full", ...props }) {
  const mobileClass = mobilePresentation === "sheet"
    ? "max-sm:w-full max-sm:max-w-none max-sm:max-h-[92dvh] max-sm:rounded-t-[24px] max-sm:rounded-b-none"
    : "max-sm:w-full max-sm:max-w-none max-sm:h-[100dvh] max-sm:max-h-none max-sm:rounded-none";
  const overlayClassName = mobilePresentation === "sheet"
    ? "flex items-end justify-center sm:items-center"
    : "flex items-center justify-center";
  return <AccessibleModal overlayClassName={overlayClassName} className={`bg-[var(--color-brand-paper)] flex flex-col overflow-hidden ${props.widthClass} ${props.maxHeightClass} ${mobileClass}`} />;
}
```

Preserve the current accent, header, scrollable body, footer, animation, shadow and `AccessibleModal` props when applying this conditional class. Only the mobile positioning and height differ.

```jsx
<ModalShell
  titleId="mini-invoice-title"
  onClose={dirty && !saving ? requestDirtyClose : onClose}
  dismissOnEscape={!saving}
  widthClass="w-[min(520px,95vw)]"
  bodyClassName="p-4 sm:p-5"
  mobilePresentation="sheet"
  header={
    <header className="px-5 pb-4 pt-5">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Mini invoice</p>
      <h2 id="mini-invoice-title" className="font-display text-2xl font-bold text-brand-purple">Invoice · {booking.dogName}</h2>
    </header>
  }
  footer={
    <div className="grid grid-cols-2 gap-2 border-t border-slate-100 bg-white px-5 py-3">
      <button type="button" onClick={dirty ? requestDirtyClose : onClose} disabled={saving} className="min-h-11 rounded-full border border-slate-200 font-bold">Cancel</button>
      <button type="submit" form="mini-invoice-form" disabled={saving} className="min-h-11 rounded-full bg-brand-purple font-bold text-white">{saving ? "Saving…" : "Save payment"}</button>
    </div>
  }
>
  <form id="mini-invoice-form" onSubmit={submit} className="flex flex-col gap-4">
    <p className="text-sm text-slate-600">{serviceName} · {booking.slot}</p>
    <label>Base groom price <input aria-label="Base groom price" type="number" min="0.01" step="0.01" value={basePrice} onChange={(event) => setBasePrice(event.target.value)} /></label>
    <fieldset><legend>Additional services</legend>{AVAILABLE_ADDONS.map((addon) => <label key={addon}><input type="checkbox" checked={addons.includes(addon)} onChange={() => toggleAddon(addon)} />{addon}</label>)}</fieldset>
    <label>Deposit received <input aria-label="Deposit received" type="number" min="0" step="0.01" value={depositAmount} onChange={(event) => setDepositAmount(event.target.value)} /></label>
    <dl><div><dt>Total</dt><dd>{formatMoney(totals.subtotal)}</dd></div><div><dt>Outstanding balance</dt><dd>{formatMoney(totals.amountDue)}</dd></div></dl>
    <label>Payment received <input aria-label="Payment received" type="number" min="0" step="0.01" value={paymentReceived} onChange={(event) => setPaymentReceived(event.target.value)} /></label>
    <fieldset><legend>Payment method</legend>{PAYMENT_METHODS.map((method) => <label key={method.id}><input type="radio" name="payment-method" value={method.id} checked={paymentMethod === method.id} onChange={() => setPaymentMethod(method.id)} />{method.label}</label>)}</fieldset>
    {error && <p role="alert" className="text-sm font-semibold text-brand-coral-text">{error}</p>}
  </form>
</ModalShell>
```

The displayed order must be context, base price, add-ons, deposit, total, balance, payment received and method. Use a native confirmation dialog only for dirty close, with the exact prompt `Discard these invoice changes?`.

- [ ] **Step 6: Run the invoice tests**

Run: `npm run test:logic -- src/engine/dailyBrief.test.ts && npm run test:component -- src/components/views/today/MiniInvoiceModal.component.test.jsx`

Expected: PASS.

- [ ] **Step 7: Commit the invoice slice**

```bash
git add src/engine/dailyBrief.ts src/engine/dailyBrief.test.ts src/components/modals/shell/ModalShell.jsx src/components/views/today/MiniInvoiceModal.jsx src/components/views/today/MiniInvoiceModal.component.test.jsx
git commit -m "feat: add Daily Brief mini invoice"
```

---

### Task 5: Build the split header and accessible journey row

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/index.css`
- Modify: `src/components/views/today/TodayHeader.jsx`
- Create: `src/components/views/today/JourneyIconButton.jsx`
- Create: `src/components/views/today/BookingJourneyRow.jsx`
- Modify: `src/components/views/today/BookingFeed.jsx`
- Modify: `src/components/views/today/today.component.test.jsx`

**Interfaces:**
- Consumes: Task 2's `JourneyAction`, `buildJourneyActions`, `paymentVisual`, Lucide icons and existing display/pricing resolvers.
- Produces: `BookingJourneyRow({ entry, slotLabel, display, price, handlers })`; `BookingFeed` renders one row per entry.

- [ ] **Step 1: Replace the header/row tests with approved interaction assertions**

```jsx
it("renders the Daily Brief heading, date control and balanced availability panel", () => {
  render(<TodayHeader dateLabel="Tuesday 14 July" dogsBooked={11} actionCount={6} unpaidTotal={482} isDayOpen nextOnlineSlot={null} onOpenDatePicker={vi.fn()} onManageAvailability={vi.fn()} />);
  expect(screen.getByRole("heading", { name: "Daily Brief" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Choose date, Tuesday 14 July/i })).toBeInTheDocument();
  expect(screen.getByText("No online slots available")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Manage availability" })).toBeInTheDocument();
});

it("exposes distinct row destinations and six journey actions before readiness", () => {
  renderFeed([group("09:00", [entry(booking)])]);
  expect(screen.getByRole("button", { name: "Open Jack's dog file" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Open Full groom booking" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Open David Law's human file" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Open £42 invoice" })).toBeInTheDocument();
  expect(screen.getAllByTestId("journey-action")).toHaveLength(6);
});

it("merges collection actions and redistributes the row at ready", () => {
  renderFeed([group("09:00", [entry({ ...booking, status: "Ready for pick-up" }, { stage: "ready" })])]);
  expect(screen.getByRole("button", { name: "Waiting to be collected" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Message for collection" })).not.toBeInTheDocument();
  expect(screen.getByTestId("booking-journey-grid")).toHaveAttribute("data-centres", "7");
});

it("shows the same label pill on hover and keyboard focus", () => {
  renderFeed([group("09:00", [entry(booking)])]);
  const checkIn = screen.getByRole("button", { name: "Check-in" });
  fireEvent.focus(checkIn);
  expect(screen.getByText("Check-in")).toHaveClass("group-focus-within:opacity-100");
});
```

- [ ] **Step 2: Run the Today component test and verify the old disclosure UI fails**

Run: `npm run test:component -- src/components/views/today/today.component.test.jsx`

Expected: FAIL because the heading is still Today and the row still uses an expandable disclosure.

- [ ] **Step 3: Install and expose Caveat**

Run: `npm install @fontsource/caveat@5.2.8`

Add to `src/index.css` immediately after Tailwind:

```css
@import "@fontsource/caveat/700.css";
```

Add inside `@theme`:

```css
--font-handwriting: "Caveat", cursive;
```

- [ ] **Step 4: Implement the label-pill icon primitive**

```jsx
export function JourneyIconButton({ label, active = false, complete = false, onClick, children }) {
  return (
    <span className="group relative flex min-w-0 justify-center pb-7">
      <button
        type="button"
        data-testid="journey-action"
        aria-label={label}
        onClick={onClick}
        className={[
          "inline-flex size-11 items-center justify-center rounded-full border-2 outline-none transition",
          "focus-visible:ring-2 focus-visible:ring-brand-purple focus-visible:ring-offset-2",
          complete ? "border-brand-teal bg-brand-teal text-white" : active ? "border-brand-yellow-dark bg-brand-yellow text-brand-purple" : "border-brand-paper-line bg-[#F4EFE6] text-slate-500",
        ].join(" ")}
      >
        {children}
      </button>
      <span className="pointer-events-none absolute bottom-0 z-10 whitespace-nowrap rounded-full bg-brand-purple px-2 py-1 text-[10px] font-bold text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        {label}
      </span>
    </span>
  );
}
```

- [ ] **Step 5: Implement one responsive journey row**

Use Lucide `LogIn`, `Bubbles`, `Scissors`, `Send`, `Car`, `PoundSterling`, `Banknote`, `Coins`, `CreditCard`, `Landmark` and `MessageCircle`. Map action IDs to the approved icons. The row structure is:

```jsx
<article id={`today-card-${booking.id}`} className="rounded-2xl border border-brand-paper-line bg-white px-3 py-3 sm:px-4">
  <p className="min-w-0 text-center font-handwriting text-[clamp(1.45rem,3vw,2rem)] font-bold leading-tight text-brand-purple">
    <button aria-label={`Open ${display.dogName}'s dog file`} onClick={() => handlers.onOpenDog(booking._dogId)}>{display.dogName} · {display.breed}</button>
    <span aria-hidden> · </span>
    <button aria-label={`Open ${display.serviceLabel} booking`} onClick={() => handlers.onOpenBooking(booking.id)}>{display.serviceLabel}</button>
    <span aria-hidden> · </span>
    <button aria-label={`Open ${display.owner}'s human file`} onClick={() => handlers.onOpenHuman(booking._ownerId)}>{display.owner}</button>
    <span aria-hidden> · </span>
    <button aria-label={`Open £${price} invoice`} onClick={() => handlers.onOpenInvoice(booking)}>£{price}</button>
  </p>

  <div
    data-testid="booking-journey-grid"
    data-centres={journey.length === 6 ? "8" : "7"}
    className="journey-grid mt-3 grid grid-cols-8 items-start justify-items-center gap-y-1 sm:grid-cols-[repeat(var(--journey-centres),minmax(0,1fr))]"
    style={{ "--journey-centres": journey.length + 2 }}
  >
    <span className="relative flex justify-center pb-7">
      <button type="button" aria-label={`Open ${slotLabel} booking`} onClick={() => handlers.onOpenBooking(booking.id)} className="flex size-13 items-center justify-center rounded-full bg-brand-purple text-sm font-extrabold text-white tabular-nums focus-visible:ring-2 focus-visible:ring-brand-purple focus-visible:ring-offset-2">{slotLabel}</button>
    </span>
    {journey.map((action) => <JourneyIconButton key={action.id} label={action.label} active={action.next} complete={action.completed} onClick={() => handlers.onJourneyAction(booking, action)}>{iconFor(action, booking)}</JourneyIconButton>)}
    <span className="relative flex justify-center pb-7">
      <button type="button" aria-label={`Message ${display.owner}`} onClick={() => handlers.onMessageOwner(booking)} className="flex min-h-11 min-w-11 items-center justify-center text-brand-purple focus-visible:ring-2 focus-visible:ring-brand-purple focus-visible:ring-offset-2"><MessageCircle size={52} fill="currentColor" strokeWidth={1.8} /></button>
    </span>
  </div>
</article>
```

The appointment sentence buttons have no underline, but retain visible focus rings. For mobile, keep chronological DOM order and use two balanced rows; do not add horizontal scrolling. For cash, render `Banknote` and `Coins` together inside one 44px button.

Add the mobile balancing rule to `src/index.css`; every item spans two of eight tracks, and the first item of a three-item final row starts on track two:

```css
@media (max-width: 639px) {
  .journey-grid > * { grid-column: span 2; }
  .journey-grid[data-centres="7"] > :nth-child(5) { grid-column-start: 2; }
}
```

- [ ] **Step 6: Simplify `BookingFeed` to one row per booking**

Import `SERVICES` from the existing constants module, then render each entry directly:

```jsx
export function BookingFeed({ groups, dogs, resolve, paymentOf, priceOf, ...handlers }) {
  return (
    <section aria-label="Daily bookings" className="flex flex-col gap-2">
      {groups.flatMap((group) => group.entries.map((entry) => {
        const booking = entry.booking;
        return (
          <BookingJourneyRow
            key={booking.id}
            entry={entry}
            slotLabel={group.label}
            display={{ ...resolve(booking), serviceLabel: SERVICES.find((service) => service.id === booking.service)?.name || booking.service }}
            price={priceOf(booking)}
            handlers={handlers}
          />
        );
      }))}
    </section>
  );
}
```

Delete the disclosure toggle, chips, `RowDetail`, payment chooser and the six-button action grid from this file.

- [ ] **Step 7: Rebuild the split header**

Use a two-column `lg:grid-cols-[minmax(0,1.35fr)_minmax(16rem,.65fr)]` header. The left side contains `Daily Brief`, a calendar-button date, and the three existing summary pills. The right side is a bordered warm-white panel with `Manage availability`, `No online slots available` or the next slot, and the closed-day label when relevant. `Manage availability` remains visible on closed dates.

```jsx
<button type="button" aria-label={`Choose date, ${dateLabel}`} onClick={onOpenDatePicker} className="inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-left text-brand-purple hover:bg-white">
  <CalendarDays size={20} aria-hidden />
  <span className="font-display text-base font-bold">{dateLabel}</span>
</button>
```

- [ ] **Step 8: Run component tests and visual static checks**

Run: `npm run test:component -- src/components/views/today/today.component.test.jsx && npm run typecheck && npm run lint`

Expected: PASS.

- [ ] **Step 9: Commit the visual component slice**

```bash
git add package.json package-lock.json src/index.css src/components/views/today/TodayHeader.jsx src/components/views/today/JourneyIconButton.jsx src/components/views/today/BookingJourneyRow.jsx src/components/views/today/BookingFeed.jsx src/components/views/today/today.component.test.jsx
git commit -m "feat: build Daily Brief journey interface"
```

---

### Task 6: Integrate Daily Brief actions, destinations and state handling

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/components/views/TodayView.jsx`
- Modify: `src/components/views/today/TodayNowStrip.jsx`
- Modify: `src/components/views/today/today.component.test.jsx`

**Interfaces:**
- Consumes: Tasks 1–5 interfaces and existing `onUpdateBooking`, `onOpenBooking`, dog/human profile callbacks, Inbox navigation and toast provider.
- Produces: a fully operational selected-date Daily Brief with one mutation surface per booking.

- [ ] **Step 1: Add failing integration-oriented component cases**

```jsx
it("uses the selected date for rows, copy and new bookings", () => {
  const onNewBooking = vi.fn();
  render(<TodayView {...viewProps} selectedDateStr="2026-07-16" selectedDateObj={new Date(2026, 6, 16)} bookingsByDate={{ "2026-07-16": [] }} onNewBooking={onNewBooking} />);
  expect(screen.getByText("No bookings on this date")).toBeInTheDocument();
  expect(screen.getByText("Thursday 16 July")).toBeInTheDocument();
});

it("confirms a skipped care stage and does not confirm early payment", async () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  render(<TodayView {...viewProps} />);
  fireEvent.click(screen.getByRole("button", { name: "Start groom" }));
  expect(confirm).toHaveBeenCalledWith("Jack has not been checked in. Continue anyway?");
  fireEvent.click(screen.getByRole("button", { name: "Record payment" }));
  expect(confirm).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run the Today component test and verify failure**

Run: `npm run test:component -- src/components/views/today/today.component.test.jsx`

Expected: FAIL because `TodayView` still derives its date from the clock and has no journey dispatcher.

- [ ] **Step 3: Replace real-today derivation with selected-date derivation**

In `TodayView.jsx`:

```jsx
const daySettingsForDate = daySettings?.[selectedDateStr] || {};
const dayBookings = useMemo(() => bookingsByDate?.[selectedDateStr] || [], [bookingsByDate, selectedDateStr]);
const isDayOpen = dayOpenState?.[selectedDateStr] !== false;
const feed = useMemo(() => buildDailyBriefFeed(dayBookings, selectedDateStr, now), [dayBookings, selectedDateStr, now]);
const dateLabel = selectedDateObj.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
```

Use `selectedDateStr` for settings, opportunities, dismiss keys, new-booking slots, notes and mutation fallbacks. Remove `useNextOpenDayBrief`, `ClosedDayBrief` and the next-open-day substitution. Closed dates still render their bookings and actions; an empty selected date renders `No bookings on this date` while calendar and availability remain available.

- [ ] **Step 4: Add a single journey dispatcher with skip confirmation**

```jsx
const updateStatus = useCallback(async (booking, status, successMessage, options = {}) => {
  const skipped = requiresCareSkipConfirmation(booking.status, status);
  if (skipped && !window.confirm(`${booking.dogName} has not ${skipped}. Continue anyway?`)) return null;
  return patch(booking, { status, ...(options.skipCollectionPrompt ? { _skipCollectionPrompt: true } : {}) }, successMessage);
}, [patch]);

const onJourneyAction = useCallback((booking, action) => {
  if (action.id === "checkIn") return updateStatus(booking, BOOKING_STATUS.CHECKED_IN, `${booking.dogName} checked in`);
  if (action.id === "startGroom") return updateStatus(booking, BOOKING_STATUS.IN_BATH, `${booking.dogName} — groom started`);
  if (action.id === "ready") return updateStatus(booking, BOOKING_STATUS.READY_FOR_PICKUP, `${booking.dogName} is waiting to be collected`, { skipCollectionPrompt: true });
  if (action.id === "messageCollection") return onSendCollection(booking);
  if (action.id === "collected") return updateStatus(booking, BOOKING_STATUS.COMPLETED, `${booking.dogName} collected`);
  if (action.id === "paid") return setInvoiceBooking(booking);
  return null;
}, [onSendCollection, updateStatus]);
```

Completed actions may be disabled unless an existing product rule intentionally allows reversal through `BookingDetailModal`. The two collection alternatives never trigger a skip confirmation.

- [ ] **Step 5: Wire identity destinations and invoice saving**

```jsx
const onOpenInvoice = useCallback((booking) => setInvoiceBooking(booking), []);
const onSaveInvoice = useCallback((booking, invoicePatch) => patch(booking, invoicePatch, "Payment recorded"), [patch]);

<BookingFeed
  groups={groups}
  dogs={dogs}
  resolve={resolve}
  paymentOf={paymentOf}
  priceOf={(booking) => paymentOf(booking).subtotal}
  onOpenDog={onOpenDog}
  onOpenHuman={onOpenHuman}
  onOpenBooking={onOpenBooking}
  onOpenInvoice={onOpenInvoice}
  onMessageOwner={onMessageOwner}
  onJourneyAction={onJourneyAction}
/>

{invoiceBooking && (
  <MiniInvoiceModal
    booking={invoiceBooking}
    dog={getDogByIdOrName(dogs, invoiceBooking._dogId || invoiceBooking.dogName)}
    configPricing={configPricing}
    onSave={(invoicePatch) => onSaveInvoice(invoiceBooking, invoicePatch)}
    onClose={() => setInvoiceBooking(null)}
  />
)}
```

- [ ] **Step 6: Remove duplicate mutations from the Now strip**

Keep the current/next identity and live context, but make the identity click scroll to and focus `#today-card-<id>`. Remove `NowAction`, quick payment and collection buttons so the booking row is the single source of operational actions.

```jsx
<TodayNowStrip selection={nowNext} now={now} resolve={resolve} onJumpTo={onJumpTo} />
```

`onJumpTo` should focus the row's time button after scrolling; it must no longer expand a deleted disclosure region.

- [ ] **Step 7: Run focused component, logic and type tests**

Run: `npm run test:logic -- src/engine/dailyBrief.test.ts && npm run test:component -- src/components/views/today/today.component.test.jsx src/components/views/today/MiniInvoiceModal.component.test.jsx && npm run typecheck`

Expected: PASS.

- [ ] **Step 8: Commit the integrated Daily Brief**

```bash
git add src/App.jsx src/components/views/TodayView.jsx src/components/views/today/TodayNowStrip.jsx src/components/views/today/today.component.test.jsx
git commit -m "feat: integrate Daily Brief operations"
```

---

### Task 7: Add responsive browser acceptance coverage

**Files:**
- Create: `e2e/daily-brief.spec.ts`

**Interfaces:**
- Consumes: the completed `/today?date=YYYY-MM-DD` UI and the deterministic `VITE_FORCE_OFFLINE=1` preview dataset.
- Produces: automated desktop, tablet and mobile coverage through the existing Playwright projects.

- [ ] **Step 1: Write the Daily Brief browser test**

```ts
import { expect, test } from "@playwright/test";

test("Daily Brief keeps its core journey usable at every supported width", async ({ page }) => {
  await page.goto("/today?date=2026-07-14");
  await expect(page.getByRole("heading", { name: "Daily Brief" })).toBeVisible();
  await expect(page).toHaveURL(/\/today\?date=2026-07-14/);

  const firstRow = page.getByRole("article").first();
  await expect(firstRow.getByRole("button", { name: /Open .* dog file/ })).toBeVisible();
  await expect(firstRow.getByRole("button", { name: "Check-in" })).toBeVisible();
  await firstRow.getByRole("button", { name: /Open £.* invoice/ }).click();
  await expect(page.getByRole("heading", { name: /Invoice/ })).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();

  await page.getByRole("button", { name: /Choose date/ }).click();
  await page.getByRole("button", { name: /Wednesday 15 July 2026/ }).click();
  await expect(page).toHaveURL(/date=2026-07-15/);
  await expect(page.getByText("No bookings on this date")).toBeVisible();
});
```

- [ ] **Step 2: Run the new spec in all configured projects**

Run: `npm run e2e -- e2e/daily-brief.spec.ts`

Expected: 3 passed — desktop, tablet and mobile.

- [ ] **Step 3: Run keyboard-specific assertions**

Add a second test that tabs from the date button through the first row, asserts the label pill becomes visible on focus, opens the mini invoice with Enter, closes with Escape and checks focus returns to the invoking price button.

```ts
test("journey and invoice work by keyboard", async ({ page }) => {
  await page.goto("/today?date=2026-07-14");
  const price = page.getByRole("button", { name: /Open £.* invoice/ }).first();
  await price.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: /Invoice/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(price).toBeFocused();
  const checkIn = page.getByRole("button", { name: "Check-in" }).first();
  await checkIn.focus();
  await expect(page.getByText("Check-in").last()).toBeVisible();
});
```

- [ ] **Step 4: Re-run the browser spec**

Run: `npm run e2e -- e2e/daily-brief.spec.ts`

Expected: 6 passed — two tests in each of desktop, tablet and mobile.

- [ ] **Step 5: Commit browser coverage**

```bash
git add e2e/daily-brief.spec.ts
git commit -m "test: cover Daily Brief responsive journey"
```

---

### Task 8: Complete regression and visual verification

**Files:**
- Modify only files required to fix regressions introduced by Tasks 1–7.

**Interfaces:**
- Consumes: the complete Daily Brief implementation.
- Produces: a clean build plus evidence for desktop, tablet and mobile behaviour.

- [ ] **Step 1: Run static checks and the full Vitest suite**

Run:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

Expected: all commands exit 0.

- [ ] **Step 2: Run the full browser suite**

Run: `npm run e2e`

Expected: the Daily Brief tests pass in all three projects. Compare any other failures with the branch baseline; do not attribute the known human-profile and mobile-settings failures to this feature unless their traces point to a changed file.

- [ ] **Step 3: Inspect the running interface in the user's chosen Browser**

Start the app with `npm run dev`, open `/today?date=2026-07-14`, and inspect these exact states at desktop, tablet and mobile widths:

- the split header with `No online slots available` and with a next slot;
- an eight-centre booked/check-in row and a seven-centre waiting row;
- hover and keyboard-focus pills without clipping;
- a wrapped mobile appointment sentence without horizontal scrolling;
- dog, booking, human, invoice and Inbox destinations;
- successful ready-without-message and successful message-then-ready paths;
- Cash, Card and Bank transfer paid icons;
- loading skeleton, `No bookings on this date`, save error and WhatsApp error states;
- mini-invoice focus trap, Escape, dirty-close confirmation and focus restoration.

Use the user's selected in-app Browser for this manual pass. If it is unavailable, stop before substituting direct Playwright-driven visual inspection and ask for approval.

- [ ] **Step 4: Correct visible layout defects and repeat the affected checks**

For each defect, add or tighten a component/E2E assertion first, run it to see the failure, make the smallest CSS/React change, then rerun the focused test. Do not alter the approved interaction model during polish.

- [ ] **Step 5: Run the final clean verification**

Run:

```bash
git diff --check
npm run typecheck
npm run lint
npm run test
npm run build
npm run e2e -- e2e/daily-brief.spec.ts
git status --short
```

Expected: no whitespace errors; static checks, Vitest, build and six Daily Brief browser tests pass; `git status --short` shows only intentional final fixes if they have not yet been committed.

- [ ] **Step 6: Commit final verified polish if required**

```bash
git add src e2e package.json package-lock.json
git commit -m "fix: polish Daily Brief responsive states"
```

Skip this commit when Step 5 shows no uncommitted changes.

# Appointment Card Journey Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the appointment modal so grooming progress, collection logistics and payment remain clear and easy to update from Booked through Completed.

**Architecture:** Keep `BookingDetailModal` as the data orchestrator and preserve the existing pricing and persistence paths. Move collection-person rendering into a focused field component used by `AppointmentDetailsCard`, replace the two finance-related panels with a composed `ServicesPaymentCard`, and keep grooming status, payment and messaging as independent state machines.

**Tech Stack:** React 19, JavaScript/JSX, Tailwind CSS, Vitest 4, Testing Library, Vite 7.

## Global Constraints

- Always use UK English in visible copy.
- Keep grooming status independent from payment status.
- Keep the card order stable at every grooming stage.
- Show the appointment total once in the body; never render payment as a negative service line or show “Paid £0”.
- Preserve `computeBookingPricing` as the only pricing calculation source.
- Preserve existing booking fields, update callbacks and persistence behaviour.
- Preserve the status radiogroup, roving tab index and screen-reader announcements.
- Keep primary touch targets at least 44px high with visible keyboard focus.
- Do not add dependencies.

---

## File structure

- Create `src/components/modals/booking-detail/PickupPersonField.jsx`: derives allowed collection people and renders the view/edit row.
- Create `src/components/modals/booking-detail/PickupPersonField.component.test.jsx`: protects current-person fallback and trusted-contact selection.
- Create `src/components/modals/booking-detail/PaymentStateSection.jsx`: owns edit controls, one-tap settlement and due/deposit/paid presentation.
- Create `src/components/modals/booking-detail/PaymentStateSection.component.test.jsx`: tests payment arithmetic, actions, loading and failure.
- Modify `src/components/modals/booking-detail/ServicesAddonsCard.jsx`: adds an embedded body mode and removes payment arithmetic from the service breakdown.
- Modify `src/components/modals/booking-detail/ServicesAddonsCard.component.test.jsx`: preserves price-edit coverage and tests embedded mode.
- Create `src/components/modals/booking-detail/ServicesPaymentCard.jsx`: owns the single panel shell, service/add-on body, total and payment-section composition.
- Create `src/components/modals/booking-detail/ServicesPaymentCard.component.test.jsx`: protects single-total rendering.
- Modify `src/components/modals/booking-detail/AppointmentDetailsCard.jsx`: inserts the collection person in the stable logistics order.
- Modify `src/components/modals/BookingDetailModal.jsx`: wires the new components and removes the two old card calls.
- Modify `src/components/modals/booking-detail/BookingHeader.jsx`: retains appointment value but removes duplicate payment-state copy.
- Modify `src/components/modals/booking-detail/BookingStatusBar.jsx`: adds pending-state protection and a subtle next-step affordance.
- Modify `src/components/modals/booking-detail/BookingStatusBar.component.test.jsx`: tests pending and next-step behaviour.
- Modify `src/components/modals/booking-detail/ReminderCard.jsx`: gives the pick-up message priority only at Ready.
- Modify `src/components/modals/booking-detail/ReminderCard.component.test.jsx`: tests stage-sensitive collection messaging.
- Modify `src/components/modals/BookingDetailModal.characterisation.component.test.jsx`: verifies the integrated read-mode hierarchy.
- Delete `src/components/modals/booking-detail/PaymentsPickupCard.jsx` and its test after payment and collection behaviour is ported.

---

### Task 1: Move collection logistics into Appointment details

**Files:**
- Create: `src/components/modals/booking-detail/PickupPersonField.jsx`
- Create: `src/components/modals/booking-detail/PickupPersonField.component.test.jsx`
- Modify: `src/components/modals/booking-detail/AppointmentDetailsCard.jsx`

**Interfaces:**
- Consumes: `booking`, `editData`, `setEditData`, `humans`, `primaryHuman`, `isEditing`.
- Produces: `PickupPersonField({ booking, editData, setEditData, humans, primaryHuman, isEditing })`.

- [ ] **Step 1: Write failing view and edit tests**

Create `PickupPersonField.component.test.jsx` with explicit coverage for the saved collection person and trusted contacts:

```jsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PickupPersonField } from "./PickupPersonField.jsx";

const humans = {
  owner: { id: "owner", fullName: "Tom Clark", trustedIds: ["friend"] },
  friend: { id: "friend", fullName: "Sam Jones" },
};

it("shows the saved pick-up person in view mode", () => {
  render(<PickupPersonField booking={{ owner: "Tom Clark", pickupBy: "Sam Jones" }} editData={{ pickupBy: "friend" }} humans={humans} primaryHuman={humans.owner} isEditing={false} setEditData={vi.fn()} />);
  expect(screen.getByText("Pick-up person")).toBeInTheDocument();
  expect(screen.getByText("Sam Jones")).toBeInTheDocument();
});

it("offers the owner, trusted contacts and the current saved person in edit mode", async () => {
  let editData = { pickupBy: "friend" };
  const setEditData = vi.fn((update) => { editData = update(editData); });
  render(<PickupPersonField booking={{ owner: "Tom Clark", pickupBy: "Sam Jones" }} editData={editData} humans={humans} primaryHuman={humans.owner} isEditing setEditData={setEditData} />);
  await userEvent.selectOptions(screen.getByRole("combobox", { name: "Pick-up person" }), "owner");
  expect(editData.pickupBy).toBe("owner");
});
```

- [ ] **Step 2: Run the new test and confirm the missing module failure**

Run:

```bash
npx vitest run --project=component src/components/modals/booking-detail/PickupPersonField.component.test.jsx
```

Expected: FAIL because `PickupPersonField.jsx` does not exist.

- [ ] **Step 3: Implement the focused collection-person field**

Move the trusted-human, current-value fallback and label-resolution logic out of `PaymentsPickupCard.jsx`. Render `Row` in view mode and `DetailRow` with an accessible select in edit mode:

```jsx
function buildPickupOptions({ booking, editData, humans, primaryHuman }) {
  const ownerId = primaryHuman?.id || booking._ownerId || booking.owner;
  const values = [ownerId, ...(primaryHuman?.trustedIds || [])].filter(Boolean);
  const currentValue = editData.pickupBy || booking.pickupBy || booking.owner;
  if (currentValue && !values.includes(currentValue)) values.unshift(currentValue);

  return [...new Set(values)].map((value) => {
    const human = getHumanByIdOrName(humans, value);
    return {
      value: human?.id || value,
      label: titleCase(human?.fullName || `${human?.name || ""} ${human?.surname || ""}`.trim() || value),
    };
  });
}

export function PickupPersonField({ booking, editData, setEditData, humans, primaryHuman, isEditing }) {
  const options = buildPickupOptions({ booking, editData, humans, primaryHuman });
  const selected = titleCase(
    getHumanByIdOrName(humans, editData.pickupBy)?.fullName ||
    editData.pickupBy || booking.pickupBy || booking.owner,
  );

  if (!isEditing) return <Row label="Pick-up person" value={selected} />;

  return (
    <DetailRow
      label={<LogisticsLabel text="Pick-up person" />}
      value={selected}
      editNode={
        <select
          aria-label="Pick-up person"
          value={editData.pickupBy}
          onChange={(event) => setEditData((previous) => ({ ...previous, pickupBy: event.target.value }))}
          className={MODAL_INPUT_CLS}
        >
          {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      }
      isEditing
    />
  );
}
```

This preserves the current selection even if that person is no longer trusted, matching the existing fallback behaviour.

- [ ] **Step 4: Put the field after Owner in both Appointment details modes**

Add the field directly after the Owner row in `AppointmentDetailsCard.jsx`:

```jsx
<PickupPersonField
  booking={booking}
  editData={editData}
  setEditData={setEditData}
  humans={humans}
  primaryHuman={primaryHuman}
  isEditing={isEditing}
/>
```

Extend the component signature with `humans`. Do not remove the old payment-card pickup row until Task 3 wires the replacement, keeping this task independently testable.

- [ ] **Step 5: Run focused tests**

Run:

```bash
npx vitest run --project=component src/components/modals/booking-detail/PickupPersonField.component.test.jsx src/components/modals/BookingDetailModal.component.test.jsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/modals/booking-detail/PickupPersonField.jsx src/components/modals/booking-detail/PickupPersonField.component.test.jsx src/components/modals/booking-detail/AppointmentDetailsCard.jsx
git commit -m "feat: move pickup person into appointment details"
```

---

### Task 2: Build the combined Services & payment card

**Files:**
- Create: `src/components/modals/booking-detail/PaymentStateSection.jsx`
- Create: `src/components/modals/booking-detail/PaymentStateSection.component.test.jsx`
- Modify: `src/components/modals/booking-detail/ServicesAddonsCard.jsx`
- Modify: `src/components/modals/booking-detail/ServicesAddonsCard.component.test.jsx`
- Create: `src/components/modals/booking-detail/ServicesPaymentCard.jsx`
- Create: `src/components/modals/booking-detail/ServicesPaymentCard.component.test.jsx`

**Interfaces:**
- Consumes: the existing `ServicesAddonsCard` props plus `humans`-free payment props `onUpdate` and `currentDateStr`.
- Produces: `PaymentStateSection({ booking, isEditing, editData, setEditData, pricing, onUpdate, currentDateStr })` and `ServicesPaymentCard(props)`.

- [ ] **Step 1: Write failing payment-state tests**

Create tests for due, deposit, paid, Ready priority and failure. Use this core shape:

```jsx
const baseBooking = {
  id: "b1",
  service: "full-groom",
  size: "medium",
  addons: [],
  owner: "Tom Clark",
};

function renderSection({ booking, pricing, onUpdate = vi.fn() }) {
  return render(
    <PaymentStateSection
      booking={booking}
      pricing={pricing}
      isEditing={false}
      editData={{ payment: booking.payment, paymentMethod: "card", paidAmount: null, depositAmount: booking.depositAmount ?? 0 }}
      setEditData={vi.fn()}
      onUpdate={onUpdate}
      currentDateStr="2026-07-13"
    />,
  );
}

it("shows a single due summary with accessible one-tap methods", () => {
  renderSection({ booking: { ...baseBooking, status: "Ready for pick-up", payment: "Due at Pick-up" }, pricing: { subtotal: 46, amountDue: 46 } });
  expect(screen.getByText("£46 to pay")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Record £46 cash payment" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Record £46 card payment" })).toBeInTheDocument();
  expect(screen.getByTestId("payment-state")).toHaveAttribute("data-priority", "high");
});

it("shows deposit arithmetic without a negative line", () => {
  renderSection({ booking: { ...baseBooking, payment: "Deposit Paid", depositAmount: 10 }, pricing: { subtotal: 46, depositPaid: 10, amountDue: 36, isDepositPaid: true } });
  expect(screen.getByText("£10 paid · £36 to pay")).toBeInTheDocument();
  expect(screen.queryByText(/−£/)).not.toBeInTheDocument();
});

it("shows a compact paid confirmation without payment buttons", () => {
  renderSection({ booking: { ...baseBooking, payment: "Paid in Full", paymentMethod: "card", paidAmount: 46 }, pricing: { subtotal: 46, amountDue: 0, isPaidInFull: true } });
  expect(screen.getByText("Paid £46 · Card")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /record £/i })).not.toBeInTheDocument();
  expect(screen.queryByText("Paid £0")).not.toBeInTheDocument();
});
```

For failure, make `onUpdate` resolve `null`, click Card, and assert “£46 to pay” and every method remain visible and enabled afterwards.

- [ ] **Step 2: Run payment tests and confirm failure**

Run:

```bash
npx vitest run --project=component src/components/modals/booking-detail/PaymentStateSection.component.test.jsx
```

Expected: FAIL because the new component does not exist.

- [ ] **Step 3: Implement `PaymentStateSection`**

Move payment-only logic from `PaymentsPickupCard.jsx`. Use `pricing.amountDue` for the action label because that is what staff collect now. Continue writing `pricing.subtotal` to `paidAmount` so the settled booking retains its full value for revenue reporting after a deposit:

```jsx
const isPaid = (booking.payment || "Due at Pick-up") === "Paid in Full";
const isReady = booking.status === BOOKING_STATUS.READY_FOR_PICKUP;
const amountToCollect = pricing.amountDue;
const settledTotal = pricing.subtotal;

const markPaid = async (methodId) => {
  if (!onUpdate || savingPayment) return;
  setSavingPayment(true);
  try {
    const result = await onUpdate(
      { ...booking, ...buildMarkPaidPatch({ service: booking.service, size: booking.size, addons: booking.addons }, methodId, settledTotal) },
      currentDateStr,
      currentDateStr,
    );
    if (result !== null) toast.show("Payment recorded", "success");
  } finally {
    setSavingPayment(false);
  }
};
```

Use `amountToCollect` in each accessible button name, for example `aria-label={`Record £${amountToCollect} card payment`}`. Render `data-testid="payment-state"`, `data-priority={isReady && !isPaid ? "high" : "normal"}`, a warm due/deposit background, a green paid background and method buttons with 44px minimum height. While saving, set `aria-busy="true"`, disable all method buttons and change the clicked method’s label to “Recording…”.

Port edit-mode status, method, paid amount and deposit controls without changing their field values or update semantics.

- [ ] **Step 4: Write failing combined-card tests**

Keep the existing usual-price tests in `ServicesAddonsCard.component.test.jsx`. Add an embedded-mode test there, then create the combined-card test:

```jsx
const serviceProps = {
  booking: { size: "medium", service: "full-groom", dogName: "Freddie" },
  isEditing: false,
  editData: { service: "full-groom", price: 46, saveAsUsual: false, addons: [] },
  setEditData: vi.fn(),
  setSaveError: vi.fn(),
  dogData: {},
  allowedServices: [{ id: "full-groom", name: "Full Groom" }],
  sizeTheme: { primary: "#006B5E" },
  pricing: { basePrice: 46, subtotal: 46, amountDue: 46 },
  activeAddons: [],
};

function renderCard({ booking, pricing }) {
  return render(
    <ServicesPaymentCard
      {...serviceProps}
      booking={booking}
      pricing={pricing}
      activeAddons={booking.addons}
      onUpdate={vi.fn()}
      currentDateStr="2026-07-13"
    />,
  );
}

it("returns service fields without a nested region in embedded mode", () => {
  render(<ServicesAddonsCard {...serviceProps} embedded />);
  expect(screen.queryByRole("region", { name: "Services & add-ons" })).not.toBeInTheDocument();
  expect(screen.getByText("Full Groom")).toBeInTheDocument();
});

it("renders service, add-ons and the total once before payment", () => {
  renderCard({ booking: { service: "full-groom", size: "medium", addons: ["Flea Bath"], payment: "Due at Pick-up" }, pricing: { basePrice: 40, subtotal: 50, amountDue: 50 } });
  expect(screen.getByText("Full Groom")).toBeInTheDocument();
  expect(screen.getByText(/Flea Bath/)).toBeInTheDocument();
  expect(screen.getByText("Total")).toBeInTheDocument();
  expect(screen.getAllByText("£50")).toHaveLength(1);
  expect(screen.getByText("£50 to pay")).toBeInTheDocument();
});
```

Use distinct queries for the total and due summary if Testing Library normalises nested text; the requirement is one service total row and no subtraction row.

- [ ] **Step 5: Implement `ServicesPaymentCard`**

Refactor `ServicesAddonsCard` so its edit or view body is assigned to `content`. When `embedded` is true, return `content`; otherwise preserve the current panel wrapper for compatibility. In read mode, `content` contains only the service and add-on rows—remove deposit, paid and final amount-due rows.

Compose that embedded body under one panel:

```jsx
<PanelShell eyebrow="Services & payment" icon={Scissors} accent={pricing.isPaidInFull ? "emerald" : "teal"} className="mb-3">
  <ServicesAddonsCard
    booking={booking}
    isEditing={isEditing}
    editData={editData}
    setEditData={setEditData}
    setSaveError={setSaveError}
    dogData={dogData}
    allowedServices={allowedServices}
    sizeTheme={sizeTheme}
    pricing={pricing}
    activeAddons={activeAddons}
    embedded
  />
  {!isEditing && (
    <div className="flex items-center justify-between py-3 border-t border-slate-200">
      <span className="text-[12px] font-bold uppercase tracking-[0.08em] text-slate-500">Total</span>
      <span className="text-[20px] font-extrabold text-brand-purple tabular-nums">£{pricing.subtotal}</span>
    </div>
  )}
  <PaymentStateSection booking={booking} isEditing={isEditing} editData={editData} setEditData={setEditData} pricing={pricing} onUpdate={onUpdate} currentDateStr={currentDateStr} />
</PanelShell>
```

Do not render deposit or full payment as service-breakdown rows. Do not create a second `PanelShell` inside this card.

- [ ] **Step 6: Run the new component suites**

Run:

```bash
npx vitest run --project=component src/components/modals/booking-detail/PaymentStateSection.component.test.jsx src/components/modals/booking-detail/ServicesPaymentCard.component.test.jsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/modals/booking-detail/PaymentStateSection.jsx src/components/modals/booking-detail/PaymentStateSection.component.test.jsx src/components/modals/booking-detail/ServicesAddonsCard.jsx src/components/modals/booking-detail/ServicesAddonsCard.component.test.jsx src/components/modals/booking-detail/ServicesPaymentCard.jsx src/components/modals/booking-detail/ServicesPaymentCard.component.test.jsx
git commit -m "feat: combine appointment services and payment"
```

---

### Task 3: Wire the stable modal hierarchy and remove duplicate cards

**Files:**
- Modify: `src/components/modals/BookingDetailModal.jsx`
- Modify: `src/components/modals/booking-detail/BookingHeader.jsx`
- Modify: `src/components/modals/BookingDetailModal.characterisation.component.test.jsx`
- Delete: `src/components/modals/booking-detail/PaymentsPickupCard.jsx`
- Delete: `src/components/modals/booking-detail/PaymentsPickupCard.component.test.jsx`

**Interfaces:**
- Consumes: `PickupPersonField`, `ServicesPaymentCard` and the existing modal state.
- Produces: one integrated modal hierarchy with no duplicate payment or collection sections.

- [ ] **Step 1: Add a failing modal characterisation test**

Open a Ready, unpaid booking and assert the integrated landmarks and their order:

```jsx
expect(screen.getByRole("region", { name: "Appointment details" })).toHaveTextContent("Pick-up person");
expect(screen.getByRole("region", { name: "Services & payment" })).toHaveTextContent("£46 to pay");
expect(screen.queryByRole("region", { name: "Payment & pickup" })).not.toBeInTheDocument();
expect(screen.queryByRole("region", { name: "Services & add-ons" })).not.toBeInTheDocument();
```

Add a Completed-but-unpaid case and assert that `£46 to pay` and the payment method buttons remain present.

Add a paid case and scope the header assertion with `within(screen.getByRole("banner"))`: it should show `£46` but no “Paid” or “due” payment-state copy. The Services & payment region remains the authoritative payment state.

- [ ] **Step 2: Run the characterisation test and confirm failure**

Run:

```bash
npx vitest run --project=component src/components/modals/BookingDetailModal.characterisation.component.test.jsx
```

Expected: FAIL because the old regions still render.

- [ ] **Step 3: Replace both old card calls**

Update imports and JSX in `BookingDetailModal.jsx`:

```jsx
<AppointmentDetailsCard
  booking={booking}
  isEditing={isEditing}
  editData={editData}
  setEditData={setEditData}
  setSaveError={setSaveError}
  currentDateObj={currentDateObj}
  primaryHuman={primaryHuman}
  humans={humans}
  onOpenHuman={onOpenHuman}
  onOpenDatePicker={() => setShowDatePicker(true)}
  editActiveSlots={editActiveSlots}
  otherBookings={otherBookings}
  editSettings={editSettings}
  sizeTheme={sizeTheme}
/>

<ServicesPaymentCard
  booking={booking}
  isEditing={isEditing}
  editData={editData}
  setEditData={setEditData}
  setSaveError={setSaveError}
  dogData={dogData}
  allowedServices={allowedServices}
  sizeTheme={sizeTheme}
  pricing={pricing}
  activeAddons={activeAddons}
  onUpdate={onUpdate}
  currentDateStr={currentDateStr}
/>
```

Remove `activePayment` and `activeDepositAmount` props from card calls once they are no longer consumed outside pricing.

Simplify `BookingHeader.renderPrice` to render only `pricing.subtotal`:

```jsx
const renderPrice = () => {
  if (!pricing || pricing.subtotal <= 0) return null;
  return (
    <span className="text-[15px] font-bold text-slate-800 whitespace-nowrap tabular-nums">
      £{pricing.subtotal}
    </span>
  );
};
```

- [ ] **Step 4: Remove superseded files and confirm there are no imports**

Delete `PaymentsPickupCard.jsx` and its test, then run:

```bash
rg -n "PaymentsPickupCard" src
```

Expected: no matches.

- [ ] **Step 5: Run modal and booking-detail component tests**

Run:

```bash
npx vitest run --project=component src/components/modals/BookingDetailModal.characterisation.component.test.jsx src/components/modals/BookingDetailModal.component.test.jsx src/components/modals/booking-detail
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A src/components/modals
git commit -m "refactor: simplify appointment detail hierarchy"
```

---

### Task 4: Make grooming-status updates safe and legible

**Files:**
- Modify: `src/components/modals/booking-detail/BookingStatusBar.jsx`
- Modify: `src/components/modals/booking-detail/BookingStatusBar.component.test.jsx`

**Interfaces:**
- Consumes: existing `booking`, `currentDateStr`, `onUpdate` props.
- Produces: the same `BookingStatusBar` API with pending protection and `data-next` styling metadata.

- [ ] **Step 1: Write failing pending and next-step tests**

```jsx
it("marks Checked in as the next step when Booked", () => {
  render(<BookingStatusBar booking={{ id: "b1", status: BOOKING_STATUS.BOOKED }} currentDateStr="2026-07-13" onUpdate={vi.fn()} />);
  expect(screen.getByRole("radio", { name: /checked in/i })).toHaveAttribute("data-next", "true");
});

it("disables every status while an update is pending", async () => {
  let resolveUpdate;
  const onUpdate = vi.fn(() => new Promise((resolve) => { resolveUpdate = resolve; }));
  render(<BookingStatusBar booking={{ id: "b1", status: BOOKING_STATUS.BOOKED }} currentDateStr="2026-07-13" onUpdate={onUpdate} />);
  await userEvent.click(screen.getByRole("radio", { name: /checked in/i }));
  screen.getAllByRole("radio").forEach((control) => expect(control).toBeDisabled());
  resolveUpdate({ id: "b1", status: BOOKING_STATUS.CHECKED_IN });
});
```

Add a failure test that resolves `null` and confirms Booked remains checked and the controls re-enable.

- [ ] **Step 2: Run the status suite and confirm failure**

Run:

```bash
npx vitest run --project=component src/components/modals/booking-detail/BookingStatusBar.component.test.jsx
```

Expected: FAIL because controls are not disabled and `data-next` is absent.

- [ ] **Step 3: Implement pending and next-step presentation**

Add `savingStatus` and derive the next sequential ID:

```jsx
const [savingStatus, setSavingStatus] = useState(null);
const currentIndex = BOOKING_STATUSES.findIndex((status) => status.id === currentStatus);
const nextStatusId = currentIndex >= 0 && currentIndex < BOOKING_STATUSES.length - 1
  ? BOOKING_STATUSES[currentIndex + 1].id
  : null;
```

Set `disabled={savingStatus !== null}`, `aria-busy={savingStatus === status.id}` and `data-next={status.id === nextStatusId ? "true" : undefined}`. Use a subtle ring on the next control without competing with the filled active state. Wrap the existing `onUpdate` call in `try/finally` so controls always re-enable; retain the live-region and undo behaviour.

- [ ] **Step 4: Run the status suite**

Run:

```bash
npx vitest run --project=component src/components/modals/booking-detail/BookingStatusBar.component.test.jsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/modals/booking-detail/BookingStatusBar.jsx src/components/modals/booking-detail/BookingStatusBar.component.test.jsx
git commit -m "feat: clarify appointment status updates"
```

---

### Task 5: Prioritise collection communication at Ready and verify the journey

**Files:**
- Modify: `src/components/modals/booking-detail/ReminderCard.jsx`
- Modify: `src/components/modals/booking-detail/ReminderCard.component.test.jsx`

**Interfaces:**
- Consumes: existing ReminderCard props and `booking.status`.
- Produces: unchanged ReminderCard API with stage-sensitive visual priority.

- [ ] **Step 1: Write failing Ready-message tests**

```jsx
it("makes the collection message primary when the groom is Ready", () => {
  render(<ReminderCard booking={{ id: "b1", dogName: "Freddie", owner: "Tom Clark", status: "Ready for pick-up", reminderState: "none" }} pickupHuman={{ fullName: "Tom Clark", phone: "+447700900000" }} isEditing={false} onSendReminder={vi.fn()} />);
  expect(screen.getByRole("link", { name: /send pickup-ready sms/i })).toHaveAttribute("data-priority", "primary");
});

it("keeps the collection message secondary before Ready", () => {
  render(<ReminderCard booking={{ id: "b1", dogName: "Freddie", owner: "Tom Clark", status: "In bath", reminderState: "none" }} pickupHuman={{ fullName: "Tom Clark", phone: "+447700900000" }} isEditing={false} onSendReminder={vi.fn()} />);
  expect(screen.getByRole("link", { name: /send pickup-ready sms/i })).toHaveAttribute("data-priority", "secondary");
});
```

- [ ] **Step 2: Run the reminder suite and confirm failure**

Run:

```bash
npx vitest run --project=component src/components/modals/booking-detail/ReminderCard.component.test.jsx
```

Expected: FAIL because `data-priority` is absent.

- [ ] **Step 3: Implement stage-sensitive communication styling**

Derive `isReady` from `BOOKING_STATUS.READY_FOR_PICKUP`. At Ready, render the collection link before the reminder action, give it the filled primary style and set `data-priority="primary"`. At every other stage, retain the current outlined style and set `data-priority="secondary"`. Do not change reminder state, payment state or grooming status when the SMS link opens.

- [ ] **Step 4: Run focused and full verification**

Run:

```bash
npx vitest run --project=component src/components/modals/booking-detail src/components/modals/BookingDetailModal.characterisation.component.test.jsx src/components/modals/BookingDetailModal.component.test.jsx
npm run typecheck
npm run lint
npm run build
```

Expected: all tests pass; typecheck, lint and production build exit 0.

- [ ] **Step 5: Verify the seven state combinations in the browser**

Run `npm run dev`, open the Bookings route and inspect at both the normal 480px modal width and a narrow mobile viewport:

1. Booked + due at pick-up
2. Checked in + deposit paid
3. In bath + paid in full
4. Ready + due at pick-up
5. Ready + paid in full
6. Completed + paid in full
7. Completed + due at pick-up

For every combination confirm the same card order, readable wrapping, no repeated total, collection person beside Owner, and payment controls only when money is due. Confirm status, payment and collection-message updates do not mutate either of the other two states.

- [ ] **Step 6: Commit**

```bash
git add src/components/modals/booking-detail/ReminderCard.jsx src/components/modals/booking-detail/ReminderCard.component.test.jsx
git commit -m "feat: prioritise ready-stage collection actions"
```

- [ ] **Step 7: Record final evidence**

```bash
git status --short
git log --oneline -6
```

Expected: clean worktree and five implementation commits after the design and plan commits.

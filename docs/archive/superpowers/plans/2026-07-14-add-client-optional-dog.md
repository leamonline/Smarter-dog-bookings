# Optional-Dog Add Client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the competing Humans creation actions with one Add client flow that can save a person with no dog, save a person and dogs without a booking, or complete the existing first-booking path.

**Architecture:** Keep the existing write-at-end wizard and idempotent commit helper. Make the dogs and first-booking stages optional through explicit save actions, then remove the separate Add Human entry point from the Humans page; no database or mutation-hook change is required because `commitNewClient` already handles empty dog and booking collections.

**Tech Stack:** React, existing modal shell, Vitest, Testing Library.

## Global Constraints

- Use one visible label everywhere: `Add client`.
- Client details remain required before saving.
- The dog step title is `Their dogs (optional)`.
- With no dogs, the primary action on step 2 is `Save client`.
- With dogs, staff may choose `Save & book later` or `Continue to booking`.
- On the booking step, staff may choose `Save & book later` or `Confirm booking`.
- Preserve duplicate detection, phone validation, idempotent retry, and partial-failure recovery.
- Do not remove `AddHumanModal`; it is still used from dog/profile flows outside the Humans page.

---

### Task 1: Prove the commit helper supports client-only and dogs-only saves

**Files:**
- Test: `src/components/modals/new-client/commitNewClient.test.js`
- Modify only if a failing test exposes a real guard need: `src/components/modals/new-client/commitNewClient.js`

**Interfaces:**
- Consumes: `commitNewClient({ dogs: [], selections: {}, ... })`
- Produces: `{ ok: true, humanId }` without calling `addDog` or `onAddBookings`.

- [ ] **Step 1: Add focused tests**

```js
it("saves a client without dogs or a booking", async () => {
  const addHuman = vi.fn(async () => ({ id: "h1" }));
  const addDog = realisticAddDog();
  const onAddBookings = vi.fn(async () => ({ ok: true }));

  const out = await commitNewClient({
    addHuman,
    addDog,
    onAddBookings,
    human,
    phone: "+447700900123",
    dogs: [],
    selections: {},
    dateStr: "",
    slot: "",
    committed: makeCommitted(),
  });

  expect(out).toEqual({ ok: true, humanId: "h1" });
  expect(addDog).not.toHaveBeenCalled();
  expect(onAddBookings).not.toHaveBeenCalled();
});

it("saves a client and dogs without making a booking", async () => {
  const addHuman = vi.fn(async () => ({ id: "h1" }));
  const addDog = realisticAddDog();
  const onAddBookings = vi.fn(async () => ({ ok: true }));

  await commitNewClient({
    addHuman,
    addDog,
    onAddBookings,
    human,
    phone: "+447700900123",
    dogs: [dog("a", "Alfie")],
    selections: { a: { booked: false, service: "full-groom", addons: [] } },
    dateStr: "",
    slot: "",
    committed: makeCommitted(),
  });

  expect(addDog).toHaveBeenCalledTimes(1);
  expect(onAddBookings).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the helper tests**

Run: `npm test -- src/components/modals/new-client/commitNewClient.test.js`

Expected: PASS with the current loop-based implementation. If either test fails, add only the null-safe forms already used elsewhere: iterate over `dogs ?? []` and read `selections?.[dog.clientKey]?.booked`.

- [ ] **Step 3: Commit the regression coverage**

```bash
git add src/components/modals/new-client/commitNewClient.js src/components/modals/new-client/commitNewClient.test.js
git commit -m "test: cover client saves without bookings"
```

### Task 2: Add optional save paths to the wizard

**Files:**
- Modify: `src/components/modals/new-client/NewClientWizard.jsx`
- Modify: `src/components/modals/new-client/StepDogs.jsx`
- Create: `src/components/modals/new-client/NewClientWizard.component.test.jsx`

**Interfaces:**
- Consumes: unchanged `commitNewClient` interface.
- Produces: `handleCommit({ includeBooking: boolean })` and the three approved terminal paths.

- [ ] **Step 1: Write failing component tests**

Create component coverage with these imports, callback fixture, and interaction helpers:

```jsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../../contexts/ToastContext.jsx", () => ({
  useToast: () => ({ show: vi.fn() }),
}));

import { NewClientWizard } from "./NewClientWizard.jsx";

function renderWizard(overrides = {}) {
  const props = {
    onClose: vi.fn(),
    addHuman: vi.fn().mockResolvedValue({ id: "human-1" }),
    addDog: vi.fn().mockResolvedValue({ id: "dog-1" }),
    onAddBookings: vi.fn().mockResolvedValue({ ok: true }),
    findHumanByFullName: vi.fn().mockResolvedValue(null),
    onBookAnother: vi.fn(),
    bookingsByDate: {},
    dayOpenState: {},
    daySettings: {},
    ...overrides,
  };
  render(<NewClientWizard {...props} />);
  return props;
}

async function enterValidClient(user) {
  await user.type(screen.getByLabelText("First name *"), "Amanda");
  await user.type(screen.getByLabelText("Surname *"), "Booth");
  await user.type(screen.getByLabelText("Phone *"), "07700 900123");
}

async function addValidDog(user, name) {
  await user.type(screen.getByRole("textbox", { name: "Dog name" }), name);
  await user.click(screen.getByRole("button", { name: "Small" }));
  await user.click(screen.getByRole("button", { name: "+ Add this dog" }));
}
```

Then assert all three paths:

```jsx
it("saves a client from the optional dog step without adding a dog", async () => {
  const user = userEvent.setup();
  const props = renderWizard();
  await enterValidClient(user);
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(screen.getByRole("button", { name: "Save client" }));

  await waitFor(() => expect(props.addHuman).toHaveBeenCalledTimes(1));
  expect(props.addDog).not.toHaveBeenCalled();
  expect(props.onAddBookings).not.toHaveBeenCalled();
  expect(props.onClose).toHaveBeenCalledTimes(1);
});

it("saves added dogs without booking them", async () => {
  const user = userEvent.setup();
  const props = renderWizard();
  await enterValidClient(user);
  await user.click(screen.getByRole("button", { name: "Next" }));
  await addValidDog(user, "Alfie");
  await user.click(screen.getByRole("button", { name: "Save & book later" }));

  await waitFor(() => expect(props.addDog).toHaveBeenCalledTimes(1));
  expect(props.onAddBookings).not.toHaveBeenCalled();
});

it("keeps the existing first-booking route", async () => {
  const user = userEvent.setup();
  renderWizard();
  await enterValidClient(user);
  await user.click(screen.getByRole("button", { name: "Next" }));
  await addValidDog(user, "Alfie");
  await user.click(screen.getByRole("button", { name: "Continue to booking" }));
  expect(screen.getByRole("heading", { name: "First booking" })).toBeInTheDocument();
});
```

The test helper must mock only network-facing callbacks; render the real `StepCustomer`, `StepDogs`, and footer so labels and navigation are tested together.

- [ ] **Step 2: Run the component test and verify it fails**

Run: `npm test -- src/components/modals/new-client/NewClientWizard.component.test.jsx`

Expected: FAIL because step 2 currently requires a dog and exposes only `Next`.

- [ ] **Step 3: Make the dog stage visibly optional**

Change the title constant:

```jsx
const STEP_TITLES = ["Customer", "Their dogs (optional)", "First booking"];
```

Add this explanatory sentence near the top of `StepDogs`:

```jsx
<p className="text-xs text-slate-500 m-0">
  Add dog details now, or save the client and come back later.
</p>
```

- [ ] **Step 4: Consolidate terminal writes in the wizard**

Replace the booking-only confirm handler with one shared handler:

```jsx
async function handleCommit({ includeBooking }) {
  if (submitting) return;
  setSubmitting(true);
  setError(null);

  try {
    const commitSelections = includeBooking
      ? selections
      : Object.fromEntries(
          dogs.map((dog) => [
            dog.clientKey,
            { ...selections[dog.clientKey], booked: false },
          ]),
        );
    const { humanId } = await commitNewClient({
      addHuman,
      addDog,
      onAddBookings,
      human,
      phone: normalisedPhoneRef.current || human.phone.trim(),
      dogs,
      selections: commitSelections,
      dateStr: includeBooking ? dateStr : "",
      slot: includeBooking ? slot : "",
      committed: committedRef.current,
      onCustomerCreated: () => setCustomerCreated(true),
    });

    const dogCopy = dogs.length === 0
      ? ""
      : ` with ${dogs.length} dog${dogs.length === 1 ? "" : "s"}`;
    const bookingCopy = includeBooking ? " and a booking" : "";
    const action = includeBooking && onBookAnother && humanId
      ? { label: `Book another for ${human.name}`, onClick: () => onBookAnother(humanId) }
      : undefined;
    toast.show(`${human.name} saved${dogCopy}${bookingCopy}`, "success", action);
    onClose();
  } catch (err) {
    logger.error("NewClientWizard save failed", err);
    setError(err?.message || "That didn't quite work — let's try again.");
  } finally {
    setSubmitting(false);
  }
}
```

Set `confirmReady` to the existing `canConfirm(...) && !submitting` expression.

- [ ] **Step 5: Render explicit step actions**

For step 2, render:

```jsx
<div className="ml-auto flex items-center gap-2">
  {dogs.length > 0 && (
    <button
      type="button"
      onClick={() => handleCommit({ includeBooking: false })}
      disabled={submitting}
      className="px-4 py-2.5 rounded-full border border-slate-200 bg-white text-slate-600 text-[13px] font-bold disabled:opacity-40 disabled:cursor-not-allowed"
    >
      Save &amp; book later
    </button>
  )}
  <button
    type="button"
    onClick={dogs.length === 0
      ? () => handleCommit({ includeBooking: false })
      : () => setStep(3)}
    disabled={submitting}
    className="px-5 py-2.5 rounded-full bg-brand-teal text-white text-[13px] font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
  >
    {submitting ? "Saving…" : dogs.length === 0 ? "Save client" : "Continue to booking"}
  </button>
</div>
```

For step 3, keep `Back` and replace the right-hand action with:

```jsx
<div className="ml-auto flex items-center gap-2">
  <button
    type="button"
    onClick={() => handleCommit({ includeBooking: false })}
    disabled={submitting}
    className="px-4 py-2.5 rounded-full border border-slate-200 bg-white text-slate-600 text-[13px] font-bold disabled:opacity-40 disabled:cursor-not-allowed"
  >
    Save &amp; book later
  </button>
  <button
    type="button"
    onClick={() => handleCommit({ includeBooking: true })}
    disabled={!confirmReady}
    className="px-5 py-2.5 rounded-full bg-brand-green-600 text-white text-[13px] font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-brand-green-700 transition-colors"
  >
    {submitting ? "Saving…" : "Confirm booking"}
  </button>
</div>
```

- [ ] **Step 6: Run wizard and helper tests**

Run: `npm test -- src/components/modals/new-client/NewClientWizard.component.test.jsx src/components/modals/new-client/commitNewClient.test.js src/components/modals/new-client/wizardValidation.test.js`

Expected: PASS.

- [ ] **Step 7: Commit the optional path**

```bash
git add src/components/modals/new-client/NewClientWizard.jsx src/components/modals/new-client/StepDogs.jsx src/components/modals/new-client/NewClientWizard.component.test.jsx
git commit -m "feat: allow clients without dog details"
```

### Task 3: Use one Add client entry point on the Humans page

**Files:**
- Modify: `src/components/views/HumansView.jsx:1-10,300-335,485-505,715-730`
- Modify: `src/App.jsx:920-985`
- Test: `src/components/views/HumansView.component.test.jsx`

**Interfaces:**
- Consumes: existing `onNewClient()` callback.
- Removes from HumansView only: `onAddHuman` prop, `AddHumanModal` import, and `showAddModal` state.

- [ ] **Step 1: Write the failing entry-point test**

Add `onNewClient: vi.fn()` to `renderView` defaults, then add:

```jsx
it("offers one Add client action and opens the guided flow", () => {
  const { onNewClient } = renderView();
  const action = screen.getByRole("button", { name: "Add client" });
  expect(screen.queryByRole("button", { name: /add human/i })).not.toBeInTheDocument();
  fireEvent.click(action);
  expect(onNewClient).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run the Humans test and verify it fails**

Run: `npm test -- src/components/views/HumansView.component.test.jsx`

Expected: FAIL because the page currently renders `New client` and `Add Human`.

- [ ] **Step 3: Simplify HumansView**

Remove `AddHumanModal`, `showAddModal`, the `onAddHuman` prop, and the modal block. Replace both header actions with:

```jsx
{onNewClient && (
  <Button variant="primary" onClick={onNewClient}>
    + Add client
  </Button>
)}
```

Leave the size legend unchanged in this tranche.

- [ ] **Step 4: Remove the obsolete prop from both Humans routes**

In `src/App.jsx`, delete `onAddHuman={addHuman}` only from the `/humans` and `/humans/:id` `HumansView` elements. Do not remove `addHuman` from dog/profile modals.

- [ ] **Step 5: Run the Humans tests**

Run: `npm test -- src/components/views/HumansView.component.test.jsx`

Expected: PASS.

- [ ] **Step 6: Commit the entry-point change**

```bash
git add src/components/views/HumansView.jsx src/components/views/HumansView.component.test.jsx src/App.jsx
git commit -m "feat: unify client creation entry point"
```

### Task 4: Pin the already-approved quiet New Booking search

**Files:**
- Test: `src/components/modals/new-booking/DogSearchSection.component.test.jsx`

**Interfaces:**
- Confirms existing behaviour only; no production interface change.

- [ ] **Step 1: Add an explicit empty-query regression test**

```jsx
it("shows no dog results until staff type", () => {
  renderTypedSearch({ dogQuery: "", isSearchingDogs: false });
  expect(screen.queryByText("Belle")).not.toBeInTheDocument();
  expect(screen.queryByText("Eti")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "New customer" })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the search tests**

Run: `npm test -- src/components/modals/new-booking/DogSearchSection.component.test.jsx`

Expected: PASS without production changes.

- [ ] **Step 3: Commit the regression guard**

```bash
git add src/components/modals/new-booking/DogSearchSection.component.test.jsx
git commit -m "test: keep booking search quiet until typing"
```

### Task 5: Verify the complete creation flow responsively

**Files:**
- No source change expected.

- [ ] **Step 1: Verify client-only flow**

At 1440×900 and 390×844, open Humans → Add client, enter synthetic valid details, reach `Their dogs (optional)`, and confirm `Save client` is visible without entering dog data. Do not submit against production.

- [ ] **Step 2: Verify dogs-only and booking paths**

In offline sample mode, add a synthetic dog and verify both `Save & book later` and `Continue to booking`; proceed to the booking step and verify `Confirm booking` remains disabled until date and slot are chosen.

- [ ] **Step 3: Run related component tests**

Run: `npm test -- src/components/modals/new-client src/components/views/HumansView.component.test.jsx src/components/modals/new-booking/DogSearchSection.component.test.jsx`

Expected: PASS.

# React Aria Modal Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure only the topmost modal is exposed to assistive technology while preserving current Escape handling, focus containment, focus return, scroll locking, drawers, and stacked-dialog behaviour.

**Architecture:** Wrap the application in React Aria’s `OverlayProvider`, render dialogs through `OverlayContainer`, and apply `useModal({ isDisabled: !modal })` to modal dialogs. Keep the project’s existing dialog stack and reference-counted scroll lock because they encode application-specific stacked Escape and drawer behaviour.

**Tech Stack:** React Aria 3.50, React 19, TypeScript, Vitest, Testing Library.

## Global Constraints

- Modal dialogs hide background application content from the accessibility tree.
- Nested/stacked dialogs expose only the topmost dialog.
- `modal={false}` booking drawers remain non-modal: no background hiding, no scroll lock, and no focus containment.
- Escape closes only the topmost mounted dialog.
- Closing restores focus to the original trigger.
- Body scroll remains locked until the last modal closes.
- Do not replace the current visual backdrop or modal sizing system.

---

### Task 1: Add accessibility-tree isolation tests

**Files:**
- Modify: `src/components/shared/AccessibleModal.component.test.tsx`

**Interfaces:**
- Expects root `OverlayProvider` integration and `useModal`/`OverlayContainer` semantics.

- [ ] **Step 1: Write failing background-isolation tests**

Import `OverlayProvider` from `react-aria` and add:

```tsx
it("hides the application from assistive technology while a modal is open", () => {
  const view = render(
    <OverlayProvider>
      <main data-testid="application">Application content</main>
      <AccessibleModal onClose={() => {}} titleId="isolation-title">
        <h2 id="isolation-title">Modal content</h2>
      </AccessibleModal>
    </OverlayProvider>,
  );

  const application = view.getByTestId("application");
  const hiddenAncestor = application.closest('[aria-hidden="true"]');
  expect(hiddenAncestor).not.toBeNull();
  expect(view.getByRole("dialog", { name: "Modal content" })).toBeInTheDocument();
});

it("does not hide the application for a non-modal drawer", () => {
  const view = render(
    <OverlayProvider>
      <main data-testid="application">Application content</main>
      <AccessibleModal modal={false} onClose={() => {}} titleId="drawer-title">
        <h2 id="drawer-title">Drawer content</h2>
      </AccessibleModal>
    </OverlayProvider>,
  );

  expect(view.getByTestId("application").closest('[aria-hidden="true"]')).toBeNull();
});
```

- [ ] **Step 2: Run the modal test and verify it fails**

Run: `npm test -- src/components/shared/AccessibleModal.component.test.tsx`

Expected: FAIL because the custom portal does not currently participate in React Aria modal isolation.

### Task 2: Integrate OverlayProvider, OverlayContainer, and useModal

**Files:**
- Modify: `src/index.jsx:1-45`
- Modify: `src/components/shared/AccessibleModal.tsx:1-150`
- Test: `src/components/shared/AccessibleModal.component.test.tsx`

**Interfaces:**
- Consumes: `OverlayProvider`, `OverlayContainer`, `useModal`, and `mergeProps` from `react-aria`.
- Preserves: existing `AccessibleModalProps` API.

- [ ] **Step 1: Wrap the routed application**

Import `OverlayProvider` and wrap all routes inside `BrowserRouter`:

```jsx
import { OverlayProvider } from "react-aria";

createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <OverlayProvider>
      {supabaseConfigError ? (
        <Routes>
          <Route path="/customer/*" element={<CustomerUnavailablePage />} />
          <Route path="/*" element={<StaffMisconfiguredPage />} />
        </Routes>
      ) : (
        <Suspense fallback={<LoadingSpinner />}>
          <Routes>
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/customer/*" element={<CustomerApp />} />
            <Route path="/*" element={<App />} />
          </Routes>
        </Suspense>
      )}
    </OverlayProvider>
  </BrowserRouter>,
);
```

- [ ] **Step 2: Replace the custom portal primitive**

Change imports:

```tsx
import { useRef, useEffect, type ReactNode } from "react";
import { FocusScope, mergeProps, OverlayContainer, useDialog, useModal } from "react-aria";
```

Remove `createPortal`. Inside `AccessibleModal`, add:

```tsx
const { modalProps } = useModal({ isDisabled: !modal });
const mergedDialogProps = mergeProps(dialogProps, modalProps);
```

Replace the return with:

```tsx
return (
  <OverlayContainer>
    <div
      className={`fixed inset-0 ${modal ? backdropClass : "pointer-events-none"} ${overlayClassName}`}
      style={{ zIndex }}
      onClick={modal ? onClose : undefined}
    >
      <FocusScope contain={modal} restoreFocus autoFocus>
        <div
          {...mergedDialogProps}
          ref={ref}
          aria-modal={modal ? "true" : undefined}
          className={`${modal ? "" : "pointer-events-auto"} ${className}`}
          onClick={(event) => event.stopPropagation()}
        >
          {children}
        </div>
      </FocusScope>
    </div>
  </OverlayContainer>
);
```

`useModal({ isDisabled: !modal })` prevents the non-modal drawer from hiding background content. Keep the custom Escape listener, dialog stack, and scroll-lock effects unchanged.

- [ ] **Step 3: Update the portal assertion**

Keep the existing transformed-ancestor test, but assert the dialog is under the React Aria overlay container attached to `document.body`, not inside Testing Library’s render container.

- [ ] **Step 4: Run all shared overlay tests**

Run: `npm test -- src/components/shared/AccessibleModal.component.test.tsx src/components/shared/DrawerShell.component.test.tsx`

Expected: PASS.

- [ ] **Step 5: Run representative modal suites**

Run: `npm test -- src/components/modals/NewBookingModal.component.test.jsx src/components/modals/BookingDetailModal.component.test.jsx src/components/modals/HumanCardModal.component.test.jsx src/components/views/inbox/compose-new/ComposeNewModal.component.test.jsx`

Expected: PASS.

- [ ] **Step 6: Commit modal isolation**

```bash
git add src/index.jsx src/components/shared/AccessibleModal.tsx src/components/shared/AccessibleModal.component.test.tsx
git commit -m "fix: isolate modal content for assistive technology"
```

### Task 3: Verify stacked, non-modal, focus, and background behaviour

**Files:**
- No source change expected.

- [ ] **Step 1: Verify a standard modal**

Open New message from Inbox. Confirm body scrolling is locked, Tab stays within the modal, Escape closes it once, and focus returns to New message.

- [ ] **Step 2: Verify a full-screen mobile modal**

At 390×844, open New Booking. Confirm the modal fills the intended viewport, the background is not scrollable or reachable by keyboard, and closing returns focus to New booking.

- [ ] **Step 3: Verify a non-modal drawer plus stacked confirmation**

Open the booking drawer, then open a confirmation dialog above it. Confirm the drawer leaves the page interactive before the confirmation; while the confirmation is open, only it is exposed; the first Escape closes the confirmation and the second closes the drawer.

- [ ] **Step 4: Inspect the accessibility tree**

With a standard modal open, confirm the page navigation and main content are hidden from the accessibility snapshot. Close it and confirm both return. Repeat with `modal={false}` and confirm the page remains exposed.

- [ ] **Step 5: Run final quality gates**

Run: `npm run typecheck && npm run lint && npm test && npm run build`

Expected: all commands exit 0.


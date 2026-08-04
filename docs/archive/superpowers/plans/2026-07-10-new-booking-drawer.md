# New Booking Drawer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the New Booking modal into a right-hand side drawer (desktop) in the /today paper style, with a live link so calendar slot clicks feed the open draft.

**Architecture:** Reshape in place — all booking logic in `NewBookingModal.jsx` is untouched. `AccessibleModal`/`DrawerShell` gain a `modal={false}` mode (no backdrop / focus trap / scroll lock); App gains a `requestNewBooking` router that turns calendar picks into `draftPick` updates while the drawer is open; the day view highlights the draft's slot; sections restyle to the paper language.

**Tech Stack:** React 19 + Vite 7, Tailwind 4, react-aria (`FocusScope`, `useDialog`), Vitest (+ @testing-library/react, jsdom for `*.component.test.*`).

**Spec:** `docs/superpowers/specs/2026-07-10-new-booking-drawer-design.md`

## Global Constraints

- Branch: `feat/new-booking-drawer` (already created). Never push to `main`.
- No changes to: `src/engine/`, `supabase/`, any RPC, any booking write-path logic in `NewBookingModal.jsx` (handlers `handleConfirm` → `commitBookings` inclusive).
- Existing behaviour tests must pass **unmodified** except where a test asserts a styling detail this plan explicitly changes (each task says which).
- Import rule: never write a `.js`/`.jsx` extension on a relative import whose target is `.ts`/`.tsx` (lint enforces). `DrawerShell` is `.tsx` → import extensionless.
- No bare `console` in `src/` (use `src/lib/logger.ts` — not needed by this plan).
- UK English, warm/calm copy voice. Paper tokens: `bg-[var(--color-brand-paper)]`, `border-brand-paper-line`, card idiom `rounded-2xl border border-brand-paper-line bg-white`.
- The CI bar for the final task: `npm run lint && npm run typecheck && npm run check:migrations && npm run test && npm run build`.
- Component tests run with `npx vitest run <path> --project component` if a project flag is needed; plain `npx vitest run <path>` works too (config routes by filename).

---

### Task 1: Non-modal mode for AccessibleModal + DrawerShell

**Files:**
- Modify: `src/components/shared/AccessibleModal.tsx`
- Modify: `src/components/shared/DrawerShell.tsx`
- Test: `src/components/shared/AccessibleModal.component.test.tsx`
- Test: `src/components/shared/DrawerShell.component.test.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `AccessibleModal` and `DrawerShell` both accept `modal?: boolean` (default `true`). When `false`: no backdrop colour, overlay is `pointer-events-none` (panel re-enables), no focus containment, no body scroll lock, no backdrop-click close, no `aria-modal`. Escape-close, portal, `role="dialog"`, `aria-labelledby` all kept. All existing callers are unaffected (default `true`).

- [ ] **Step 1: Write the failing tests**

Append to `src/components/shared/AccessibleModal.component.test.tsx`:

```tsx
describe("AccessibleModal — non-modal mode (modal={false})", () => {
  it("renders a dialog without aria-modal, scroll lock, or a blocking backdrop", () => {
    render(
      <AccessibleModal onClose={() => {}} titleId="nm" modal={false}>
        <h2 id="nm">Panel</h2>
      </AccessibleModal>,
    );
    const dialog = document.body.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog).not.toBeNull();
    expect(dialog.getAttribute("aria-modal")).toBeNull();
    // Page behind must stay scrollable…
    expect(document.body.style.overflow).toBe("");
    // …and the full-screen wrapper must not swallow clicks.
    const overlay = document.body.querySelector('[class*="inset-0"]') as HTMLElement;
    expect(overlay.className).toContain("pointer-events-none");
    // The panel itself re-enables pointer events.
    expect(dialog.className).toContain("pointer-events-auto");
  });

  it("still closes on Escape, but not on an overlay click", () => {
    const onClose = vi.fn();
    render(
      <AccessibleModal onClose={onClose} titleId="nm2" modal={false}>
        <h2 id="nm2">Panel</h2>
      </AccessibleModal>,
    );
    const overlay = document.body.querySelector('[class*="inset-0"]') as HTMLElement;
    fireEvent.click(overlay);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
```

Append to `src/components/shared/DrawerShell.component.test.tsx`:

```tsx
describe("DrawerShell — non-modal mode (modal={false})", () => {
  it("passes non-modal through: no scroll lock, click-through overlay, Escape still closes", () => {
    const onClose = vi.fn();
    render(
      <DrawerShell onClose={onClose} titleId="nmd" modal={false}>
        <h2 id="nmd">Live drawer</h2>
      </DrawerShell>,
    );
    expect(document.body.style.overflow).toBe("");
    const overlay = getOverlay();
    expect(overlay.className).toContain("pointer-events-none");
    fireEvent.click(overlay);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    const dialog = document.body.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.getAttribute("aria-modal")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `npx vitest run src/components/shared/AccessibleModal.component.test.tsx src/components/shared/DrawerShell.component.test.tsx`
Expected: the two new describes FAIL (aria-modal present / overflow "hidden"); all existing tests PASS.

- [ ] **Step 3: Implement non-modal mode in AccessibleModal**

In `src/components/shared/AccessibleModal.tsx`:

Add to `AccessibleModalProps` (after `overlayClassName`):

```tsx
  /**
   * Default true — a classic modal (backdrop, focus trap, scroll lock,
   * aria-modal, backdrop-click close). Set false for a non-modal panel
   * (the live booking drawer): the page behind stays scrollable and
   * clickable, focus moves freely, Escape and the close button dismiss.
   */
  modal?: boolean;
```

Destructure `modal = true` in the function signature. Then three changes in the body:

```tsx
  // Scroll lock (reference-counted — see above). Non-modal panels leave the
  // page scrollable — that's the point of them.
  useEffect(() => {
    if (!modal) return;
    lockBodyScroll();
    return () => unlockBodyScroll();
  }, [modal]);
```

Replace the returned JSX with:

```tsx
  return createPortal(
    <div
      className={`fixed inset-0 ${modal ? backdropClass : "pointer-events-none"} ${overlayClassName}`}
      style={{ zIndex }}
      onClick={modal ? onClose : undefined}
    >
      <FocusScope contain={modal} restoreFocus autoFocus>
        <div
          {...dialogProps}
          ref={ref}
          aria-modal={modal ? "true" : undefined}
          className={`${modal ? "" : "pointer-events-auto"} ${className}`}
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      </FocusScope>
    </div>,
    document.body,
  );
```

(`contain` is fixed per mount here — `modal` never flips while open, so react-aria's FocusScope is safe.)

- [ ] **Step 4: Pass `modal` through DrawerShell**

In `src/components/shared/DrawerShell.tsx`: add `modal?: boolean;` to `DrawerShellProps` (with the doc comment `/** Default true. False = non-modal live panel — see AccessibleModal. */`), destructure `modal = true`, and pass `modal={modal}` to `<AccessibleModal>`.

- [ ] **Step 5: Run the tests again**

Run: `npx vitest run src/components/shared/AccessibleModal.component.test.tsx src/components/shared/DrawerShell.component.test.tsx`
Expected: ALL PASS (including every pre-existing test — the default path must be byte-identical in behaviour).

- [ ] **Step 6: Commit**

```bash
git add src/components/shared/AccessibleModal.tsx src/components/shared/DrawerShell.tsx src/components/shared/AccessibleModal.component.test.tsx src/components/shared/DrawerShell.component.test.tsx
git commit -m "feat(shared): non-modal mode for AccessibleModal + DrawerShell

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: NewBookingModal adopts the drawer shell + paper header

**Files:**
- Modify: `src/components/modals/NewBookingModal.jsx` (shell + header + WhatsApp banner only — no handler changes)
- Test: `src/components/modals/NewBookingModal.component.test.jsx` (must pass **unmodified**)

**Interfaces:**
- Consumes: `DrawerShell` with `modal={false}` from Task 1.
- Produces: the drawer shell that Tasks 3–5 assume. `titleId="new-booking-title"` unchanged; header live-region subtitle unchanged.

- [ ] **Step 1: Swap the shell**

In `src/components/modals/NewBookingModal.jsx`:

Replace the import `import { AccessibleModal } from "../shared/AccessibleModal.tsx";` with:

```jsx
import { DrawerShell } from "../shared/DrawerShell";
```

Replace the opening `<AccessibleModal ...>` (and its closing tag) with:

```jsx
    <DrawerShell
      onClose={onClose}
      titleId="new-booking-title"
      modal={false}
      zIndex={900}
      widthClass="sm:max-w-[500px]"
    >
```

Notes: `zIndex={900}` keeps the drawer *below* every true modal (BookingDetail, ConfirmDialog stacks at 1000) so follow-up dialogs always sit on top. `DrawerShell` already gives paper background, full height, right anchor, full-width below `sm`.

- [ ] **Step 2: Paper header (gradient gone)**

Replace the entire `{/* Header */}` block (the `div` with the `linear-gradient` style, through its closing tag) with:

```jsx
        {/* Header — paper, matching /today. The size cue now lives on each
            selected dog's row (Task 6), not the shell. */}
        <div className="px-6 py-[18px] border-b border-brand-paper-line bg-white flex justify-between items-center shrink-0">
          <div>
            <div id="new-booking-title" className="font-display text-lg font-extrabold text-brand-purple">New booking</div>
            <div
              className="text-xs mt-0.5 text-slate-600"
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              {headerSubtitle}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close new booking"
            className="tap-target bg-transparent hover:bg-slate-100 transition-colors border-none rounded-lg w-8 h-8 flex items-center justify-center cursor-pointer text-base font-bold text-slate-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple/40"
          ><span aria-hidden="true">{"×"}</span></button>
        </div>
```

- [ ] **Step 3: WhatsApp banner to paper tones**

Replace the `sourceMessageText` banner div's className with:

```jsx
          <div className="mx-6 mt-4 rounded-xl border border-l-4 border-brand-paper-line border-l-brand-teal bg-white px-3.5 py-2.5 text-[13px] text-slate-700">
```

(Content inside unchanged.)

- [ ] **Step 4: Run the existing modal tests**

Run: `npx vitest run src/components/modals/NewBookingModal.component.test.jsx`
Expected: ALL PASS with zero test edits (they query by role/label, which are unchanged). If anything fails, fix the component — not the test.

- [ ] **Step 5: Commit**

```bash
git add src/components/modals/NewBookingModal.jsx
git commit -m "feat(new-booking): drawer shell + paper header

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: `draftPick` prop — the drawer applies calendar picks

**Files:**
- Modify: `src/components/modals/NewBookingModal.jsx`
- Test: `src/components/modals/NewBookingModal.component.test.jsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `NewBookingModal` accepts `draftPick` — `{ dateStr: string, slot: string, nonce: number } | null`. Applying one sets `selectedDateStr`, sets/clears `selectedSlot`, clears the error. Task 4's App router produces this object.

- [ ] **Step 1: Write the failing test**

Append to `src/components/modals/NewBookingModal.component.test.jsx` (reuse the file's existing `luna`, `OPEN_DATE`, and mock setup; note `renderModal` doesn't return `rerender`, so render inline here):

```jsx
describe("live calendar link — draftPick", () => {
  const OPEN_DATE_2 = "2099-01-12";

  // The header subtitle is the one live-region that echoes the draft's
  // dog · slot · date. Assert on IT, not on bare text — the TimeSlotPicker
  // renders "9:00am"/"10:30am" as slot buttons too, which would false-pass.
  const getSubtitle = () =>
    Array.from(document.querySelectorAll('[aria-live="polite"]')).find((el) =>
      el.textContent.includes("Luna"),
    );

  const draftProps = () => ({
    onClose: vi.fn(),
    onAdd: vi.fn().mockResolvedValue({ ok: true }),
    dogs: {},
    humans: {},
    dogsByHumanId: {},
    ensureDogsForHumans: vi.fn(),
    bookingsByDate: {},
    dayOpenState: { [OPEN_DATE]: true, [OPEN_DATE_2]: true },
    daySettings: {},
    onOpenAddDog: vi.fn(),
    onOpenNewClient: vi.fn(),
    initialDateStr: OPEN_DATE,
    initialSlot: "09:00",
    initialEntries: [{ dog: luna, humanKey: "Emma Wilson", service: "full-groom", addons: [] }],
    onSearchDogs: vi.fn(),
    isSearchingDogs: false,
  });

  it("applies an incoming draftPick (date + slot) to the in-progress booking", async () => {
    const props = draftProps();
    const view = render(
      <ToastProvider>
        <NewBookingModal {...props} draftPick={null} />
      </ToastProvider>,
    );
    // Seeded state shows in the live header subtitle once entries hydrate.
    await waitFor(() => expect(getSubtitle()?.textContent).toMatch(/9:00am/));

    view.rerender(
      <ToastProvider>
        <NewBookingModal {...props} draftPick={{ dateStr: OPEN_DATE_2, slot: "10:30", nonce: 1 }} />
      </ToastProvider>,
    );
    // New slot + new date land in the subtitle (Mon 12 Jan for 2099-01-12).
    await waitFor(() => expect(getSubtitle()?.textContent).toMatch(/10:30am/));
    expect(getSubtitle()?.textContent).toMatch(/12 Jan/);
  });

  it("a date-only pick clears the chosen slot", async () => {
    const props = draftProps();
    const view = render(
      <ToastProvider>
        <NewBookingModal {...props} draftPick={null} />
      </ToastProvider>,
    );
    await waitFor(() => expect(getSubtitle()?.textContent).toMatch(/9:00am/));
    view.rerender(
      <ToastProvider>
        <NewBookingModal {...props} draftPick={{ dateStr: OPEN_DATE_2, slot: "", nonce: 2 }} />
      </ToastProvider>,
    );
    await waitFor(() => expect(getSubtitle()?.textContent).toMatch(/12 Jan/));
    expect(getSubtitle()?.textContent).not.toMatch(/9:00am/);
  });
});
```

- [ ] **Step 2: Run to verify the new tests fail**

Run: `npx vitest run src/components/modals/NewBookingModal.component.test.jsx`
Expected: the two new tests FAIL (subtitle still shows the old date/slot); all others PASS.

- [ ] **Step 3: Implement the prop**

In `NewBookingModal.jsx`: add `draftPick,` to the destructured props (after `initialStaffCapacityOverride`). Then add this effect directly after the "Resume prefill" effect (after the `prefilledEntriesRef` block):

```jsx
  // Live calendar link. While the drawer is open, App relays day-view slot
  // picks as { dateStr, slot, nonce }. Apply them exactly like an in-drawer
  // pick — date-only picks clear the slot (same as handleSelectDate). The
  // nonce makes re-clicking the same slot after manual changes re-apply.
  useEffect(() => {
    if (!draftPick?.dateStr) return;
    setSelectedDateStr(draftPick.dateStr);
    setSelectedSlot(draftPick.slot || "");
    setError("");
  }, [draftPick]);
```

- [ ] **Step 4: Run the tests again**

Run: `npx vitest run src/components/modals/NewBookingModal.component.test.jsx`
Expected: ALL PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/modals/NewBookingModal.jsx src/components/modals/NewBookingModal.component.test.jsx
git commit -m "feat(new-booking): apply live calendar draft picks via draftPick prop

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: App routing — `requestNewBooking`, sessionKey remount, spec amendment

**Files:**
- Modify: `src/App.jsx`
- Modify: `docs/superpowers/specs/2026-07-10-new-booking-drawer-design.md` (one behaviour amendment)

**Interfaces:**
- Consumes: `draftPick` prop from Task 3.
- Produces: `requestNewBooking(req)` — the single entry point for opening/feeding the booking drawer; `draftPick` state passed to `NewBookingModal` and (Task 5) `WeekCalendarView`. Every `setShowNewBooking(<object>)` caller in App switches to it.

No unit test — App.jsx has no test harness; behaviour is covered by Task 3's component test plus Task 7's manual verification. Keep this task pure plumbing.

- [ ] **Step 1: Add state + router**

In `App.jsx`, next to the existing `showNewBooking` usage (it comes from a state hook imported around line 317), add:

```jsx
  // Live calendar link: while the booking drawer is open, plain calendar
  // picks (a dateStr/slot with no identity prefills) update the open draft
  // instead of re-opening the wizard. Anything carrying identity — book
  // again, WhatsApp, parked-draft resume — starts a FRESH session: the
  // sessionKey remounts the drawer so its one-shot prefill refs run again
  // (they'd otherwise silently ignore the new prefill).
  const [draftPick, setDraftPick] = useState(null);
  const draftNonceRef = useRef(0);
  const bookingSessionRef = useRef(0);

  const requestNewBooking = useCallback(
    (req) => {
      const isCalendarPick =
        !!req?.dateStr &&
        !req.initialHumanId &&
        !req.initialDogId &&
        !req.initialEntries &&
        !req.sourceMessageText;
      if (showNewBooking && isCalendarPick) {
        draftNonceRef.current += 1;
        setDraftPick({
          dateStr: req.dateStr,
          slot: req.slot || "",
          nonce: draftNonceRef.current,
        });
        return;
      }
      bookingSessionRef.current += 1;
      setDraftPick(null);
      setShowNewBooking({ ...req, sessionKey: bookingSessionRef.current });
    },
    [showNewBooking, setShowNewBooking],
  );
```

(If `useCallback`/`useRef` aren't already imported in App.jsx, extend the React import.)

- [ ] **Step 2: Route every open call through it**

Find each `setShowNewBooking({` object call in `App.jsx` (grep: `grep -n "setShowNewBooking({" src/App.jsx` — expect ~7: the keyboard/toolbar shortcut near line 436, the parked-resume near 751, toolbar 827, HumanCard paths near 1114/1127, `onBookAnother` near 1189, book-again near 1291) and change the call to `requestNewBooking({` — arguments untouched. Update any surrounding `useMemo`/`useCallback` dependency arrays from `setShowNewBooking` to `requestNewBooking`.

Then the two prop pass-throughs:
- `WeekCalendarView`: `setShowNewBooking={setShowNewBooking}` → `setShowNewBooking={requestNewBooking}` (prop name stays — it receives request objects).
- `TodayView`: `onNewBooking={setShowNewBooking}` → `onNewBooking={requestNewBooking}`.

Calls of `setShowNewBooking(null)` (closing) stay as they are, but the drawer's `onClose` and the New-Client hand-off must also clear the draft: in the `<NewBookingModal>` JSX, change

```jsx
                  onClose={() => {
                    setShowNewBooking(null);
                    setDraftPick(null);
                    dogsClearSearch();
                  }}
```

and inside its `onOpenNewClient` handler add `setDraftPick(null);` after `setShowNewBooking(null);`. Do the same in the parked-booking path (`parkBooking` closes the wizard around line 715): add `setDraftPick(null);` beside that `setShowNewBooking(null);`.

- [ ] **Step 3: Remount key + draftPick prop on the drawer**

On the `<NewBookingModal` element add:

```jsx
                  key={showNewBooking.sessionKey}
                  draftPick={draftPick}
```

- [ ] **Step 4: Amend the spec (browsing must not clobber the draft)**

In `docs/superpowers/specs/2026-07-10-new-booking-drawer-design.md`, in "### Draft picks", replace the sentence "A day click in the week strip or mini calendar sets `draftPick` with `slot: ""`." with:

```markdown
  Day clicks in the week strip / mini calendar only navigate the calendar —
  they do NOT move the draft. (Amended during planning: staff peeking at
  another day to compare must not wipe an already-chosen date+slot. Only
  explicit slot-level picks — "+ Book", a ghost seat, the slot menu — feed
  the draft.)
```

- [ ] **Step 5: Sanity check**

Run: `npm run lint && npm run typecheck`
Expected: clean. Then `npx vitest run src/components/modals/NewBookingModal.component.test.jsx` — PASS.

- [ ] **Step 6: Commit**

```bash
git add src/App.jsx docs/superpowers/specs/2026-07-10-new-booking-drawer-design.md
git commit -m "feat(booking): route calendar picks into the open booking draft

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Day-view highlight of the draft slot

**Files:**
- Modify: `src/App.jsx` (pass `draftPick` + open flag down)
- Modify: `src/components/layout/WeekCalendarView.jsx`
- Modify: `src/components/dashboard/BookingMainPanel.jsx`
- Modify: `src/components/booking/SlotGrid.jsx`
- Test: `src/components/booking/SlotGrid.component.test.jsx`

**Interfaces:**
- Consumes: `draftPick` state from Task 4.
- Produces: `SlotGrid` accepts `draftPick` (`{ dateStr, slot } | null`) and marks the matching slot row. Prop is threaded App → WeekCalendarView → BookingMainPanel → SlotGrid.

- [ ] **Step 1: Write the failing test**

Append to `src/components/booking/SlotGrid.component.test.jsx` (reuses its `renderGrid` helper — pass via `gridProps`):

```jsx
describe("SlotGrid — live booking-draft marker", () => {
  it("marks the slot row the open booking draft is targeting", () => {
    renderGrid("2026-06-02", [], {
      draftPick: { dateStr: "2026-06-02", slot: "09:00" },
    });
    expect(screen.getByText("Booking here")).toBeInTheDocument();
  });

  it("shows no marker when the draft targets a different date", () => {
    renderGrid("2026-06-02", [], {
      draftPick: { dateStr: "2026-06-03", slot: "09:00" },
    });
    expect(screen.queryByText("Booking here")).toBeNull();
  });

  it("shows no marker when there is no draft", () => {
    renderGrid("2026-06-02");
    expect(screen.queryByText("Booking here")).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/booking/SlotGrid.component.test.jsx`
Expected: new tests FAIL ("Booking here" not found); existing tests PASS.

- [ ] **Step 3: Implement the marker in SlotGrid**

In `src/components/booking/SlotGrid.jsx`: add `draftPick,` to the component's destructured props (next to `onOpenNewBooking`). Inside `renderSlot` (after the `isNow` line):

```jsx
    // Live booking-draft marker: while the booking drawer targets this
    // day+slot, pin a chip on the row so staff always see where the
    // booking will land.
    const isDraftTarget =
      !!draftPick && draftPick.dateStr === currentDateStr && draftPick.slot === slot;
```

In the row container's `className` array (the one with `rowBg`), add the entry:

```jsx
          isDraftTarget ? "ring-2 ring-inset ring-brand-teal" : "",
```

And render the chip as the first child inside that row container div:

```jsx
        {isDraftTarget && (
          <span className="absolute -top-2 left-16 md:left-20 z-[1] inline-flex items-center rounded-full bg-brand-teal text-white text-[10px] font-bold px-2 py-0.5 shadow-sm pointer-events-none">
            Booking here
          </span>
        )}
```

Finally add `draftPick` to the `useCallback` dependency array of `renderSlot` (the long list ending `nowIdx]`) **and** to the `useMemo`/render paths that call it if they memoise on the same list (grep `renderSlot` usages in the file and extend each dep array that lists `nowIdx`).

- [ ] **Step 4: Thread the prop**

- `App.jsx`: pass `draftPick={showNewBooking ? draftPick : null}` to `<WeekCalendarView>`.
- `WeekCalendarView.jsx`: accept `draftPick` in props; pass `draftPick={draftPick}` to `<BookingMainPanel>`.
- `BookingMainPanel.jsx`: accept `draftPick`; pass `draftPick={draftPick}` to `<SlotGrid>` (the render around line 102).

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/components/booking/SlotGrid.component.test.jsx`
Expected: ALL PASS.

- [ ] **Step 6: Commit**

```bash
git add src/App.jsx src/components/layout/WeekCalendarView.jsx src/components/dashboard/BookingMainPanel.jsx src/components/booking/SlotGrid.jsx src/components/booking/SlotGrid.component.test.jsx
git commit -m "feat(calendar): highlight the open booking draft's target slot

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Paper restyle of the drawer sections

**Files:**
- Modify: `src/components/modals/new-booking/DogSearchSection.jsx`
- Modify: `src/components/modals/new-booking/BookingFormFields.jsx`
- Modify: `src/components/modals/new-booking/BookingActions.jsx`
- Modify: `src/components/modals/NewBookingModal.jsx` (drop `primaryTheme` from BookingActions call)
- Tests (must pass, edits only where noted): `src/components/modals/new-booking/DogSearchSection.component.test.jsx`, `src/components/modals/NewBookingModal.component.test.jsx`

**Interfaces:**
- Consumes: paper tokens; `SIZE_THEME` for the per-dog chip.
- Produces: `BookingActions` no longer takes `primaryTheme` (signature shrinks by one prop). `DogSearchSection` and `BookingFormFields` keep their signatures (`primaryTheme` still used for picker accents).

- [ ] **Step 1: Size chip on each selected dog row (DogSearchSection)**

In the dog-entry card (the block starting `const dogTheme = SIZE_THEME[...]`), change the name line and meta line: after the `{titleCase(entry.dog.name)}` span's warning emoji, and replace the meta line

```jsx
                  <div className="text-[11px] text-slate-800">
                    {titleCase(entry.dog.breed)} · {entry.dog.size || "small"} · {titleCase(entry.humanKey)}
                  </div>
```

with:

```jsx
                  <div className="text-[11px] text-slate-800 flex items-center gap-1.5 flex-wrap">
                    <span
                      className="text-[10px] font-bold uppercase tracking-wide rounded px-1.5 py-0.5 bg-white/80"
                      style={{ color: dogTheme.primary }}
                    >
                      {entry.dog.size || "small"}
                    </span>
                    <span>{titleCase(entry.dog.breed)} · {titleCase(entry.humanKey)}</span>
                  </div>
```

(The size word stays queryable by text, so existing tests that look for it keep passing.)

- [ ] **Step 2: Paper borders on the search dropdowns (DogSearchSection)**

Mechanical replace within this file only: every `border-[1.5px] border-slate-200` on the three dropdown/panel containers ("Looking for matches…", results list, "no results" panel) and the same-owner picker becomes `border border-brand-paper-line`. Leave the input field's border classes alone (focus ring behaviour is fine as-is).

- [ ] **Step 3: Date + time sections as soft cards (BookingFormFields)**

In `src/components/modals/new-booking/BookingFormFields.jsx`, wrap each of the two main pickers in the /today card idiom. The "Choose a Date" block becomes:

```jsx
        <div className="rounded-2xl border border-brand-paper-line bg-white p-3">
          <label className="text-[11px] font-extrabold text-brand-teal-text uppercase tracking-wide block mb-1.5">Choose a Date</label>
          <AvailabilityCalendar
            bookingsByDate={bookingsByDate}
            dayOpenState={dayOpenState}
            daySettings={daySettings}
            onSelectDate={onSelectDate}
            selectedDateStr={selectedDateStr}
            sizeTheme={primaryTheme}
          />
        </div>
```

and the "Available Times" block's outer `<div>` likewise gains `className="rounded-2xl border border-brand-paper-line bg-white p-3"`. The recurring `<select>` block keeps its current shape (it's a single control, not a card), but its outer `<div className="mb-4">` loses the `mb-4` (the parent's `gap-4` already spaces it).

- [ ] **Step 4: BookingActions to a standard brand CTA**

Replace the whole `BookingActions` component body's footer classes and confirm button (drop `primaryTheme` from the props list and delete the `style`/`onMouseEnter`/`onMouseLeave` props):

```jsx
    <div className="shrink-0 px-6 pt-3 pb-5 border-t border-brand-paper-line bg-[var(--color-brand-paper)] max-sm:pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
```

and the confirm button:

```jsx
        <button
          onClick={onConfirm}
          disabled={!ready}
          className="flex-1 py-[13px] rounded-xl border-none font-bold text-sm cursor-pointer font-inherit transition-all active:scale-[0.98] motion-safe:transition-transform bg-brand-teal text-white hover:bg-brand-teal-dark disabled:bg-slate-200 disabled:text-slate-600 disabled:cursor-not-allowed"
        >
          {label}
        </button>
```

In `NewBookingModal.jsx`, delete the `primaryTheme={primaryTheme}` line from the `<BookingActions>` call. (`primaryTheme` is still computed and passed to `DogSearchSection`/`BookingFormFields` — the pickers keep size-coloured selected states.)

- [ ] **Step 5: Run the affected tests**

Run: `npx vitest run src/components/modals/new-booking/DogSearchSection.component.test.jsx src/components/modals/NewBookingModal.component.test.jsx src/components/modals/new-booking/TimeSlotPicker.component.test.jsx src/components/modals/new-booking/AvailabilityCalendar.component.test.jsx`
Expected: ALL PASS. Permitted test edit: only if a DogSearchSection assertion matches the exact old meta-line string (`breed · size · owner` in one text node) — split the assertion to match the new chip + line, keeping the same semantic checks.

- [ ] **Step 6: Commit**

```bash
git add src/components/modals/new-booking/DogSearchSection.jsx src/components/modals/new-booking/BookingFormFields.jsx src/components/modals/new-booking/BookingActions.jsx src/components/modals/NewBookingModal.jsx src/components/modals/new-booking/DogSearchSection.component.test.jsx
git commit -m "feat(new-booking): paper-language restyle — size chips, paper lines, brand CTA

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Full bar + visual verification

**Files:** none new — verification only (fix-forward anything found, committing per fix).

- [ ] **Step 1: The CI bar**

Run: `npm run lint && npm run typecheck && npm run check:migrations && npm run test && npm run build`
Expected: all pass. (Known noise: ~6 directory tests can fail locally from localStorage isolation — per repo memory, don't chase those; everything touched by this plan must pass.)

- [ ] **Step 2: E2E impact check**

Run: `grep -rin "new booking\|NewBooking" e2e/ | head -20` — if any spec drives the modal, run `npm run e2e` (offline build on :4173) and fix selectors ONLY if they referenced removed styling hooks (roles/labels were preserved, so expect no changes).

- [ ] **Step 3: Visual verification (offline preview — no real PII)**

Start the `offline` launch config (VITE_FORCE_OFFLINE=1, :5174) via the preview tools, then verify on desktop viewport:
1. Open `/` (calendar), click a "+ Book" ghost seat → drawer slides in on the right; calendar remains visible AND clickable.
2. Click a different empty slot on the day view → the drawer's subtitle updates to that slot; the "Booking here" chip + teal ring move to the clicked row.
3. Pick a dog in the drawer → size chip visible on the dog card; confirm button is brand teal.
4. Escape closes the drawer; the chip disappears.
5. Resize to mobile (375px) → full-screen panel, sections legible, footer safe-area intact.
6. Save flow: Confirm → the confirmation-method dialog appears ON TOP of the drawer (z-order check).
Screenshot the desktop drawer + highlight state and the mobile view; share both.

- [ ] **Step 4: Final commit (if any fixes) and push**

```bash
git push -u origin feat/new-booking-drawer
```

Then open a PR to `main` titled "feat(new-booking): side drawer with live calendar link + paper restyle" with the spec/plan linked, ending the body with:

🤖 Generated with [Claude Code](https://claude.com/claude-code)

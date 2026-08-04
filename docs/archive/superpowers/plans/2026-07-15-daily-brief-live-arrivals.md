# Daily Brief Live Arrivals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the duplicated Now/Up next strip with a stable live booking marker, restore confirmation/progress styling, and combine readiness with optional collection messaging.

**Architecture:** Keep appointment order in the existing feed and add pure selection/copy helpers in `engine/today.ts`. `TodayView` owns one-shot scroll triggers; `BookingFeed` owns the gutter layout; `BookingJourneyRow` owns per-card confirmation/progress appearance. Readiness saves before the existing collection modal opens, and the modal gains an initial opt-in step without changing WhatsApp delivery infrastructure.

**Tech Stack:** React 19, TypeScript/JavaScript, Tailwind CSS 4, Vitest, Testing Library, Playwright, Supabase edge-function invocation through the existing modal.

## Global Constraints

- Keep the feed chronological; never reorder bookings as the clock changes.
- Scroll only on initial today load, date change to today, or successful resolution of the focused booking.
- Minute ticks update marker copy without scrolling or moving keyboard focus.
- An overdue `Booked` appointment remains focused until check-in or cancellation.
- Confirmed or checked-in-and-later non-cancelled bookings remain green; cancellation overrides green.
- Only `reminderConfirmedAt` earns the confirmation tick; check-in alone must not show it.
- Ready status saves before optional messaging; send failure never rolls Ready back.
- Keep all direct controls at least 44px and respect reduced-motion preferences.
- Do not change WhatsApp templates, persistence, booking status values, payment fields, or general owner messaging.

---

### Task 1: Pure live-focus and context engine

**Files:**
- Modify: `src/engine/today.ts:859-947`
- Modify: `src/engine/today.test.ts:615-731`

**Interfaces:**
- Consumes: `TodayFeedEntry`, `londonNowParts(now)`, `minutesUntilSlot(slot, now)`, `formatLondonTime` callers.
- Produces: `selectLiveFocus(entries: TodayFeedEntry[]): TodayFeedEntry | null` and `liveFocusContext(entry: TodayFeedEntry, now: Date): LiveFocusContext`, where `LiveFocusContext = { text: string; tone: "live" | "overdue"; ariaLabel: string }`.

- [ ] **Step 1: Replace sticky-strip tests with failing live-focus tests**

```ts
describe("selectLiveFocus", () => {
  const feedOf = (bookings: Booking[]) => buildTodayFeed(bookings, NOW_SUMMER);

  it("keeps the earliest overdue Booked arrival ahead of newer arrivals", () => {
    const focus = selectLiveFocus(feedOf([
      bk({ id: "old", _bookingDate: TODAY, slot: "08:30", status: "Booked" }),
      bk({ id: "new", _bookingDate: TODAY, slot: "10:30", status: "Booked" }),
    ]));
    expect(focus?.booking.id).toBe("old");
  });

  it("advances to the nearest upcoming arrival after check-in", () => {
    const focus = selectLiveFocus(feedOf([
      bk({ id: "done", _bookingDate: TODAY, slot: "08:30", status: "Checked in" }),
      bk({ id: "next", _bookingDate: TODAY, slot: "10:30", status: "Booked" }),
    ]));
    expect(focus?.booking.id).toBe("next");
  });

  it("falls back from arrivals to longest-waiting ready, then longest in-salon", () => {
    const ready = selectLiveFocus(feedOf([
      bk({ id: "bath", status: "In bath", checkedInAt: "2026-07-02T08:30:00Z" }),
      bk({ id: "ready", status: "Ready for pick-up", readyAt: "2026-07-02T09:00:00Z" }),
    ]));
    expect(ready?.booking.id).toBe("ready");
  });
});

describe("liveFocusContext", () => {
  it.each([
    ["10:20", "Due to arrive in 5 mins"],
    ["10:15", "Due now"],
    ["10:00", "15 mins overdue"],
  ])("formats %s against the current London time", (slot, text) => {
    const entry = buildTodayFeed([bk({ dogName: "Minnie", slot, status: "Booked" })], NOW_SUMMER)[0];
    expect(liveFocusContext(entry, NOW_SUMMER)).toMatchObject({ text, ariaLabel: `Minnie — ${text.toLowerCase()}` });
  });
});
```

- [ ] **Step 2: Run the focused logic tests and confirm failure**

Run: `npm run test:logic -- src/engine/today.test.ts`

Expected: FAIL because `selectLiveFocus` and `liveFocusContext` are not exported.

- [ ] **Step 3: Replace the Now/Next selector with the minimal live-focus implementation**

```ts
export function selectLiveFocus(entries: TodayFeedEntry[]): TodayFeedEntry | null {
  const overdue = entries
    .filter((entry) => entry.stage === "booked" && entry.isLate)
    .sort((a, b) => a.slotMinutes - b.slotMinutes);
  if (overdue[0]) return overdue[0];

  const upcoming = entries
    .filter((entry) => entry.stage === "booked" && !entry.isLate)
    .sort((a, b) => a.slotMinutes - b.slotMinutes);
  if (upcoming[0]) return upcoming[0];

  const ready = entries
    .filter((entry) => entry.stage === "ready")
    .sort((a, b) => (b.waitMinutes ?? 0) - (a.waitMinutes ?? 0));
  if (ready[0]) return ready[0];

  return entries
    .filter((entry) => entry.stage === "inSalon")
    .sort((a, b) => a.slotMinutes - b.slotMinutes)[0] ?? null;
}

export interface LiveFocusContext {
  text: string;
  tone: "live" | "overdue";
  ariaLabel: string;
}

function liveMinutes(minutes: number): string {
  const whole = Math.max(0, Math.round(minutes));
  return `${whole} ${whole === 1 ? "min" : "mins"}`;
}

function focusContext(dog: string, text: string, tone: LiveFocusContext["tone"]): LiveFocusContext {
  return { text, tone, ariaLabel: `${dog} — ${text.toLowerCase()}` };
}

function checkedInCopy(checkedInAt: string | null | undefined, now: Date): string {
  if (!checkedInAt) return "Checked in";
  const elapsed = Math.max(0, Math.floor((now.getTime() - new Date(checkedInAt).getTime()) / 60_000));
  return `Checked in ${liveMinutes(elapsed)} ago`;
}

export function liveFocusContext(entry: TodayFeedEntry, now: Date): LiveFocusContext {
  const dog = entry.booking.dogName || "Booking";
  if (entry.isLate) return focusContext(dog, `${liveMinutes(entry.overdueMinutes)} overdue`, "overdue");
  if (entry.stage === "ready") return focusContext(dog, `Waiting for collection ${liveMinutes(entry.waitMinutes ?? 0)}`, "live");
  if (entry.stage === "inSalon") return focusContext(dog, checkedInCopy(entry.booking.checkedInAt, now), "live");
  const minutes = minutesUntilSlot(entry.booking.slot || "00:00", now);
  return focusContext(dog, minutes <= 0 ? "Due now" : `Due to arrive in ${liveMinutes(minutes)}`, "live");
}
```

Keep the singular/plural semantics in `liveMinutes` and keep elapsed-time arithmetic out of components. Delete `DUE_SOON_MINUTES`, `NowReason`, `NowNextSelection`, and `selectNowNext` only after all callers move in Task 3.

- [ ] **Step 4: Run logic tests**

Run: `npm run test:logic -- src/engine/today.test.ts`

Expected: PASS for `selectLiveFocus` and every live-copy case.

- [ ] **Step 5: Commit the engine slice**

```bash
git add src/engine/today.ts src/engine/today.test.ts
git commit -m "feat(today): select the live arrival focus"
```

---

### Task 2: Restore confirmation and persistent green progress

**Files:**
- Modify: `src/components/views/today/BookingJourneyRow.jsx:53-174`
- Modify: `src/components/views/today/today.component.test.jsx:550-849`

**Interfaces:**
- Consumes: `entry.booking.reminderConfirmedAt`, `entry.booking.status`, `BOOKING_STATUS`.
- Produces: `journeyCardTone(entry): "success" | "cancelled" | "default"` (exported for direct tests if kept outside the component) and a confirmation tick labelled `Customer confirmed at HH:MM`.

- [ ] **Step 1: Add failing component cases for the exact state matrix**

```jsx
it.each([
  [{ reminderConfirmedAt: "2026-07-15T07:20:00Z", status: "Booked" }, true, true],
  [{ reminderConfirmedAt: null, status: "Checked in" }, true, false],
  [{ reminderConfirmedAt: null, status: "In bath" }, true, false],
  [{ reminderConfirmedAt: "2026-07-15T07:20:00Z", status: "Cancelled" }, false, true],
])("applies success tone=%s and real confirmation tick=%s", (patch, green, tick) => {
  renderFeed([group("09:00", [entry({ ...booking, ...patch })])]);
  const card = screen.getByRole("article", { name: /Jack/ });
  expect(card).toHaveAttribute("data-journey-tone", green ? "success" : patch.status === "Cancelled" ? "cancelled" : "default");
  expect(within(card).queryByRole("img", { name: /customer confirmed/i }) !== null).toBe(tick);
});
```

- [ ] **Step 2: Run the component test and confirm failure**

Run: `npm run test:component -- src/components/views/today/today.component.test.jsx`

Expected: FAIL because the journey article has no tone attribute or confirmation tick.

- [ ] **Step 3: Add card-tone and confirmation rendering**

```jsx
function journeyTone(booking) {
  if (booking.status === BOOKING_STATUS.CANCELLED) return "cancelled";
  if (booking.reminderConfirmedAt || [
    BOOKING_STATUS.CHECKED_IN,
    BOOKING_STATUS.IN_BATH,
    BOOKING_STATUS.READY_FOR_PICKUP,
    BOOKING_STATUS.COMPLETED,
  ].includes(booking.status)) return "success";
  return "default";
}

const CARD_TONE = {
  success: "border-emerald-300 bg-emerald-50/80",
  cancelled: "border-brand-coral/30 bg-brand-coral/[0.06]",
  default: "border-brand-paper-line bg-white",
};
```

Add `aria-label={`${display.dogName} booking`}` and `data-journey-tone` to the article. Render the same tick semantics as `BookingCardNew`, using a local `formatConfirmedAt` that specifies `Europe/London`.

- [ ] **Step 4: Run row tests**

Run: `npm run test:component -- src/components/views/today/today.component.test.jsx`

Expected: PASS; checked-in-unconfirmed is green without a tick, and cancelled-confirmed keeps the tick but not green.

- [ ] **Step 5: Commit the visual-state slice**

```bash
git add src/components/views/today/BookingJourneyRow.jsx src/components/views/today/today.component.test.jsx
git commit -m "fix(today): restore confirmed journey styling"
```

---

### Task 3: Replace Now/Up next with the gutter marker and stable scroll

**Files:**
- Delete: `src/components/views/today/TodayNowStrip.jsx`
- Modify: `src/components/views/TodayView.jsx:7-182,403-436`
- Modify: `src/components/views/today/BookingFeed.jsx:1-85`
- Modify: `src/components/views/today/today.component.test.jsx:850-949`

**Interfaces:**
- Consumes: `selectLiveFocus(displayedFeed)`, `liveFocusContext(liveFocus, now)` from Task 1.
- Produces: `BookingFeed` props `liveFocusId: string | null` and `liveContext: LiveFocusContext | null`.

- [ ] **Step 1: Write failing feed-marker and scroll-trigger tests**

```jsx
it("renders one left-gutter marker beside the focused booking", () => {
  renderFeed([group("09:00", [entry(booking)])], {
    liveFocusId: "b1",
    liveContext: { text: "Due to arrive in 5 mins", tone: "live", ariaLabel: "Jack — due to arrive in 5 mins" },
  });
  expect(screen.getByLabelText("Jack — due to arrive in 5 mins")).toHaveTextContent("Due to arrive in 5 mins");
  expect(screen.getByTestId("live-arrival-arrow")).toBeInTheDocument();
});

it("does not scroll again when only the minute tick changes", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-15T08:25:00+01:00"));
  const scrollIntoView = vi.fn();
  Element.prototype.scrollIntoView = scrollIntoView;
  renderToday();
  await vi.runOnlyPendingTimersAsync();
  expect(scrollIntoView).toHaveBeenCalledTimes(1);
  vi.setSystemTime(new Date("2026-07-15T08:26:00+01:00"));
  await vi.advanceTimersByTimeAsync(60_000);
  expect(scrollIntoView).toHaveBeenCalledTimes(1);
  vi.useRealTimers();
});
```

If `TodayView` does not accept a clock prop, use fake timers around its existing minute tick rather than adding a production-only test prop.

- [ ] **Step 2: Run component tests and confirm failure**

Run: `npm run test:component -- src/components/views/today/today.component.test.jsx`

Expected: FAIL because `TodayNowStrip` still renders and `BookingFeed` ignores live marker props.

- [ ] **Step 3: Implement gutter composition in `BookingFeed`**

```jsx
const focused = booking.id === liveFocusId;
return (
  <div key={booking.id} className={focused ? "grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2" : "pl-[5.25rem]"}>
    {focused && <LiveArrivalMarker context={liveContext} />}
    <BookingJourneyRow
      entry={entry}
      slotLabel={group.label}
      display={{ ...resolve(booking), serviceLabel }}
      price={price}
      handlers={handlers}
    />
  </div>
);
```

Use responsive classes to shrink the gutter at narrow widths, `data-testid="live-arrival-arrow"`, and an `aria-label` from `liveContext.ariaLabel`. Keep the arrow out of the journey grid.

- [ ] **Step 4: Implement one-shot scrolling in `TodayView`**

```jsx
const liveFocus = useMemo(
  () => (isToday ? selectLiveFocus(displayedFeed) : null),
  [displayedFeed, isToday],
);
const scrolledFocusRef = useRef(null);

useEffect(() => {
  if (!isToday || !liveFocus || bookingsLoading) return;
  const key = `${dateStr}:${liveFocus.booking.id}`;
  if (scrolledFocusRef.current === key) return;
  scrolledFocusRef.current = key;
  requestAnimationFrame(() => {
    const element = document.getElementById(`today-card-${liveFocus.booking.id}`);
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    element?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  });
}, [bookingsLoading, dateStr, isToday, liveFocus?.booking.id]);
```

Import `useRef`, remove `TodayNowStrip`, pass the live props to `BookingFeed`, and never call `.focus()` during automatic positioning. Reset the ref when leaving today so returning to today scrolls again.

- [ ] **Step 5: Remove the old strip and obsolete engine exports/tests**

Delete `TodayNowStrip.jsx`, its import, its component tests, and the now-unused `selectNowNext` family after `rg -n "TodayNowStrip|selectNowNext|DUE_SOON_MINUTES" src` returns only deliberate historical comments or nothing.

- [ ] **Step 6: Run focused tests and typecheck**

Run: `npm run test:logic -- src/engine/today.test.ts && npm run test:component -- src/components/views/today/today.component.test.jsx && npm run typecheck`

Expected: PASS with no old strip references.

- [ ] **Step 7: Commit the live-marker slice**

```bash
git add src/engine/today.ts src/engine/today.test.ts src/components/views/TodayView.jsx src/components/views/today/BookingFeed.jsx src/components/views/today/today.component.test.jsx
git rm src/components/views/today/TodayNowStrip.jsx
git commit -m "feat(today): anchor the live booking in the feed"
```

---

### Task 4: Collapse collection journey to one Ready action

**Files:**
- Modify: `src/engine/dailyBrief.ts:10-112`
- Modify: `src/engine/dailyBrief.test.ts:36-121`
- Modify: `src/components/views/today/BookingJourneyRow.jsx:1-44,128-160`
- Modify: `src/components/views/today/BookingFeed.jsx:1-21`
- Modify: `src/components/views/today/today.component.test.jsx:550-700`

**Interfaces:**
- Produces: `JourneyActionId` without `messageCollection`; Booked through In-bath journeys always contain `ready`, then Ready-and-later contains `waiting`.

- [ ] **Step 1: Change journey tests to the approved five-action model**

```ts
expect(buildJourneyActions(booking()).map((action) => action.id)).toEqual([
  "checkIn", "startGroom", "ready", "collected", "paid",
]);
expect(buildJourneyActions(booking({ status: BOOKING_STATUS.READY_FOR_PICKUP })).map((action) => action.id)).toEqual([
  "checkIn", "startGroom", "waiting", "collected", "paid",
]);
```

Update DOM-order expectations to time + five journey actions + owner message, and assert the action key omits `Collection message`.

- [ ] **Step 2: Run logic and component tests to verify failure**

Run: `npm run test:logic -- src/engine/dailyBrief.test.ts && npm run test:component -- src/components/views/today/today.component.test.jsx`

Expected: FAIL because `messageCollection` and the Send icon still exist.

- [ ] **Step 3: Remove the action and recalculate grid centres from data**

Remove `messageCollection` from `JourneyActionId`, `buildJourneyActions`, `ACTION_ICONS`, Lucide imports, and `ACTION_KEY`. Replace the hard-coded `data-centres` branch with:

```jsx
data-centres={journey.length + 2}
style={{ "--journey-centres": journey.length + 2 }}
```

- [ ] **Step 4: Run tests and commit**

Run: `npm run test:logic -- src/engine/dailyBrief.test.ts && npm run test:component -- src/components/views/today/today.component.test.jsx`

Expected: PASS with seven centres both before and after readiness.

```bash
git add src/engine/dailyBrief.ts src/engine/dailyBrief.test.ts src/components/views/today/BookingJourneyRow.jsx src/components/views/today/BookingFeed.jsx src/components/views/today/today.component.test.jsx
git commit -m "refactor(today): use one collection readiness action"
```

---

### Task 5: Save Ready before offering optional messaging

**Files:**
- Modify: `src/components/views/TodayView.jsx:239-303`
- Modify: `src/App.jsx:587-596,1089-1091,1385-1405`
- Modify: `src/components/modals/collection-notice/CollectionNoticeModal.jsx:35-340`
- Modify: `src/components/modals/collection-notice/CollectionNoticeModal.component.test.jsx`
- Modify: `src/components/modals/collection-notice/CollectionNoticeModal.offline.component.test.jsx`
- Modify: `src/components/views/today/today.component.test.jsx`

**Interfaces:**
- `TodayView.onSendCollection(booking)` opens the modal for an already-ready booking and never owns a second status mutation.
- `CollectionNoticeModal` takes `{ booking, onClose }`; remove the readiness-coupled `onSent` callback.

- [ ] **Step 1: Add failing modal opt-in tests**

```jsx
it("asks before loading recipient controls", async () => {
  renderModal();
  expect(screen.getByText(/message their humans/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Send message" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Not now" })).toBeInTheDocument();
  expect(screen.queryByLabelText("Minutes until ready for collection")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Send message" }));
  expect(await screen.findByLabelText("Minutes until ready for collection")).toHaveValue(15);
});

it("keeps Ready when sending fails", async () => {
  invoke.mockResolvedValue({ data: { error: "WhatsApp send failed", detail: "Message undeliverable" }, error: null });
  renderModal();
  fireEvent.click(screen.getByRole("button", { name: "Send message" }));
  fireEvent.click(await screen.findByRole("button", { name: "Send" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Message undeliverable");
  expect(screen.getByRole("heading", { name: /is ready/i })).toBeInTheDocument();
});
```

- [ ] **Step 2: Add a failing Today action-order test**

```jsx
it("opens collection messaging only after Ready saves", async () => {
  onUpdateBooking.mockResolvedValue({ id: "b1", status: "Ready for pick-up" });
  fireEvent.click(screen.getByRole("button", { name: "Ready for collection" }));
  await waitFor(() => expect(onUpdateBooking).toHaveBeenCalledWith(expect.objectContaining({ status: "Ready for pick-up" }), expect.anything(), expect.anything()));
  expect(onSendCollection).toHaveBeenCalledWith(expect.objectContaining({ id: "b1" }));
});
```

Add the complementary failure case asserting `onSendCollection` is not called.

- [ ] **Step 3: Run focused tests and confirm failure**

Run: `npm run test:component -- src/components/modals/collection-notice/CollectionNoticeModal.component.test.jsx src/components/modals/collection-notice/CollectionNoticeModal.offline.component.test.jsx src/components/views/today/today.component.test.jsx`

Expected: FAIL because the modal immediately shows recipients and App still marks Ready after send.

- [ ] **Step 4: Make the Ready handler await the save, then open messaging**

```jsx
if (action.id === "ready") {
  const saved = await updateStatus(
    booking,
    BOOKING_STATUS.READY_FOR_PICKUP,
    `${booking.dogName} is waiting to be collected`,
    "Ready for collection could not be saved.",
    { skipCollectionPrompt: true, skipConfirmation: true },
  );
  if (saved) onSendCollection({ ...booking, ...saved, status: BOOKING_STATUS.READY_FOR_PICKUP });
  return saved;
}
```

Make `onJourneyAction` async and remove the dead `messageCollection` branch.

- [ ] **Step 5: Add an initial prompt state to the existing modal**

```jsx
const [step, setStep] = useState("ask");

const askBody = (
  <div className="flex flex-col gap-4">
    <p className="text-[13px] text-slate-700">
      Would you like to message their humans to let them know they&apos;re nearly ready?
    </p>
    <div className="grid grid-cols-2 gap-2">
      <button type="button" className="min-h-11 rounded-full bg-brand-purple px-4 font-bold text-white" onClick={() => setStep("compose")}>Send message</button>
      <button type="button" className="min-h-11 rounded-full border border-slate-200 px-4 font-bold text-slate-700" onClick={() => onClose?.()}>Not now</button>
    </div>
  </div>
);
```

Render `askBody` inside the same `ModalShell` while `step === "ask"`; render the existing minutes, preview and recipient list while `step === "compose"`. Start contact queries only when `step === "compose"`. Remove `readyNotifiedRef`, `onSent`, and the misleading “message sent but could not be marked ready” error.

- [ ] **Step 6: Simplify App modal ownership**

Store only `{ booking }` in `collectionNotice`. Remove `markReadyOnSend` and the `onSent` status-update block. Keep the central `useBookings.onReadyForPickup` path opening the same optional prompt for status changes made elsewhere.

- [ ] **Step 7: Run component suite and commit**

Run: `npm run test:component -- src/components/modals/collection-notice/CollectionNoticeModal.component.test.jsx src/components/modals/collection-notice/CollectionNoticeModal.offline.component.test.jsx src/components/views/today/today.component.test.jsx`

Expected: PASS for opt-in, decline, offline, send success/failure, and Ready-save ordering.

```bash
git add src/App.jsx src/components/views/TodayView.jsx src/components/modals/collection-notice/CollectionNoticeModal.jsx src/components/modals/collection-notice/CollectionNoticeModal.component.test.jsx src/components/modals/collection-notice/CollectionNoticeModal.offline.component.test.jsx src/components/views/today/today.component.test.jsx
git commit -m "feat(today): offer messaging after marking ready"
```

---

### Task 6: Integrated Daily Brief verification

**Files:**
- Modify: `e2e/daily-brief.spec.ts`
- Modify only if contract text changed: `e2e/smoke.spec.ts`

**Interfaces:**
- Verifies the complete Daily Brief behaviour produced by Tasks 1-5.

- [ ] **Step 1: Add an end-to-end journey covering focus, green state and collection prompt**

```ts
test("live arrival advances without a duplicate Now panel", async ({ page }) => {
  await page.goto("/today?date=2026-07-15");
  await expect(page.getByLabel(/due to arrive|overdue/i)).toBeVisible();
  await expect(page.getByRole("region", { name: "Happening now" })).toHaveCount(0);
  expect(await page.locator('[data-journey-tone="success"]').count()).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Ready for collection" }).first().click();
  await expect(page.getByRole("button", { name: "Send message" })).toBeVisible();
  await page.getByRole("button", { name: "Not now" }).click();
  await expect(page.getByRole("button", { name: "Waiting to be collected" }).first()).toBeVisible();
});
```

Use the file's existing `SAMPLE_NOW` (`2026-07-14T09:15:00+01:00`) and route `/today?date=2026-07-14` so the test shares the established deterministic fixture contract.

- [ ] **Step 2: Run the focused browser test**

Run: `npx playwright test e2e/daily-brief.spec.ts --project=chromium`

Expected: PASS in the configured `desktop`, `tablet`, and `mobile` Chromium projects.

- [ ] **Step 3: Run full engineering verification**

Run: `npm test && npm run typecheck && npm run lint && npm run build`

Expected: all Vitest projects pass, TypeScript emits no errors, ESLint/import/duplicate checks pass, and Vite production build completes.

- [ ] **Step 4: Commit verification**

```bash
git add e2e/daily-brief.spec.ts e2e/smoke.spec.ts
git commit -m "test(today): cover live arrival and collection flow"
```

# Today KPI Accuracy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the misleading “Dogs in” count with an accurate on-site count while retaining the booked total in the same card.

**Architecture:** Derive `onSite` once in the pure Today summary engine, then pass it to the live Today KPI. The next-open-day brief deliberately omits `onSite`, causing the shared KPI to show only “Booked” because an on-site figure is meaningless for a future date.

**Tech Stack:** TypeScript domain engine, React, Vitest, Testing Library.

## Global Constraints

- “On site” means checked in, in bath, or ready for pick-up; completed/collected dogs are excluded.
- Cancelled bookings remain excluded from every Today total.
- The first KPI card shows `On site` as the primary value and `{n} booked today` as supporting text on the live Today screen.
- The next-open-day brief shows `Booked` as its primary label and does not show an on-site value.
- Capacity continues to use total booked dogs, not on-site dogs.

---

### Task 1: Add `onSite` to the day summary

**Files:**
- Modify: `src/engine/today.ts:350-405`
- Test: `src/engine/today.test.ts:273-310`

**Interfaces:**
- Produces: `DaySummary.onSite: number`
- Consumes: existing `statusRank`, `BOOKING_STATUS.COMPLETED`, and countable bookings.

- [ ] **Step 1: Write the failing engine assertions**

Add `expect(s.onSite).toBe(2)` to the mixed-status summary test: Checked in and Ready are on site; Booked and Completed are not. Add this focused guard:

```ts
it("counts only dogs physically on site", () => {
  const summary = buildDaySummary([
    bk({ status: "Booked" }),
    bk({ status: "Checked in" }),
    bk({ status: "In bath" }),
    bk({ status: "Ready for pick-up" }),
    bk({ status: "Completed" }),
    bk({ status: "Cancelled" }),
  ]);

  expect(summary.dogsBooked).toBe(5);
  expect(summary.onSite).toBe(3);
});
```

- [ ] **Step 2: Run the engine test and verify it fails**

Run: `npm test -- src/engine/today.test.ts`

Expected: FAIL because `DaySummary` does not yet expose `onSite`.

- [ ] **Step 3: Implement the summary field**

Add the field and counter in `buildDaySummary`:

```ts
export interface DaySummary {
  total: number;
  expected: number;
  arrived: number;
  onSite: number;
  ready: number;
  collected: number;
  unpaidCount: number;
  dogsBooked: number;
  capacityUsedPct: number;
  expectedRevenue: number;
  collectedRevenue: number;
}
```

```ts
let onSite = 0;

for (const b of countable) {
  const rank = Math.max(0, statusRank(b.status));
  if (rank === 0) expected++;
  if (rank >= 1) arrived++;
  if (rank >= 1 && b.status !== BOOKING_STATUS.COMPLETED) onSite++;
  if (b.status === BOOKING_STATUS.READY_FOR_PICKUP) ready++;
  if (b.status === BOOKING_STATUS.COMPLETED) collected++;
  if ((b.payment || "Due at Pick-up") !== "Paid in Full") unpaidCount++;
}
```

Include `onSite` in the returned object.

- [ ] **Step 4: Run the engine test and verify it passes**

Run: `npm test -- src/engine/today.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the engine change**

```bash
git add src/engine/today.ts src/engine/today.test.ts
git commit -m "fix: derive actual dogs on site"
```

### Task 2: Render the combined live KPI and future-safe brief

**Files:**
- Modify: `src/components/views/today/TodayKpiRow.jsx:18-40`
- Modify: `src/components/views/TodayView.jsx:115-128`
- Modify: `src/components/views/TodayView.jsx:385-400`
- Test: `src/components/views/today/parts.component.test.jsx:165-184`

**Interfaces:**
- Consumes: `TodayKpiRow({ dogsBooked, onSite?, expectedRevenue })`
- Produces: live `On site` KPI with booked hint; future `Booked` KPI without an on-site hint.

- [ ] **Step 1: Write failing component tests for both modes**

Replace the existing first KPI test with:

```jsx
it("shows on-site dogs with the booked total and keeps capacity booked-based", () => {
  render(<TodayKpiRow dogsBooked={11} onSite={3} expectedRevenue={478.4} />);
  expect(screen.getByText("On site").parentElement).toHaveTextContent("3");
  expect(screen.getByText("11 booked today")).toBeInTheDocument();
  expect(screen.getByText("£478")).toBeInTheDocument();
  const bar = screen.getByRole("progressbar", { name: /capacity/i });
  expect(bar).toHaveAttribute("aria-valuenow", "11");
});

it("shows a booked-only card when onSite is omitted for a future brief", () => {
  render(<TodayKpiRow dogsBooked={6} expectedRevenue={252} />);
  expect(screen.getByText("Booked").parentElement).toHaveTextContent("6");
  expect(screen.queryByText("On site")).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the component test and verify it fails**

Run: `npm test -- src/components/views/today/parts.component.test.jsx`

Expected: FAIL because `TodayKpiRow` still renders “Dogs in”.

- [ ] **Step 3: Implement the conditional first KPI**

Change the component signature from:

```jsx
export function TodayKpiRow({ dogsBooked, expectedRevenue }) {
```

to:

```jsx
export function TodayKpiRow({ dogsBooked, onSite, expectedRevenue }) {
  const pct = Math.min(100, Math.round((dogsBooked / DAY_CAPACITY) * 100));
  const isLiveDay = Number.isFinite(onSite);
```

Replace only the existing `Dogs in` card with:

```jsx
<KpiCard
  label={isLiveDay ? "On site" : "Booked"}
  hint={isLiveDay ? `${dogsBooked} booked today` : undefined}
>
  {isLiveDay ? onSite : dogsBooked}
</KpiCard>
```

Pass `onSite={summary.onSite}` only in the live-day call in `TodayView`. Leave the `ClosedDayBrief` call without `onSite`.

- [ ] **Step 4: Run Today tests**

Run: `npm test -- src/components/views/today/parts.component.test.jsx src/components/views/today/today.component.test.jsx`

Expected: PASS.

- [ ] **Step 5: Verify the responsive card copy**

Run the app in offline sample mode and inspect `/today` at 1440×900, 768×1024, and 390×844. Confirm “On site”, the main number, and “n booked today” fit without collision and that Capacity still matches booked dogs.

- [ ] **Step 6: Commit the UI change**

```bash
git add src/components/views/today/TodayKpiRow.jsx src/components/views/TodayView.jsx src/components/views/today/parts.component.test.jsx
git commit -m "fix: clarify booked and on-site dogs"
```

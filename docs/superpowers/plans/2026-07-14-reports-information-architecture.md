# Reports Information Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split weekly cash-up and analytics into distinct routes, then make Insights concise by showing the decision-making overview first and keeping secondary reports behind an explicit disclosure.

**Architecture:** A new Reports layout owns the title and local navigation, with nested `cash-up` and `insights` routes. Cash-up mounts only weekly cash-up data; Insights owns the existing analytics hook, keeps period selection and KPI/Key Insights visible, and lazily reveals the existing detailed report components after the user expands them.

**Tech Stack:** React Router 7, React, existing report components, Vitest, Testing Library.

## Global Constraints

- `/reports` redirects to `/reports/cash-up`.
- `/reports/cash-up` and `/reports/insights` are directly linkable and preserve the main Reports navigation state.
- Local navigation labels are `Cash-up` and `Insights`.
- Cash-up does not initialise analytics hooks.
- Insights overview always shows the reporting period, low-sample warning, KPI row, and Key Insights.
- `Detailed reports` is collapsed by default and uses a real button with `aria-expanded` and `aria-controls`.
- Existing report calculations and period query parameter behaviour remain unchanged.

---

### Task 1: Create the Reports layout and nested routes

**Files:**
- Create: `src/components/views/reports/ReportsLayout.jsx`
- Create: `src/components/views/reports/CashUpView.jsx`
- Create from the analytics portion of: `src/components/views/reports/ReportsInsightsView.jsx`
- Delete after its analytics content has moved: `src/components/views/ReportsView.jsx`
- Modify: `src/App.jsx:115-130,1038-1050`
- Modify: `src/components/layout/navConfig.jsx:100-112`
- Create: `src/components/views/reports/ReportsLayout.component.test.jsx`

**Interfaces:**
- Produces: `ReportsLayout`, `CashUpView`, `ReportsInsightsView` named exports.
- Routes: `/reports/cash-up`, `/reports/insights`, `/reports` redirect.

- [ ] **Step 1: Write the failing layout navigation test**

```jsx
it("navigates between Cash-up and Insights with nested routes", async () => {
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={["/reports/cash-up"]}>
      <Routes>
        <Route path="/reports" element={<ReportsLayout />}>
          <Route path="cash-up" element={<div>Cash-up body</div>} />
          <Route path="insights" element={<div>Insights body</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );

  expect(screen.getByRole("link", { name: "Cash-up" })).toHaveAttribute("aria-current", "page");
  await user.click(screen.getByRole("link", { name: "Insights" }));
  expect(screen.getByText("Insights body")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Insights" })).toHaveAttribute("aria-current", "page");
});
```

- [ ] **Step 2: Run the new test and verify it fails**

Run: `npm test -- src/components/views/reports/ReportsLayout.component.test.jsx`

Expected: FAIL because the layout does not exist.

- [ ] **Step 3: Implement the layout**

```jsx
import { NavLink, Outlet } from "react-router-dom";

const REPORT_SECTIONS = [
  { to: "/reports/cash-up", label: "Cash-up" },
  { to: "/reports/insights", label: "Insights" },
];

export function ReportsLayout() {
  return (
    <div className="py-2.5 flex flex-col gap-3 sm:gap-4">
      <h1 className="text-lg sm:text-xl md:text-[22px] font-extrabold m-0 text-slate-800 font-display leading-tight">
        Reports
      </h1>
      <nav aria-label="Report sections" className="inline-flex self-start rounded-control bg-slate-100 p-1">
        {REPORT_SECTIONS.map((section) => (
          <NavLink
            key={section.to}
            to={section.to}
            className={({ isActive }) => isActive
              ? "min-h-[44px] inline-flex items-center rounded-md bg-white px-4 text-sm font-bold text-brand-purple shadow-sm no-underline"
              : "min-h-[44px] inline-flex items-center rounded-md px-4 text-sm font-semibold text-slate-600 no-underline hover:text-slate-800"}
          >
            {section.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
```

- [ ] **Step 4: Create the cash-up route component**

```jsx
import { WeeklyCashUp } from "./WeeklyCashUp.jsx";

export function CashUpView() {
  return <WeeklyCashUp />;
}
```

The existing `WeeklyCashUp` purple header remains the route’s `h2` and retains its explanatory subtitle, so no duplicated heading is introduced.

- [ ] **Step 5: Wire nested routes**

Lazy-load the three exports in `App.jsx`:

```jsx
const ReportsLayout = lazy(() =>
  import("./components/views/reports/ReportsLayout.jsx").then((module) => ({ default: module.ReportsLayout })),
);
const CashUpView = lazy(() =>
  import("./components/views/reports/CashUpView.jsx").then((module) => ({ default: module.CashUpView })),
);
const ReportsInsightsView = lazy(() =>
  import("./components/views/reports/ReportsInsightsView.jsx").then((module) => ({ default: module.ReportsInsightsView })),
);
```

Add this entry before the `/` catch-all in `ROUTE_CHUNK_IMPORTS`:

```jsx
["/reports", () => import("./components/views/reports/ReportsLayout.jsx")],
```

Replace the single route with:

```jsx
<Route path="/reports" element={<ReportsLayout />}>
  <Route index element={<Navigate to="cash-up" replace />} />
  <Route path="cash-up" element={<CashUpView />} />
  <Route path="insights" element={<ReportsInsightsView loadError={be || de || he} />} />
</Route>
```

Keep `PRIMARY_NAV.to` as `/reports`; React Router will mark it active for nested report paths. Change `sectionTitleFor` from `Cash-up & reports` to `Reports`.

- [ ] **Step 6: Run layout and smoke tests**

Run: `npm test -- src/components/views/reports/ReportsLayout.component.test.jsx src/test/smoke.component.test.tsx`

Expected: PASS.

- [ ] **Step 7: Commit route separation**

```bash
git add src/App.jsx src/components/layout/navConfig.jsx src/components/views/ReportsView.jsx src/components/views/reports/ReportsLayout.jsx src/components/views/reports/CashUpView.jsx src/components/views/reports/ReportsInsightsView.jsx src/components/views/reports/ReportsLayout.component.test.jsx
git commit -m "feat: split cash-up and insights routes"
```

### Task 2: Create a concise Insights overview with expandable detail

**Files:**
- Modify: `src/components/views/reports/ReportsInsightsView.jsx`
- Modify: `src/components/views/reports/ReportWidgets.jsx`
- Create: `src/components/views/reports/ReportWidgets.component.test.jsx`

**Interfaces:**
- Produces: `DetailedReportsDisclosure({ children })` and `#detailed-reports` region.
- Consumes: unchanged `useReportsData(days, reportSource)` result.

- [ ] **Step 1: Write failing disclosure tests**

Test the disclosure component directly:

```jsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { DetailedReportsDisclosure } from "./ReportWidgets.jsx";

it("shows the overview and keeps detailed reports collapsed initially", () => {
  render(<DetailedReportsDisclosure><p>Service mix report</p></DetailedReportsDisclosure>);
  expect(screen.getByRole("button", { name: "Show detailed reports" })).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByText("Service mix report")).not.toBeInTheDocument();
});

it("reveals and hides detailed reports", async () => {
  const user = userEvent.setup();
  render(<DetailedReportsDisclosure><p>Service mix report</p></DetailedReportsDisclosure>);
  const toggle = screen.getByRole("button", { name: "Show detailed reports" });
  await user.click(toggle);
  expect(toggle).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByText("Service mix report")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Hide detailed reports" }));
  expect(screen.queryByText("Service mix report")).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the Insights test and verify it fails**

Run: `npm test -- src/components/views/reports/ReportWidgets.component.test.jsx`

Expected: FAIL because every report is currently mounted in one long page.

- [ ] **Step 3: Keep only decision-making content in the overview**

Retain, in order:

1. `Reports analytics` heading and period control.
2. Low-sample warning.
3. Loading/error/empty state.
4. Four KPI cards.
5. `KeyInsights` as the always-visible overview card.

Move Revenue Trend, Service Mix, Demand Pattern, Customer Ranking, Booking Health, Slot Fill, Service Value, Outcomes, Source Mix, Retention, Capacity Prevented, Funnel, and Collected by Method into the detailed region.

- [ ] **Step 4: Add the disclosure**

Add this exported component to `ReportWidgets.jsx`:

```jsx
export function DetailedReportsDisclosure({ children }) {
  const [expanded, setExpanded] = useState(false);
  return (
<div className="rounded-2xl border border-slate-200 bg-white shadow-card-resting overflow-hidden">
  <button
    type="button"
    aria-expanded={expanded}
    aria-controls="detailed-reports"
    onClick={() => setExpanded((open) => !open)}
    className="w-full min-h-[56px] flex items-center justify-between gap-3 px-5 py-3 bg-white text-left text-sm font-extrabold text-brand-purple"
  >
    <span>{expanded ? "Hide detailed reports" : "Show detailed reports"}</span>
    <span aria-hidden="true">{expanded ? "−" : "+"}</span>
  </button>
  {expanded && (
    <div id="detailed-reports" className="border-t border-slate-100 p-3 sm:p-4 flex flex-col gap-3 sm:gap-4">
      {children}
    </div>
  )}
</div>
  );
}
```

Wrap the current detailed report JSX in `ReportsInsightsView` with:

```jsx
<DetailedReportsDisclosure>
  <ReportsExpandAllContext.Provider value={compact ? allExpanded : null}>
    {compact && (
      <div className="flex justify-end -mt-1 -mb-1">
        <button
          type="button"
          onClick={() => setAllExpanded((value) => !value)}
          aria-expanded={allExpanded}
          className="inline-flex items-center gap-1 min-h-[36px] px-2 bg-transparent border-none cursor-pointer text-xs font-bold text-brand-purple hover:text-brand-purple/70 font-[inherit]"
        >
          {allExpanded ? "Collapse all" : "Expand all"}
        </button>
      </div>
    )}
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
      <RevenueTrend days={days} chart={stats.chart} maxChartRev={stats.maxChartRev} chartLabels={chartLabels} insight={insights.capacity} />
      <ServiceMix svcs={stats.svcs} maxSvcRev={stats.maxSvcRev} insight={insights.service} />
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
      <DemandPattern dow={stats.dow} maxDowN={stats.maxDowN} busiestDay={stats.busiestDay} slots={stats.slots} maxSlotN={stats.maxSlotN} busiestSlot={stats.busiestSlot} dayInsight={insights.day} />
      <CustomerRanking topCusts={stats.topCusts} uniqueCusts={stats.uniqueCusts} revPerCust={stats.revPerCust} />
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
      <BookingHealth statusAcc={stats.statusAcc} totalPast={stats.totalPast} noShowN={stats.noShowN} noShowRate={stats.noShowRate} prevNoShowRate={stats.prevNoShowRate} insight={insights.health} />
      <SlotFillReport slotFill={analytics.slotFill} slotLevers={analytics.slotLevers} />
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
      <ServiceValueReport serviceValue={analytics.serviceValue} />
      <OutcomesReport outcomes={analytics.outcomes} />
    </div>
    <SourceMixReport sourceMix={analytics.sourceMix} />
    <RetentionReport />
    <CapacityPreventedReport days={days} />
    <FunnelReport days={days} />
    <CollectedByMethodReport collectedByMethod={analytics.collectedByMethod} />
  </ReportsExpandAllContext.Provider>
</DetailedReportsDisclosure>
```

Render `KeyInsights` by itself immediately after the KPI row so it remains part of the concise overview.

- [ ] **Step 5: Run Insights and analytics tests**

Run: `npm test -- src/components/views/reports/ReportWidgets.component.test.jsx src/hooks/useReportsData.test.ts src/engine/reportsAnalytics.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit concise Insights**

```bash
git add src/components/views/reports/ReportsInsightsView.jsx src/components/views/reports/ReportWidgets.jsx src/components/views/reports/ReportWidgets.component.test.jsx
git commit -m "feat: add concise expandable reports overview"
```

### Task 3: Verify route, loading, empty, and responsive states

**Files:**
- No source change expected.

- [ ] **Step 1: Verify direct routes**

Open `/reports`, `/reports/cash-up`, and `/reports/insights?period=90`. Confirm the redirect, local active state, main Reports navigation state, and query parameter all survive reloads.

- [ ] **Step 2: Verify data boundaries**

Use component mocks or network inspection to confirm Cash-up does not call `useReportsData`, while Insights does not mount `WeeklyCashUp`.

- [ ] **Step 3: Verify responsive behaviour**

At 1440×900, 768×1024, and 390×844, confirm the two local links remain readable, overview content is visible without expanding details, and the detailed toggle has a 44px minimum target.

- [ ] **Step 4: Run route-level quality gates**

Run: `npm run typecheck && npm run lint && npm run build`

Expected: all commands exit 0.

import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useReportsData } from "../../hooks/useReportsData.ts";
import { SkeletonKpiRow, SkeletonChart, EmptyState, Card } from "../ui/index.js";
import { ErrorBanner } from "../ui/ErrorBanner.jsx";
import { Kpi, PERIODS } from "./reports/ReportWidgets.jsx";
import { RevenueTrend } from "./reports/RevenueTrend.jsx";
import { ServiceMix } from "./reports/ServiceMix.jsx";
import { DemandPattern } from "./reports/DemandPattern.jsx";
import { KeyInsights } from "./reports/KeyInsights.jsx";
import { CustomerRanking } from "./reports/CustomerRanking.jsx";
import { BookingHealth } from "./reports/BookingHealth.jsx";
import { WeeklyCashUp } from "./reports/WeeklyCashUp.jsx";
import { SlotFillReport } from "./reports/SlotFillReport.jsx";
import { ServiceValueReport } from "./reports/ServiceValueReport.jsx";
import { OutcomesReport } from "./reports/OutcomesReport.jsx";
import { SourceMixReport } from "./reports/SourceMixReport.jsx";
import { RetentionReport } from "./reports/RetentionReport.jsx";
import { CapacityPreventedReport } from "./reports/CapacityPreventedReport.jsx";
import { CollectedByMethodReport } from "./reports/CollectedByMethodReport.jsx";
import { useSalon } from "../../contexts/SalonContext";

const ALLOWED_PERIODS = [7, 30, 90];
const DEFAULT_PERIOD = 30;

function parsePeriod(value) {
  const n = Number(value);
  return ALLOWED_PERIODS.includes(n) ? n : null;
}

export function ReportsView({ loadError = null }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const days = parsePeriod(searchParams.get("period")) ?? DEFAULT_PERIOD;
  const setDays = useCallback(
    (v) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("period", String(v));
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );
  const { bookingsByDate, dogs, humans } = useSalon();
  const reportSource = useMemo(
    () => ({
      bookingsByDate,
      dogs,
      humans,
    }),
    [bookingsByDate, dogs, humans],
  );
  const { loading, stats, chartLabels, insights, analytics } = useReportsData(days, reportSource);

  const activePeriod = PERIODS.find((p) => p.v === days) ?? PERIODS[1];
  // Below this threshold, period-over-period deltas read like noise —
  // a single booking can swing a percentage by hundreds of points. Hide
  // them across the page and tell the user why.
  const LOW_N_THRESHOLD = 5;
  const isLowN = stats.curN > 0 && stats.curN < LOW_N_THRESHOLD;

  return (
    <div className="py-2.5 flex flex-col gap-3 sm:gap-4">
      {/* Page title */}
      <h1 className="text-lg sm:text-xl md:text-[22px] font-extrabold m-0 text-slate-800 font-display leading-tight">
        Cash-up &amp; reports
      </h1>

      {/* Part A — Weekly cash-up (its own week selector, expected takings) */}
      <WeeklyCashUp />

      {/* Divider between the cash-up sheet and the analytics dashboard */}
      <div className="flex items-center gap-3 pt-1">
        <div className="h-px bg-slate-200 flex-1" />
        <span className="text-label text-ink-muted">Reports &amp; insights</span>
        <div className="h-px bg-slate-200 flex-1" />
      </div>

      {/* Part B — Analytics: period control (scopes the analytics below only) */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base sm:text-lg font-extrabold m-0 text-slate-800 font-display leading-tight">
            Reports analytics
          </h2>
          <p className="text-caption sm:text-xs text-slate-500 font-medium m-0 mt-0.5">
            Open days only · showing last {activePeriod.l.toLowerCase()}
          </p>
        </div>
        <div
          className="flex bg-slate-100 p-1 rounded-lg shrink-0"
          role="group"
          aria-label="Reporting period"
        >
          {PERIODS.map((p) => {
            const selected = days === p.v;
            return (
              <button
                key={p.v}
                onClick={() => setDays(p.v)}
                type="button"
                aria-pressed={selected}
                aria-label={`Show last ${p.l}`}
                className={`min-h-[44px] inline-flex items-center justify-center px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-md text-caption sm:text-xs font-bold border-none cursor-pointer transition-all font-[inherit] ${
                  selected
                    ? "bg-white text-slate-800 shadow-sm"
                    : "bg-transparent text-slate-600 hover:text-slate-800"
                }`}
              >
                {p.l}
              </button>
            );
          })}
        </div>
      </div>

      {isLowN && (
        <div
          role="status"
          className="rounded-xl border border-amber-200 bg-amber-50 text-amber-900 text-xs font-medium px-3 py-2"
        >
          Not enough bookings to compare periods just yet — showing numbers only.
          Comparisons hidden until there are {LOW_N_THRESHOLD}+ bookings.
        </div>
      )}

      {loading ? (
        <div className="flex flex-col gap-3 sm:gap-4">
          <SkeletonKpiRow />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
            <SkeletonChart />
            <SkeletonChart />
          </div>
        </div>
      ) : loadError && stats.curN === 0 ? (
        <ErrorBanner
          title="We can't load the reports right now"
          message="The booking data didn't load. Refresh to have another go."
          retry={() => window.location.reload()}
          retryLabel="Refresh"
        />
      ) : stats.curN === 0 ? (
        <Card padding="none">
          <EmptyState
            icon="📊"
            title="No bookings in this period"
            description="Try a longer time range."
          />
        </Card>
      ) : (
        <>
          {/* Band 3 — KPI row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi
              label="Expected"
              value={`£${stats.curRev.toFixed(0)}`}
              sub={
                stats.curDue > 0
                  ? `£${stats.curDue.toFixed(0)} still to collect · vs £${stats.prevRev.toFixed(0)} prev period`
                  : `all collected · vs £${stats.prevRev.toFixed(0)} prev period`
              }
              cur={stats.curRev}
              prev={stats.prevRev}
              hideDelta={isLowN}
              color="var(--color-brand-teal)"
            />
            <Kpi
              label="Bookings"
              value={stats.curN}
              sub={`${stats.uniqueCusts} ${stats.uniqueCusts === 1 ? "customer" : "customers"}`}
              cur={stats.curN}
              prev={stats.prevN}
              hideDelta={isLowN}
              color="#10C2FC"
            />
            <Kpi
              label="Avg per Dog"
              value={`£${stats.avgPer.toFixed(0)}`}
              sub="expected, incl. add-ons"
              cur={stats.avgPer}
              prev={stats.prevAvgPer}
              hideDelta={isLowN}
              color="#7C3AED"
            />
            <Kpi
              label="Capacity"
              value={`${stats.util.toFixed(0)}%`}
              sub={`of the 14/day limit · ${stats.openDays} open ${stats.openDays === 1 ? "day" : "days"}, last ${days} days`}
              color="var(--color-brand-coral)"
            />
          </div>

          {/* Band 4 — Trend + Key Insights */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
            <RevenueTrend
              days={days}
              chart={stats.chart}
              maxChartRev={stats.maxChartRev}
              chartLabels={chartLabels}
              insight={insights.capacity}
            />
            <KeyInsights stats={stats} insights={insights} days={days} />
          </div>

          {/* Band 5 — Service Mix + Demand Pattern */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
            <ServiceMix svcs={stats.svcs} maxSvcRev={stats.maxSvcRev} insight={insights.service} />
            <DemandPattern
              dow={stats.dow}
              maxDowN={stats.maxDowN}
              busiestDay={stats.busiestDay}
              slots={stats.slots}
              maxSlotN={stats.maxSlotN}
              busiestSlot={stats.busiestSlot}
              dayInsight={insights.day}
            />
          </div>

          {/* Band 6 — Customers + Booking Health */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
            <CustomerRanking
              topCusts={stats.topCusts}
              uniqueCusts={stats.uniqueCusts}
              revPerCust={stats.revPerCust}
            />
            <BookingHealth
              statusAcc={stats.statusAcc}
              totalPast={stats.totalPast}
              noShowN={stats.noShowN}
              noShowRate={stats.noShowRate}
              prevNoShowRate={stats.prevNoShowRate}
              insight={insights.health}
            />
          </div>

          {/* Band 7 — Hardest to fill + Value per hour by service */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
            <SlotFillReport slotFill={analytics.slotFill} slotLevers={analytics.slotLevers} />
            <ServiceValueReport serviceValue={analytics.serviceValue} />
          </div>

          {/* Band 8 — Outcomes + Booking source */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
            <OutcomesReport outcomes={analytics.outcomes} />
            <SourceMixReport sourceMix={analytics.sourceMix} />
          </div>

          {/* Band 9 — Retention (self-fetching, spans all booking history) */}
          <RetentionReport />

          {/* Band 10 — Capacity-prevented demand (self-fetching booking_denials) */}
          <CapacityPreventedReport days={days} />

          {/* Band — Collected by method (recorded takings, improvement #3) */}
          <CollectedByMethodReport collectedByMethod={analytics.collectedByMethod} />
        </>
      )}
    </div>
  );
}

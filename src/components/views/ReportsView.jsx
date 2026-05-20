import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useReportsData } from "../../hooks/useReportsData.ts";
import { LoadingSpinner } from "../ui/LoadingSpinner.jsx";
import { ErrorBanner } from "../ui/ErrorBanner.jsx";
import { Kpi, PERIODS } from "./reports/ReportWidgets.jsx";
import { RevenueTrend } from "./reports/RevenueTrend.jsx";
import { ServiceMix } from "./reports/ServiceMix.jsx";
import { DemandPattern } from "./reports/DemandPattern.jsx";
import { KeyInsights } from "./reports/KeyInsights.jsx";
import { CustomerRanking } from "./reports/CustomerRanking.jsx";
import { BookingHealth } from "./reports/BookingHealth.jsx";
import { WeeklySnapshot } from "./reports/WeeklySnapshot.jsx";
import { useSalon } from "../../contexts/SalonContext.js";

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
  const { loading, stats, chartLabels, insights } = useReportsData(days, reportSource);

  const activePeriod = PERIODS.find((p) => p.v === days) ?? PERIODS[1];
  // Below this threshold, period-over-period deltas read like noise —
  // a single booking can swing a percentage by hundreds of points. Hide
  // them across the page and tell the user why.
  const LOW_N_THRESHOLD = 5;
  const isLowN = stats.curN > 0 && stats.curN < LOW_N_THRESHOLD;

  return (
    <div className="py-2.5 flex flex-col gap-3 sm:gap-4">
      {/* Band 1 — Page title + period control */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-xl md:text-[22px] font-extrabold m-0 text-slate-800 font-display leading-tight">
            Reports
          </h1>
          <p className="text-[11px] sm:text-xs text-slate-500 font-medium m-0 mt-0.5">
            Showing last {activePeriod.l.toLowerCase()}
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
                className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-md text-[11px] sm:text-[12px] font-bold border-none cursor-pointer transition-all font-[inherit] ${
                  selected
                    ? "bg-white text-slate-800 shadow-sm"
                    : "bg-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                {p.l}
              </button>
            );
          })}
        </div>
      </div>

      {/* Band 2 — This-week hero (own data fetch, independent of period filter) */}
      <WeeklySnapshot />

      {isLowN && (
        <div
          role="status"
          className="rounded-xl border border-amber-200 bg-amber-50 text-amber-900 text-[12px] font-medium px-3 py-2"
        >
          Insufficient data for reliable comparisons — showing absolute values only.
          Period-over-period deltas hidden below {LOW_N_THRESHOLD} bookings.
        </div>
      )}

      {loading ? (
        <LoadingSpinner />
      ) : loadError && stats.curN === 0 ? (
        <ErrorBanner
          title="Couldn't load reports right now"
          message="The underlying booking data didn't come through. Refresh to try again."
          retry={() => window.location.reload()}
          retryLabel="Refresh"
        />
      ) : stats.curN === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 sm:p-12 text-center">
          <div className="text-lg font-bold text-slate-400 mb-1">No bookings in this period</div>
          <div className="text-sm text-slate-400">Try selecting a longer time range.</div>
        </div>
      ) : (
        <>
          {/* Band 3 — KPI row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi
              label="Revenue"
              value={`£${stats.curRev.toFixed(0)}`}
              sub={`vs £${stats.prevRev.toFixed(0)} prev period`}
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
              sub="estimated from base prices"
              cur={stats.avgPer}
              prev={stats.prevAvgPer}
              hideDelta={isLowN}
              color="#7C3AED"
            />
            <Kpi
              label="Seat Fill Rate"
              value={`${stats.util.toFixed(0)}%`}
              sub={`across ${stats.openDays} open ${stats.openDays === 1 ? "day" : "days"} · last ${days} days`}
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
        </>
      )}
    </div>
  );
}

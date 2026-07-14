import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useReportsData } from "../../../hooks/useReportsData.ts";
import { useMediaQuery } from "../../../hooks/useMediaQuery";
import { SkeletonKpiRow, SkeletonChart, EmptyState, Card } from "../../ui/index.js";
import { ErrorBanner } from "../../ui/ErrorBanner.jsx";
import {
  DetailedReportsDisclosure,
  Kpi,
  PERIODS,
  ReportsExpandAllContext,
} from "./ReportWidgets.jsx";
import { RevenueTrend } from "./RevenueTrend.jsx";
import { ServiceMix } from "./ServiceMix.jsx";
import { DemandPattern } from "./DemandPattern.jsx";
import { KeyInsights } from "./KeyInsights.jsx";
import { CustomerRanking } from "./CustomerRanking.jsx";
import { BookingHealth } from "./BookingHealth.jsx";
import { SlotFillReport } from "./SlotFillReport.jsx";
import { ServiceValueReport } from "./ServiceValueReport.jsx";
import { OutcomesReport } from "./OutcomesReport.jsx";
import { SourceMixReport } from "./SourceMixReport.jsx";
import { RetentionReport } from "./RetentionReport.jsx";
import { CapacityPreventedReport } from "./CapacityPreventedReport.jsx";
import { CollectedByMethodReport } from "./CollectedByMethodReport.jsx";
import { FunnelReport } from "./FunnelReport.jsx";
import { useSalon } from "../../../contexts/SalonContext";

const ALLOWED_PERIODS = [7, 30, 90];
const DEFAULT_PERIOD = 30;

function parsePeriod(value) {
  const n = Number(value);
  return ALLOWED_PERIODS.includes(n) ? n : null;
}

export function ReportsInsightsView({ loadError = null }) {
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

  // Reports collapse to titles on phones (below md). This drives the
  // "expand all / collapse all" control, which is only shown there.
  const compact = useMediaQuery("(max-width: 767px)");
  const [allExpanded, setAllExpanded] = useState(false);

  return (
    <div className="flex flex-col gap-3 sm:gap-4">
      {/* Analytics period control */}
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

          <KeyInsights stats={stats} insights={insights} days={days} />

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
                <RevenueTrend
                  days={days}
                  chart={stats.chart}
                  maxChartRev={stats.maxChartRev}
                  chartLabels={chartLabels}
                  insight={insights.capacity}
                />
                <ServiceMix svcs={stats.svcs} maxSvcRev={stats.maxSvcRev} insight={insights.service} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                <DemandPattern
                  dow={stats.dow}
                  maxDowN={stats.maxDowN}
                  busiestDay={stats.busiestDay}
                  slots={stats.slots}
                  maxSlotN={stats.maxSlotN}
                  busiestSlot={stats.busiestSlot}
                  dayInsight={insights.day}
                />
                <CustomerRanking
                  topCusts={stats.topCusts}
                  uniqueCusts={stats.uniqueCusts}
                  revPerCust={stats.revPerCust}
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                <BookingHealth
                  statusAcc={stats.statusAcc}
                  totalPast={stats.totalPast}
                  noShowN={stats.noShowN}
                  noShowRate={stats.noShowRate}
                  prevNoShowRate={stats.prevNoShowRate}
                  insight={insights.health}
                />
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
        </>
      )}
    </div>
  );
}

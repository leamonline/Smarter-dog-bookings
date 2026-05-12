import { Section } from "./ReportWidgets.jsx";
import { fmtLabel } from "../../../hooks/useReportsData.ts";

// Three reference ticks (max, half, 0) keep the chart readable even
// with a single bar in the period — the brief flagged that the chart
// was hard to interpret without numbers.
function buildYAxisTicks(maxRev) {
  if (!Number.isFinite(maxRev) || maxRev <= 0) return [0];
  const top = Math.ceil(maxRev / 10) * 10 || maxRev;
  return [top, Math.round(top / 2), 0];
}

export function RevenueTrend({ days, chart, maxChartRev, chartLabels, insight }) {
  const isWeekly = days > 30;
  const activeCount = chart.filter((bar) => bar.rev > 0).length;
  const ticks = buildYAxisTicks(maxChartRev);

  return (
    <Section title={isWeekly ? "Weekly Revenue Trend" : "Daily Revenue"} accent="#2D8B7A" insight={insight}>
      <div className="flex gap-2 h-[90px]">
        {/* Y-axis: three ticks (max, half, 0) for readability. */}
        <div className="flex flex-col justify-between text-[9px] text-slate-400 font-semibold tabular-nums w-7 text-right pr-0.5 shrink-0">
          {ticks.map((t) => (
            <span key={t} aria-hidden="true">£{t}</span>
          ))}
        </div>
        <div className="flex-1 relative">
          {/* Faint horizontal guide lines at each tick. */}
          <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
            {ticks.map((_, i) => (
              <div
                key={i}
                className="border-t border-slate-100"
                style={{ height: 0 }}
                aria-hidden="true"
              />
            ))}
          </div>
          <div className="flex items-end gap-[2px] h-full">
            {chart.map((bar, i) => (
              <div key={i} className="flex-1 flex flex-col justify-end h-full group relative">
                <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] font-bold px-2 py-1 rounded shadow opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                  {fmtLabel(bar.date, true)} · {"£"}{bar.rev.toFixed(0)} · {bar.count} dog{bar.count !== 1 ? "s" : ""}
                </div>
                <div
                  className="w-full rounded-t-sm bg-brand-teal/80 group-hover:bg-brand-teal transition-colors"
                  style={{
                    height: `${Math.max((bar.rev / maxChartRev) * 100, 2)}%`,
                    minHeight: bar.rev > 0 ? "4px" : "1px",
                  }}
                  aria-label={`${bar.date}: £${bar.rev.toFixed(0)}, ${bar.count} booking${bar.count !== 1 ? "s" : ""}`}
                  tabIndex={0}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex gap-[2px] mt-1.5 ml-9">
        {chart.map((bar, i) => (
          <div key={i} className="flex-1 text-center">
            {chartLabels.includes(i) && (
              <span className="text-[9px] text-slate-400 font-semibold">
                {days <= 7 ? fmtLabel(bar.date, false) : fmtLabel(bar.date, true)}
              </span>
            )}
          </div>
        ))}
      </div>
      {isWeekly && (
        <div className="mt-2 text-[11px] text-slate-400 font-medium">
          {activeCount === 0
            ? "No active weeks in this period."
            : `${activeCount} of ${chart.length} week${chart.length !== 1 ? "s" : ""} had bookings.`}
        </div>
      )}
    </Section>
  );
}

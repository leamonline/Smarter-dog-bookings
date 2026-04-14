import { Section } from "./ReportWidgets.jsx";
import { fmtLabel } from "../../../hooks/useReportsData.ts";

export function RevenueTrend({ days, chart, maxChartRev, chartLabels, insight }) {
  return (
    <Section title={days <= 30 ? "Daily Revenue" : "Weekly Revenue"} accent="#2D8B7A" insight={insight}>
      {/* Bars */}
      <div className="flex items-end gap-[2px] h-[130px]">
        {chart.map((bar, i) => (
          <div key={i} className="flex-1 flex flex-col justify-end h-full group relative">
            <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[9px] font-bold px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
              {"\u00A3"}{bar.rev.toFixed(0)} · {bar.count} dog{bar.count !== 1 ? "s" : ""}
            </div>
            <div
              className="w-full rounded-t-sm bg-brand-teal/80 group-hover:bg-brand-teal transition-colors"
              style={{
                height: `${Math.max((bar.rev / maxChartRev) * 100, 2)}%`,
                minHeight: bar.rev > 0 ? "4px" : "1px",
              }}
            />
          </div>
        ))}
      </div>
      {/* Labels */}
      <div className="flex gap-[2px] mt-1.5">
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
    </Section>
  );
}

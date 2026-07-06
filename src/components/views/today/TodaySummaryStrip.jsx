// Section G — Quick summary strip. Compact, skimmable day totals. No charts.
import { DAY_CAPACITY } from "../../../engine/utilisation";
import { formatMoney } from "./parts.jsx";

function Stat({ label, value, hint }) {
  return (
    <div className="flex flex-col items-center justify-center px-3 py-2 min-w-[76px]">
      <span className="text-[20px] font-extrabold text-slate-800 leading-none tabular-nums">{value}</span>
      <span className="text-[11px] text-slate-600 mt-1 text-center leading-tight">{label}</span>
      {hint && <span className="text-[10px] text-slate-500 mt-0.5">{hint}</span>}
    </div>
  );
}

export function TodaySummaryStrip({ summary, takings }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
      {/* overflow-x-auto must live on this outer wrapper: putting it on the
          same element as min-w-max lets the strip grow past the viewport and
          drag the whole page wide on phones instead of scrolling in place. */}
      <div className="overflow-x-auto">
        <div className="flex items-stretch divide-x divide-slate-100 min-w-max">
          <Stat label="Booked in" value={summary.total} hint={`${summary.capacityUsedPct}% of ${DAY_CAPACITY}`} />
          <Stat label="Arrived" value={summary.arrived} />
          <Stat label="Still expected" value={summary.expected} />
          <Stat label="Ready" value={summary.ready} />
          <Stat label="Collected" value={summary.collected} />
          <Stat label="Unpaid" value={summary.unpaidCount} />
          <Stat label="Expected" value={formatMoney(summary.expectedRevenue)} hint="appointment value" />
          <Stat label="Recorded paid" value={formatMoney(summary.collectedRevenue)} hint="status, not a till" />
        </div>
      </div>
      {takings && takings.total > 0 && (
        <div className="border-t border-slate-100 px-3 py-2 flex items-center gap-x-3 gap-y-1 flex-wrap text-[12px]">
          <span className="font-bold text-slate-700">Taken today {formatMoney(takings.total)}</span>
          {takings.byMethod.map((m) => (
            <span key={m.method} className="text-slate-600">
              {m.label} <span className="font-semibold text-slate-800">{formatMoney(m.amount)}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// The daily-progress footer keeps lifecycle outcomes and recorded takings
// reachable without repeating the headline booking, revenue or capacity facts.
import { formatMoney } from "./parts.jsx";

function Stat({ label, value, hint }) {
  return (
    <div className="flex flex-col items-center justify-center px-1 py-2 min-w-0">
      <span className="text-[20px] font-extrabold text-slate-800 leading-none tabular-nums">{value}</span>
      <span className="text-[11px] text-slate-600 mt-1 text-center leading-tight whitespace-nowrap">{label}</span>
      {hint && <span className="text-[10px] text-slate-500 mt-0.5 whitespace-nowrap">{hint}</span>}
    </div>
  );
}

export function TodaySummaryStrip({ summary, takings, isToday = true }) {
  return (
    <section
      aria-label="Daily progress"
      className="rounded-2xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)]"
    >
      <div className="flex items-baseline justify-between gap-2 flex-wrap px-3.5 pt-2.5 pb-2 border-b border-slate-100">
        <h2 className="text-[13px] font-bold text-slate-800">Daily progress</h2>
        <span className="text-[12px] text-slate-600 tabular-nums">
          {summary.collected} collected
        </span>
      </div>

      <div className="grid grid-cols-3 divide-x divide-slate-100">
        <Stat label="Arrived" value={summary.arrived} />
        <Stat label="Ready" value={summary.ready} />
        <Stat label="Collected" value={summary.collected} />
      </div>

      {takings && takings.total > 0 && (
        <div className="border-t border-slate-100 px-3.5 py-2 flex items-center gap-x-3 gap-y-1 flex-wrap text-[12px]">
          <span className="font-bold text-slate-700">Taken{isToday ? " today" : ""} {formatMoney(takings.total)}</span>
          {takings.byMethod.map((m) => (
            <span key={m.method} className="text-slate-600">
              {m.label} <span className="font-semibold text-slate-800 tabular-nums">{formatMoney(m.amount)}</span>
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

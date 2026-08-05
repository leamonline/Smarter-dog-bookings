// The daily-progress footer keeps lifecycle outcomes and recorded takings
// reachable without repeating the headline booking, revenue or capacity facts.
import { CompactZeroState, formatMoney } from "./parts.jsx";

function Stat({ label, value, hint }) {
  return (
    <div className="flex min-w-0 flex-col items-center justify-center px-1 py-1.5">
      <span className="text-[18px] font-extrabold leading-none text-slate-700 tabular-nums">{value}</span>
      <span className="mt-0.5 whitespace-nowrap text-center text-[10px] leading-tight text-slate-500">{label}</span>
      {hint && <span className="text-[10px] text-slate-500 mt-0.5 whitespace-nowrap">{hint}</span>}
    </div>
  );
}

export function TodaySummaryStrip({ summary, takings, isToday = true }) {
  const hasProgress = summary.arrived > 0 || summary.ready > 0 || summary.collected > 0
    || (takings && takings.total > 0);

  if (!hasProgress) {
    return (
      <section aria-label="Daily progress">
        <CompactZeroState>Progress: no dogs have arrived yet</CompactZeroState>
      </section>
    );
  }

  return (
    <section
      aria-label="Daily progress"
      className="rounded-xl border border-slate-200/80 bg-white/65 text-slate-600"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 px-3 py-1.5">
        <h2 className="text-[12px] font-bold text-slate-700">Daily progress</h2>
        <span className="text-[11px] text-slate-500 tabular-nums">
          {summary.collected} collected
        </span>
      </div>

      <div className="grid grid-cols-3 divide-x divide-slate-100">
        <Stat label="Arrived" value={summary.arrived} />
        <Stat label="Ready" value={summary.ready} />
        <Stat label="Collected" value={summary.collected} />
      </div>

      {takings && takings.total > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-100 px-3 py-1.5 text-[11px]">
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

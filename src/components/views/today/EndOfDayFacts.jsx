// The day's facts on one hairline-separated row: how many have arrived, what
// is in the till, what the day is worth, and where it sits against the daily
// cap. Restrained on purpose — this is a workflow screen, not an accounting
// screen.
//
// Kept from the previous end-of-day strip unchanged in substance — the numbers
// staff actually cash up against. It outlived the four-zone board it used to
// sit beneath (deleted October 2026, #995); the stack's Collected summary now
// sits above it instead.
import { formatMoney } from "./parts.jsx";

export function EndOfDayFacts({ summary, takings, capacityTotal }) {
  if (!summary) return null;
  const overCap = summary.dogsBooked > capacityTotal;

  return (
    <div
      aria-label="End of day"
      role="group"
      className="flex flex-wrap items-baseline gap-x-5 gap-y-1 border-t border-brand-paper-line px-1 pt-2.5 text-[12px] text-slate-500"
    >
      {summary.arrived > 0 ? (
        <span className="whitespace-nowrap">
          <strong className="font-bold text-slate-700 tabular-nums">{summary.arrived}</strong> arrived so far
        </span>
      ) : (
        <span className="whitespace-nowrap">No dogs have arrived yet</span>
      )}
      <span
        className="inline-flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5"
        aria-label={`Taken ${formatMoney(takings?.total ?? 0)} of ${formatMoney(summary.expectedRevenue)} expected`}
      >
        <span className="whitespace-nowrap">
          Taken{" "}
          <strong className="font-bold text-slate-700 tabular-nums">{formatMoney(takings?.total ?? 0)}</strong>
          {" "}of{" "}
          <strong className="font-bold text-slate-700 tabular-nums">{formatMoney(summary.expectedRevenue)}</strong>
        </span>
        {summary.expectedRevenue > 0 ? (
          // The day's takings at a glance — one quiet bar, no chart, because
          // this page is a workflow surface, not an accounting screen.
          <span
            aria-hidden="true"
            data-takings-bar
            className="inline-block h-1.5 w-24 overflow-hidden rounded-full bg-brand-purple/10"
          >
            <span
              className="block h-full rounded-full bg-brand-teal"
              style={{ width: `${Math.min(100, Math.round(((takings?.total ?? 0) / summary.expectedRevenue) * 100))}%` }}
            />
          </span>
        ) : null}
        {takings && takings.total > 0
          ? takings.byMethod.map((method) => (
            <span key={method.method} className="whitespace-nowrap text-slate-500">
              {method.label} <span className="tabular-nums">{formatMoney(method.amount)}</span>
            </span>
          ))
          : null}
      </span>
      <span className={`whitespace-nowrap ${overCap ? "font-bold text-brand-coral-text" : ""}`}>
        Capacity{" "}
        <strong className={`font-bold tabular-nums ${overCap ? "text-brand-coral-text" : "text-slate-700"}`}>
          {summary.dogsBooked}/{capacityTotal}
        </strong>
        {overCap ? " — over the daily cap" : ""}
      </span>
    </div>
  );
}

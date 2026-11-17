// The day's facts in the summary panel: how many have arrived, what
// is in the till, what the day is worth, and where it sits against the daily
// cap. Restrained on purpose — this is a workflow screen, not an accounting
// screen.
//
// These stay in deliberate rows on a phone: arrivals and capacity, then the
// takings and payment methods with their progress bar below.
import { formatMoney } from "./parts.jsx";

export function EndOfDayFacts({ summary, takings, capacityTotal }) {
  if (!summary) return null;
  const overCap = summary.dogsBooked > capacityTotal;

  return (
    <div
      aria-label="End of day"
      role="group"
      className="grid grid-cols-2 items-baseline gap-x-4 gap-y-3 border-t border-brand-paper-line px-4 py-3 text-caption text-ink-muted sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:gap-x-6"
    >
      {summary.arrived > 0 ? (
        <span>
          <strong className="font-bold text-slate-700 tabular-nums">{summary.arrived}</strong> arrived so far
        </span>
      ) : (
        <span>No dogs have arrived yet</span>
      )}
      <span
        className="order-3 col-span-2 grid min-w-0 gap-2 sm:order-2 sm:col-span-1"
        aria-label={`Taken ${formatMoney(takings?.total ?? 0)} of ${formatMoney(summary.expectedRevenue)} expected`}
      >
        <span className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <span>
            Taken{" "}
            <strong className="font-bold text-slate-700 tabular-nums">{formatMoney(takings?.total ?? 0)}</strong>
            {" "}of{" "}
            <strong className="font-bold text-slate-700 tabular-nums">{formatMoney(summary.expectedRevenue)}</strong>
          </span>
          {takings && takings.total > 0 ? (
            <span className="flex flex-wrap gap-x-3 gap-y-1">
              {takings.byMethod.map((method) => (
                <span key={method.method}>
                  {method.label} <span className="tabular-nums">{formatMoney(method.amount)}</span>
                </span>
              ))}
            </span>
          ) : null}
        </span>
        {summary.expectedRevenue > 0 ? (
          // The day's takings at a glance — one quiet bar, no chart, because
          // this page is a workflow surface, not an accounting screen.
          <span
            aria-hidden="true"
            data-takings-bar
            className="block h-1.5 w-full overflow-hidden rounded-full bg-brand-ink/10"
          >
            <span
              className="block h-full rounded-full bg-brand-teal"
              style={{ width: `${Math.min(100, Math.round(((takings?.total ?? 0) / summary.expectedRevenue) * 100))}%` }}
            />
          </span>
        ) : null}
      </span>
      <span className={`order-2 text-right sm:order-3 ${overCap ? "font-bold text-brand-coral-text" : ""}`}>
        Capacity{" "}
        <strong className={`font-bold tabular-nums ${overCap ? "text-brand-coral-text" : "text-slate-700"}`}>
          {summary.dogsBooked}/{capacityTotal}
        </strong>
        {overCap ? " — over the daily cap" : ""}
      </span>
    </div>
  );
}

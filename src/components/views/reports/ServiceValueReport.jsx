import { Section } from "./ReportWidgets.jsx";

// 2B — "What is each service worth per booked hour?"
// value/hour = completed revenue ÷ booked half-hours. Durations are the
// scheduled 30-min slots (an estimate until arrival→ready timings accrue).
const MIN_N_FOR_RATE = 3; // below this, per-service rates are noise

export function ServiceValueReport({ serviceValue }) {
  const active = serviceValue.filter((s) => s.completedN > 0);
  const maxVph = Math.max(...active.map((s) => s.valuePerHour), 1);

  const top = active.slice().sort((a, b) => b.valuePerHour - a.valuePerHour)[0];
  const insight = top
    ? `${top.name} earns the most per hour (£${top.valuePerHour.toFixed(0)}/h, scheduled estimate).`
    : undefined;

  return (
    <Section title="Value per hour by service" accent="var(--color-brand-teal)" insight={insight}>
      <p className="text-caption text-ink-muted font-medium m-0 mb-3">
        Based on scheduled 30-minute slots — an estimate until real groom durations build up.
      </p>
      {active.length === 0 ? (
        <div className="text-caption text-ink-muted font-medium">No completed grooms in this period.</div>
      ) : (
        <div className="flex flex-col gap-3">
          {active.map((s) => (
            <div key={s.id}>
              <div className="flex items-baseline justify-between mb-1">
                <span className="text-xs font-bold text-slate-700">{s.name}</span>
                <span className="text-xs font-black text-slate-800 font-display">
                  £{s.valuePerHour.toFixed(0)}<span className="text-micro font-semibold text-ink-muted">/h</span>
                </span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden" role="img" aria-label={`${s.name}: £${s.valuePerHour.toFixed(0)} per hour`}>
                <div className="h-full rounded-full bg-brand-teal/60 transition-all" style={{ width: `${(s.valuePerHour / maxVph) * 100}%` }} />
              </div>
              <div className="flex gap-3 mt-1 text-micro text-ink-muted font-medium">
                <span>{s.completedN} done</span>
                {s.completedN >= MIN_N_FOR_RATE ? (
                  <>
                    <span>rebooked {s.rebookRatePct.toFixed(0)}%</span>
                    <span>cancelled {s.cancelRatePct.toFixed(0)}%</span>
                  </>
                ) : (
                  <span className="italic">rates need {MIN_N_FOR_RATE}+ grooms</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

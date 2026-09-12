import { Section } from "./ReportWidgets.jsx";

// Improvement #3 — "What have we actually taken, and how?"
// Recorded takings (Paid in Full bookings) over the period, split by method.
// Method + paid time only accrue from when the feature went live, so this fills
// out over time; "Not recorded" is a paid booking with no method captured.
function money(n) {
  return `£${Math.round(n)}`;
}

export function CollectedByMethodReport({ collectedByMethod }) {
  const { total, count, byMethod } = collectedByMethod;

  if (count === 0) {
    return (
      <Section title="Collected by method" accent="var(--color-brand-yellow)">
        <div className="text-caption text-ink-muted font-medium">
          Nothing recorded as paid in this period yet. Marking bookings paid (with a method) fills this in.
        </div>
      </Section>
    );
  }

  const max = Math.max(...byMethod.map((m) => m.amount), 1);
  const insight = `${money(total)} recorded as taken across ${count} paid booking${count !== 1 ? "s" : ""}.`;

  return (
    <Section title="Collected by method" accent="var(--color-brand-yellow)" insight={insight}>
      <div className="flex flex-col gap-2">
        {byMethod.map((m) => (
          <div key={m.method} className="flex items-center gap-2">
            <span className="text-caption font-bold text-slate-600 w-[100px] shrink min-w-0 truncate" title={m.label}>{m.label}</span>
            <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden" role="img" aria-label={`${m.label}: ${money(m.amount)}`}>
              <div
                className={`h-full rounded-full transition-all ${m.method === "unrecorded" ? "bg-slate-300" : "bg-brand-yellow"}`}
                style={{ width: `${(m.amount / max) * 100}%` }}
              />
            </div>
            <span className="text-micro font-extrabold text-slate-600 w-[72px] shrink-0 text-right tabular-nums">
              {money(m.amount)} · {m.count}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-3 pt-3 border-t border-slate-100 text-micro text-ink-muted font-medium">
        Recorded takings only — method + paid time build up from when the feature went live.
      </div>
    </Section>
  );
}

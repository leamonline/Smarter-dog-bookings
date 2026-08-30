import { Section } from "./ReportWidgets.jsx";

// 2E — "Where do bookings come from, and is self-service holding up?"
// Share by who created the booking (created_by_role). Link→completion
// conversion isn't captured, so we don't claim it.
const ROLE_COLOR = {
  staff: "var(--color-brand-purple)",
  customer: "var(--color-brand-teal)",
  ai: "#10C2FC",
  system: "#94A3B8",
  unknown: "#CBD5E1",
};

export function SourceMixReport({ sourceMix }) {
  const { bySource, selfServicePct, totalCountable } = sourceMix;

  const insight =
    totalCountable > 0
      ? `${selfServicePct.toFixed(0)}% of bookings are customer self-service (portal + WhatsApp).`
      : undefined;

  return (
    <Section title="Booking source" accent="#10C2FC" insight={insight}>
      {totalCountable === 0 ? (
        <div className="text-caption text-ink-muted font-medium">No bookings in this period.</div>
      ) : (
        <div className="flex flex-col gap-3">
          {bySource.map((s) => (
            <div key={s.role}>
              <div className="flex items-baseline justify-between mb-1">
                <span className="text-xs font-bold text-slate-700">{s.label}</span>
                <span className="text-xs font-black text-slate-800 font-display">{s.pct.toFixed(0)}%</span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden" role="img" aria-label={`${s.label}: ${s.pct.toFixed(0)}%`}>
                <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(s.pct, 100)}%`, background: ROLE_COLOR[s.role] || "#CBD5E1" }} />
              </div>
              <div className="flex gap-3 mt-1 text-micro text-ink-muted font-medium">
                <span>{s.n} booking{s.n !== 1 ? "s" : ""}</span>
                <span>avg £{s.avgValue.toFixed(0)}</span>
                {s.cancelRatePct > 0 && <span>cancelled {s.cancelRatePct.toFixed(0)}%</span>}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="mt-3 pt-3 border-t border-slate-100 text-micro text-ink-muted font-medium">
        Booking-link → completion conversion isn’t tracked yet, so drop-off before booking isn’t shown here.
      </div>
    </Section>
  );
}

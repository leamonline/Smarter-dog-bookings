import { Section } from "./ReportWidgets.jsx";
import { useFunnelData } from "../../../hooks/useFunnelData.ts";

// Improvement #4 — "Where do customers drop off in the booking wizard?"
// Reads booking_funnel_events (one session per wizard run, counted by furthest
// step reached). Only counts self-service portal runs — a low completion rate
// is the drop-off signal, not lost revenue on its own.
export function FunnelReport({ days }) {
  const { loading, available, stats } = useFunnelData(days);

  if (!available) {
    return (
      <Section title="Booking funnel" accent="#10C2FC">
        <div className="text-caption text-ink-muted font-medium">
          {loading ? "Loading the booking funnel…" : "This needs live portal telemetry — it isn't available in offline mode."}
        </div>
      </Section>
    );
  }

  if (stats.totalSessions === 0) {
    return (
      <Section title="Booking funnel" accent="#10C2FC">
        <div className="text-caption text-ink-muted font-medium">
          No self-service booking sessions in this period yet. This starts collecting from when the feature went live.
        </div>
      </Section>
    );
  }

  const insight = `${stats.completionPct.toFixed(0)}% of the ${stats.totalSessions} customers who opened the wizard finished booking.`;
  // Biggest single drop between consecutive steps (skip the first step).
  const biggestDrop = stats.steps.slice(1).reduce((worst, s) => (s.dropFromPrev > worst.dropFromPrev ? s : worst), stats.steps[1] ?? null);

  return (
    <Section title="Booking funnel" accent="#10C2FC" insight={insight}>
      <p className="text-caption text-ink-muted font-medium m-0 mb-3">
        Self-service wizard runs, by furthest step reached.
        {biggestDrop && biggestDrop.dropFromPrev > 0 ? ` Biggest fall-off is at "${biggestDrop.label}".` : ""}
      </p>
      <div className="flex flex-col gap-1.5">
        {stats.steps.map((s) => (
          <div key={s.step} className="flex items-center gap-2">
            <span className="text-caption font-bold text-slate-600 w-[120px] shrink-0 truncate" title={s.label}>{s.label}</span>
            <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden" role="img" aria-label={`${s.label}: ${s.sessions} sessions (${s.pctOfStarted.toFixed(0)}%)`}>
              <div
                className={`h-full rounded-full transition-all ${s.step === "booked" ? "bg-brand-teal/70" : "bg-cyan-400/60"}`}
                style={{ width: `${Math.min(s.pctOfStarted, 100)}%` }}
              />
            </div>
            <span className="text-micro font-extrabold text-slate-500 w-[64px] text-right">
              {s.sessions} · {s.pctOfStarted.toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </Section>
  );
}

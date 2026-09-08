import { Section } from "./ReportWidgets.jsx";
import { useFunnelData } from "../../../hooks/useFunnelData.ts";

// Improvement #4 — "Where do customers drop off in the booking wizard?"
// Reads booking_funnel_events (one session per wizard run, counted by furthest
// step reached). Only counts self-service portal runs — a low completion rate
// is the drop-off signal, not lost revenue on its own.
export function FunnelReport({ days }) {
  const { loading, available, stats } = useFunnelData(days);

  if (loading || !available) {
    return (
      <Section title="Booking funnel" accent="#10C2FC">
        <div className="text-caption text-ink-muted font-medium">
          {loading ? "Loading the booking funnel…" : "This needs live portal telemetry — none is loaded right now."}
        </div>
      </Section>
    );
  }

  const quality = stats.quality;
  const qualityNote = (
    <p className="text-caption text-ink-muted font-medium mt-3 mb-0">
      Directional data: {quality.missingStarts} sessions without a recorded start excluded;
      {" "}{quality.missingIntermediate} sessions with missing intermediate steps;
      {" "}{quality.repeatedSteps} repeated step events counted once;
      {" "}{quality.invalidRows} invalid events excluded. Repeated steps can be revisits.
      Missing events cannot all be detected.
    </p>
  );
  if (stats.totalSessions === 0) {
    return (
      <Section title="Booking funnel" accent="#10C2FC">
        <p className="text-caption text-ink-muted font-medium">
          No booking attempts with a recorded start in this period.
        </p>
        {qualityNote}
      </Section>
    );
  }

  const insight = `${stats.completionPct.toFixed(0)}% of the ${stats.totalSessions} recorded booking attempts reached booking success.`;
  // Biggest single drop between consecutive steps (skip the first step).
  const biggestDrop = stats.steps.slice(1).reduce((worst, s) => (s.dropFromPrev > worst.dropFromPrev ? s : worst), stats.steps[1] ?? null);

  return (
    <Section title="Booking funnel" accent="#10C2FC" insight={insight}>
      <p className="text-caption text-ink-muted font-medium m-0 mb-3">
        Portal attempts with a recorded start in this period, by furthest step reached. Intermediate reach is inferred. An unfinished attempt is not proof of abandonment. Dates use UTC and include today so far.
        {biggestDrop && biggestDrop.dropFromPrev > 0 ? ` Biggest fall-off is at "${biggestDrop.label}".` : ""}
      </p>
      {qualityNote}
      <div className="flex flex-col gap-1.5 mt-3">
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

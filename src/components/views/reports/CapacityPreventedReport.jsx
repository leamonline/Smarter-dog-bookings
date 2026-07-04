import { Section } from "./ReportWidgets.jsx";
import { useDenialsData } from "../../../hooks/useDenialsData.ts";
import { fmtLabel } from "../../../hooks/useReportsData.ts";

// 2F — "What demand did we have to turn away, and why?"
// Reads booking_denials (the fire-and-forget capture from the portal + WhatsApp
// flow). Frames carefully: a protective limit refusing a booking is the rules
// working as designed, NOT necessarily lost revenue.
export function CapacityPreventedReport({ days }) {
  const { loading, available, stats } = useDenialsData(days);

  if (!available) {
    return (
      <Section title="Turned-away demand" accent="var(--color-brand-coral)">
        <div className="text-caption text-ink-muted font-medium">
          {loading ? "Checking for turned-away bookings…" : "This needs live booking data — it isn't available in offline mode."}
        </div>
      </Section>
    );
  }

  if (stats.total === 0) {
    return (
      <Section title="Turned-away demand" accent="var(--color-brand-coral)">
        <div className="text-caption text-ink-muted font-medium">
          Nothing turned away in this period — every booking that was tried went through. This starts collecting from when the feature went live, so it'll fill out over time.
        </div>
      </Section>
    );
  }

  const maxReason = Math.max(...stats.byReason.map((r) => r.n), 1);
  const maxSlot = Math.max(...stats.bySlot.map((s) => s.n), 1);
  const takenPct = stats.alternativeShownN > 0 ? (stats.alternativeTakenN / stats.alternativeShownN) * 100 : 0;

  const insight = `${stats.total} booking${stats.total !== 1 ? "s were" : " was"} turned away — most often "${stats.byReason[0].label}".`;

  return (
    <Section title="Turned-away demand" accent="var(--color-brand-coral)" insight={insight}>
      <p className="text-caption text-ink-muted font-medium m-0 mb-3">
        Bookings the salon couldn't take{stats.firstSeen ? `, since ${fmtLabel(stats.firstSeen.slice(0, 10), true)}` : ""}. Some are your limits doing their job — a rising share of avoidable ones is the thing to watch.
      </p>

      {/* Reasons ranked */}
      <div className="flex flex-col gap-1.5 mb-4">
        {stats.byReason.map((r) => (
          <div key={r.code} className="flex items-center gap-2">
            <span className="text-caption font-bold text-slate-600 w-[130px] shrink-0 truncate" title={r.label}>{r.label}</span>
            <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden" role="img" aria-label={`${r.label}: ${r.n}`}>
              <div className="h-full rounded-full bg-brand-coral/60 transition-all" style={{ width: `${(r.n / maxReason) * 100}%` }} />
            </div>
            <span className="text-micro font-extrabold text-slate-500 w-[28px] text-right">{r.n}</span>
          </div>
        ))}
      </div>

      {/* Demand by slot */}
      {stats.bySlot.length > 0 && (
        <div className="pt-3 border-t border-slate-100">
          <div className="text-xs font-semibold text-slate-500 mb-2">Most-wanted times we couldn't fill</div>
          <div className="flex flex-col gap-1.5">
            {stats.bySlot.slice(0, 5).map((s) => (
              <div key={s.slot} className="flex items-center gap-2">
                <span className="text-caption font-bold text-slate-600 w-[50px] shrink-0">{s.label}</span>
                <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden" role="img" aria-label={`${s.label}: ${s.n}`}>
                  <div className="h-full rounded-full bg-purple-400 transition-all" style={{ width: `${(s.n / maxSlot) * 100}%` }} />
                </div>
                <span className="text-micro font-extrabold text-slate-500 w-[28px] text-right">{s.n}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Alternatives */}
      {stats.alternativeShownN > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-100 text-caption text-ink-muted font-medium">
          Offered another time <strong className="text-slate-700">{stats.alternativeShownN}×</strong> — <strong className="text-slate-700">{stats.alternativeTakenN}</strong> taken ({takenPct.toFixed(0)}%).
        </div>
      )}
    </Section>
  );
}

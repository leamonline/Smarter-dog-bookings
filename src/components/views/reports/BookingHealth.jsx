import { Section, STATUS_COLORS, STATUS_LABELS } from "./ReportWidgets.jsx";

export function BookingHealth({ statusAcc, totalPast, noShowN, noShowRate, prevNoShowRate, insight }) {
  return (
    <Section title="Booking Health" accent="var(--color-brand-coral)" insight={insight}>
      {totalPast === 0 ? (
        <div className="text-body text-ink-muted">No completed bookings to analyse yet</div>
      ) : (
        <div className="flex items-center gap-3">
          {/* No-show callout */}
          <div className="shrink-0 flex items-center gap-2.5 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200/60">
            <div className="text-center">
              <div className="text-xl font-black text-amber-600 leading-none">
                {noShowRate.toFixed(0)}%
              </div>
              <div className="text-micro font-bold text-amber-600 uppercase tracking-wide mt-0.5">
                no-show
              </div>
            </div>
            <div className="text-caption text-amber-700 font-medium leading-snug">
              {noShowN}/{totalPast} past
              {prevNoShowRate > 0 && (
                <div className="text-micro text-amber-600/80">
                  was {prevNoShowRate.toFixed(0)}%
                </div>
              )}
            </div>
          </div>

          {/* Stacked status bar + legend */}
          <div className="flex-1 min-w-0">
            <div className="flex h-3 rounded-full overflow-hidden mb-2" role="img" aria-label={`Booking status: ${noShowRate.toFixed(0)}% no-show out of ${totalPast} past bookings`}>
              {Object.entries(STATUS_COLORS).map(([status, color]) => {
                const n = statusAcc[status] || 0;
                const pct = (n / totalPast) * 100;
                if (pct === 0) return null;
                return <div key={status} style={{ width: `${pct}%`, background: color }} />;
              })}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {Object.entries(STATUS_COLORS).map(([status, color]) => {
                const n = statusAcc[status] || 0;
                if (n === 0) return null;
                const pct = ((n / totalPast) * 100).toFixed(0);
                return (
                  <div key={status} className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-sm inline-block shrink-0" style={{ background: color }} />
                    <span className="text-caption font-semibold text-slate-600">
                      {STATUS_LABELS[status] || status} {pct}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </Section>
  );
}

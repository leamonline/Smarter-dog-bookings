import { useNavigate } from "react-router-dom";
import { Section, STATUS_COLORS, STATUS_LABELS } from "./ReportWidgets.jsx";

// Two separate truths, deliberately not merged:
//   • Confirmed no-shows — staff cancelled the booking and recorded "No-show".
//     A real customer absence, measured against the appointments that actually
//     reached their slot.
//   • Needs classification — past bookings still sitting on "Booked". That is
//     the salon's own paperwork, not an absence. It used to be counted as a
//     no-show, which overstated the rate and made it look worse the busier the
//     salon got. It now links to /needs-attention so it can be closed off.
export function BookingHealth({
  statusAcc,
  totalPast,
  noShowN,
  noShowRate,
  noShowDenom,
  needsClassificationN = 0,
  prevNoShowRate,
  insight,
}) {
  const navigate = useNavigate();
  const denom = noShowDenom ?? totalPast;

  return (
    <Section title="Booking Health" accent="var(--color-brand-coral)" insight={insight}>
      {totalPast === 0 && noShowN === 0 ? (
        <div className="text-body text-ink-muted">No completed bookings to analyse yet</div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            {/* Confirmed no-show callout */}
            <div className="shrink-0 flex items-center gap-2.5 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200/60">
              <div className="text-center">
                <div className="text-xl font-black text-amber-600 leading-none">
                  {noShowRate.toFixed(0)}%
                </div>
                <div className="text-micro font-bold text-amber-600 uppercase tracking-wide mt-0.5">
                  Confirmed no-shows
                </div>
              </div>
              <div className="text-caption text-amber-700 font-medium leading-snug">
                {noShowN} of {denom} dogs due in
                {prevNoShowRate > 0 && (
                  <div className="text-micro text-amber-600/80">
                    was {prevNoShowRate.toFixed(0)}%
                  </div>
                )}
              </div>
            </div>

            {/* Stacked status bar + legend */}
            <div className="flex-1 min-w-0">
              <div
                className="flex h-3 rounded-full overflow-hidden mb-2"
                role="img"
                aria-label={`Past bookings by status, out of ${totalPast}`}
              >
                {Object.entries(STATUS_COLORS).map(([status, color]) => {
                  const n = statusAcc[status] || 0;
                  const pct = totalPast > 0 ? (n / totalPast) * 100 : 0;
                  if (pct === 0) return null;
                  return <div key={status} style={{ width: `${pct}%`, background: color }} />;
                })}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {Object.entries(STATUS_COLORS).map(([status, color]) => {
                  const n = statusAcc[status] || 0;
                  if (n === 0) return null;
                  const pct = totalPast > 0 ? ((n / totalPast) * 100).toFixed(0) : "0";
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

          <p className="text-micro text-ink-muted leading-snug">
            Counts dogs staff marked as a no-show, out of the dogs due in that
            day. Bookings cancelled ahead of time aren&apos;t counted either way
            &mdash; nobody was expected.
          </p>

          {needsClassificationN > 0 && (
            <button
              type="button"
              onClick={() => navigate("/needs-attention")}
              className="flex items-center justify-between gap-3 w-full text-left px-3 py-2 rounded-xl bg-slate-50 border border-slate-200/80 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400 transition-colors"
            >
              <span className="text-caption text-slate-600 leading-snug">
                Not counted above — these finished days were never closed off, so
                we don&apos;t yet know how they went.
              </span>
              <span className="shrink-0 text-caption font-bold text-slate-700 underline underline-offset-2">
                Review {needsClassificationN} unclassified booking
                {needsClassificationN === 1 ? "" : "s"}
              </span>
            </button>
          )}
        </div>
      )}
    </Section>
  );
}

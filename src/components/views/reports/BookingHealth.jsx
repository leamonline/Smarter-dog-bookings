import { Section, STATUS_COLORS, STATUS_LABELS } from "./ReportWidgets.jsx";

export function BookingHealth({ statusAcc, totalPast, noShowN, noShowRate, prevNoShowRate, insight }) {
  return (
    <Section title="Booking Health" accent="#E8567F" insight={insight}>
      {totalPast === 0 ? (
        <div className="text-[13px] text-slate-400">No completed bookings to analyse yet</div>
      ) : (
        <>
          {/* Stacked status bar */}
          <div className="flex h-4 rounded-full overflow-hidden mb-3">
            {Object.entries(STATUS_COLORS).map(([status, color]) => {
              const n = statusAcc[status] || 0;
              const pct = (n / totalPast) * 100;
              if (pct === 0) return null;
              return <div key={status} style={{ width: `${pct}%`, background: color }} />;
            })}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 mb-5">
            {Object.entries(STATUS_COLORS).map(([status, color]) => {
              const n = statusAcc[status] || 0;
              if (n === 0) return null;
              const pct = ((n / totalPast) * 100).toFixed(0);
              return (
                <div key={status} className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm inline-block shrink-0" style={{ background: color }} />
                  <span className="text-[12px] font-semibold text-slate-600">
                    {STATUS_LABELS[status] || status} {pct}%
                  </span>
                </div>
              );
            })}
          </div>

          {/* No-show highlight */}
          <div className="flex items-center gap-3 p-3 rounded-xl bg-amber-50 border border-amber-200/60">
            <div className="shrink-0 text-center">
              <div className="text-[22px] font-black text-amber-600 leading-none">
                {noShowRate.toFixed(0)}%
              </div>
              <div className="text-[9px] font-bold text-amber-500 uppercase tracking-wide mt-0.5">
                no-show
              </div>
            </div>
            <div className="text-[12px] text-amber-700 font-medium leading-snug">
              {noShowN} of {totalPast} past booking{totalPast !== 1 ? "s" : ""}
              {prevNoShowRate > 0 && (
                <span className="ml-1">
                  (was {prevNoShowRate.toFixed(0)}% prev period)
                </span>
              )}
            </div>
          </div>
        </>
      )}
    </Section>
  );
}

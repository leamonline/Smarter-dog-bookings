import { Section } from "./ReportWidgets.jsx";

export function DemandPattern({ dow, maxDowN, busiestDay, slots, maxSlotN, busiestSlot, dayInsight }) {
  const activeSlots = slots.filter((s) => s.n > 0);
  const inactiveSlots = slots.filter((s) => s.n === 0);
  const hasDayData = busiestDay.n > 0;
  const hasSlotData = busiestSlot.n > 0;

  return (
    <Section title="Demand Pattern" accent="#7C3AED" insight={dayInsight}>
      {/* Peak day headline + day strip */}
      <div className="mb-4">
        <div className="flex items-baseline justify-between mb-2">
          <div className="text-xs font-semibold text-slate-500">
            Peak day:{" "}
            <span className="text-slate-800 font-extrabold">
              {hasDayData ? busiestDay.label : "—"}
            </span>
            {hasDayData && (
              <span className="text-ink-muted font-medium">
                {" · "}
                {busiestDay.n} booking{busiestDay.n !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-end gap-1.5 h-[60px]">
          {dow.map((d) => {
            const isPeak = hasDayData && d.label === busiestDay.label;
            const h = d.n > 0 ? Math.max((d.n / maxDowN) * 100, 8) : 3;
            return (
              <div key={d.label} className="flex-1 flex flex-col items-center justify-end h-full">
                <div
                  className={`w-full rounded-t-md transition-colors ${
                    isPeak ? "bg-brand-teal" : d.n > 0 ? "bg-brand-teal/50" : "bg-slate-200"
                  }`}
                  style={{ height: `${h}%` }}
                  aria-label={`${d.label}: ${d.n} booking${d.n !== 1 ? "s" : ""}`}
                />
                <div className="text-micro font-bold text-slate-600 mt-1">{d.label}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Peak slot + active slots */}
      <div className="pt-3 border-t border-slate-100">
        <div className="text-xs font-semibold text-slate-500 mb-2">
          Peak slot:{" "}
          <span className="text-slate-800 font-extrabold">
            {hasSlotData ? busiestSlot.label : "—"}
          </span>
          {hasSlotData && (
            <span className="text-ink-muted font-medium">
              {" · "}
              {busiestSlot.n} booking{busiestSlot.n !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        {activeSlots.length === 0 ? (
          <div className="text-caption text-ink-muted font-medium">No slot activity in this period.</div>
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              {activeSlots.map((s) => (
                <div key={s.slot} className="flex items-center gap-2">
                  <span className="text-caption font-bold text-slate-600 w-[50px] shrink-0">{s.label}</span>
                  <div
                    className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden"
                    role="img"
                    aria-label={`${s.label}: ${s.n} booking${s.n !== 1 ? "s" : ""}`}
                  >
                    <div
                      className="h-full rounded-full bg-purple-400 transition-all"
                      style={{ width: `${(s.n / maxSlotN) * 100}%` }}
                    />
                  </div>
                  <span className="text-micro font-extrabold text-slate-500 w-[20px] text-right">{s.n}</span>
                </div>
              ))}
            </div>
            {inactiveSlots.length > 0 && (
              <div className="mt-2 text-caption text-ink-muted font-medium">
                {inactiveSlots.length} quiet slot{inactiveSlots.length !== 1 ? "s" : ""} (no bookings)
              </div>
            )}
          </>
        )}
      </div>
    </Section>
  );
}

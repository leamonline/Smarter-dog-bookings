import { Section } from "./ReportWidgets.jsx";

export function ScheduleCharts({ dow, maxDowN, busiestDay, slots, maxSlotN, busiestSlot, dayInsight }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Busiest days */}
      <Section title="Busiest Days" accent="#2D8B7A" insight={dayInsight}>
        <div className="flex items-end gap-2 h-[100px]">
          {dow.map((d) => {
            const h = Math.max((d.n / maxDowN) * 100, 3);
            const isBusiest = d.label === busiestDay.label && d.n > 0;
            return (
              <div key={d.label} className="flex-1 flex flex-col items-center justify-end h-full">
                <div className="text-[10px] font-bold text-slate-500 mb-1">{d.n || ""}</div>
                <div
                  className={`w-full rounded-t-md transition-colors ${isBusiest ? "bg-brand-teal" : "bg-brand-teal/40"}`}
                  style={{ height: `${d.n > 0 ? h : 3}%` }}
                />
                <div className="text-[11px] font-bold text-slate-600 mt-1.5">{d.label}</div>
              </div>
            );
          })}
        </div>
        {busiestDay.n > 0 && (
          <div className="mt-3 text-[12px] text-slate-500 font-medium">
            Peak: <span className="font-bold text-slate-700">{busiestDay.label}</span>{" "}
            with {"\u00A3"}{busiestDay.rev.toFixed(0)} revenue
          </div>
        )}
      </Section>

      {/* Time slot demand */}
      <Section title="Time Slot Demand" accent="#7C3AED">
        <div className="flex flex-col gap-1.5">
          {slots.map((s) => (
            <div key={s.slot} className="flex items-center gap-2">
              <span className="text-[12px] font-bold text-slate-600 w-[56px] shrink-0">{s.label}</span>
              <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-purple-400 transition-all"
                  style={{ width: `${(s.n / maxSlotN) * 100}%` }}
                />
              </div>
              <span className="text-[11px] font-extrabold text-slate-500 w-[24px] text-right">{s.n}</span>
            </div>
          ))}
        </div>
        {busiestSlot.n > 0 && (
          <div className="mt-3 text-[12px] text-slate-500 font-medium">
            Peak slot: <span className="font-bold text-slate-700">{busiestSlot.label}</span>{" "}
            with {busiestSlot.n} booking{busiestSlot.n !== 1 ? "s" : ""}
          </div>
        )}
      </Section>
    </div>
  );
}

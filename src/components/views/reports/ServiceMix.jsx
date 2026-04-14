import { Section } from "./ReportWidgets.jsx";

export function ServiceMix({ svcs, maxSvcRev, insight }) {
  return (
    <Section title="Service Mix" accent="#0EA5E9" insight={insight}>
      <div className="flex flex-col gap-3">
        {svcs.map((s) => (
          <div key={s.id}>
            <div className="flex justify-between items-baseline mb-1">
              <span className="text-[13px] font-bold text-slate-700">{s.icon} {s.name}</span>
              <span className="text-[13px] font-extrabold text-slate-800">{"\u00A3"}{s.rev.toFixed(0)}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-sky-400 transition-all"
                  style={{ width: `${(s.rev / maxSvcRev) * 100}%` }}
                />
              </div>
              <span className="text-[11px] font-semibold text-slate-400 w-[65px] text-right shrink-0">
                {s.n} booking{s.n !== 1 ? "s" : ""}
              </span>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

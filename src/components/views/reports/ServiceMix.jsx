import { Section } from "./ReportWidgets.jsx";

export function ServiceMix({ svcs, maxSvcRev, insight }) {
  const active = svcs.filter((s) => s.n > 0);
  const inactive = svcs.filter((s) => s.n === 0);

  return (
    <Section title="Service Mix" accent="#10C2FC" insight={insight}>
      {active.length === 0 ? (
        <div className="text-body text-ink-muted">No services booked in this period</div>
      ) : (
        <div className="flex flex-col gap-3">
          {active.map((s) => (
            <div key={s.id}>
              <div className="flex justify-between items-baseline mb-1">
                <span className="text-body font-bold text-slate-700">{s.name}</span>
                <span className="text-body font-extrabold text-slate-800">{"£"}{s.rev.toFixed(0)}</span>
              </div>
              <div className="flex items-center gap-2">
                <div
                  className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden"
                  role="img"
                  aria-label={`${s.name}: £${s.rev.toFixed(0)} from ${s.n} booking${s.n !== 1 ? "s" : ""}`}
                >
                  <div
                    className="h-full rounded-full bg-sky-400 transition-all"
                    style={{ width: `${(s.rev / maxSvcRev) * 100}%` }}
                  />
                </div>
                <span className="text-caption font-semibold text-ink-muted w-[65px] text-right shrink-0">
                  {s.n} booking{s.n !== 1 ? "s" : ""}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {inactive.length > 0 && active.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-100 text-caption text-ink-muted font-medium">
          <span className="font-bold text-slate-500">No activity:</span>{" "}
          {inactive.map((s) => s.name).join(", ")}
        </div>
      )}
    </Section>
  );
}

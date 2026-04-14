import { Section, SIZE_COLORS } from "./ReportWidgets.jsx";

export function SizeSplit({ sizes, insight }) {
  return (
    <Section title="Size Split" accent="#E8567F" insight={insight}>
      <div className="flex flex-col gap-3">
        {sizes.map((s) => (
          <div key={s.size}>
            <div className="flex justify-between items-baseline mb-1">
              <div className="flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-full inline-block shrink-0"
                  style={{ background: SIZE_COLORS[s.size], boxShadow: `0 0 0 2px ${SIZE_COLORS[s.size]}33` }}
                />
                <span className="text-[13px] font-bold text-slate-700">{s.label}</span>
              </div>
              <span className="text-[13px] font-extrabold text-slate-800">
                {s.n} <span className="font-semibold text-slate-400">({s.pct.toFixed(0)}%)</span>
              </span>
            </div>
            <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${s.pct}%`, background: SIZE_COLORS[s.size] }}
              />
            </div>
            <div className="text-[11px] text-slate-400 font-semibold mt-0.5">
              {"\u00A3"}{s.rev.toFixed(0)} revenue
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

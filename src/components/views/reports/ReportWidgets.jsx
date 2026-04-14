// Shared presentational widgets used by all report sub-components.

function pctChange(cur, prev) {
  if (prev === 0) return cur > 0 ? 100 : 0;
  return ((cur - prev) / prev) * 100;
}

export function Trend({ cur, prev, invert }) {
  const p = pctChange(cur, prev);
  if (prev === 0 && cur === 0) return null;
  const up = p > 0;
  const good = invert ? !up : up;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-bold px-1.5 py-0.5 rounded-full ${good ? "text-emerald-600 bg-emerald-50" : "text-rose-600 bg-rose-50"}`}>
      {up ? "\u2191" : "\u2193"} {Math.abs(p).toFixed(0)}%
    </span>
  );
}

export function Kpi({ label, value, sub, cur, prev, color = "#2D8B7A", invert }) {
  return (
    <div className="bg-white p-4 md:p-5 rounded-2xl border border-slate-200 shadow-[0_2px_8px_rgba(0,0,0,0.03)]">
      <div className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 mb-1.5">{label}</div>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-2xl md:text-[28px] font-black leading-none" style={{ color }}>{value}</span>
        {cur != null && prev != null && <Trend cur={cur} prev={prev} invert={invert} />}
      </div>
      {sub && <div className="text-[11px] text-slate-400 font-medium mt-1">{sub}</div>}
    </div>
  );
}

export function Section({ title, accent = "#2D8B7A", children, insight }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-[0_2px_8px_rgba(0,0,0,0.03)] overflow-hidden">
      <div className="h-[3px]" style={{ background: `linear-gradient(90deg, ${accent}, ${accent}88)` }} />
      <div className="p-5">
        <div className="text-[11px] font-extrabold uppercase tracking-widest text-slate-400 mb-4">{title}</div>
        {children}
        {insight && (
          <div className="mt-4 pt-3 border-t border-slate-100 text-[12px] font-medium leading-relaxed">
            <span className="text-[#2D8B7A] font-bold">Insight: </span>
            <span className="text-slate-500">{insight}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// Display-level constants shared across report sub-components
export const SIZE_COLORS = { small: "#F5C518", medium: "#2D8B7A", large: "#E8567F" };
export const STATUS_COLORS = { "No-show": "#475569", "Checked in": "#16A34A", "Ready for pick-up": "#7C3AED" };
export const STATUS_LABELS = { "No-show": "Awaiting / No-show", "Checked in": "Checked in", "Ready for pick-up": "Finished" };
export const PERIODS = [{ v: 7, l: "7 days" }, { v: 30, l: "30 days" }, { v: 90, l: "90 days" }];

// Shared presentational widgets used by all report sub-components.

import { formatDelta } from "../../../utils/intl.js";

export function Trend({ cur, prev, invert }) {
  // formatDelta returns an em-dash when the previous period was zero \u2014 there's
  // no meaningful percentage to display in that case, so the badge is
  // suppressed entirely (rendered as a small em-dash placeholder).
  const delta = formatDelta(cur, prev);
  if (delta === "\u2014") return <span className="text-[11px] font-bold text-slate-400 px-1.5">{"\u2014"}</span>;
  if (prev === 0 && cur === 0) return null;
  const up = delta.startsWith("+");
  const good = invert ? !up : up;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-bold px-1.5 py-0.5 rounded-full ${good ? "text-emerald-600 bg-emerald-50" : "text-rose-600 bg-rose-50"}`}>
      {up ? "\u2191" : "\u2193"} {delta.replace(/^[+-]/, "")}
    </span>
  );
}

export function Kpi({ label, value, sub, cur, prev, color = "var(--color-brand-teal)", invert, hideDelta }) {
  return (
    <div className="bg-white p-3 md:p-5 rounded-2xl border border-slate-200 shadow-[0_2px_8px_rgba(0,0,0,0.03)]">
      <div className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 mb-1">{label}</div>
      <div className="flex items-baseline gap-1.5 flex-wrap">
        <span className="text-xl sm:text-2xl md:text-[28px] font-black leading-none font-display" style={{ color }}>{value}</span>
        {!hideDelta && cur != null && prev != null && <Trend cur={cur} prev={prev} invert={invert} />}
      </div>
      {sub && <div className="text-[11px] text-slate-400 font-medium mt-0.5 md:mt-1">{sub}</div>}
    </div>
  );
}

export function Section({ title, accent = "var(--color-brand-teal)", children, insight }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-[0_2px_8px_rgba(0,0,0,0.03)] overflow-hidden">
      <div className="h-[3px]" style={{ background: `linear-gradient(90deg, ${accent}, color-mix(in srgb, ${accent} 53%, transparent))` }} />
      <div className="p-5">
        <div className="text-[11px] font-extrabold uppercase tracking-widest text-slate-400 mb-4">{title}</div>
        {children}
        {insight && (
          <div className="mt-4 pt-3 border-t border-slate-100 text-[12px] font-medium leading-relaxed">
            <span className="text-brand-teal-text font-bold">Insight: </span>
            <span className="text-slate-500">{insight}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// Display-level constants shared across report sub-components
export const SIZE_COLORS = { small: "var(--color-size-small)", medium: "var(--color-brand-teal)", large: "var(--color-brand-coral)" };
export const STATUS_COLORS = { "Booked": "#475569", "Checked in": "#16A34A", "Ready for pick-up": "#7C3AED" };
export const STATUS_LABELS = { "Booked": "Booked / No-show", "Checked in": "Checked in", "Ready for pick-up": "Finished" };
export const PERIODS = [{ v: 7, l: "7 days" }, { v: 30, l: "30 days" }, { v: 90, l: "90 days" }];

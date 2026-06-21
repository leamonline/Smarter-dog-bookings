// Shared presentational widgets used by all report sub-components.

import { formatDelta } from "../../../utils/intl.js";
import { SectionLabel } from "../../ui/index.js";
import { BOOKING_STATUS } from "../../../constants/salon";

export function Trend({ cur, prev, invert }) {
  // formatDelta returns an em-dash when the previous period was zero \u2014 there's
  // no meaningful percentage to display in that case, so the badge is
  // suppressed entirely (rendered as a small em-dash placeholder). It can
  // also cap an extreme swing off a near-zero baseline as ">+999%"/"<-999%".
  const delta = formatDelta(cur, prev);
  if (delta === "\u2014") return <span className="text-caption font-bold text-ink-muted px-1.5">{"\u2014"}</span>;
  if (prev === 0 && cur === 0) return null;
  // Direction comes from the values, not the string, so the capped
  // ">+999%"/"<-999%" forms (which don't start with a bare +/-) are
  // classified correctly.
  const up = cur > prev;
  const good = invert ? !up : up;
  // Strip the leading sign but keep a ">"/"<" cap marker if present.
  const magnitude = delta.replace(/^([<>]?)[+-]?/, "$1");
  return (
    <span className={`inline-flex items-center gap-0.5 text-caption font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap ${good ? "text-emerald-600 bg-emerald-50" : "text-rose-600 bg-rose-50"}`}>
      {up ? "\u2191" : "\u2193"} {magnitude}
    </span>
  );
}

export function Kpi({ label, value, sub, cur, prev, color = "var(--color-brand-teal)", invert, hideDelta }) {
  return (
    <div className="bg-white p-3 md:p-5 rounded-2xl border border-slate-200 shadow-card-resting">
      <SectionLabel className="mb-1">{label}</SectionLabel>
      <div className="flex items-baseline gap-1.5 flex-wrap">
        <span className="text-xl sm:text-2xl md:text-display font-black leading-none font-display" style={{ color }}>{value}</span>
        {!hideDelta && cur != null && prev != null && <Trend cur={cur} prev={prev} invert={invert} />}
      </div>
      {sub && <div className="text-caption text-ink-muted font-medium mt-0.5 md:mt-1">{sub}</div>}
    </div>
  );
}

export function Section({ title, accent = "var(--color-brand-teal)", children, insight }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-card-resting overflow-hidden">
      <div className="h-[3px]" style={{ background: `linear-gradient(90deg, ${accent}, color-mix(in srgb, ${accent} 53%, transparent))` }} />
      <div className="p-5">
        <SectionLabel as="h3" className="mb-4">{title}</SectionLabel>
        {children}
        {insight && (
          <div className="mt-4 pt-3 border-t border-slate-100 text-xs font-medium leading-relaxed">
            <span className="text-brand-teal-text font-bold">Insight: </span>
            <span className="text-ink-muted">{insight}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// Display-level constants shared across report sub-components
export const SIZE_COLORS = { small: "var(--color-size-small)", medium: "var(--color-brand-teal)", large: "var(--color-brand-coral)" };
export const STATUS_COLORS = { [BOOKING_STATUS.BOOKED]: "#475569", [BOOKING_STATUS.CHECKED_IN]: "#16A34A", [BOOKING_STATUS.READY_FOR_PICKUP]: "#7C3AED" };
export const STATUS_LABELS = { [BOOKING_STATUS.BOOKED]: "Booked / No-show", [BOOKING_STATUS.CHECKED_IN]: "Checked in", [BOOKING_STATUS.READY_FOR_PICKUP]: "Finished" };
export const PERIODS = [{ v: 7, l: "7 days" }, { v: 30, l: "30 days" }, { v: 90, l: "90 days" }];

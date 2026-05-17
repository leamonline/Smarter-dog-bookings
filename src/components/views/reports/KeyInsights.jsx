import { Section, SIZE_COLORS } from "./ReportWidgets.jsx";
import { pluralCount } from "../../../utils/intl.js";

function buildSizeSummary(sizes, curRev) {
  const active = sizes.filter((s) => s.n > 0);
  if (active.length === 0) return null;
  if (active.length === 1) {
    const only = active[0];
    return {
      sizes: active,
      text: `${only.label} dogs only — £${only.rev.toFixed(0)} (${only.pct.toFixed(0)}%).`,
    };
  }
  const parts = active.map((s) => `${s.pct.toFixed(0)}% ${s.label}`);
  return {
    sizes: active,
    text: `Mix: ${parts.join(" · ")}.`,
  };
}

function fillRateInsight(util, openDays, days) {
  if (openDays === 0) return null;
  const scope = ` · last ${days} days`;
  if (util < 30) return `Seat fill is ${util.toFixed(0)}% — availability is wide open${scope}.`;
  if (util > 85) return `Seat fill is ${util.toFixed(0)}% — capacity is nearly maxed${scope}.`;
  return `Seat fill is ${util.toFixed(0)}% across ${pluralCount(openDays, "open day", "open days")}${scope}.`;
}

export function KeyInsights({ stats, insights, days }) {
  const items = [];

  if (insights.service) items.push({ key: "service", text: insights.service });
  else if (stats.svcs[0]?.rev > 0) {
    const top = stats.svcs[0];
    items.push({
      key: "service",
      text: `${top.name} drives the period (£${top.rev.toFixed(0)} from ${pluralCount(top.n, "booking", "bookings")}).`,
    });
  }

  if (insights.day) items.push({ key: "day", text: insights.day });
  else if (stats.busiestDay.n > 0) {
    items.push({
      key: "day",
      text: `${stats.busiestDay.label} is the busiest day (${pluralCount(stats.busiestDay.n, "booking", "bookings")}).`,
    });
  }

  if (stats.busiestSlot.n > 0) {
    items.push({
      key: "slot",
      text: `${stats.busiestSlot.label} is the strongest time slot.`,
    });
  }

  const fill = fillRateInsight(stats.util, stats.openDays, days);
  if (fill) items.push({ key: "fill", text: fill });

  if (insights.health) items.push({ key: "health", text: insights.health });

  const sizeSummary = buildSizeSummary(stats.sizes, stats.curRev);

  return (
    <Section title="Key Insights" accent="#FECC13">
      {items.length === 0 && !sizeSummary ? (
        <div className="text-[13px] text-slate-400">Not enough data yet — bookings will reveal patterns.</div>
      ) : (
        <ul className="flex flex-col gap-2 list-none p-0 m-0">
          {items.map((item) => (
            <li key={item.key} className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-yellow mt-1.5 shrink-0" aria-hidden="true" />
              <span className="text-[12px] text-slate-600 leading-relaxed">{item.text}</span>
            </li>
          ))}
        </ul>
      )}

      {sizeSummary && (
        <div className="mt-3 pt-3 border-t border-slate-100">
          <div className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 mb-1.5">
            Size mix
          </div>
          <div className="flex items-center gap-2 mb-1.5">
            {sizeSummary.sizes.map((s) => (
              <div key={s.size} className="flex items-center gap-1">
                <span
                  className="w-2.5 h-2.5 rounded-full inline-block shrink-0"
                  style={{ background: SIZE_COLORS[s.size] }}
                />
                <span className="text-[11px] font-bold text-slate-600">{s.label}</span>
              </div>
            ))}
          </div>
          <div className="text-[12px] text-slate-500 font-medium">{sizeSummary.text}</div>
        </div>
      )}
    </Section>
  );
}

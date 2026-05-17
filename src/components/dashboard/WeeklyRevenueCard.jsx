import { useMemo } from "react";
import { computeRevenue } from "../../engine/pricing.js";
import { toDateStr } from "../../supabase/transforms.js";

// Working revenue targets. Used purely as the bar's denominator so
// "100%" means "a normal full day / normal full week" — the salon
// owner's mental yardstick rather than an enforced limit.
// Rough basis: ~14 dogs/day × £36 avg ≈ £504, rounded.
const DAY_REVENUE_TARGET = 500;
const WEEK_REVENUE_TARGET = DAY_REVENUE_TARGET * 6; // 6 open days/week

function revenueColour(pct) {
  if (pct >= 90) return "bg-emerald-500";
  if (pct >= 50) return "bg-brand-teal";
  if (pct > 0) return "bg-amber-400";
  return "bg-transparent";
}

function revenueLabel(pct, hasRevenue) {
  if (!hasRevenue) return "Empty";
  if (pct >= 100) return "Strong";
  if (pct >= 60) return "Healthy";
  if (pct >= 25) return "Steady";
  return "Quiet";
}

function RevenueBar({ amount, pct, label, sub, statusLabel }) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5 gap-2">
        <div className="text-xs font-semibold text-brand-purple truncate">
          {label}
          {sub && (
            <span className="text-slate-400 font-medium ml-1">{sub}</span>
          )}
        </div>
        <div className="text-xs font-semibold text-slate-500 tabular-nums shrink-0 flex items-center gap-1.5">
          <span className="font-bold text-brand-teal">£{amount}</span>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            {statusLabel}
          </span>
        </div>
      </div>
      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
        <div
          className={`h-full ${revenueColour(pct)} rounded-full transition-all`}
          style={{ width: `${Math.min(100, pct)}%` }}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}

export function WeeklyRevenueCard({
  dates,
  bookingsByDate,
  dogs,
  currentDateObj,
}) {
  const todayStr = toDateStr(new Date());
  const selectedStr = currentDateObj ? toDateStr(currentDateObj) : null;

  const dayRevenue = useMemo(() => {
    if (!selectedStr) return 0;
    return computeRevenue(bookingsByDate?.[selectedStr] || [], dogs);
  }, [bookingsByDate, dogs, selectedStr]);

  const weekRevenue = useMemo(() => {
    return (dates || []).reduce(
      (sum, d) =>
        sum + computeRevenue(bookingsByDate?.[d.dateStr] || [], dogs),
      0,
    );
  }, [dates, bookingsByDate, dogs]);

  const dayPct = Math.round((dayRevenue / DAY_REVENUE_TARGET) * 100);
  const weekPct = Math.round((weekRevenue / WEEK_REVENUE_TARGET) * 100);

  return (
    <section
      aria-label="Revenue summary"
      className="bg-white rounded-2xl border border-gray-100 shadow-[0_2px_8px_rgba(0,0,0,0.04)] p-4"
    >
      <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">
        Revenue
      </h2>

      <div className="flex flex-col gap-3">
        <RevenueBar
          amount={dayRevenue}
          pct={dayPct}
          label={selectedStr === todayStr ? "Today" : "This day"}
          sub={
            currentDateObj
              ? currentDateObj.toLocaleDateString("en-GB", {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                })
              : ""
          }
          statusLabel={revenueLabel(dayPct, dayRevenue > 0)}
        />
        <RevenueBar
          amount={weekRevenue}
          pct={weekPct}
          label="This week"
          statusLabel={revenueLabel(weekPct, weekRevenue > 0)}
        />
      </div>
    </section>
  );
}

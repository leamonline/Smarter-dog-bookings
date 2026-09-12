import { useMemo } from "react";
import { computeRevenue } from "../../engine/pricing";
import { toDateStr } from "../../supabase/transforms";
import { SkeletonBlock } from "../ui/Skeleton.jsx";
import { MetricBar } from "../ui";

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


// Revenue keeps its own semantics — the loading skeleton and its own colour
// scale — and hands MetricBar a rendered figure plus a fill class. While
// loading there is no figure and no total, so the caption and the track are
// both withheld rather than showing a number that is not yet true.
function RevenueBar({ amount, pct, label, sub, statusLabel, loading = false }) {
  return (
    <MetricBar
      label={label}
      subLabel={sub}
      value={
        loading ? (
          <SkeletonBlock className="h-4 w-12 rounded-md" />
        ) : (
          <span className="font-bold text-brand-teal-text">£{amount}</span>
        )
      }
      caption={loading ? null : statusLabel}
      progress={loading ? null : pct}
      progressClassName={revenueColour(pct)}
      loading={loading}
    />
  );
}

export function WeeklyRevenueCard({
  dates,
  bookingsByDate,
  dogs,
  currentDateObj,
  loading = false,
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
      className="bg-white rounded-2xl border border-slate-200/70 p-4"
    >
      <h2 className="text-label text-ink-muted mb-3">
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
          statusLabel={dayRevenue > 0 ? (selectedStr === todayStr ? "expected today" : "expected") : "no revenue"}
          loading={loading}
        />
        <RevenueBar
          amount={weekRevenue}
          pct={weekPct}
          label="This week"
          statusLabel={weekRevenue > 0 ? "booked this week" : "no bookings"}
          loading={loading}
        />
      </div>
    </section>
  );
}

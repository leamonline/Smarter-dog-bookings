import { useState, useEffect, useMemo } from "react";
import { supabase } from "../../supabase/client.js";
import { PRICING, SERVICES, SALON_SLOTS } from "../../constants/index.js";
import { LoadingSpinner } from "../ui/LoadingSpinner.jsx";

// ── Utilities ──────────────────────────────────────────────────

function estPrice(service, size, customPrice) {
  if (customPrice != null && customPrice > 0) return customPrice;
  const str = PRICING[service]?.[size] || "\u00A30";
  return parseFloat(str.replace(/[^0-9.]/g, "")) || 0;
}

function pctChange(cur, prev) {
  if (prev === 0) return cur > 0 ? 100 : 0;
  return ((cur - prev) / prev) * 100;
}

function fmtSlot(slot) {
  const [h, m] = slot.split(":").map(Number);
  const suffix = h < 12 ? "am" : "pm";
  return `${h > 12 ? h - 12 : h === 0 ? 12 : h}:${String(m).padStart(2, "0")}${suffix}`;
}

function datesInRange(n) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    out.push(d.toISOString().split("T")[0]);
  }
  return out;
}

function fmtLabel(dateStr, short) {
  const d = new Date(dateStr + "T00:00:00");
  return short
    ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })
    : d.toLocaleDateString("en-GB", { weekday: "short" });
}

function toLocal(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const SIZE_COLORS = { small: "#F5C518", medium: "#2D8B7A", large: "#E8567F" };
const STATUS_COLORS = { "No-show": "#D97706", "Checked in": "#16A34A", "Ready for pick-up": "#7C3AED" };
const STATUS_LABELS = { "No-show": "Awaiting / No-show", "Checked in": "Checked in", "Ready for pick-up": "Ready" };
const PERIODS = [{ v: 7, l: "7 days" }, { v: 30, l: "30 days" }, { v: 90, l: "90 days" }];

// ── Sub-components ─────────────────────────────────────────────

function Trend({ cur, prev, invert }) {
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

function Kpi({ label, value, sub, cur, prev, color = "#2D8B7A", invert }) {
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

function Section({ title, accent = "#2D8B7A", children, insight }) {
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

// ── Main Component ─────────────────────────────────────────────

export function ReportsView() {
  const [loading, setLoading] = useState(true);
  const [bookings, setBookings] = useState([]);
  const [dogMap, setDogMap] = useState({});
  const [humanMap, setHumanMap] = useState({});
  const [days, setDays] = useState(30);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!supabase) {
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const since = new Date();
        since.setDate(since.getDate() - days * 2);
        const sinceStr = toLocal(since);

        const [bk, dg, hm] = await Promise.all([
          supabase.from("bookings")
            .select("id, booking_date, service, size, status, payment, slot, dog_id")
            .gte("booking_date", sinceStr)
            .order("booking_date"),
          supabase.from("dogs").select("id, human_id, custom_price"),
          supabase.from("humans").select("id, name, surname"),
        ]);

        if (cancelled) return;
        setBookings(bk.data || []);

        const dm = {};
        (dg.data || []).forEach((d) => { dm[d.id] = { humanId: d.human_id, customPrice: d.custom_price }; });
        setDogMap(dm);

        const hm2 = {};
        (hm.data || []).forEach((h) => { hm2[h.id] = `${h.name || ""} ${h.surname || ""}`.trim(); });
        setHumanMap(hm2);
      } catch (err) {
        console.error("ReportsView: failed to load data", err);
      }
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [days]);

  // ── Analytics ────────────────────────────────────────────

  const stats = useMemo(() => {
    const todayStr = toLocal(new Date());
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = toLocal(cutoff);

    const cur = bookings.filter((b) => b.booking_date > cutoffStr);
    const prev = bookings.filter((b) => b.booking_date <= cutoffStr);

    const rev = (list) =>
      list.reduce((s, b) => s + estPrice(b.service, b.size, dogMap[b.dog_id]?.customPrice), 0);

    // KPIs
    const curRev = rev(cur);
    const prevRev = rev(prev);
    const curN = cur.length;
    const prevN = prev.length;
    const avgPer = curN > 0 ? curRev / curN : 0;
    const prevAvgPer = prevN > 0 ? prevRev / prevN : 0;

    // Utilisation (seats used / seats available on open days)
    const openDays = new Set(cur.map((b) => b.booking_date)).size;
    const totalSeats = openDays * SALON_SLOTS.length * 2;
    const util = totalSeats > 0 ? Math.min((curN / totalSeats) * 100, 100) : 0;

    // Revenue trend chart
    const allDates = datesInRange(days);
    const dailyRev = {};
    const dailyCount = {};
    cur.forEach((b) => {
      dailyRev[b.booking_date] = (dailyRev[b.booking_date] || 0) + estPrice(b.service, b.size, dogMap[b.dog_id]?.customPrice);
      dailyCount[b.booking_date] = (dailyCount[b.booking_date] || 0) + 1;
    });

    let chart;
    if (days <= 30) {
      chart = allDates.map((d) => ({ date: d, rev: dailyRev[d] || 0, count: dailyCount[d] || 0 }));
    } else {
      chart = [];
      for (let i = 0; i < allDates.length; i += 7) {
        const week = allDates.slice(i, i + 7);
        chart.push({
          date: week[0],
          rev: week.reduce((s, d) => s + (dailyRev[d] || 0), 0),
          count: week.reduce((s, d) => s + (dailyCount[d] || 0), 0),
        });
      }
    }
    const maxChartRev = Math.max(...chart.map((d) => d.rev), 1);

    // Service breakdown
    const svcAcc = {};
    cur.forEach((b) => {
      if (!svcAcc[b.service]) svcAcc[b.service] = { n: 0, rev: 0 };
      svcAcc[b.service].n++;
      svcAcc[b.service].rev += estPrice(b.service, b.size, dogMap[b.dog_id]?.customPrice);
    });
    const svcs = SERVICES.map((s) => ({
      ...s,
      n: svcAcc[s.id]?.n || 0,
      rev: svcAcc[s.id]?.rev || 0,
    })).sort((a, b) => b.rev - a.rev);
    const maxSvcRev = Math.max(...svcs.map((s) => s.rev), 1);

    // Size breakdown
    const szAcc = {};
    cur.forEach((b) => {
      const sz = b.size || "small";
      if (!szAcc[sz]) szAcc[sz] = { n: 0, rev: 0 };
      szAcc[sz].n++;
      szAcc[sz].rev += estPrice(b.service, b.size, dogMap[b.dog_id]?.customPrice);
    });
    const sizes = ["small", "medium", "large"].map((s) => ({
      size: s,
      label: s.charAt(0).toUpperCase() + s.slice(1),
      n: szAcc[s]?.n || 0,
      rev: szAcc[s]?.rev || 0,
      pct: curN > 0 ? ((szAcc[s]?.n || 0) / curN) * 100 : 0,
    }));

    // Day of week
    const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const dayAcc = Array.from({ length: 7 }, () => ({ n: 0, rev: 0 }));
    cur.forEach((b) => {
      const d = new Date(b.booking_date + "T00:00:00").getDay();
      const idx = d === 0 ? 6 : d - 1;
      dayAcc[idx].n++;
      dayAcc[idx].rev += estPrice(b.service, b.size, dogMap[b.dog_id]?.customPrice);
    });
    const dow = dayAcc.map((d, i) => ({ label: dayLabels[i], ...d }));
    const maxDowN = Math.max(...dow.map((d) => d.n), 1);
    const busiestDay = dow.reduce((best, d) => (d.n > best.n ? d : best), dow[0]);

    // Slot popularity
    const slotAcc = {};
    cur.forEach((b) => { if (b.slot) slotAcc[b.slot] = (slotAcc[b.slot] || 0) + 1; });
    const slots = SALON_SLOTS.map((s) => ({ slot: s, label: fmtSlot(s), n: slotAcc[s] || 0 }));
    const maxSlotN = Math.max(...slots.map((s) => s.n), 1);
    const busiestSlot = slots.reduce((best, s) => (s.n > best.n ? s : best), slots[0]);

    // Status breakdown (past bookings only — future "No-show" = awaiting arrival)
    const pastCur = cur.filter((b) => b.booking_date < todayStr);
    const statusAcc = {};
    pastCur.forEach((b) => { statusAcc[b.status] = (statusAcc[b.status] || 0) + 1; });
    const totalPast = pastCur.length;
    const noShowN = statusAcc["No-show"] || 0;
    const noShowRate = totalPast > 0 ? (noShowN / totalPast) * 100 : 0;
    const prevPastNoShow = prev.filter((b) => b.status === "No-show" && b.booking_date < cutoffStr).length;
    const prevPast = prev.filter((b) => b.booking_date < cutoffStr).length;
    const prevNoShowRate = prevPast > 0 ? (prevPastNoShow / prevPast) * 100 : 0;

    // Customers
    const custAcc = {};
    cur.forEach((b) => {
      const hId = dogMap[b.dog_id]?.humanId;
      if (!hId) return;
      if (!custAcc[hId]) custAcc[hId] = { n: 0, rev: 0, dogs: new Set() };
      custAcc[hId].n++;
      custAcc[hId].rev += estPrice(b.service, b.size, dogMap[b.dog_id]?.customPrice);
      custAcc[hId].dogs.add(b.dog_id);
    });
    const topCusts = Object.entries(custAcc)
      .sort(([, a], [, b]) => b.rev - a.rev)
      .slice(0, 5)
      .map(([id, d]) => ({ name: humanMap[id] || "Unknown", n: d.n, rev: d.rev, dogs: d.dogs.size }));
    const uniqueCusts = Object.keys(custAcc).length;

    // Revenue per customer
    const revPerCust = uniqueCusts > 0 ? curRev / uniqueCusts : 0;
    const prevCustAcc = {};
    prev.forEach((b) => {
      const hId = dogMap[b.dog_id]?.humanId;
      if (hId) prevCustAcc[hId] = true;
    });
    const prevUniqueCusts = Object.keys(prevCustAcc).length;

    return {
      curRev, prevRev, curN, prevN, avgPer, prevAvgPer, util, openDays,
      chart, maxChartRev,
      svcs, maxSvcRev, sizes,
      dow, maxDowN, busiestDay,
      slots, maxSlotN, busiestSlot,
      statusAcc, totalPast, noShowN, noShowRate, prevNoShowRate,
      topCusts, uniqueCusts, prevUniqueCusts, revPerCust,
    };
  }, [bookings, dogMap, humanMap, days]);

  // Chart label positions
  const chartLabels = useMemo(() => {
    const len = stats.chart.length;
    if (!len) return [];
    if (days <= 7) return stats.chart.map((_, i) => i);
    const step = Math.max(Math.floor(len / 5), 1);
    const indices = [];
    for (let i = 0; i < len; i += step) indices.push(i);
    if (indices[indices.length - 1] !== len - 1) indices.push(len - 1);
    return indices;
  }, [stats.chart, days]);

  // Auto-generated insights
  const insights = useMemo(() => {
    const out = {};

    if (stats.svcs.length > 0 && stats.curRev > 0) {
      const top = stats.svcs[0];
      const pct = ((top.rev / stats.curRev) * 100).toFixed(0);
      out.service = `${top.name} drives ${pct}% of your revenue (\u00A3${top.rev.toFixed(0)} from ${top.n} bookings).`;
    }

    const large = stats.sizes.find((s) => s.size === "large");
    if (large && large.pct > 0 && stats.curRev > 0) {
      const revPct = ((large.rev / stats.curRev) * 100).toFixed(0);
      if (parseFloat(revPct) > large.pct + 5) {
        out.size = `Large dogs are ${large.pct.toFixed(0)}% of bookings but ${revPct}% of revenue \u2014 high-value appointments.`;
      }
    }

    if (stats.busiestDay.n > 0) {
      const quietest = stats.dow.reduce((q, d) => (d.n < q.n && d.n > 0 ? d : q), stats.busiestDay);
      if (quietest.label !== stats.busiestDay.label) {
        out.day = `${stats.busiestDay.label} is your busiest day. ${quietest.label} is quietest \u2014 a good candidate for promotions.`;
      } else {
        out.day = `${stats.busiestDay.label} is your busiest day with ${stats.busiestDay.n} bookings.`;
      }
    }

    if (stats.totalPast > 5) {
      if (stats.noShowRate > 15) {
        out.health = `${stats.noShowRate.toFixed(0)}% no-show rate is high. Booking reminders could recover significant lost revenue.`;
      } else if (stats.noShowRate < 5) {
        out.health = "Strong attendance \u2014 your no-show rate is well below the industry average of 10-15%.";
      }
    }

    if (stats.util > 0) {
      if (stats.util < 50 && stats.openDays > 3) {
        out.capacity = `Running at ${stats.util.toFixed(0)}% capacity \u2014 room to grow without adding hours or staff.`;
      } else if (stats.util > 85) {
        out.capacity = `At ${stats.util.toFixed(0)}% capacity \u2014 consider adding slots or opening an extra day.`;
      }
    }

    return out;
  }, [stats]);

  // ── Render ──────────────────────────────────────────────

  return (
    <div className="py-2.5 flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-center gap-3">
        <h2 className="text-[22px] font-extrabold m-0 text-slate-800">Overview & Analytics</h2>
        <div className="flex bg-slate-100 p-1 rounded-lg">
          {PERIODS.map((p) => (
            <button
              key={p.v}
              onClick={() => setDays(p.v)}
              className={`px-3 py-1.5 rounded-md text-[12px] font-bold border-none cursor-pointer transition-all font-[inherit] ${
                days === p.v
                  ? "bg-white text-slate-800 shadow-sm"
                  : "bg-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {p.l}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : stats.curN === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <div className="text-lg font-bold text-slate-400 mb-1">No bookings in this period</div>
          <div className="text-sm text-slate-400">Try selecting a longer time range.</div>
        </div>
      ) : (
        <>
          {/* ── KPI Cards ─────────────────────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi
              label="Revenue"
              value={`\u00A3${stats.curRev.toFixed(0)}`}
              sub={`vs \u00A3${stats.prevRev.toFixed(0)} prev period`}
              cur={stats.curRev}
              prev={stats.prevRev}
              color="#2D8B7A"
            />
            <Kpi
              label="Bookings"
              value={stats.curN}
              sub={`${stats.uniqueCusts} customer${stats.uniqueCusts !== 1 ? "s" : ""}`}
              cur={stats.curN}
              prev={stats.prevN}
              color="#0EA5E9"
            />
            <Kpi
              label="Avg per Dog"
              value={`\u00A3${stats.avgPer.toFixed(0)}`}
              sub="estimated from base prices"
              cur={stats.avgPer}
              prev={stats.prevAvgPer}
              color="#7C3AED"
            />
            <Kpi
              label="Seat Fill Rate"
              value={`${stats.util.toFixed(0)}%`}
              sub={`across ${stats.openDays} open day${stats.openDays !== 1 ? "s" : ""}`}
              color="#E8567F"
            />
          </div>

          {/* ── Revenue Trend ─────────────────────────────── */}
          <Section title={days <= 30 ? "Daily Revenue" : "Weekly Revenue"} accent="#2D8B7A" insight={insights.capacity}>
            {/* Bars */}
            <div className="flex items-end gap-[2px] h-[130px]">
              {stats.chart.map((bar, i) => (
                <div key={i} className="flex-1 flex flex-col justify-end h-full group relative">
                  <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[9px] font-bold px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                    {"\u00A3"}{bar.rev.toFixed(0)} · {bar.count} dog{bar.count !== 1 ? "s" : ""}
                  </div>
                  <div
                    className="w-full rounded-t-sm bg-brand-teal/80 group-hover:bg-brand-teal transition-colors"
                    style={{
                      height: `${Math.max((bar.rev / stats.maxChartRev) * 100, 2)}%`,
                      minHeight: bar.rev > 0 ? "4px" : "1px",
                    }}
                  />
                </div>
              ))}
            </div>
            {/* Labels */}
            <div className="flex gap-[2px] mt-1.5">
              {stats.chart.map((bar, i) => (
                <div key={i} className="flex-1 text-center">
                  {chartLabels.includes(i) && (
                    <span className="text-[9px] text-slate-400 font-semibold">
                      {days <= 7 ? fmtLabel(bar.date, false) : fmtLabel(bar.date, true)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </Section>

          {/* ── Service Mix + Size Split ──────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Section title="Service Mix" accent="#0EA5E9" insight={insights.service}>
              <div className="flex flex-col gap-3">
                {stats.svcs.map((s) => (
                  <div key={s.id}>
                    <div className="flex justify-between items-baseline mb-1">
                      <span className="text-[13px] font-bold text-slate-700">{s.icon} {s.name}</span>
                      <span className="text-[13px] font-extrabold text-slate-800">{"\u00A3"}{s.rev.toFixed(0)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-sky-400 transition-all"
                          style={{ width: `${(s.rev / stats.maxSvcRev) * 100}%` }}
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

            <Section title="Size Split" accent="#E8567F" insight={insights.size}>
              <div className="flex flex-col gap-3">
                {stats.sizes.map((s) => (
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
          </div>

          {/* ── Schedule: Days + Slots ────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Section title="Busiest Days" accent="#2D8B7A" insight={insights.day}>
              <div className="flex items-end gap-2 h-[100px]">
                {stats.dow.map((d) => {
                  const h = Math.max((d.n / stats.maxDowN) * 100, 3);
                  const isBusiest = d.label === stats.busiestDay.label && d.n > 0;
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
              {stats.busiestDay.n > 0 && (
                <div className="mt-3 text-[12px] text-slate-500 font-medium">
                  Peak: <span className="font-bold text-slate-700">{stats.busiestDay.label}</span>{" "}
                  with {"\u00A3"}{stats.busiestDay.rev.toFixed(0)} revenue
                </div>
              )}
            </Section>

            <Section title="Time Slot Demand" accent="#7C3AED">
              <div className="flex flex-col gap-1.5">
                {stats.slots.map((s) => (
                  <div key={s.slot} className="flex items-center gap-2">
                    <span className="text-[12px] font-bold text-slate-600 w-[56px] shrink-0">{s.label}</span>
                    <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-purple-400 transition-all"
                        style={{ width: `${(s.n / stats.maxSlotN) * 100}%` }}
                      />
                    </div>
                    <span className="text-[11px] font-extrabold text-slate-500 w-[24px] text-right">{s.n}</span>
                  </div>
                ))}
              </div>
              {stats.busiestSlot.n > 0 && (
                <div className="mt-3 text-[12px] text-slate-500 font-medium">
                  Peak slot: <span className="font-bold text-slate-700">{stats.busiestSlot.label}</span>{" "}
                  with {stats.busiestSlot.n} booking{stats.busiestSlot.n !== 1 ? "s" : ""}
                </div>
              )}
            </Section>
          </div>

          {/* ── Customers + Booking Health ────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Section title="Top Customers by Revenue" accent="#F5C518">
              {stats.topCusts.length === 0 ? (
                <div className="text-[13px] text-slate-400">No customer data available</div>
              ) : (
                <>
                  <div className="flex flex-col gap-1">
                    {stats.topCusts.map((c, i) => (
                      <div key={c.name} className="flex items-center justify-between py-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-700 text-[11px] font-black flex items-center justify-center shrink-0">
                            {i + 1}
                          </span>
                          <div className="min-w-0">
                            <div className="text-[13px] font-bold text-slate-700 truncate">{c.name}</div>
                            <div className="text-[11px] text-slate-400">
                              {c.n} visit{c.n !== 1 ? "s" : ""} · {c.dogs} dog{c.dogs !== 1 ? "s" : ""}
                            </div>
                          </div>
                        </div>
                        <span className="text-[14px] font-black text-[#2D8B7A] shrink-0 ml-2">
                          {"\u00A3"}{c.rev.toFixed(0)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 pt-3 border-t border-slate-100 flex gap-5">
                    <div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Customers</div>
                      <div className="text-[16px] font-black text-slate-700">{stats.uniqueCusts}</div>
                    </div>
                    <div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Avg per Customer</div>
                      <div className="text-[16px] font-black text-[#2D8B7A]">{"\u00A3"}{stats.revPerCust.toFixed(0)}</div>
                    </div>
                  </div>
                </>
              )}
            </Section>

            <Section title="Booking Health" accent="#E8567F" insight={insights.health}>
              {stats.totalPast === 0 ? (
                <div className="text-[13px] text-slate-400">No completed bookings to analyse yet</div>
              ) : (
                <>
                  {/* Stacked status bar */}
                  <div className="flex h-4 rounded-full overflow-hidden mb-3">
                    {Object.entries(STATUS_COLORS).map(([status, color]) => {
                      const n = stats.statusAcc[status] || 0;
                      const pct = (n / stats.totalPast) * 100;
                      if (pct === 0) return null;
                      return <div key={status} style={{ width: `${pct}%`, background: color }} />;
                    })}
                  </div>

                  {/* Legend */}
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5 mb-5">
                    {Object.entries(STATUS_COLORS).map(([status, color]) => {
                      const n = stats.statusAcc[status] || 0;
                      if (n === 0) return null;
                      const pct = ((n / stats.totalPast) * 100).toFixed(0);
                      return (
                        <div key={status} className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-sm inline-block shrink-0" style={{ background: color }} />
                          <span className="text-[12px] font-semibold text-slate-600">
                            {STATUS_LABELS[status] || status} {pct}%
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {/* No-show highlight */}
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-amber-50 border border-amber-200/60">
                    <div className="shrink-0 text-center">
                      <div className="text-[22px] font-black text-amber-600 leading-none">
                        {stats.noShowRate.toFixed(0)}%
                      </div>
                      <div className="text-[9px] font-bold text-amber-500 uppercase tracking-wide mt-0.5">
                        no-show
                      </div>
                    </div>
                    <div className="text-[12px] text-amber-700 font-medium leading-snug">
                      {stats.noShowN} of {stats.totalPast} past booking{stats.totalPast !== 1 ? "s" : ""}
                      {stats.prevNoShowRate > 0 && (
                        <span className="ml-1">
                          (was {stats.prevNoShowRate.toFixed(0)}% prev period)
                        </span>
                      )}
                    </div>
                  </div>
                </>
              )}
            </Section>
          </div>
        </>
      )}
    </div>
  );
}

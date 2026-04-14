import { useState, useEffect, useMemo } from "react";
import { supabase } from "../supabase/client.js";
import { PRICING, SERVICES, SALON_SLOTS } from "../constants/index.js";

// -- Utility functions -------------------------------------------------------

function estPrice(
  service: string,
  size: string,
  customPrice: number | null | undefined,
): number {
  if (customPrice != null && customPrice > 0) return customPrice;
  const str = (PRICING as Record<string, Record<string, string>>)[service]?.[size] || "\u00A30";
  return parseFloat(str.replace(/[^0-9.]/g, "")) || 0;
}

export function fmtSlot(slot: string): string {
  const [h, m] = slot.split(":").map(Number);
  const suffix = h < 12 ? "am" : "pm";
  return `${h > 12 ? h - 12 : h === 0 ? 12 : h}:${String(m).padStart(2, "0")}${suffix}`;
}

function datesInRange(n: number): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    out.push(d.toISOString().split("T")[0]);
  }
  return out;
}

export function fmtLabel(dateStr: string, short: boolean): string {
  const d = new Date(dateStr + "T00:00:00");
  return short
    ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })
    : d.toLocaleDateString("en-GB", { weekday: "short" });
}

function toLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// -- Hook --------------------------------------------------------------------

export function useReportsData(days: number) {
  const [loading, setLoading] = useState(true);
  const [bookings, setBookings] = useState<any[]>([]);
  const [dogMap, setDogMap] = useState<Record<string, { humanId: string; customPrice: number | null }>>({});
  const [humanMap, setHumanMap] = useState<Record<string, string>>({});

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
          supabase
            .from("bookings")
            .select("id, booking_date, service, size, status, payment, slot, dog_id")
            .gte("booking_date", sinceStr)
            .order("booking_date"),
          supabase.from("dogs").select("id, human_id, custom_price"),
          supabase.from("humans").select("id, name, surname"),
        ]);

        if (cancelled) return;
        setBookings(bk.data || []);

        const dm: Record<string, { humanId: string; customPrice: number | null }> = {};
        (dg.data || []).forEach((d: any) => {
          dm[d.id] = { humanId: d.human_id, customPrice: d.custom_price };
        });
        setDogMap(dm);

        const hm2: Record<string, string> = {};
        (hm.data || []).forEach((h: any) => {
          hm2[h.id] = `${h.name || ""} ${h.surname || ""}`.trim();
        });
        setHumanMap(hm2);
      } catch (err) {
        console.error("ReportsView: failed to load data", err);
      }
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [days]);

  // -- Analytics computation -------------------------------------------------

  const stats = useMemo(() => {
    const todayStr = toLocal(new Date());
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = toLocal(cutoff);

    const cur = bookings.filter((b) => b.booking_date > cutoffStr);
    const prev = bookings.filter((b) => b.booking_date <= cutoffStr);

    const rev = (list: any[]) =>
      list.reduce(
        (s, b) => s + estPrice(b.service, b.size, dogMap[b.dog_id]?.customPrice),
        0,
      );

    // KPIs
    const curRev = rev(cur);
    const prevRev = rev(prev);
    const curN = cur.length;
    const prevN = prev.length;
    const avgPer = curN > 0 ? curRev / curN : 0;
    const prevAvgPer = prevN > 0 ? prevRev / prevN : 0;

    // Utilisation (seats used / seats available on open days)
    const openDays = new Set(cur.map((b: any) => b.booking_date)).size;
    const totalSeats = openDays * SALON_SLOTS.length * 2;
    const util = totalSeats > 0 ? Math.min((curN / totalSeats) * 100, 100) : 0;

    // Revenue trend chart
    const allDates = datesInRange(days);
    const dailyRev: Record<string, number> = {};
    const dailyCount: Record<string, number> = {};
    cur.forEach((b: any) => {
      dailyRev[b.booking_date] =
        (dailyRev[b.booking_date] || 0) +
        estPrice(b.service, b.size, dogMap[b.dog_id]?.customPrice);
      dailyCount[b.booking_date] = (dailyCount[b.booking_date] || 0) + 1;
    });

    let chart: { date: string; rev: number; count: number }[];
    if (days <= 30) {
      chart = allDates.map((d) => ({
        date: d,
        rev: dailyRev[d] || 0,
        count: dailyCount[d] || 0,
      }));
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
    const svcAcc: Record<string, { n: number; rev: number }> = {};
    cur.forEach((b: any) => {
      if (!svcAcc[b.service]) svcAcc[b.service] = { n: 0, rev: 0 };
      svcAcc[b.service].n++;
      svcAcc[b.service].rev += estPrice(
        b.service,
        b.size,
        dogMap[b.dog_id]?.customPrice,
      );
    });
    const svcs = SERVICES.map((s: any) => ({
      ...s,
      n: svcAcc[s.id]?.n || 0,
      rev: svcAcc[s.id]?.rev || 0,
    })).sort((a: any, b: any) => b.rev - a.rev);
    const maxSvcRev = Math.max(...svcs.map((s: any) => s.rev), 1);

    // Size breakdown
    const szAcc: Record<string, { n: number; rev: number }> = {};
    cur.forEach((b: any) => {
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
    cur.forEach((b: any) => {
      const d = new Date(b.booking_date + "T00:00:00").getDay();
      const idx = d === 0 ? 6 : d - 1;
      dayAcc[idx].n++;
      dayAcc[idx].rev += estPrice(b.service, b.size, dogMap[b.dog_id]?.customPrice);
    });
    const dow = dayAcc.map((d, i) => ({ label: dayLabels[i], ...d }));
    const maxDowN = Math.max(...dow.map((d) => d.n), 1);
    const busiestDay = dow.reduce(
      (best, d) => (d.n > best.n ? d : best),
      dow[0],
    );

    // Slot popularity
    const slotAcc: Record<string, number> = {};
    cur.forEach((b: any) => {
      if (b.slot) slotAcc[b.slot] = (slotAcc[b.slot] || 0) + 1;
    });
    const slots = SALON_SLOTS.map((s: any) => ({
      slot: s,
      label: fmtSlot(s),
      n: slotAcc[s] || 0,
    }));
    const maxSlotN = Math.max(...slots.map((s) => s.n), 1);
    const busiestSlot = slots.reduce(
      (best, s) => (s.n > best.n ? s : best),
      slots[0],
    );

    // Status breakdown (past bookings only -- future "No-show" = awaiting arrival)
    const pastCur = cur.filter((b: any) => b.booking_date < todayStr);
    const statusAcc: Record<string, number> = {};
    pastCur.forEach((b: any) => {
      statusAcc[b.status] = (statusAcc[b.status] || 0) + 1;
    });
    const totalPast = pastCur.length;
    const noShowN = statusAcc["No-show"] || 0;
    const noShowRate = totalPast > 0 ? (noShowN / totalPast) * 100 : 0;
    const prevPastNoShow = prev.filter(
      (b: any) => b.status === "No-show" && b.booking_date < cutoffStr,
    ).length;
    const prevPast = prev.filter((b: any) => b.booking_date < cutoffStr).length;
    const prevNoShowRate =
      prevPast > 0 ? (prevPastNoShow / prevPast) * 100 : 0;

    // Customers
    const custAcc: Record<string, { n: number; rev: number; dogs: Set<string> }> = {};
    cur.forEach((b: any) => {
      const hId = dogMap[b.dog_id]?.humanId;
      if (!hId) return;
      if (!custAcc[hId]) custAcc[hId] = { n: 0, rev: 0, dogs: new Set() };
      custAcc[hId].n++;
      custAcc[hId].rev += estPrice(
        b.service,
        b.size,
        dogMap[b.dog_id]?.customPrice,
      );
      custAcc[hId].dogs.add(b.dog_id);
    });
    const topCusts = Object.entries(custAcc)
      .sort(([, a], [, b]) => b.rev - a.rev)
      .slice(0, 5)
      .map(([id, d]) => ({
        name: humanMap[id] || "Unknown",
        n: d.n,
        rev: d.rev,
        dogs: d.dogs.size,
      }));
    const uniqueCusts = Object.keys(custAcc).length;

    // Revenue per customer
    const revPerCust = uniqueCusts > 0 ? curRev / uniqueCusts : 0;
    const prevCustAcc: Record<string, boolean> = {};
    prev.forEach((b: any) => {
      const hId = dogMap[b.dog_id]?.humanId;
      if (hId) prevCustAcc[hId] = true;
    });
    const prevUniqueCusts = Object.keys(prevCustAcc).length;

    return {
      curRev,
      prevRev,
      curN,
      prevN,
      avgPer,
      prevAvgPer,
      util,
      openDays,
      chart,
      maxChartRev,
      svcs,
      maxSvcRev,
      sizes,
      dow,
      maxDowN,
      busiestDay,
      slots,
      maxSlotN,
      busiestSlot,
      statusAcc,
      totalPast,
      noShowN,
      noShowRate,
      prevNoShowRate,
      topCusts,
      uniqueCusts,
      prevUniqueCusts,
      revPerCust,
    };
  }, [bookings, dogMap, humanMap, days]);

  // Chart label positions
  const chartLabels = useMemo(() => {
    const len = stats.chart.length;
    if (!len) return [] as number[];
    if (days <= 7) return stats.chart.map((_: any, i: number) => i);
    const step = Math.max(Math.floor(len / 5), 1);
    const indices: number[] = [];
    for (let i = 0; i < len; i += step) indices.push(i);
    if (indices[indices.length - 1] !== len - 1) indices.push(len - 1);
    return indices;
  }, [stats.chart, days]);

  // Auto-generated insights
  const insights = useMemo(() => {
    const out: Record<string, string> = {};

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
      const quietest = stats.dow.reduce(
        (q, d) => (d.n < q.n && d.n > 0 ? d : q),
        stats.busiestDay,
      );
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
        out.health =
          "Strong attendance \u2014 your no-show rate is well below the industry average of 10-15%.";
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

  return { loading, stats, chartLabels, insights };
}

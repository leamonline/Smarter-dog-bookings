import { useState, useEffect, useMemo } from "react";
import { supabase } from "../supabase/client.js";
import { SERVICES, SALON_SLOTS, BOOKING_STATUS, DOG_SIZE, ALL_DAYS } from "../constants/index";
import { getDefaultOpenForDate } from "../engine/utils";
import { computeBookingPricing, isCountableBooking } from "../engine/bookingRules";
import { computeFillRate } from "../engine/utilisation";
import { fetchDaySettingsWeek } from "../supabase/queries/bootQueries.js";
import { logger } from "../lib/logger";
import type { Booking, Dog, Human } from "../types/index";
import type { Database } from "../supabase/database.types";

/** Open-day predicate: did/does the salon open on this "YYYY-MM-DD" date? */
export type IsOpenDate = (dateStr: string) => boolean;

/**
 * Weekday default (Mon–Wed open) — the fallback when no per-date day_settings
 * row exists. Used everywhere as the "at minimum" rule so closed-by-default
 * weekdays (Thu–Sun) never reach an aggregation, average or "busiest/quietest"
 * pick, even before any settings are fetched.
 */
function defaultIsOpen(dateStr: string): boolean {
  return getDefaultOpenForDate(new Date(dateStr + "T00:00:00"));
}

type ReportDogMap = Record<string, { humanId: string; customPrice: number | null }>;
type ReportHumanMap = Record<string, string>;

// Raw rows as selected by the reports queries — subsets of the generated
// Supabase schema rows, matching the column lists in the .select() calls.
type ReportDogQueryRow = Pick<
  Database["public"]["Tables"]["dogs"]["Row"],
  "id" | "human_id" | "custom_price"
>;
type ReportHumanQueryRow = Pick<
  Database["public"]["Tables"]["humans"]["Row"],
  "id" | "name" | "surname"
>;

// Offline report sources can hold app-shaped bookings or legacy sample rows
// (numeric ids, snake_case fields), so every field is read defensively.
interface ReportSalonBooking extends Partial<Omit<Booking, "id">> {
  id?: string | number;
  dog_id?: string;
  booking_date?: string;
}

interface ReportBookingRow {
  id: string;
  booking_date: string;
  service: string;
  size: string;
  status: string;
  payment: string;
  slot: string;
  dog_id: string;
  addons: string[];
  deposit_amount: number | null;
}

interface ReportSourceData {
  bookings: ReportBookingRow[];
  dogMap: ReportDogMap;
  humanMap: ReportHumanMap;
}

interface SalonReportSource {
  bookingsByDate?: Record<string, ReportSalonBooking[]>;
  dogs?: Record<string, Dog>;
  humans?: Record<string, Human>;
}

const EMPTY_REPORT_SOURCE: ReportSourceData = {
  bookings: [],
  dogMap: {},
  humanMap: {},
};

// -- Utility functions -------------------------------------------------------

export function fmtSlot(slot: string): string {
  const [h, m] = slot.split(":").map(Number);
  const suffix = h < 12 ? "am" : "pm";
  return `${h > 12 ? h - 12 : h === 0 ? 12 : h}:${String(m).padStart(2, "0")}${suffix}`;
}

function datesInRange(n: number, today: Date): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    out.push(toLocal(d));
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

function fullName(human: Partial<Human> | null | undefined): string {
  if (!human) return "";
  return (
    human.fullName ||
    `${human.name || ""} ${human.surname || ""}`.trim()
  );
}

function stableFallbackId(prefix: string, ...parts: unknown[]): string {
  const key = parts
    .map((part) => String(part ?? ""))
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${prefix}:${key || "unknown"}`;
}

function findHuman(
  humans: Record<string, Human>,
  value: unknown,
): Human | null {
  const target = String(value ?? "").trim();
  if (!target) return null;
  if (humans[target]) return humans[target];

  return (
    Object.values(humans).find((human) => {
      const name = fullName(human);
      return human.id === target || name === target;
    }) || null
  );
}

function findDog(dogs: Record<string, Dog>, value: unknown): Dog | null {
  const target = String(value ?? "").trim();
  if (!target) return null;
  if (dogs[target]) return dogs[target];

  return (
    Object.values(dogs).find(
      (dog) => dog.id === target || dog.name === target,
    ) || null
  );
}

export function buildReportSourceFromSalon(
  source: SalonReportSource = {},
): ReportSourceData {
  const bookingsByDate = source.bookingsByDate || {};
  const dogs = source.dogs || {};
  const humans = source.humans || {};
  const dogMap: ReportDogMap = {};
  const humanMap: ReportHumanMap = {};
  const bookings: ReportBookingRow[] = [];

  Object.values(humans).forEach((human) => {
    if (human.id) humanMap[human.id] = fullName(human) || "Unknown";
  });

  Object.values(dogs).forEach((dog) => {
    const owner = findHuman(humans, dog._humanId || dog.humanId);
    const humanId =
      dog._humanId ||
      owner?.id ||
      stableFallbackId("human", dog.humanId || "unknown");
    const dogId = dog.id || stableFallbackId("dog", dog.name);
    dogMap[dogId] = {
      humanId,
      customPrice: dog.customPrice ?? null,
    };
    if (!humanMap[humanId]) {
      humanMap[humanId] = fullName(owner) || dog.humanId || "Unknown";
    }
  });

  Object.entries(bookingsByDate).forEach(([dateStr, dayBookings]) => {
    (dayBookings || []).forEach((booking, index) => {
      const dog = findDog(dogs, booking._dogId || booking.dog_id || booking.dogName);
      const owner = findHuman(
        humans,
        booking._ownerId || booking.owner || dog?._humanId || dog?.humanId,
      );
      const dogId =
        booking._dogId ||
        booking.dog_id ||
        dog?.id ||
        stableFallbackId("dog", dateStr, booking.id ?? index, booking.dogName);
      const humanId =
        booking._ownerId ||
        dog?._humanId ||
        owner?.id ||
        stableFallbackId("human", booking.owner || dog?.humanId || "unknown");

      dogMap[dogId] = {
        humanId,
        customPrice: dog?.customPrice ?? dogMap[dogId]?.customPrice ?? null,
      };
      if (!humanMap[humanId]) {
        humanMap[humanId] = fullName(owner) || booking.owner || dog?.humanId || "Unknown";
      }

      bookings.push({
        id: String(booking.id ?? `${dateStr}-${index}`),
        booking_date: booking.booking_date || booking._bookingDate || dateStr,
        service: booking.service || "full-groom",
        size: booking.size || dog?.size || "small",
        status: booking.status || BOOKING_STATUS.BOOKED,
        payment: booking.payment || "",
        slot: booking.slot || "",
        dog_id: dogId,
        addons: booking.addons || [],
        deposit_amount: booking.depositAmount ?? null,
      });
    });
  });

  return { bookings, dogMap, humanMap };
}

export function computeReportStats(
  days: number,
  bookings: ReportBookingRow[],
  dogMap: ReportDogMap,
  humanMap: ReportHumanMap,
  today: Date = new Date(),
  isOpen: IsOpenDate = defaultIsOpen,
) {
  const todayStr = toLocal(today);
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = toLocal(cutoff);
  // Lower bound for the previous period, so "prev" is the symmetric window
  // (cutoff − N, cutoff] rather than all history before the current window —
  // otherwise every period-over-period delta compares last-N-days against
  // everything-ever-before. The fetch already pulls today − 2*days of rows.
  const prevCutoff = new Date(today);
  prevCutoff.setDate(prevCutoff.getDate() - days * 2);
  const prevCutoffStr = toLocal(prevCutoff);

  // Open-days-only: closed dates (per day_settings, falling back to the weekday
  // default) never enter any aggregation, average or "busiest/quietest" pick —
  // the salon opens Mon–Wed, so 7-weekday stats produced nonsense otherwise.
  // Cancelled bookings are excluded everywhere via the shared isCountableBooking
  // rule. The current window is also capped at today so upcoming bookings don't
  // inflate the KPIs above what the revenue-trend chart (which stops at today)
  // can show — KPI totals then equal the chart total by construction.
  const cur = bookings.filter(
    (b) =>
      b.booking_date > cutoffStr &&
      b.booking_date <= todayStr &&
      isCountableBooking(b) &&
      isOpen(b.booking_date),
  );
  const prev = bookings.filter(
    (b) =>
      b.booking_date > prevCutoffStr &&
      b.booking_date <= cutoffStr &&
      isCountableBooking(b) &&
      isOpen(b.booking_date),
  );

  // Single pricing source (computeBookingPricing) — same engine the cash-up and
  // booking cards use, so add-ons, custom prices (incl. a deliberate £0) and the
  // expected/still-to-collect split all agree across the page.
  const pricingOf = (b: ReportBookingRow) =>
    computeBookingPricing({
      service: b.service,
      size: b.size,
      addons: b.addons,
      payment: b.payment,
      depositAmount: b.deposit_amount,
      customPrice: dogMap[b.dog_id]?.customPrice,
    });
  const priceOf = (b: ReportBookingRow) => pricingOf(b).subtotal;
  const dueOf = (b: ReportBookingRow) => pricingOf(b).amountDue;

  const sumBy = (
    list: ReportBookingRow[],
    fn: (b: ReportBookingRow) => number,
  ) => list.reduce((s, b) => s + fn(b), 0);

  const curRev = sumBy(cur, priceOf);
  const prevRev = sumBy(prev, priceOf);
  // Expected vs collected: amountDue is what's still to take at pick-up.
  const curDue = sumBy(cur, dueOf);
  const prevDue = sumBy(prev, dueOf);
  const curN = cur.length;
  const prevN = prev.length;
  const avgPer = curN > 0 ? curRev / curN : 0;
  const prevAvgPer = prevN > 0 ? prevRev / prevN : 0;

  const allDates = datesInRange(days, today);
  const openDayDates = allDates.filter(isOpen);
  // Denominator = open calendar days in the window (not "days that happened to
  // have a booking"), so closed days don't distort the seat-fill rate.
  const openDays = openDayDates.length;
  // Capacity against the salon's real daily limit (DAILY_DOG_CAP), the same
  // scale the weekly calendar's Full/Steady/Quiet badge uses.
  const util = computeFillRate(curN, openDays);

  const dailyRev: Record<string, number> = {};
  const dailyCount: Record<string, number> = {};
  cur.forEach((b) => {
    dailyRev[b.booking_date] = (dailyRev[b.booking_date] || 0) + priceOf(b);
    dailyCount[b.booking_date] = (dailyCount[b.booking_date] || 0) + 1;
  });

  const chart =
    days <= 30
      ? // Daily view: plot open dates only — no £0 closed-day bars cluttering it.
        openDayDates.map((d) => ({
          date: d,
          rev: dailyRev[d] || 0,
          count: dailyCount[d] || 0,
        }))
      : // Weekly view: chunk the full calendar by 7 so weeks align; closed days
        // sum to 0 because dailyRev only holds open-day rows.
        Array.from({ length: Math.ceil(allDates.length / 7) }, (_, i) => {
        const week = allDates.slice(i * 7, i * 7 + 7);
        return {
          date: week[0],
          rev: week.reduce((s, d) => s + (dailyRev[d] || 0), 0),
          count: week.reduce((s, d) => s + (dailyCount[d] || 0), 0),
        };
      });
  const maxChartRev = Math.max(...chart.map((d) => d.rev), 1);

  const svcAcc: Record<string, { n: number; rev: number }> = {};
  cur.forEach((b) => {
    if (!svcAcc[b.service]) svcAcc[b.service] = { n: 0, rev: 0 };
    svcAcc[b.service].n++;
    svcAcc[b.service].rev += priceOf(b);
  });
  const svcs = SERVICES.map((s) => ({
    ...s,
    n: svcAcc[s.id]?.n || 0,
    rev: svcAcc[s.id]?.rev || 0,
  })).sort((a, b) => b.rev - a.rev);
  const maxSvcRev = Math.max(...svcs.map((s) => s.rev), 1);

  const szAcc: Record<string, { n: number; rev: number }> = {};
  cur.forEach((b) => {
    const sz = b.size || "small";
    if (!szAcc[sz]) szAcc[sz] = { n: 0, rev: 0 };
    szAcc[sz].n++;
    szAcc[sz].rev += priceOf(b);
  });
  const sizes = ["small", "medium", "large"].map((s) => ({
    size: s,
    label: s.charAt(0).toUpperCase() + s.slice(1),
    n: szAcc[s]?.n || 0,
    rev: szAcc[s]?.rev || 0,
    pct: curN > 0 ? ((szAcc[s]?.n || 0) / curN) * 100 : 0,
  }));

  const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const dayAcc = Array.from({ length: 7 }, () => ({ n: 0, rev: 0 }));
  cur.forEach((b) => {
    const d = new Date(b.booking_date + "T00:00:00").getDay();
    const idx = d === 0 ? 6 : d - 1;
    dayAcc[idx].n++;
    dayAcc[idx].rev += priceOf(b);
  });
  // `open` marks the weekdays the salon generally trades (Mon–Wed via ALL_DAYS).
  // Closed weekdays are never rendered or ranked — busiest/quietest are chosen
  // from open weekdays only.
  const dow = dayAcc.map((d, i) => ({
    label: dayLabels[i],
    open: ALL_DAYS[i]?.defaultOpen ?? false,
    ...d,
  }));
  const openDow = dow.filter((d) => d.open);
  const maxDowN = Math.max(...openDow.map((d) => d.n), 1);
  const busiestDay = openDow.reduce(
    (best, d) => (d.n > best.n ? d : best),
    openDow[0] ?? dow[0],
  );

  const slotAcc: Record<string, number> = {};
  cur.forEach((b) => {
    if (b.slot) slotAcc[b.slot] = (slotAcc[b.slot] || 0) + 1;
  });
  const slots = SALON_SLOTS.map((s) => ({
    slot: s,
    label: fmtSlot(s),
    n: slotAcc[s] || 0,
  }));
  const maxSlotN = Math.max(...slots.map((s) => s.n), 1);
  const busiestSlot = slots.reduce(
    (best, s) => (s.n > best.n ? s : best),
    slots[0],
  );

  const pastCur = cur.filter((b) => b.booking_date < todayStr);
  const statusAcc: Record<string, number> = {};
  pastCur.forEach((b) => {
    statusAcc[b.status] = (statusAcc[b.status] || 0) + 1;
  });
  const totalPast = pastCur.length;
  const noShowN = statusAcc[BOOKING_STATUS.BOOKED] || 0;
  const noShowRate = totalPast > 0 ? (noShowN / totalPast) * 100 : 0;
  const prevPastNoShow = prev.filter(
    (b) => b.status === BOOKING_STATUS.BOOKED && b.booking_date < cutoffStr,
  ).length;
  const prevPast = prev.filter((b) => b.booking_date < cutoffStr).length;
  const prevNoShowRate = prevPast > 0 ? (prevPastNoShow / prevPast) * 100 : 0;

  const custAcc: Record<string, { n: number; rev: number; dogs: Set<string> }> = {};
  cur.forEach((b) => {
    const hId = dogMap[b.dog_id]?.humanId;
    if (!hId) return;
    if (!custAcc[hId]) custAcc[hId] = { n: 0, rev: 0, dogs: new Set() };
    custAcc[hId].n++;
    custAcc[hId].rev += priceOf(b);
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
  const revPerCust = uniqueCusts > 0 ? curRev / uniqueCusts : 0;
  const prevCustAcc: Record<string, boolean> = {};
  prev.forEach((b) => {
    const hId = dogMap[b.dog_id]?.humanId;
    if (hId) prevCustAcc[hId] = true;
  });
  const prevUniqueCusts = Object.keys(prevCustAcc).length;

  return {
    curRev,
    prevRev,
    curDue,
    prevDue,
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
}

export function buildChartLabels(chart: Array<unknown>, days: number): number[] {
  const len = chart.length;
  if (!len) return [];
  if (days <= 7) return chart.map((_, i) => i);
  const step = Math.max(Math.floor(len / 5), 1);
  const indices: number[] = [];
  for (let i = 0; i < len; i += step) indices.push(i);
  if (indices[indices.length - 1] !== len - 1) indices.push(len - 1);
  return indices;
}

export function buildReportInsights(stats: ReturnType<typeof computeReportStats>) {
  const out: Record<string, string> = {};

  if (stats.svcs.length > 0 && stats.curRev > 0) {
    const top = stats.svcs[0];
    const pct = ((top.rev / stats.curRev) * 100).toFixed(0);
    out.service = `${top.name} drives ${pct}% of your revenue (\u00A3${top.rev.toFixed(0)} from ${top.n} bookings).`;
  }

  const large = stats.sizes.find((s) => s.size === DOG_SIZE.LARGE);
  if (large && large.pct > 0 && stats.curRev > 0) {
    const revPct = ((large.rev / stats.curRev) * 100).toFixed(0);
    if (parseFloat(revPct) > large.pct + 5) {
      out.size = `Large dogs are ${large.pct.toFixed(0)}% of bookings but ${revPct}% of revenue \u2014 high-value appointments.`;
    }
  }

  if (stats.busiestDay.n > 0) {
    const quietest = stats.dow
      .filter((d) => d.open)
      .reduce((q, d) => (d.n < q.n && d.n > 0 ? d : q), stats.busiestDay);
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
}

// -- Hook --------------------------------------------------------------------

export function useReportsData(days: number, source?: SalonReportSource) {
  const [loading, setLoading] = useState(true);
  const [reportSource, setReportSource] =
    useState<ReportSourceData>(EMPTY_REPORT_SOURCE);
  // Per-date open/closed across the analytics window. Empty ⇒ every date falls
  // back to the weekday default (Mon–Wed) via `defaultIsOpen`.
  const [dayOpenByDate, setDayOpenByDate] = useState<Record<string, boolean>>(
    {},
  );

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      if (!supabase) {
        const offlineSource = buildReportSourceFromSalon(source);
        if (!controller.signal.aborted) {
          setReportSource(offlineSource);
          // Offline has no historical per-date settings — default (Mon–Wed).
          setDayOpenByDate({});
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      try {
        const since = new Date();
        since.setDate(since.getDate() - days * 2);
        const sinceStr = toLocal(since);
        const todayStr = toLocal(new Date());

        const [bk, dg, hm, ds] = await Promise.all([
          supabase
            .from("bookings")
            .select("id, booking_date, service, size, status, payment, slot, dog_id, addons, deposit_amount")
            .gte("booking_date", sinceStr)
            .order("booking_date")
            .abortSignal(controller.signal),
          supabase.from("dogs").select("id, human_id, custom_price").abortSignal(controller.signal),
          supabase.from("humans").select("id, name, surname").abortSignal(controller.signal),
          // Same source/shape useDaySettings uses, over the analytics window.
          fetchDaySettingsWeek(supabase, sinceStr, todayStr, controller.signal),
        ]);

        if (controller.signal.aborted) return;
        if (bk.error || dg.error || hm.error) {
          throw new Error(
            [
              bk.error?.message,
              dg.error?.message,
              hm.error?.message,
            ]
              .filter(Boolean)
              .join(" | "),
          );
        }

        const dogMap: ReportDogMap = {};
        (dg.data || []).forEach((d: ReportDogQueryRow) => {
          dogMap[d.id] = { humanId: d.human_id, customPrice: d.custom_price };
        });

        const humanMap: ReportHumanMap = {};
        (hm.data || []).forEach((h: ReportHumanQueryRow) => {
          humanMap[h.id] = `${h.name || ""} ${h.surname || ""}`.trim();
        });

        // Day settings degrade gracefully: on error we keep an empty map and
        // every date falls back to the weekday default.
        const dayOpen: Record<string, boolean> = {};
        if (!ds.error) {
          (
            (ds.data || []) as Array<{ setting_date: string; is_open: boolean }>
          ).forEach((row) => {
            dayOpen[row.setting_date] = row.is_open;
          });
        }

        setReportSource({
          bookings: (bk.data || []) as ReportBookingRow[],
          dogMap,
          humanMap,
        });
        setDayOpenByDate(dayOpen);
      } catch (err) {
        if (!controller.signal.aborted) {
          logger.error("ReportsView: failed to load data", err);
        }
      }
      if (!controller.signal.aborted) setLoading(false);
    }

    load();
    return () => {
      controller.abort();
    };
  }, [days, source]);

  // Open-day predicate: explicit day_settings row wins, else weekday default.
  const isOpen = useMemo<IsOpenDate>(
    () => (dateStr) =>
      dateStr in dayOpenByDate ? dayOpenByDate[dateStr] : defaultIsOpen(dateStr),
    [dayOpenByDate],
  );

  const stats = useMemo(
    () =>
      computeReportStats(
        days,
        reportSource.bookings,
        reportSource.dogMap,
        reportSource.humanMap,
        new Date(),
        isOpen,
      ),
    [days, reportSource, isOpen],
  );
  const chartLabels = useMemo(
    () => buildChartLabels(stats.chart, days),
    [stats.chart, days],
  );
  const insights = useMemo(() => buildReportInsights(stats), [stats]);

  return { loading, stats, chartLabels, insights };
}

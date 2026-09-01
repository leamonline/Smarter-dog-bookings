import { useMemo, useState } from "react";

import { SERVICES } from "../../../constants/index";
import { getDefaultOpenForDate } from "../../../engine/utils";
import { resolveBookingDisplay } from "../../../engine/bookingRules";
import { buildWeeklyCashUp } from "../../../engine/cashup";
import { toDateStr } from "../../../supabase/transforms";
import { fmtSlot } from "../../../hooks/useReportsData";
import { useDaySettings } from "../../../supabase/hooks/useDaySettings";
import { Badge, SectionLabel, SkeletonText } from "../../ui/index.js";
import { useWeeklyCashUp } from "./useWeeklyCashUp.js";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const SERVICE_NAME = Object.fromEntries(SERVICES.map((s) => [s.id, s.name]));

// Payment-status display. These are expected-takings buckets, NOT reconciled
// money — labels stay honest ("expected" / "to collect"), and no cash/card
// split is implied.
const STATUS_META = {
  paid: { label: "Paid in full", tone: "success" },
  deposit: { label: "Deposit paid", tone: "info" },
  due: { label: "Due at pick-up", tone: "neutral" },
};
const STATUS_ORDER = ["paid", "deposit", "due"];

function money(n) {
  const v = Number(n) || 0;
  return `£${v.toLocaleString("en-GB", {
    minimumFractionDigits: Number.isInteger(v) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

function BreakdownChips({ breakdown }) {
  const chips = STATUS_ORDER.filter((key) => breakdown[key].count > 0);
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map((key) => (
        <Badge key={key} tone={STATUS_META[key].tone}>
          {breakdown[key].count} {STATUS_META[key].label.toLowerCase()} ·{" "}
          {money(breakdown[key].amount)}
        </Badge>
      ))}
    </div>
  );
}

function CashUpDayCard({ day, meta }) {
  const { dogs, humans, rows, dayTotal, dueTotal, statusBreakdown } = day;
  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden">
      <div className="flex items-center justify-between gap-3 bg-slate-50 px-4 py-2 border-b border-slate-100">
        <h3 className="text-sm font-extrabold text-slate-800 m-0">{meta.full}</h3>
        <span className="text-caption font-semibold text-ink-muted">
          {rows.length} dog{rows.length === 1 ? "" : "s"}
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="px-4 py-3 text-sm text-ink-muted">
          No dogs booked — <span className="font-semibold text-slate-600">£0</span> expected.
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 m-0 p-0 list-none">
          {rows.map((row) => {
            const display = resolveBookingDisplay(row.booking, dogs, humans);
            const service =
              SERVICE_NAME[row.booking.service] || row.booking.service || "—";
            const slot = row.booking.slot ? fmtSlot(row.booking.slot) : "";
            return (
              <li
                key={row.booking.id}
                className="flex items-center justify-between gap-3 px-4 py-2.5"
              >
                <div className="min-w-0">
                  <div className="font-bold text-slate-800 truncate">
                    {display.dogName}
                  </div>
                  <div className="text-caption text-ink-muted truncate">
                    {display.owner} · {service}
                    {slot ? ` · ${slot}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-bold text-slate-800 tabular-nums">
                    {money(row.subtotal)}
                  </span>
                  {row.subtotal === 0 && (
                    <Badge tone="warning">£0 — check price</Badge>
                  )}
                  <Badge tone={STATUS_META[row.status].tone}>
                    {STATUS_META[row.status].label}
                  </Badge>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2.5 bg-white border-t border-slate-100">
        <BreakdownChips breakdown={statusBreakdown} />
        <div className="text-right ml-auto">
          <div className="text-sm">
            <span className="font-black text-slate-800 tabular-nums">
              {money(dayTotal)}
            </span>{" "}
            <span className="text-caption text-ink-muted">day total (expected)</span>
          </div>
          {dueTotal > 0 && (
            <div className="text-caption text-ink-muted tabular-nums">
              {money(dueTotal)} still to collect at pick-up
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function WeeklyCashUp() {
  const [weekOffset, setWeekOffset] = useState(0);

  const weekStart = useMemo(() => {
    const today = new Date();
    const dow = today.getDay();
    const mondayOffset = dow === 0 ? -6 : 1 - dow;
    const monday = new Date(today);
    monday.setDate(today.getDate() + mondayOffset + weekOffset * 7);
    monday.setHours(0, 0, 0, 0);
    return monday;
  }, [weekOffset]);

  const dates = useMemo(
    () =>
      DAY_LABELS.map((label, i) => {
        const d = new Date(weekStart);
        d.setDate(weekStart.getDate() + i);
        return {
          label,
          dateObj: d,
          dateStr: toDateStr(d),
          full: d.toLocaleDateString("en-GB", {
            weekday: "long",
            day: "numeric",
            month: "long",
          }),
        };
      }),
    [weekStart],
  );

  const { daySettings } = useDaySettings(weekStart);
  const { bookingsByDate, dogs, humans, loading } = useWeeklyCashUp(weekStart);

  // The single open-days test, shared with the analytics below:
  // daySettings override wins, else the weekday default (Mon–Wed open).
  const openDates = useMemo(
    () =>
      dates.filter(
        (d) => daySettings[d.dateStr]?.isOpen ?? getDefaultOpenForDate(d.dateObj),
      ),
    [dates, daySettings],
  );

  const cashUp = useMemo(
    () => buildWeeklyCashUp(openDates.map((d) => d.dateStr), bookingsByDate, dogs),
    [openDates, bookingsByDate, dogs],
  );

  const metaByDate = useMemo(
    () => Object.fromEntries(openDates.map((d) => [d.dateStr, d])),
    [openDates],
  );

  const weekRangeLabel = useMemo(() => {
    const fmt = (d, withYear) =>
      d.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        ...(withYear ? { year: "numeric" } : {}),
      });
    // Span the open days actually shown below (first → last open date), so the
    // header can't advertise a full Mon–Sun week while only Mon–Wed have cards.
    const span = openDates.length > 0 ? openDates : dates;
    const first = span[0].dateObj;
    const last = span[span.length - 1].dateObj;
    return `${fmt(first, false)} – ${fmt(last, true)}`;
  }, [dates, openDates]);

  const isThisWeek = weekOffset === 0;

  return (
    <section
      aria-label="Weekly cash-up"
      className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-card-resting"
    >
      {/* Header + week navigation */}
      <div className="bg-gradient-to-br from-brand-purple to-brand-purple-light px-4 sm:px-6 py-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h2 className="text-[15px] sm:text-base font-extrabold text-white m-0">
              Weekly cash-up
            </h2>
            <p className="text-caption sm:text-xs font-medium text-white/80 m-0 mt-0.5">
              Expected takings from booked dogs — not money taken.
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setWeekOffset((o) => o - 1)}
              aria-label="Previous week"
              className="w-8 h-8 inline-flex items-center justify-center rounded-lg bg-white/15 hover:bg-white/25 text-white font-bold transition-colors"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => setWeekOffset(0)}
              disabled={isThisWeek}
              className="px-2.5 h-8 inline-flex items-center justify-center rounded-lg bg-white/15 hover:bg-white/25 disabled:opacity-50 disabled:cursor-default text-white text-caption font-bold transition-colors"
            >
              This week
            </button>
            <button
              type="button"
              onClick={() => setWeekOffset((o) => o + 1)}
              aria-label="Next week"
              className="w-8 h-8 inline-flex items-center justify-center rounded-lg bg-white/15 hover:bg-white/25 text-white font-bold transition-colors"
            >
              ›
            </button>
          </div>
        </div>
        <div className="text-caption font-semibold text-white/90 mt-1.5">
          {isThisWeek ? "This week" : "Week of"} · {weekRangeLabel} · open days only
        </div>
      </div>

      <div className="p-4 sm:p-6 flex flex-col gap-3">
        {loading ? (
          <SkeletonText lines={5} />
        ) : openDates.length === 0 ? (
          <div className="text-sm text-ink-muted">
            The salon is closed every day this week — nothing to cash up.
          </div>
        ) : (
          <>
            {cashUp.days.map((day) => (
              <CashUpDayCard
                key={day.dateStr}
                day={{ ...day, dogs, humans }}
                meta={metaByDate[day.dateStr]}
              />
            ))}

            {/* Week grand total */}
            <div className="rounded-xl bg-brand-purple/5 border border-brand-purple/15 px-4 py-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <div>
                <SectionLabel className="mb-1">Expected this week</SectionLabel>
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-2xl sm:text-display font-black text-brand-purple font-display leading-none tabular-nums">
                    {money(cashUp.weekTotal)}
                  </span>
                  {cashUp.weekDueTotal > 0 && (
                    <span className="text-caption text-ink-muted tabular-nums">
                      {money(cashUp.weekDueTotal)} still to collect
                    </span>
                  )}
                </div>
              </div>
              <BreakdownChips breakdown={cashUp.weekStatusBreakdown} />
            </div>
          </>
        )}
      </div>
    </section>
  );
}

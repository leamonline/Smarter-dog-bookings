// Daily Brief header — one identity row and one status sentence, the same
// anatomy at every width. The date IS the date-picker control; availability
// state lives on the button that manages it; the act-now numbers are itemised
// so the count defines itself ("1 late · 1 to confirm") instead of an opaque
// "N need action" whose meaning hid in a hover tooltip.
import { CalendarDays, ChevronDown, ChevronRight, Clock3 } from "lucide-react";
import { DAY_CAPACITY } from "../../../engine/utilisation";
import { PageHeader, PageHeaderPill } from "../../ui/PageHeader.jsx";
import { formatMoney } from "./parts.jsx";

// The union the needs-attention FILTER shows (money is deliberately part of
// the filter so an owing dog can never be filtered out of sight, even though
// it is not part of the act-now counts).
export const NEEDS_ACTION_DEFINITION =
  "Needs attention means late arrivals, unconfirmed bookings, dogs waiting to be collected, and unpaid balances.";

function segmentPlural(count, singular, plural = null) {
  return `${count} ${count === 1 ? singular : plural || `${singular}s`}`;
}

/**
 * The itemised act-now cluster. Zero → a calm sentence (today only — a past
 * or future date needs no reassurance). Non-zero → one toggle that filters
 * the board to everything needing attention; the segments name the reasons so
 * the number is self-defining.
 */
function NowCluster({ nowCounts, actionCount, isToday, active, onToggle }) {
  const { late, toConfirm, waiting, dogs } = nowCounts;
  if (dogs === 0 && actionCount === 0) {
    return isToday ? (
      <span className="text-[13px] font-bold text-brand-teal-text">Nothing needs you yet</span>
    ) : null;
  }

  const segments = [
    late > 0 && { text: `${late} late`, tone: "text-brand-coral-text" },
    toConfirm > 0 && { text: `${toConfirm} to confirm`, tone: "text-amber-800" },
    waiting > 0 && { text: `${waiting} waiting`, tone: "text-brand-purple" },
  ].filter(Boolean);
  // A day can need attention on money alone (act-now counts all zero).
  if (segments.length === 0) {
    segments.push({ text: segmentPlural(actionCount, "to review"), tone: "text-brand-purple" });
  }

  if (active) {
    return (
      <button
        type="button"
        aria-pressed="true"
        aria-label={`Show all bookings; ${actionCount} currently need attention`}
        aria-describedby="needs-action-definition"
        data-filter-selected="true"
        onClick={onToggle}
        className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-control bg-brand-purple px-3 text-[13px] font-bold text-white outline-none focus-visible:ring-2 focus-visible:ring-brand-purple focus-visible:ring-offset-2"
      >
        Showing {actionCount} · Clear
      </button>
    );
  }

  return (
    <button
      type="button"
      aria-pressed="false"
      aria-label={`Filter to the ${actionCount} ${actionCount === 1 ? "booking" : "bookings"} needing attention: ${segments.map((s) => s.text).join(", ")}`}
      aria-describedby="needs-action-definition"
      data-filter-selected="false"
      onClick={onToggle}
      className="group inline-flex min-h-11 shrink-0 items-center gap-x-2 rounded-control px-2 -mx-1 text-[13px] font-bold leading-none outline-none transition-colors hover:bg-brand-coral/[0.06] focus-visible:ring-2 focus-visible:ring-brand-purple focus-visible:ring-offset-2"
    >
      {segments.map((segment, index) => (
        <span key={segment.text} className={`whitespace-nowrap tabular-nums ${segment.tone}`}>
          {index > 0 ? <span aria-hidden="true" className="mr-2 font-normal text-slate-300">·</span> : null}
          {segment.text}
        </span>
      ))}
      <ChevronRight size={13} aria-hidden="true" className="self-center text-slate-400 transition-colors group-hover:text-brand-coral-text" />
    </button>
  );
}

export function TodayHeader({
  dateLabel,
  dogsBooked,
  capacityTotal = DAY_CAPACITY,
  nowCounts = { late: 0, toConfirm: 0, waiting: 0, dogs: 0 },
  actionCount = 0,
  unpaidTotal = 0,
  isDayOpen,
  isToday = false,
  nextOnlineSlot = null,
  nextUp = null,
  onJumpToNext,
  onOpenDatePicker,
  onManageAvailability,
  actionFilterActive = false,
  onToggleActionFilter,
}) {
  const availabilityLabel = nextOnlineSlot
    ? `Next online ${nextOnlineSlot}`
    : isDayOpen
      ? "No online slots today"
      : "Online booking closed";
  const overCap = dogsBooked > capacityTotal;

  return (
    <PageHeader title="Daily Brief" className="!mb-4 !min-h-0 !gap-1.5 !py-3">
      <div className="grid w-full gap-1.5">
        {/* Identity row: the date is the picker; availability state lives on
            the button that manages it. */}
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
          <button
            type="button"
            data-testid="daily-brief-date"
            onClick={onOpenDatePicker}
            aria-label={`${dateLabel} — choose a different date`}
            className="mr-auto inline-flex min-h-11 min-w-0 items-center gap-2 rounded-control px-1 -ml-1 text-left outline-none transition-colors hover:bg-brand-purple/[0.04] focus-visible:ring-2 focus-visible:ring-brand-purple focus-visible:ring-offset-2"
          >
            <CalendarDays size={18} aria-hidden="true" className="shrink-0 text-brand-purple/45" />
            <strong className="min-w-0 truncate font-display text-xl font-bold leading-none tracking-[-0.02em] text-brand-purple sm:text-2xl">
              {dateLabel}
            </strong>
            <ChevronDown size={15} aria-hidden="true" className="shrink-0 text-brand-purple/45" />
          </button>
          <PageHeaderPill tone={isDayOpen ? "open" : "closed"} dot>
            {isDayOpen ? "Salon open" : "Salon closed"}
          </PageHeaderPill>
          <button
            type="button"
            onClick={onManageAvailability}
            aria-label={`Manage availability — ${availabilityLabel}`}
            className="inline-flex min-h-11 shrink-0 flex-col items-start justify-center gap-0 rounded-control border border-slate-300 bg-white px-3.5 py-1 text-left outline-none transition-colors hover:border-brand-purple/40 hover:bg-brand-purple/5 focus-visible:ring-2 focus-visible:ring-brand-purple focus-visible:ring-offset-2 max-md:ml-auto"
          >
            <span className="inline-flex items-center gap-1.5 text-[13px] font-bold leading-tight text-brand-purple">
              <Clock3 size={15} aria-hidden="true" />
              Manage availability
            </span>
            <span aria-hidden="true" className="pl-[21px] text-[11px] font-medium leading-tight text-slate-500">
              {availabilityLabel}
            </span>
          </button>
        </div>

        {/* Status sentence: booked · act-now (itemised, filters) · money ·
            over-cap warning · the Next jump. Segments render only when true. */}
        <div
          role="region"
          aria-label="Daily Brief status"
          className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-0.5 text-[13px] text-slate-600"
        >
          <span className="whitespace-nowrap">
            <strong className="font-bold text-brand-purple tabular-nums">{dogsBooked}</strong> booked
          </span>
          <NowCluster
            nowCounts={nowCounts}
            actionCount={actionCount}
            isToday={isToday}
            active={actionFilterActive}
            onToggle={onToggleActionFilter}
          />
          {unpaidTotal > 0 ? (
            <span className="whitespace-nowrap">
              <strong className="font-bold text-brand-purple tabular-nums">{formatMoney(unpaidTotal)}</strong> to collect
            </span>
          ) : dogsBooked > 0 ? (
            <span className="whitespace-nowrap font-bold text-brand-teal-text">All paid</span>
          ) : null}
          {overCap ? (
            <span className="whitespace-nowrap font-bold text-brand-coral-text">
              <span className="tabular-nums">{dogsBooked}/{capacityTotal}</span> over the daily cap
            </span>
          ) : null}
          {isToday && nextUp ? (
            <button
              type="button"
              onClick={onJumpToNext}
              aria-label={`Next: ${nextUp.dogName} — ${nextUp.text}`}
              className="ml-auto hidden min-h-11 min-w-0 items-center gap-1 rounded-control px-1 text-[13px] font-bold text-brand-purple underline decoration-brand-purple/25 underline-offset-4 outline-none transition-colors hover:decoration-brand-purple md:inline-flex focus-visible:ring-2 focus-visible:ring-brand-purple focus-visible:ring-offset-2"
            >
              <span className="shrink-0">Next:</span>
              <span className={`min-w-0 truncate ${nextUp.tone === "overdue" ? "text-brand-coral-text" : ""}`}>
                {nextUp.dogName} — {nextUp.text}
              </span>
              <ChevronDown size={13} aria-hidden="true" className="shrink-0 text-brand-purple/50" />
            </button>
          ) : null}
        </div>
      </div>

      {actionCount > 0 ? (
        <span id="needs-action-definition" className="sr-only">
          {NEEDS_ACTION_DEFINITION}
        </span>
      ) : null}
    </PageHeader>
  );
}

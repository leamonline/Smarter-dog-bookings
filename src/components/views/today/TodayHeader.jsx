// The board's header — the day, and whether it is going well.
//
// Two lines, one anatomy at every width. The first is identity and control:
// the date IS the date-picker (it must never leave the screen — it is the only
// guard against doing today's work on Thursday's bookings), the salon's
// open/closed state, and the availability button carrying its own status.
//
// The second answers the only question worth answering from a distance:
// "everything's on track", or "2 things need you" — followed by the shape of
// the day and, quietly, the money. Deliberately NOT a KPI row: every number
// here either changes what someone does next or is one glance of reassurance.
import { CalendarDays, ChevronDown, Clock3 } from "lucide-react";
import { DAY_CAPACITY } from "../../../engine/utilisation";
import { PageHeader, PageHeaderPill } from "../../ui/PageHeader.jsx";
import { formatMoney } from "./parts.jsx";
import {
  NeedsAttentionSummary,
  NEEDS_ATTENTION_DEFINITION,
} from "./board/NeedsAttentionSummary.jsx";

export { NEEDS_ATTENTION_DEFINITION };

export function TodayHeader({
  dateLabel,
  dogsBooked,
  capacityTotal = DAY_CAPACITY,
  attention = { count: 0, headline: "", ids: [] },
  zoneCounts = [],
  collectedTotal = 0,
  unpaidTotal = 0,
  isDayOpen,
  isToday = false,
  nextOnlineSlot = null,
  onOpenDatePicker,
  onManageAvailability,
  attentionActive = false,
  onToggleAttention,
}) {
  const availabilityLabel = nextOnlineSlot
    ? `Next online ${nextOnlineSlot}`
    : isDayOpen
      ? "No online slots today"
      : "Online booking closed";
  const overCap = dogsBooked > capacityTotal;
  const shape = zoneCounts.filter((entry) => entry.count > 0);

  return (
    <PageHeader title="Daily Brief" className="!mb-4 !min-h-0 !gap-1.5 !py-3">
      <div className="grid w-full gap-1.5">
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

        <div
          role="region"
          aria-label="Day status"
          className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-0.5 text-[13px] text-slate-600"
        >
          <NeedsAttentionSummary
            summary={attention}
            isToday={isToday}
            active={attentionActive}
            onToggle={onToggleAttention}
          />
          {shape.length > 0 ? (
            <span className="min-w-0 whitespace-nowrap" data-testid="board-shape">
              {shape.map((entry, index) => (
                <span key={entry.zone} className="whitespace-nowrap">
                  {index > 0 ? <span aria-hidden="true" className="mx-1.5 text-slate-300">·</span> : null}
                  <strong className="font-bold text-brand-purple tabular-nums">{entry.count}</strong> {entry.label}
                </span>
              ))}
            </span>
          ) : null}
          {collectedTotal > 0 || unpaidTotal > 0 ? (
            // Money stays secondary: the board is a workflow surface, not a
            // till. Two numbers, no chart, no panel.
            <span className="whitespace-nowrap text-slate-500" data-testid="board-money">
              {collectedTotal > 0 ? (
                <span className="whitespace-nowrap">
                  <strong className="font-bold text-slate-700 tabular-nums">{formatMoney(collectedTotal)}</strong> collected
                </span>
              ) : null}
              {collectedTotal > 0 && unpaidTotal > 0 ? (
                <span aria-hidden="true" className="mx-1.5 text-slate-300">·</span>
              ) : null}
              {unpaidTotal > 0 ? (
                <span className="whitespace-nowrap">
                  <strong className="font-bold text-slate-700 tabular-nums">{formatMoney(unpaidTotal)}</strong> to collect
                </span>
              ) : null}
            </span>
          ) : dogsBooked > 0 ? (
            <span className="whitespace-nowrap font-bold text-brand-teal-text">All paid</span>
          ) : null}
          {overCap ? (
            <span className="whitespace-nowrap font-bold text-brand-coral-text">
              <span className="tabular-nums">{dogsBooked}/{capacityTotal}</span> over the daily cap
            </span>
          ) : null}
        </div>
      </div>

      {attention.count > 0 ? (
        <span id="needs-attention-definition" className="sr-only">
          {NEEDS_ATTENTION_DEFINITION}
        </span>
      ) : null}
    </PageHeader>
  );
}

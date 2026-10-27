// Date and availability first; actionable attention next; quieter day totals last.
// The date stays visible to prevent work on the wrong day. Stack geometry,
// booking order and card expansion remain owned by the unchanged stack modules.
import { CalendarDays, ChevronDown, Clock3 } from "lucide-react";
import { DAY_CAPACITY } from "../../../engine/utilisation";
import { Button } from "../../ui/Button.jsx";
import { PageHeader } from "../../ui/PageHeader.jsx";
import { formatMoney } from "./parts.jsx";
import {
  NeedsAttentionSummary,
  NEEDS_ATTENTION_DEFINITION,
} from "./NeedsAttentionSummary.jsx";

export { NEEDS_ATTENTION_DEFINITION };

export function TodayHeader({
  dateLabel,
  dogsBooked,
  capacityTotal = DAY_CAPACITY,
  attention = { count: 0, headline: "", ids: [], reasons: { late: [], toConfirm: [], waiting: [], unpaid: [] } },
  zoneCounts = [],
  collectedTotal = 0,
  /** Actionable balance across the strip's unpaid dogs (Ready onward). */
  dueNow = 0,
  unpaidTotal = 0,
  isDayOpen,
  isToday = false,
  nextOnlineSlot = null,
  onOpenDatePicker,
  onManageAvailability,
  attentionReason = null,
  onSelectAttentionReason,
}) {
  const availabilityLabel = nextOnlineSlot
    ? `Next online ${nextOnlineSlot}`
    : isDayOpen
      ? "No online slots today"
      : "Online booking closed";
  const overCap = dogsBooked > capacityTotal;
  const shape = zoneCounts.filter((entry) => entry.count > 0);

  return (
    <PageHeader title="Daily Brief" className="!mb-2 !min-h-0 !gap-1.5 !py-2 sm:!mb-4 sm:!py-3">
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
            <strong className="min-w-0 truncate font-display text-lg font-bold leading-none tracking-[-0.02em] text-brand-purple sm:text-2xl">
              {dateLabel}
            </strong>
            <ChevronDown size={15} aria-hidden="true" className="shrink-0 text-brand-purple/45" />
          </button>
          <Button variant="quiet" onClick={onManageAvailability}
            aria-label={`Manage availability — ${availabilityLabel}`}
            className="min-h-11 shrink-0"
            iconLeft={<Clock3 size={15} aria-hidden="true" />}>
            <span className="sm:hidden">Availability</span>
            <span className="hidden sm:inline">Manage availability</span>
          </Button>
        </div>

        <div
          role="region"
          aria-label="Day status"
          className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-0.5 text-body text-slate-600"
        >
          <div className="flex w-full min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-1">
            <NeedsAttentionSummary
              summary={attention}
              dueNow={dueNow}
              isToday={isToday}
              activeReason={attentionReason}
              onSelectReason={onSelectAttentionReason}
            />
          </div>
          {overCap ? (
            <span className="font-bold text-brand-coral-text">
              <span className="tabular-nums">{dogsBooked}/{capacityTotal}</span> over the daily cap
            </span>
          ) : null}
          <div role="group" aria-label="Day totals"
            className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-caption text-ink-muted">
            <span className={isDayOpen ? "font-semibold text-emerald-700" : "font-semibold text-brand-coral-text"}>
              {isDayOpen ? "Salon open" : "Salon closed"}
            </span>
            <span>{availabilityLabel}</span>
            {shape.length > 0 ? (
              <span className="min-w-0 flex flex-wrap items-center gap-y-1" data-testid="board-shape">
                {shape.map((entry, index) => (
                  <span key={entry.zone} className="whitespace-nowrap">
                    {index > 0 ? <span aria-hidden="true" className="mx-1.5 text-slate-300">·</span> : null}
                    <strong className="font-bold text-brand-purple tabular-nums">{entry.count}</strong> {entry.label}
                  </span>
                ))}
              </span>
            ) : null}
            {collectedTotal > 0 ? (
              // One financial voice per surface: the header says what is in the
              // till, the strip says what is due right now, and the end-of-day
              // facts carry the day total. Repeating all three here made the
              // same story speak in several voices at once.
              <span className="whitespace-nowrap text-slate-500" data-testid="board-money">
                <strong className="font-bold text-slate-700 tabular-nums">{formatMoney(collectedTotal)}</strong> collected
              </span>
            ) : dogsBooked > 0 && unpaidTotal === 0 ? (
              <span className="whitespace-nowrap font-bold text-brand-teal-text">All paid</span>
            ) : null}
          </div>
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

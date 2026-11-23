// Date and availability first; actionable attention next; quieter day totals last.
// The date stays visible to prevent work on the wrong day. Stack geometry,
// booking order and card expansion remain owned by the unchanged stack modules.
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Clock3 } from "lucide-react";
import { DAY_CAPACITY } from "../../../engine/utilisation";
import { Button } from "../../ui/Button.jsx";
import { IconButton } from "../../ui/IconButton.jsx";
import { PageHeader } from "../../ui/PageHeader.jsx";
import { ScribbleUnderline } from "../../ui/ScribbleUnderline.jsx";
import { formatMoney } from "./parts.jsx";
import {
  NeedsAttentionSummary,
  NEEDS_ATTENTION_DEFINITION,
} from "./NeedsAttentionSummary.jsx";

export { NEEDS_ATTENTION_DEFINITION };

export function TodayHeader({
  dateLabel,
  /** Phones only: the same date with a short weekday, e.g. "Wed 18 November". */
  dateLabelShort = dateLabel,
  /** The narrowest phones (below 360px): short weekday and month, e.g. "Wed 18 Nov". */
  dateLabelNarrow = dateLabelShort,
  dogsBooked,
  capacityTotal = DAY_CAPACITY,
  attention = { count: 0, headline: "", ids: [], reasons: { late: [], toConfirm: [], waiting: [], unpaid: [] } },
  zoneCounts = [],
  /** Every Paid-in-Full booking today, in or out of the door: shown as "taken". */
  collectedTotal = 0,
  /** Actionable balance across the strip's unpaid dogs (Ready onward). */
  dueNow = 0,
  unpaidTotal = 0,
  isDayOpen,
  isToday = false,
  /** The day has no bookings: the empty state below speaks for it. */
  isEmptyDay = false,
  nextOnlineSlot = null,
  onOpenDatePicker,
  /** Step one calendar day back. Omitted, the arrows are not drawn. */
  onPreviousDay,
  /** Step one calendar day forward. */
  onNextDay,
  /** Jump to the real today; offered only while browsing another date. */
  onToday,
  onManageAvailability,
  attentionReason = null,
  onSelectAttentionReason,
}) {
  // A closed day refuses every customer booking at the database
  // (validate_booking_calendar raises calendar_closed before it ever looks at
  // same-day slots), so closed wins over a flagged slot: "Next online 10:00"
  // on a closed day would be a promise the gate does not keep.
  const availabilityLabel = !isDayOpen
    ? "Online booking closed"
    : nextOnlineSlot
      ? `Next online ${nextOnlineSlot}`
      : isToday ? "No online slots today" : "No online slots on this day";
  const hasDayArrows = Boolean(onPreviousDay && onNextDay);
  const overCap = dogsBooked > capacityTotal;
  const shape = zoneCounts.filter((entry) => entry.count > 0);

  return (
    <PageHeader title="Today" className="!mb-2 !min-h-0 !gap-1.5 !py-2 sm:!mb-4 sm:!py-3">
      <div className="grid w-full gap-1.5">
        {/* On phones the date and Availability share one line (audit N-06), so the
            dog stack starts higher. The calendar icon steps aside there (the
            chevron still marks the date as a picker) and the date truncates
            only as a last resort. With the day arrows beside it, phones use the
            short date ("Sat 14 Nov") so all four controls still fit one line,
            a short weekday from 640px ("Sat 14 November") and the full date
            from 768px; below 400px Availability drops its clock icon, and on
            the narrowest phones (under 360px) the date steps down a size and
            drops its chevron, since the arrows already mark it as a control. */}
        <div className="flex min-w-0 flex-nowrap items-center gap-x-2 gap-y-1.5 sm:flex-wrap sm:gap-x-3">
          <div className="mr-auto flex min-w-0 items-center">
            {hasDayArrows ? (
              <IconButton
                label="Previous day"
                onClick={onPreviousDay}
                className="-ml-2 text-brand-ink sm:-ml-1"
              >
                <ChevronLeft size={18} aria-hidden="true" />
              </IconButton>
            ) : null}
            <button
              type="button"
              data-testid="daily-brief-date"
              onClick={onOpenDatePicker}
              aria-label={`${dateLabel} — choose a different date`}
              className={`inline-flex min-h-11 min-w-0 items-center gap-2 rounded-control px-1 text-left outline-none transition-colors hover:bg-brand-ink/[0.04] focus-visible:ring-2 focus-visible:ring-brand-ink focus-visible:ring-offset-2 ${hasDayArrows ? "max-sm:gap-1" : "-ml-1"}`}
            >
              <CalendarDays size={18} aria-hidden="true" className="hidden shrink-0 text-brand-ink/45 sm:block" />
              {/* The yellow swash under the page title (flyer visual language,
                  decision 8). It sits on this wrapper, not the title, because
                  the title truncates and would clip it. */}
              <span className="relative inline-flex min-w-0">
              <strong className={`min-w-0 truncate font-display text-lg font-bold leading-none tracking-[-0.02em] text-brand-ink sm:text-2xl ${hasDayArrows ? "max-[359px]:text-base" : ""}`}>
                {hasDayArrows ? (
                  <>
                    <span className="sm:hidden">{dateLabelNarrow}</span>
                    <span className="hidden sm:inline md:hidden">{dateLabelShort}</span>
                    <span className="hidden md:inline">{dateLabel}</span>
                  </>
                ) : (
                  <>
                    <span className="min-[360px]:hidden">{dateLabelNarrow}</span>
                    <span className="hidden min-[360px]:inline sm:hidden">{dateLabelShort}</span>
                    <span className="hidden sm:inline">{dateLabel}</span>
                  </>
                )}
              </strong>
              <ScribbleUnderline />
              </span>
              <ChevronDown size={15} aria-hidden="true" className={`shrink-0 text-brand-ink/45 ${hasDayArrows ? "max-[359px]:hidden" : ""}`} />
            </button>
            {hasDayArrows ? (
              <IconButton label="Next day" onClick={onNextDay} className="text-brand-ink">
                <ChevronRight size={18} aria-hidden="true" />
              </IconButton>
            ) : null}
          </div>
          <Button variant="quiet" onClick={onManageAvailability}
            aria-label={`Manage availability — ${availabilityLabel}`}
            className="min-h-11 shrink-0 max-sm:!gap-1.5 max-sm:!px-2"
            iconLeft={<Clock3 size={15} aria-hidden="true" className={hasDayArrows ? "max-[399px]:hidden" : undefined} />}>
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
            {/* An empty day has nothing to be on track: the reassurance would
                sit beside "Salon closed" and say nothing about the messages
                waiting, so the empty state below does the talking instead. */}
            {isEmptyDay ? null : (
              <NeedsAttentionSummary
                summary={attention}
                dueNow={dueNow}
                isToday={isToday}
                activeReason={attentionReason}
                onSelectReason={onSelectAttentionReason}
              />
            )}
            {!isToday && onToday ? (
              <Button variant="quiet" onClick={onToday} className="ml-auto -mr-2 text-ink">
                Back to today
              </Button>
            ) : null}
          </div>
          {overCap ? (
            <span className="font-bold text-brand-coral-text">
              <span className="tabular-nums">{dogsBooked}/{capacityTotal}</span> over the daily cap
            </span>
          ) : null}
          <div role="group" aria-label="Day totals"
            className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-caption text-ink-muted">
            {/* Closed is the salon's normal state four days a week, not a
                fault, so it reads in the neutral ink rather than alarm red. */}
            <span className={isDayOpen
              ? "font-semibold text-emerald-700"
              : "rounded-full bg-slate-100 px-2.5 py-0.5 font-semibold text-ink-muted"}>
              {isDayOpen ? "Salon open" : "Salon closed"}
            </span>
            {/* "Online booking closed" always follows from a closed salon, so it
                is not repeated beside it; the Availability button's name keeps it. */}
            {isDayOpen ? <span>{availabilityLabel}</span> : null}
            {shape.length > 0 ? (
              <span className="min-w-0 flex flex-wrap items-center gap-y-1" data-testid="board-shape">
                {shape.map((entry, index) => (
                  <span key={entry.zone} className="whitespace-nowrap">
                    {index > 0 ? <span aria-hidden="true" className="mx-1.5 text-slate-300">·</span> : null}
                    <strong className="font-bold text-brand-ink tabular-nums">{entry.count}</strong> {entry.label}
                  </span>
                ))}
              </span>
            ) : null}
            {collectedTotal > 0 ? (
              // One financial voice per surface: the header says what is in the
              // till, the strip says what is due right now, and the end-of-day
              // facts carry the day total. Repeating all three here made the
              // same story speak in several voices at once.
              //
              // "taken", not "collected": this is every Paid-in-Full booking,
              // including dogs that paid ahead and are still here, so it is the
              // end-of-day line's "Taken £84". "Collected today" further down is
              // a different number — the dogs that have gone home.
              <span className="whitespace-nowrap text-ink-muted" data-testid="board-money">
                <strong className="font-bold text-slate-700 tabular-nums">{formatMoney(collectedTotal)}</strong> taken
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

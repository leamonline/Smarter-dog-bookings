import { CalendarDays, ChevronRight, Clock3 } from "lucide-react";
import { DAY_CAPACITY } from "../../../engine/utilisation";
import {
  PageHeader,
  PageHeaderAction,
  PageHeaderPill,
} from "../../ui/PageHeader.jsx";
import { formatMoney } from "./parts.jsx";

export const NEEDS_ACTION_DEFINITION =
  "Need action means late arrivals, confirmation chases, overdue collections and unpaid bookings after arrival.";

function SecondaryAction({ children, className = "", icon: Icon, ...props }) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex h-11 min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-control border border-slate-300 bg-white px-2 text-[13px] font-bold text-brand-purple shadow-sm outline-none transition-colors hover:border-brand-purple/40 hover:bg-brand-purple/5 focus-visible:ring-2 focus-visible:ring-brand-purple focus-visible:ring-offset-2 sm:gap-2 sm:px-4 sm:text-sm ${className}`}
    >
      <Icon size={17} aria-hidden="true" />
      {children}
    </button>
  );
}

function OperationalFact({ label, value, valueClassName = "" }) {
  return (
    <div className="flex min-h-12 min-w-0 flex-col justify-center border-r border-slate-200 px-2 py-1 last:border-r-0 lg:px-3">
      <span className={`truncate text-[14px] font-black leading-tight tabular-nums text-brand-purple sm:text-[16px] ${valueClassName}`}>
        {value}
      </span>
      <span className="mt-0.5 whitespace-nowrap text-[12px] font-bold uppercase leading-tight tracking-normal text-slate-500">
        {label}
      </span>
    </div>
  );
}

/**
 * The mobile Need-action control: a plain "N need action" button when there's
 * something to see, explicit "Showing N · Clear" escape language once the
 * filter is active, and calm non-interactive text when there's nothing to
 * chase — never a bare number that could be mistaken for a static count.
 */
function MobileNeedAction({ actionCount, actionFilterActive, onToggleActionFilter }) {
  if (actionCount === 0) {
    return <span className="text-[13px] font-bold text-brand-teal-text">All calm</span>;
  }
  if (actionFilterActive) {
    return (
      <button
        type="button"
        aria-pressed="true"
        aria-describedby="needs-action-definition"
        onClick={onToggleActionFilter}
        className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full bg-brand-purple px-3 text-[13px] font-bold text-white outline-none focus-visible:ring-2 focus-visible:ring-brand-purple focus-visible:ring-offset-2"
      >
        Showing {actionCount} · Clear
      </button>
    );
  }
  return (
    <button
      type="button"
      aria-pressed="false"
      aria-describedby="needs-action-definition"
      onClick={onToggleActionFilter}
      className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full bg-brand-coral/[0.12] px-3 text-[13px] font-bold text-brand-coral-text outline-none focus-visible:ring-2 focus-visible:ring-brand-purple focus-visible:ring-offset-2"
    >
      {actionCount} need action
      <ChevronRight size={14} aria-hidden="true" />
    </button>
  );
}

function SecondaryTotals({ dogsBooked, capacityTotal, unpaidTotal, expectedRevenue }) {
  return (
    <section
      role="region"
      aria-label="Daily Brief secondary totals"
      className="flex min-h-7 flex-wrap items-center gap-x-3 gap-y-0.5 rounded-lg bg-slate-50 px-2.5 py-1 text-[11px] text-slate-600"
    >
      <span><strong className="font-bold text-slate-700 tabular-nums">{dogsBooked}/{capacityTotal}</strong> capacity</span>
      <span><strong className="font-bold text-slate-700 tabular-nums">{unpaidTotal > 0 ? formatMoney(unpaidTotal) : "All paid"}</strong>{unpaidTotal > 0 ? " unpaid" : ""}</span>
      <span><strong className="font-bold text-slate-700 tabular-nums">{formatMoney(expectedRevenue)}</strong> expected</span>
    </section>
  );
}

export function TodayHeader({
  dateLabel,
  dogsBooked,
  onSite = 0,
  lateCount = 0,
  readyCount = 0,
  actionCount,
  unpaidTotal = 0,
  expectedRevenue = 0,
  capacityTotal = DAY_CAPACITY,
  nextOnlineSlot = null,
  isDayOpen,
  briefMode = false,
  onOpenDatePicker,
  onManageAvailability,
  actionFilterActive = false,
  onToggleActionFilter,
}) {
  const availabilityLabel = nextOnlineSlot
    ? `Next online ${nextOnlineSlot}`
    : isDayOpen
      ? "No online slots available"
      : "No online slots · bookings closed";

  return (
    <PageHeader title="Daily Brief" className="!mb-3 !min-h-0 !gap-2 !py-2.5">
      {/* Compact mobile header (below md): date opens the picker directly, no
          separate Choose-date control, unpaid total dropped, one Need-action
          row instead of the four-cell status grid. */}
      <div className="grid w-full gap-2 md:hidden">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={onOpenDatePicker}
            aria-label={`${dateLabel} — choose a different date`}
            className="mr-auto inline-flex min-h-11 min-w-0 items-center gap-1.5 rounded-control px-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-brand-purple focus-visible:ring-offset-2"
          >
            <CalendarDays size={17} aria-hidden="true" className="shrink-0 text-brand-purple/50" />
            <strong className="min-w-0 truncate font-display text-xl font-black leading-none tracking-[-0.02em] text-brand-purple">
              {dateLabel}
            </strong>
          </button>
          <PageHeaderPill tone={isDayOpen ? "open" : "closed"} dot>
            {isDayOpen ? "Salon open" : "Salon closed"}
          </PageHeaderPill>
        </div>

        {!briefMode ? (
          <div className="flex min-w-0 items-center justify-between gap-2">
            <span className="shrink-0 text-[13px] font-bold text-slate-700 tabular-nums">{dogsBooked} booked</span>
            <MobileNeedAction
              actionCount={actionCount}
              actionFilterActive={actionFilterActive}
              onToggleActionFilter={onToggleActionFilter}
            />
            <span className="shrink-0 text-[13px] font-bold text-slate-700 tabular-nums">{formatMoney(expectedRevenue)} expected</span>
          </div>
        ) : null}

        <div className="flex min-w-0 items-center justify-between gap-2">
          <span className="min-w-0 truncate text-[12px] font-bold text-slate-600">{availabilityLabel}</span>
          <button
            type="button"
            onClick={onManageAvailability}
            className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-control bg-brand-purple px-3 text-[13px] font-bold text-white outline-none transition-colors hover:bg-brand-purple-light focus-visible:ring-2 focus-visible:ring-brand-purple focus-visible:ring-offset-2"
          >
            <Clock3 size={16} aria-hidden="true" />
            Availability
          </button>
        </div>
      </div>

      {/* Existing richer header at md and above. */}
      <div className="hidden w-full gap-2 md:grid" data-testid="daily-brief-header-full">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <strong
            data-testid="daily-brief-date"
            className="mr-auto shrink-0 font-display text-2xl font-black leading-none tracking-[-0.025em] text-brand-purple sm:text-[1.7rem]"
          >
            {dateLabel}
          </strong>
          <PageHeaderPill tone={isDayOpen ? "open" : "closed"} dot>
            {isDayOpen ? "Salon open" : "Salon closed"}
          </PageHeaderPill>
          <span className="text-[11px] font-bold text-slate-600 sm:text-xs" aria-label="Availability">
            {availabilityLabel}
          </span>
        </div>

        <div className="grid items-stretch gap-2 lg:grid-cols-[minmax(0,1fr)_max-content]">
          {!briefMode ? (
            <div className="grid min-w-0 gap-1.5">
              <section
                role="region"
                aria-label="Daily Brief operational status"
                className="grid min-w-0 grid-cols-4 overflow-hidden rounded-xl border border-slate-200 bg-white"
              >
                <OperationalFact
                  label="Late"
                  value={lateCount > 0 ? lateCount : "On time"}
                  valueClassName={lateCount > 0 ? "text-brand-coral-text" : "text-[11px] text-brand-teal-text sm:text-[13px]"}
                />
                <OperationalFact label="On site" value={onSite} />
                <OperationalFact label="Ready" value={readyCount} />
                {actionCount > 0 ? (
                  <button
                    type="button"
                    aria-label={actionFilterActive
                      ? `Show all bookings; ${actionCount} currently need action`
                      : `Filter ${actionCount} ${actionCount === 1 ? "booking" : "bookings"} needing action`}
                    aria-describedby="needs-action-definition"
                    aria-pressed={actionFilterActive}
                    data-filter-selected={actionFilterActive ? "true" : "false"}
                    title={NEEDS_ACTION_DEFINITION}
                    onClick={onToggleActionFilter}
                    className={`flex min-h-12 min-w-0 flex-col justify-center px-2 py-1 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-purple sm:px-3 ${
                      actionFilterActive
                        ? "bg-brand-purple text-white"
                        : "bg-brand-coral/[0.08] text-brand-coral-text hover:bg-brand-coral/[0.14]"
                    }`}
                  >
                    <span className="truncate text-[14px] font-black leading-tight tabular-nums sm:text-[16px]">
                      {actionFilterActive ? "Filtering" : actionCount}
                    </span>
                    <span className={`mt-0.5 truncate text-[9px] font-bold uppercase min-[390px]:text-[10px] ${actionFilterActive ? "text-white/80" : "text-brand-coral-text"}`}>
                      {actionFilterActive ? `${actionCount} action` : "Action"}
                    </span>
                  </button>
                ) : (
                  <OperationalFact label="Action" value="All calm" valueClassName="text-[12px] text-brand-teal-text sm:text-[14px]" />
                )}
              </section>
              <SecondaryTotals
                dogsBooked={dogsBooked}
                capacityTotal={capacityTotal}
                unpaidTotal={unpaidTotal}
                expectedRevenue={expectedRevenue}
              />
            </div>
          ) : <span aria-hidden="true" />}

          <div className="grid shrink-0 grid-cols-2 items-center gap-2 lg:grid-cols-[max-content_max-content]">
            <SecondaryAction
              className="w-full lg:w-auto"
              icon={CalendarDays}
              aria-label={`Choose date, ${dateLabel}`}
              onClick={onOpenDatePicker}
            >
              Choose date
            </SecondaryAction>
            <PageHeaderAction className="w-full gap-1.5 px-2 text-[13px] sm:gap-2 sm:px-4 sm:text-sm lg:w-auto" icon={Clock3} onClick={onManageAvailability}>
              Manage availability
            </PageHeaderAction>
          </div>
        </div>
      </div>

      {!briefMode && actionCount > 0 ? (
        <span id="needs-action-definition" className="sr-only">
          {NEEDS_ACTION_DEFINITION}
        </span>
      ) : null}
      {briefMode ? (
        <aside aria-label="Availability" className="sr-only">{availabilityLabel}</aside>
      ) : null}
    </PageHeader>
  );
}

import { CalendarDays, Clock3 } from "lucide-react";
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
    <div className="flex min-h-14 min-w-0 flex-col justify-center border-r border-slate-200 px-2 py-1.5 last:border-r-0 sm:min-h-[3.75rem] lg:px-3">
      <span className={`truncate text-[15px] font-black leading-tight tabular-nums text-brand-purple sm:text-[17px] ${valueClassName}`}>
        {value}
      </span>
      <span className="mt-0.5 whitespace-nowrap text-[9px] font-bold uppercase leading-tight tracking-normal text-slate-500 min-[390px]:text-[10px] sm:text-[9px] lg:text-[10px]">
        {label}
      </span>
    </div>
  );
}

export function TodayHeader({
  dateLabel,
  dogsBooked,
  onSite = 0,
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
      <div className="grid w-full gap-2">
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
            <section
              role="region"
              aria-label="Daily Brief operational status"
              className="grid min-w-0 grid-cols-3 overflow-hidden rounded-xl border border-slate-200 bg-white [&>*:nth-child(-n+3)]:border-b [&>*:nth-child(3)]:border-r-0 sm:grid-cols-6 sm:[&>*:nth-child(-n+3)]:border-b-0 sm:[&>*:nth-child(3)]:border-r"
            >
              <OperationalFact label="Booked" value={dogsBooked} />
              <OperationalFact label="On site" value={onSite} />
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
                  className={`flex min-h-14 min-w-0 flex-col justify-center border-r border-slate-200 px-2 py-1.5 text-left outline-none transition last:border-r-0 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-purple sm:min-h-[3.75rem] sm:px-3 ${
                    actionFilterActive
                      ? "bg-brand-purple text-white"
                      : "bg-brand-coral/[0.08] text-brand-coral-text hover:bg-brand-coral/[0.14]"
                  }`}
                >
                  <span className="truncate text-[15px] font-black leading-tight tabular-nums sm:text-[17px]">
                    {actionFilterActive ? "Filtering" : actionCount}
                  </span>
                  <span className={`mt-0.5 truncate text-[10px] font-bold uppercase tracking-[0.04em] sm:text-[11px] ${actionFilterActive ? "text-white/80" : "text-brand-coral-text"}`}>
                    {actionFilterActive ? `${actionCount} need action` : "Need action"}
                  </span>
                </button>
              ) : (
                <OperationalFact label="Action" value="All calm" valueClassName="text-brand-teal-text" />
              )}
              <OperationalFact label="Unpaid" value={unpaidTotal > 0 ? formatMoney(unpaidTotal) : "All paid"} />
              <OperationalFact label="Expected revenue" value={formatMoney(expectedRevenue)} />
              <OperationalFact label="Capacity" value={`${dogsBooked}/${capacityTotal}`} />
            </section>
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

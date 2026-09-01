import {
  SERVICE_LABELS,
  formatDate,
} from "./dashboardConstants.js";
import { resolveServicePricePence } from "../../engine/bookingRules";
import { formatGBP } from "../../utils/money";
import { ClipboardList, ChevronDown } from "lucide-react";
import { titleCase } from "../../utils/text";

/**
 * Past-only appointments list. The "Upcoming" + "Time for another groom?"
 * blocks moved into <BookingCard /> at the top of the dashboard so the
 * customer's next action lives in one place.
 *
 * This component now renders:
 *   • a collapsible header with a chevron that rotates 180° when open
 *   • each row in the new compact format: "{date} — {service} · £{price}"
 *   • a Sync to calendar action (only if there are upcoming bookings —
 *     decided in the parent and passed via onSubscribe)
 */

function priceLabelFor(service, size) {
  if (!service || !size) return null;
  // Bare guide amount ("£42", no "+" suffix) for cleaner inline display.
  const pence = resolveServicePricePence(service, size);
  return pence != null ? formatGBP(pence) : null;
}

export function AppointmentsSection({
  pastBookings,
  pastExpanded,
  setPastExpanded,
  hasMorePast,
  loadingMore,
  onLoadMore,
  onSubscribe,
}) {
  const isEmpty = pastBookings.length === 0;

  return (
    <div className="portal-card portal-card--lavender">
      <button
        type="button"
        className="flex justify-between items-center w-full bg-transparent border-none cursor-pointer p-0"
        onClick={() => !isEmpty && setPastExpanded(p => !p)}
        aria-expanded={pastExpanded}
        aria-controls="past-appointments-list"
        disabled={isEmpty}
      >
        <div className="flex items-center gap-2">
          <span className="portal-card-iconbadge portal-card-iconbadge--lavender">
            <ClipboardList size={18} aria-hidden="true" />
          </span>
          <h2 className="portal-card-title" style={{ margin: 0 }}>
            Past appointments
          </h2>
        </div>
        {isEmpty ? (
          <span className="text-[12px] text-[var(--sd-ink-light)] font-semibold">
            Nothing yet
          </span>
        ) : (
          <span className="text-[13px] text-[var(--sd-navy-soft)] font-semibold flex items-center gap-1.5">
            {pastExpanded ? "Hide" : "Show"}
            <ChevronDown size={16} aria-hidden="true" className="portal-chevron" />
          </span>
        )}
      </button>

      {pastExpanded && !isEmpty && (
        <div id="past-appointments-list" className="mt-3">
          {pastBookings.map(b => {
            const dogName = b.dog?.name ? titleCase(b.dog.name) : "your dog";
            const size = b.dog?.size || b.size;
            const service = SERVICE_LABELS[b.service] || b.service;
            const price = priceLabelFor(b.service, size);
            return (
              <div key={b.id} className="portal-past-row">
                <span className="portal-past-row-date">{formatDate(b.bookingDate)}</span>
                <span className="portal-past-row-service">
                  {service}
                  <span className="text-[var(--sd-ink-light)] font-normal"> · {dogName}</span>
                </span>
                {price && <span className="portal-past-row-price">{price}</span>}
              </div>
            );
          })}

          {hasMorePast && (
            <button
              type="button"
              className="portal-btn portal-btn--secondary w-full mt-3 text-[13px]"
              onClick={onLoadMore}
              disabled={loadingMore}
            >
              {loadingMore ? "Loading…" : "Load more past appointments"}
            </button>
          )}

          {onSubscribe && (
            <div className="mt-3 pt-3 border-t border-[rgba(45,0,75,0.07)] text-center">
              <button
                type="button"
                onClick={onSubscribe}
                className="text-[12px] text-[var(--sd-navy-soft)] font-semibold cursor-pointer bg-transparent border-none hover:text-[var(--sd-navy)]"
              >
                Sync upcoming bookings to your calendar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

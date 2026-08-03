import { ChevronDown, X } from "lucide-react";

const HEADER_CLASS =
  "flex min-h-11 w-full shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-3 text-left text-sm font-bold text-brand-purple transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-purple";

// The two sections own their scrolling differently, on purpose.
//
// Booking is a self-contained pane: it pins its own date strip and draft-offer
// footer and scrolls the slot list between them. Giving its frame a scrollbar
// too would stack two scrollers and push "Insert into reply" below the fold.
//
// Customer is a plain document, so its frame is the scroller.
const BOOKING_BODY_CLASS = "flex min-h-0 flex-1 flex-col overflow-hidden";
const CUSTOMER_BODY_CLASS = "min-h-0 flex-1 overflow-y-auto overscroll-contain";

/**
 * The workspace's third pane: Booking above Customer, one section open at a
 * time. Both headers stay pinned so either is one tap away; only the open
 * body scrolls.
 *
 * A booking suggestion is advisory only — it labels the Booking header and
 * never expands it. Dismissal is held by the caller for the session.
 */
export function BookingCustomerPane({
  expandedSection = "customer",
  bookingSuggested = false,
  suggestionDismissed = false,
  onExpand,
  onDismissSuggestion,
  bookingPane,
  customerPane,
}) {
  const showSuggestion = bookingSuggested && !suggestionDismissed;
  const bookingOpen = expandedSection === "booking";
  const customerOpen = expandedSection === "customer";

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white">
      <div className="flex shrink-0 items-stretch border-b border-slate-200">
        <button
          type="button"
          onClick={() => onExpand?.("booking")}
          aria-expanded={bookingOpen}
          aria-controls="inbox-context-booking"
          className={`${HEADER_CLASS} flex-1 border-b-0`}
        >
          <ChevronDown
            aria-hidden="true"
            size={15}
            className={`shrink-0 transition-transform ${bookingOpen ? "" : "-rotate-90"}`}
          />
          Booking
          {showSuggestion ? (
            <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-brand-yellow/25 px-2 py-0.5 text-micro font-bold text-brand-purple">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-brand-coral" />
              Booking suggested
            </span>
          ) : null}
        </button>
        {showSuggestion ? (
          <button
            type="button"
            onClick={onDismissSuggestion}
            aria-label="Dismiss suggestion"
            className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center text-slate-500 transition-colors hover:bg-slate-50 hover:text-brand-purple focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-purple"
          >
            <X aria-hidden="true" size={15} />
          </button>
        ) : null}
      </div>

      {bookingOpen ? (
        <div id="inbox-context-booking" className={BOOKING_BODY_CLASS}>
          {bookingPane}
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => onExpand?.("customer")}
        aria-expanded={customerOpen}
        aria-controls="inbox-context-customer"
        className={`${HEADER_CLASS} border-t`}
      >
        <ChevronDown
          aria-hidden="true"
          size={15}
          className={`shrink-0 transition-transform ${customerOpen ? "" : "-rotate-90"}`}
        />
        Customer
      </button>

      {customerOpen ? (
        <div id="inbox-context-customer" className={CUSTOMER_BODY_CLASS}>
          {customerPane}
        </div>
      ) : null}
    </div>
  );
}

import { useState } from "react";
import {
  Bubbles,
  Car,
  CircleHelp,
  LogIn,
  PoundSterling,
  Scissors,
} from "lucide-react";
import { SERVICES } from "../../../constants/index";
import { BookingJourneyRow } from "./BookingJourneyRow.jsx";
import { LiveArrivalDivider } from "./LiveArrivalDivider.jsx";

const ACTION_KEY = [
  { label: "Check-in", Icon: LogIn },
  { label: "Grooming", Icon: Bubbles },
  { label: "Ready", Icon: Scissors },
  { label: "Collected", Icon: Car },
  { label: "Paid", Icon: PoundSterling },
];

export function BookingFeed({
  groups,
  dogs: _dogs,
  resolve,
  paymentOf,
  priceOf,
  liveFocusId = null,
  liveContext = null,
  ...handlers
}) {
  const [showActionKey, setShowActionKey] = useState(false);

  return (
    <section aria-label="Daily bookings" className="flex flex-col gap-2">
      <div className="flex justify-end [@media(hover:hover)]:hidden">
        <button
          type="button"
          aria-label={showActionKey ? "Hide booking action key" : "Show booking action key"}
          aria-expanded={showActionKey}
          onClick={() => setShowActionKey((visible) => !visible)}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-brand-paper-line bg-white px-3 text-[12px] font-bold text-brand-purple outline-none focus-visible:ring-2 focus-visible:ring-brand-purple focus-visible:ring-offset-2"
        >
          <CircleHelp size={16} aria-hidden="true" />
          Action key
        </button>
      </div>
      {showActionKey && (
        <div
          role="region"
          aria-label="Booking action key"
          className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-xl border border-brand-paper-line bg-white px-3 py-2 text-[12px] font-medium text-slate-700 sm:grid-cols-3 [@media(hover:hover)]:hidden"
        >
          {ACTION_KEY.map(({ label, Icon }) => (
            <span key={label} className="flex items-center gap-1.5">
              <Icon size={16} className="shrink-0 text-brand-purple" aria-hidden="true" />
              {label}
            </span>
          ))}
        </div>
      )}
      <div className="flex flex-col gap-2">
        {groups.map((group) => {
          const focusedGroup = Boolean(
            liveContext && group.entries.some((entry) => entry.booking.id === liveFocusId),
          );
          return (
            <div key={group.slot ?? "unscheduled"} className="flex w-full flex-col gap-2">
              {focusedGroup ? <LiveArrivalDivider context={liveContext} /> : null}
              {group.entries.map((entry) => {
                const booking = entry.booking;
                const serviceLabel =
                  SERVICES.find((service) => service.id === booking.service)?.name ||
                  booking.service;
                const price = priceOf?.(booking) ?? paymentOf?.(booking)?.subtotal ?? 0;

                return (
                  <div
                    key={booking.id}
                    data-booking-feed-card-shell
                    className="w-full"
                  >
                    <BookingJourneyRow
                      entry={entry}
                      slotLabel={group.label}
                      display={{ ...resolve(booking), serviceLabel }}
                      price={price}
                      handlers={handlers}
                    />
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </section>
  );
}

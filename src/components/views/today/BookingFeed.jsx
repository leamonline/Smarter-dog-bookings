import { SERVICES } from "../../../constants/index";
import { BookingJourneyRow } from "./BookingJourneyRow.jsx";

export function BookingFeed({
  groups,
  dogs: _dogs,
  resolve,
  paymentOf,
  priceOf,
  ...handlers
}) {
  return (
    <section aria-label="Daily bookings" className="flex flex-col gap-2">
      {groups.flatMap((group) =>
        group.entries.map((entry) => {
          const booking = entry.booking;
          const serviceLabel =
            SERVICES.find((service) => service.id === booking.service)?.name ||
            booking.service;
          const price = priceOf?.(booking) ?? paymentOf?.(booking)?.subtotal ?? 0;

          return (
            <BookingJourneyRow
              key={booking.id}
              entry={entry}
              slotLabel={group.label}
              display={{ ...resolve(booking), serviceLabel }}
              price={price}
              handlers={handlers}
            />
          );
        }),
      )}
    </section>
  );
}

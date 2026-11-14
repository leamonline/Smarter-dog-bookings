import { Button } from "../../ui";
import { serviceLabel } from "../inbox/helpers.js";
import { formatDate } from "./BookingPane.jsx";

/**
 * Every upcoming visit for this customer. View and Reschedule hand off to
 * the existing booking detail; neither sends a message nor writes a booking.
 */
export function UpcomingBookings({ bookings, onViewBooking, onReschedule, compact = false }) {
  if (!bookings?.length) return null;
  const heading = bookings.length === 1
    ? "Upcoming booking"
    : `${bookings.length} upcoming bookings`;

  if (compact) {
    return (
      <section aria-label="Upcoming bookings" className="max-h-40 shrink-0 overflow-y-auto overscroll-contain border-b border-slate-200 bg-brand-paper px-3 py-2">
        <h2 className="text-xs font-extrabold text-brand-ink">{heading}</h2>
        <ul className="mt-1 flex flex-col gap-1">
          {bookings.map((booking) => (
            <li key={booking.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-ink-muted">
              <span className="min-w-0 break-words text-brand-ink">
                {formatDate(booking.date)} {booking.slot} · {booking.dogName || "Dog"} · {booking.status || "Booked"}
              </span>
              <Button type="button" variant="ghost" size="sm" className="min-h-11 px-2" onClick={() => onViewBooking?.(booking)}>
                View
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="min-h-11 px-2"
                aria-label={`Reschedule ${booking.dogName || "dog"} on ${formatDate(booking.date)} at ${booking.slot}`}
                onClick={() => onReschedule?.(booking)}
              >
                Reschedule
              </Button>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <section
      aria-label="Upcoming bookings"
      className="max-h-[45%] shrink-0 overflow-y-auto overscroll-contain border-b border-slate-200 bg-brand-paper"
    >
      <h2 className="px-3 pt-2 font-display text-sm font-extrabold text-brand-ink">{heading}</h2>
      <ul className="flex flex-col gap-2 px-3 py-2">
        {bookings.map((booking) => {
          const status = booking.status || "Booked";
          const summary = `${formatDate(booking.date)} at ${booking.slot}, ${booking.dogName || "dog"}, ${serviceLabel(booking.service)}, ${status}`;
          return (
            <li key={booking.id} className="rounded-card border border-brand-paper-line bg-white px-3 py-2">
              <p className="text-sm font-bold text-brand-ink">
                {formatDate(booking.date)} · {booking.slot}
              </p>
              <p className="mt-0.5 break-words text-xs font-semibold text-ink-muted">
                {booking.dogName || "Dog"} · {serviceLabel(booking.service)} · {status}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="strong"
                  size="sm"
                  onClick={() => onViewBooking?.(booking)}
                  className="min-h-11"
                >
                  View booking
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onReschedule?.(booking)}
                  aria-label={`Reschedule ${summary}`}
                  className="min-h-11"
                >
                  Reschedule
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

import { useMemo } from "react";
import { SERVICES, BOOKING_STATUS } from "../../../constants/index.js";
import { titleCase } from "../../../utils/text.js";
import { getDogsForHuman } from "../../../utils/directorySearch.js";

function formatBookingDate(iso) {
  if (!iso) return "";
  // ISO `YYYY-MM-DD` → `DD-MM-YYYY` for the staff-facing UK format.
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  const [, y, m, d] = match;
  return `${d}-${m}-${y}`;
}

// Recent-bookings section of the HumanCardModal. Self-contained card
// with sticky internal header + capped scroll region so the modal
// shell never has to scroll. Rows become buttons when an
// `onOpenBooking` handler is provided.
export function HumanBookingHistory({
  human,
  dogs,
  dogsByHumanId,
  bookingsByDate,
  onOpenBooking,
}) {
  const history = useMemo(() => {
    if (!bookingsByDate || !human) return [];

    const humanDogNames = new Set(
      getDogsForHuman(human, dogs || {}, dogsByHumanId || {}).map(
        (dog) => dog.name,
      ),
    );

    const entries = [];
    for (const [dateStr, bookings] of Object.entries(bookingsByDate)) {
      for (const booking of bookings) {
        if (
          humanDogNames.has(booking.dogName) ||
          booking._ownerId === human.id ||
          booking.owner === human.fullName
        ) {
          entries.push({ ...booking, date: dateStr });
        }
      }
    }

    return entries.sort((a, b) => b.date.localeCompare(a.date));
  }, [human, dogs, dogsByHumanId, bookingsByDate]);

  const rows = history.slice(0, 5);

  return (
    <section
      aria-label="Recent bookings"
      className="bg-white rounded-2xl border border-gray-100 shadow-[0_2px_8px_rgba(0,0,0,0.04)] overflow-hidden"
    >
      <div className="max-h-40 overflow-y-auto">
        <div className="sticky top-0 z-[1] bg-white px-3 py-2 border-b border-slate-200/70 flex items-center justify-between gap-2">
          <h3 className="text-[10px] font-bold uppercase tracking-wider text-brand-teal-text/70">
            Recent bookings
          </h3>
          {history.length > rows.length && (
            <span className="text-[10px] font-semibold text-slate-400">
              Showing {rows.length} of {history.length}
            </span>
          )}
        </div>
        <div className="px-3 py-1">
          {rows.length === 0 ? (
            <div className="text-sm text-slate-400 italic py-1.5">
              No bookings yet.
            </div>
          ) : (
            rows.map((booking, i) => {
              const service = SERVICES.find((s) => s.id === booking.service);
              const isClickable = !!onOpenBooking && !!booking.id;
              const label = (
                <>
                  <div className="min-w-0 truncate">
                    <span className="font-semibold text-slate-800">
                      {formatBookingDate(booking.date)}
                    </span>
                    <span className="text-slate-500 ml-1.5">
                      {titleCase(booking.dogName)}
                    </span>
                    {service?.name && (
                      <span className="text-slate-500 ml-1">{service.name}</span>
                    )}
                  </div>
                  <span
                    className="font-semibold text-[11px] shrink-0"
                    style={{
                      color:
                        booking.status === BOOKING_STATUS.READY_FOR_PICKUP
                          ? "#16A34A"
                          : "#6B7280",
                    }}
                  >
                    {booking.status}
                  </span>
                </>
              );

              if (isClickable) {
                return (
                  <button
                    key={`${booking.id}-${i}`}
                    type="button"
                    onClick={() => onOpenBooking(booking.id)}
                    aria-label={`Open booking on ${booking.date} for ${booking.dogName}`}
                    className="w-full flex justify-between items-center gap-2 py-1.5 px-1 -mx-1 text-xs text-left font-inherit bg-transparent border-x-0 border-t-0 border-b border-slate-100 last:border-b-0 cursor-pointer rounded transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal/60"
                  >
                    {label}
                  </button>
                );
              }

              return (
                <div
                  key={`${booking.id || booking.date}-${i}`}
                  className="flex justify-between items-center gap-2 py-1.5 border-b border-slate-100 last:border-b-0 text-xs"
                >
                  {label}
                </div>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}

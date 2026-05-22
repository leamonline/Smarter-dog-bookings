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

// Recent-bookings section of the HumanCardModal. Pure leaf — given a
// human + the dogs map + bookingsByDate, surfaces the last five
// bookings that belong to this owner (either directly or via one of
// their dogs). Render hidden when the human has no bookings.
export function HumanBookingHistory({ human, dogs, dogsByHumanId, bookingsByDate }) {
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

  if (history.length === 0) return null;

  return (
    <>
      <div className="mt-5 font-extrabold text-xs text-brand-teal-text uppercase tracking-wide mb-2">
        Recent Bookings
      </div>
      {history.slice(0, 5).map((booking, i) => {
        const service = SERVICES.find((s) => s.id === booking.service);
        return (
          <div
            key={`${booking.id || booking.date}-${i}`}
            className="flex justify-between items-center py-1.5 border-b border-slate-200 text-xs"
          >
            <div>
              <span className="font-semibold text-slate-800">
                {formatBookingDate(booking.date)}
              </span>
              <span className="text-slate-500 ml-1.5">
                {titleCase(booking.dogName)}
              </span>
              <span className="text-slate-500 ml-1">
                {service?.name}
              </span>
            </div>
            <span
              className="font-semibold text-[11px]"
              style={{
                color:
                  booking.status === BOOKING_STATUS.READY_FOR_PICKUP
                    ? "#16A34A"
                    : "#6B7280",
              }}
            >
              {booking.status}
            </span>
          </div>
        );
      })}
    </>
  );
}

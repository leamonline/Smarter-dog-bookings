// src/components/booking/BookingList.jsx
import { useMemo } from "react";
import { Clock } from "lucide-react";
import { BookingCardNew } from "./BookingCardNew.jsx";

function formatSlot(slot) {
  if (!slot) return "";
  const [h, m] = slot.split(":");
  const hour = parseInt(h, 10);
  return `${hour}:${m}`;
}

export function BookingList({ bookings = [], searchQuery = "" }) {
  const sortedBookings = useMemo(() => {
    return [...bookings].sort((a, b) => {
      const timeDiff = a.slot.localeCompare(b.slot);
      if (timeDiff !== 0) return timeDiff;
      return (a.dogName || "").localeCompare(b.dogName || "");
    });
  }, [bookings]);

  if (bookings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4">
        <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          </svg>
        </div>
        <h3 className="text-lg font-bold text-brand-purple mb-1">No bookings yet</h3>
        <p className="text-sm text-slate-500 text-center max-w-[280px]">
          There are no appointments scheduled for this day. Switch back to grid view to add new bookings.
        </p>
      </div>
    );
  }

  const query = searchQuery.toLowerCase().trim();

  return (
    <div className="flex flex-col gap-3 p-4 bg-slate-50/50 min-h-full">
      {sortedBookings.map((booking) => {
        let searchDimmed = false;
        if (query) {
          const dogMatch = booking.dogName?.toLowerCase().includes(query);
          const ownerMatch =
            booking.ownerName?.toLowerCase().includes(query) ||
            booking.owner?.toLowerCase().includes(query);
          searchDimmed = !dogMatch && !ownerMatch;
        }

        const arrival = formatSlot(booking.slot);

        return (
          <div
            key={booking.id}
            className="w-full max-w-2xl mx-auto flex items-stretch gap-3"
          >
            {/* Arrival time pill — sits to the left of every list-view card
                so the schedule reads time → who → what without scanning
                back into the card body. */}
            <div className="shrink-0 flex flex-col items-center justify-center min-w-[64px] md:min-w-[80px] bg-white border border-slate-200 rounded-2xl px-2 py-3 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
              <Clock
                size={14}
                strokeWidth={2.2}
                className="text-brand-purple/60 mb-1"
                aria-hidden="true"
              />
              <span className="text-[13px] md:text-sm font-bold text-brand-purple tabular-nums leading-none">
                {arrival}
              </span>
              <span className="sr-only">Arrival time</span>
            </div>
            <div className="flex-1 min-w-0">
              <BookingCardNew booking={booking} searchDimmed={searchDimmed} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

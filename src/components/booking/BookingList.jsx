// src/components/booking/BookingList.jsx
import { useMemo } from "react";
import { BookingCardNew } from "./BookingCardNew.jsx";

export function BookingList({ bookings = [], searchQuery = "" }) {
  const sortedBookings = useMemo(() => {
    return [...bookings].sort((a, b) => {
      // Sort primarily by slot time
      const timeDiff = a.slot.localeCompare(b.slot);
      if (timeDiff !== 0) return timeDiff;
      // Secondary sort by dog name
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
        <h3 className="text-lg font-bold text-slate-800 mb-1">No bookings yet</h3>
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
          const ownerMatch = booking.ownerName?.toLowerCase().includes(query) || booking.owner?.toLowerCase().includes(query); // Check both ownerName and owner just in case
          searchDimmed = !dogMatch && !ownerMatch;
        }

        return (
          <div key={booking.id} className="w-full max-w-2xl mx-auto">
            <BookingCardNew
              booking={booking}
              searchDimmed={searchDimmed}
            />
          </div>
        );
      })}
    </div>
  );
}

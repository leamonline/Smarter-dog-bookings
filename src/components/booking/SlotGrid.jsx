// src/components/booking/SlotGrid.jsx
import { useMemo } from "react";
import { getSeatStatesForSlot } from "../../engine/capacity.js";
import { BookingCardNew } from "./BookingCardNew.jsx";
import { GhostSeat } from "./GhostSeat.jsx";
import { BlockedSeatCell } from "./BlockedSeatCell.jsx";

function formatSlotTime(slot) {
  const [hourStr, minStr] = slot.split(":");
  const hour = parseInt(hourStr, 10);
  const suffix = hour < 12 ? "am" : "pm";
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${displayHour}:${minStr}${suffix}`;
}

export function SlotGrid({
  bookings,
  activeSlots,
  onOpenNewBooking,
  currentDateStr,
  overrides,
  onOverride,
}) {
  const allEmpty = useMemo(() => {
    return activeSlots.every((slot) => {
      const slotOverrides = overrides?.[slot] || {};
      const states = getSeatStatesForSlot(bookings, slot, activeSlots, slotOverrides);
      return states.every((s) => s.type === "available");
    });
  }, [bookings, activeSlots, overrides]);

  return (
    <div className="relative">
    <div className="bg-white border border-slate-200 border-t-0 rounded-b-[14px] overflow-hidden">
      {activeSlots.map((slot, i) => {
        const slotOverrides = overrides?.[slot] || {};
        const seatStates = getSeatStatesForSlot(bookings, slot, activeSlots, slotOverrides);

        // Determine layout patterns for spanning
        const allAvailable = seatStates.every((s) => s.type === "available");
        const allBlockedByStaff = seatStates.every((s) => s.type === "blocked" && s.staffBlocked);

        const isLast = i === activeSlots.length - 1;

        return (
          <div
            key={slot}
            className={[
              "grid grid-cols-[56px_1fr_1fr] md:grid-cols-[72px_1fr_1fr] gap-1.5 md:gap-2.5 p-2 md:p-[10px_14px] min-h-[110px] md:min-h-[140px] items-stretch",
              isLast ? "" : "border-b border-[#F1F3F5]",
            ].join(" ")}
          >
            {/* Time label */}
            <div className="text-sm font-extrabold text-slate-800 text-center border-r-2 border-slate-200 pr-2 md:pr-2.5 self-stretch flex items-center justify-center">
              {formatSlotTime(slot)}
            </div>

            {/* Seats */}
            {allAvailable ? (
              /* Both empty — individual ghost seats */
              <>
                <GhostSeat
                  onClick={() => onOpenNewBooking(currentDateStr, slot)}
                  onBlock={onOverride ? () => onOverride(currentDateStr, slot, 0, "blocked") : undefined}
                />
                <GhostSeat
                  onClick={() => onOpenNewBooking(currentDateStr, slot)}
                  onBlock={onOverride ? () => onOverride(currentDateStr, slot, 1, "blocked") : undefined}
                />
              </>
            ) : allBlockedByStaff ? (
              /* Both staff-blocked — individual blocked bars */
              <>
                <BlockedSeatCell
                  onClick={() => { if (onOverride) onOverride(currentDateStr, slot, 0, "blocked"); }}
                />
                <BlockedSeatCell
                  onClick={() => { if (onOverride) onOverride(currentDateStr, slot, 1, "blocked"); }}
                />
              </>
            ) : (
              /* Mixed — render each seat individually */
              <>
                {seatStates.map((seat) => {
                  if (seat.type === "booking") {
                    return <BookingCardNew key={seat.seatIndex} booking={seat.booking} />;
                  }
                  if (seat.type === "reserved") {
                    return (
                      <div
                        key={seat.seatIndex}
                        className="border-[1.5px] border-slate-200 rounded-xl min-h-[60px] md:min-h-[80px] flex items-center justify-center bg-slate-50 text-slate-400 text-[11px] font-semibold italic"
                      >
                        (large dog)
                      </div>
                    );
                  }
                  if (seat.type === "blocked" && seat.staffBlocked) {
                    return (
                      <BlockedSeatCell
                        key={seat.seatIndex}
                        onClick={() => {
                          if (onOverride) onOverride(currentDateStr, slot, seat.seatIndex, "blocked");
                        }}
                      />
                    );
                  }
                  if (seat.type === "blocked") {
                    return (
                      <div
                        key={seat.seatIndex}
                        className="border-[1.5px] border-slate-200 rounded-xl min-h-[60px] md:min-h-[80px] flex items-center justify-center bg-slate-50 text-slate-300"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                          <circle cx="12" cy="12" r="9" stroke="#D1D5DB" strokeWidth="2" />
                          <line x1="6" y1="6" x2="18" y2="18" stroke="#D1D5DB" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                      </div>
                    );
                  }
                  // Available seat
                  return (
                    <GhostSeat
                      key={seat.seatIndex}
                      onClick={() => onOpenNewBooking(currentDateStr, slot)}
                      onBlock={onOverride ? () => onOverride(currentDateStr, slot, seat.seatIndex, "blocked") : undefined}
                    />
                  );
                })}
              </>
            )}
          </div>
        );
      })}
    </div>
    {allEmpty && (
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="text-center">
          <div className="text-slate-400 text-sm font-semibold">No bookings today</div>
          <div className="text-slate-400 text-xs mt-1">Tap a slot to add one</div>
        </div>
      </div>
    )}
    </div>
  );
}

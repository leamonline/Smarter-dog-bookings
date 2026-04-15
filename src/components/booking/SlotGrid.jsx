// src/components/booking/SlotGrid.jsx
import { useMemo, useCallback } from "react";
import { getSeatStatesForSlot } from "../../engine/capacity.js";
import { BookingCardNew } from "./BookingCardNew.jsx";
import { GhostSeat } from "./GhostSeat.jsx";
import { BlockedSeatCell } from "./BlockedSeatCell.jsx";
import { SkeletonCard } from "../shared/SkeletonCard.jsx";
import { useToast } from "../../contexts/ToastContext.jsx";

function formatSlotTime(slot) {
  const [hourStr, minStr] = slot.split(":");
  const hour = parseInt(hourStr, 10);
  const suffix = hour < 12 ? "am" : "pm";
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${displayHour}:${minStr}${suffix}`;
}

export function SlotGrid({
  bookings,
  loading,
  activeSlots,
  onOpenNewBooking,
  currentDateStr,
  overrides,
  onOverride,
  searchQuery,
}) {
  const toast = useToast();

  const block = useCallback((slot, seatIndex) => {
    if (onOverride) {
      onOverride(slot, seatIndex, "blocked");
      toast.show("Seat blocked", "info", () => onOverride(slot, seatIndex, "blocked"));
    }
  }, [onOverride, toast]);

  const unblock = useCallback((slot, seatIndex) => {
    if (onOverride) {
      onOverride(slot, seatIndex, "blocked");
      toast.show("Seat unblocked", "info", () => onOverride(slot, seatIndex, "blocked"));
    }
  }, [onOverride, toast]);

  const searchActive = searchQuery && searchQuery.trim().length > 0;
  const searchLower = searchActive ? searchQuery.toLowerCase().trim() : "";

  return (
    <div className="bg-white border border-slate-200 border-t-0 rounded-b-xl overflow-hidden">
      {activeSlots.map((slot, i) => {
        const slotOverrides = overrides?.[slot] || {};
        const seatStates = getSeatStatesForSlot(bookings, slot, activeSlots, slotOverrides);

        // Determine layout patterns for spanning
        const allAvailable = seatStates.every((s) => s.type === "available");
        const allBlockedByStaff = seatStates.every((s) => s.type === "blocked" && s.staffBlocked);

        const isLast = i === activeSlots.length - 1;

        const hasBooking = seatStates.some((s) => s.type === "booking");
        const rowHeight = hasBooking
          ? "min-h-[110px] md:min-h-[140px]"
          : "min-h-[48px] md:min-h-[56px]";

        return (
          <div
            key={slot}
            className={[
              `grid grid-cols-[56px_1fr_1fr] md:grid-cols-[72px_1fr_1fr] gap-1.5 md:gap-2.5 p-2 md:p-[10px_14px] ${rowHeight} items-stretch`,
              isLast ? "" : "border-b border-[#F1F3F5]",
            ].join(" ")}
          >
            {/* Time label */}
            <div className="text-sm font-extrabold text-slate-800 text-center border-r-2 border-slate-200 pr-2 md:pr-2.5 self-stretch flex items-center justify-center">
              {formatSlotTime(slot)}
            </div>

            {/* Seats */}
            {loading ? (
              <>
                <SkeletonCard />
                <SkeletonCard />
              </>
            ) : allAvailable ? (
              /* Both empty — individual ghost seats */
              <>
                <GhostSeat
                  onClick={() => onOpenNewBooking(currentDateStr, slot)}
                  onBlock={onOverride ? () => block(slot, 0) : undefined}
                />
                <GhostSeat
                  onClick={() => onOpenNewBooking(currentDateStr, slot)}
                  onBlock={onOverride ? () => block(slot, 1) : undefined}
                />
              </>
            ) : allBlockedByStaff ? (
              /* Both staff-blocked — individual blocked bars */
              <>
                <BlockedSeatCell
                  onClick={() => unblock(slot, 0)}
                />
                <BlockedSeatCell
                  onClick={() => unblock(slot, 1)}
                />
              </>
            ) : (
              /* Mixed — render each seat individually */
              <>
                {seatStates.map((seat) => {
                  if (seat.type === "booking") {
                    const b = seat.booking;
                    const dimmed = searchActive && !`${b.dogName} ${b.breed} ${b.owner} ${b.ownerName || ""}`.toLowerCase().includes(searchLower);
                    return <BookingCardNew key={b.id || seat.seatIndex} booking={b} searchDimmed={dimmed} />;
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
                        onClick={() => unblock(slot, seat.seatIndex)}
                      />
                    );
                  }
                  if (seat.type === "blocked") {
                    return (
                      <div
                        key={seat.seatIndex}
                        className="border-[1.5px] border-slate-200 rounded-xl min-h-[36px] md:min-h-[44px] flex flex-col items-center justify-center gap-0.5 bg-slate-50 text-slate-300"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                          <circle cx="12" cy="12" r="9" stroke="#D1D5DB" strokeWidth="2" />
                          <line x1="6" y1="6" x2="18" y2="18" stroke="#D1D5DB" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                        <span className="text-[10px] font-semibold text-slate-300">Closed</span>
                      </div>
                    );
                  }
                  // Available seat
                  return (
                    <GhostSeat
                      key={seat.seatIndex}
                      onClick={() => onOpenNewBooking(currentDateStr, slot)}
                      onBlock={onOverride ? () => block(slot, seat.seatIndex) : undefined}
                    />
                  );
                })}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

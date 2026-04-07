import { BRAND } from "../../constants/index.js";
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
  return (
    <div
      style={{
        background: BRAND.white,
        border: `1px solid ${BRAND.greyLight}`,
        borderTop: "none",
        borderRadius: "0 0 14px 14px",
      }}
    >
      {activeSlots.map((slot, i) => {
        const slotOverrides = overrides?.[slot] || {};
        const seatStates = getSeatStatesForSlot(bookings, slot, activeSlots, slotOverrides);

        // Determine layout patterns for spanning
        const allAvailable = seatStates.every((s) => s.type === "available");
        const allBlockedByStaff = seatStates.every((s) => s.type === "blocked" && s.staffBlocked);

        return (
          <div
            key={slot}
            style={{
              display: "grid",
              gridTemplateColumns: "72px 1fr 1fr",
              gap: 10,
              padding: "10px 14px",
              minHeight: 100,
              alignItems: "center",
              borderBottom: i < activeSlots.length - 1
                ? "1px solid #F1F3F5"
                : "none",
            }}
          >
            {/* Time label */}
            <div
              style={{
                fontSize: 14,
                fontWeight: 800,
                color: BRAND.text,
                textAlign: "center",
                borderRight: `2px solid ${BRAND.greyLight}`,
                paddingRight: 10,
                alignSelf: "stretch",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {formatSlotTime(slot)}
            </div>

            {/* Seats */}
            {allAvailable ? (
              /* Both empty — spanning ghost seat */
              <GhostSeat
                span
                onClick={() => onOpenNewBooking(currentDateStr, slot)}
                onBlock={onOverride ? (seatIdx) => onOverride(currentDateStr, slot, seatIdx, "blocked") : undefined}
              />
            ) : allBlockedByStaff ? (
              /* Both staff-blocked — spanning blocked bar */
              <BlockedSeatCell
                span
                onClick={() => {
                  if (onOverride) {
                    onOverride(currentDateStr, slot, 0, "blocked");
                    onOverride(currentDateStr, slot, 1, "blocked");
                  }
                }}
              />
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
                        style={{
                          border: `1.5px solid ${BRAND.greyLight}`,
                          borderRadius: 12,
                          minHeight: 80,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          background: "#F9FAFB",
                          color: BRAND.textLight,
                          fontSize: 11,
                          fontWeight: 600,
                          fontStyle: "italic",
                        }}
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
                        style={{
                          border: `1.5px solid ${BRAND.greyLight}`,
                          borderRadius: 12,
                          minHeight: 80,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          background: "#F9FAFB",
                          color: "#D1D5DB",
                        }}
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
  );
}

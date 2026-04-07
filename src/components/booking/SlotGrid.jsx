import { BRAND } from "../../constants/index.js";
import { BookingCardNew } from "./BookingCardNew.jsx";
import { GhostSeat } from "./GhostSeat.jsx";

function formatSlotTime(slot) {
  const [hourStr, minStr] = slot.split(":");
  const hour = parseInt(hourStr, 10);
  const suffix = hour < 12 ? "am" : "pm";
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${displayHour}:${minStr}${suffix}`;
}

export function SlotGrid({ bookings, activeSlots, onOpenNewBooking, currentDateStr }) {
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
        const slotBookings = bookings.filter((b) => b.slot === slot);
        const seats = [
          slotBookings[0] || null,
          slotBookings[1] || null,
        ];
        const isEmpty = slotBookings.length === 0;

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
                ? `1px solid #F1F3F5`
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
            {isEmpty ? (
              <GhostSeat
                span
                onClick={() => onOpenNewBooking(currentDateStr, slot)}
              />
            ) : (
              <>
                {seats[0] ? (
                  <BookingCardNew booking={seats[0]} />
                ) : (
                  <GhostSeat onClick={() => onOpenNewBooking(currentDateStr, slot)} />
                )}
                {seats[1] ? (
                  <BookingCardNew booking={seats[1]} />
                ) : (
                  <GhostSeat onClick={() => onOpenNewBooking(currentDateStr, slot)} />
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

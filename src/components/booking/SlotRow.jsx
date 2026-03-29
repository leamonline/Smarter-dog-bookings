import { useState } from "react";
import { BRAND, LARGE_DOG_SLOTS } from "../../constants/index.js";
import { useSalon } from "../../contexts/SalonContext.jsx";
import { BookingCard } from "./BookingCard.jsx";
import { AvailableSeat } from "../ui/AvailableSeat.jsx";
import { BlockedSeat } from "../ui/BlockedSeat.jsx";

function getSeatsNeeded(booking, slot) {
  if (booking.size !== "large") return 1;
  const rule = LARGE_DOG_SLOTS[slot];
  return rule ? rule.seats : 2;
}

function buildSeatPlan(capacity, overrides = {}) {
  const seats = [null, null];
  const slotBookings = capacity.bookings || [];
  const occupied = [false, false];

  for (const booking of slotBookings) {
    const seatsNeeded = getSeatsNeeded(booking, booking.slot);
    const startIndex = occupied.findIndex((seatTaken) => !seatTaken);

    if (startIndex === -1) break;

    occupied[startIndex] = true;
    seats[startIndex] = { type: "booking", booking };

    for (let i = 1; i < seatsNeeded; i++) {
      const blockedIndex = startIndex + i;
      if (blockedIndex < seats.length) {
        occupied[blockedIndex] = true;
        seats[blockedIndex] = {
          type: "occupied",
          reason: "occupied_by_large_dog",
          seatIndex: blockedIndex,
        };
      }
    }
  }

  for (let i = 0; i < seats.length; i++) {
    if (seats[i]) continue;

    if (overrides[i] === "blocked") {
      seats[i] = { type: "blocked", seatIndex: i, staffBlocked: true };
      continue;
    }

    if (overrides[i] === "open") {
      seats[i] = { type: "available", seatIndex: i, staffOpened: true };
      continue;
    }

    if (i < capacity.max) {
      seats[i] = { type: "available", seatIndex: i };
    } else {
      seats[i] = { type: "blocked", seatIndex: i };
    }
  }

  return seats;
}

export function SlotRow({
  slot,
  capacity,
  bookings,
  onAdd,
  overrides,
  onOverride,
  activeSlots,
  onOpenNewBooking,
}) {
  // Shared data from SalonContext — replaces 12+ drilled props
  const { dogs, humans, currentDateStr } = useSalon();

  const [showForm, setShowForm] = useState(false);
  const [formSeat, setFormSeat] = useState(null);

  const hour = parseInt(slot.split(":")[0], 10);
  const min = parseInt(slot.split(":")[1], 10);
  const displayTime = `${hour > 12 ? hour - 12 : hour}:${min
    .toString()
    .padStart(2, "0")}${hour >= 12 ? "pm" : "am"}`;

  const slotOverrides = overrides || {};
  const seats = buildSeatPlan(capacity, slotOverrides);

  const closeForm = () => {
    setShowForm(false);
    setFormSeat(null);
  };

  const handleSubmitAdd = async (booking) => {
    const result = await onAdd(booking);
    if (result !== false && result !== null) {
      closeForm();
    }
  };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "72px 1fr",
        gap: 12,
        padding: "10px 16px",
        borderBottom: `1px solid ${BRAND.greyLight}`,
        background: BRAND.white,
        alignItems: "start",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          alignSelf: "stretch",
        }}
      >
        <div
          style={{
            fontWeight: 700,
            fontSize: 15,
            color: BRAND.text,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {displayTime}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {seats.map((seat, i) => (
          <div key={i}>
            {seat.type === "booking" ? (
              <BookingCard booking={seat.booking} />
            ) : showForm && formSeat === i ? (
              <AddBookingForm
                slot={slot}
                bookings={bookings}
                activeSlots={activeSlots}
                dogs={dogs}
                humans={humans}
                slotOverrides={slotOverrides}
                selectedSeatIndex={i}
                onAdd={handleSubmitAdd}
                onCancel={closeForm}
              />
            ) : seat.type === "available" ? (
                <AvailableSeat
                  onAddBooking={() => onOpenNewBooking?.(currentDateStr, slot)}
                  onBlock={() => onOverride(slot, i, "blocked")}
                />
            ) : (
                <BlockedSeat
                  onAddBooking={() => onOpenNewBooking?.(currentDateStr, slot)}
                  onOpen={() => onOverride(slot, i, "open")}
                />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

import { AddBookingForm } from "./AddBookingForm.jsx";

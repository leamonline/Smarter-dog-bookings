import { useState } from "react";
import { BRAND } from "../../constants/index.js";
import { BookingCard } from "./BookingCard.jsx";
import { AddBookingForm } from "./AddBookingForm.jsx";
import { AvailableSeat } from "../ui/AvailableSeat.jsx";
import { BlockedSeat } from "../ui/BlockedSeat.jsx";

export function SlotRow({ slot, slotIndex, capacity, bookings, onAdd, onRemove, overrides, onOverride, activeSlots, onOpenHuman, onOpenDog, onUpdate, currentDateStr, currentDateObj, bookingsByDate, dayOpenState, dogs, humans, onUpdateDog, onRebook }) {
  const [showForm, setShowForm] = useState(false);
  const [formSeat, setFormSeat] = useState(null);
  const hour = parseInt(slot.split(":")[0]);
  const min = parseInt(slot.split(":")[1]);
  const displayTime = `${hour > 12 ? hour - 12 : hour}:${min.toString().padStart(2, "0")}${hour >= 12 ? "pm" : "am"}`;

  const slotBookings = capacity.bookings;
  const maxSeats = capacity.max;
  const slotOverrides = overrides || {};

  const seats = [];
  for (let i = 0; i < 2; i++) {
    if (i < slotBookings.length) {
      seats.push({ type: "booking", booking: slotBookings[i] });
    } else if (slotOverrides[i] === "blocked") {
      seats.push({ type: "blocked", seatIndex: i, staffBlocked: true });
    } else if (slotOverrides[i] === "open" && i >= maxSeats) {
      seats.push({ type: "available", seatIndex: i, staffOpened: true });
    } else if (i < maxSeats) {
      seats.push({ type: "available", seatIndex: i });
    } else {
      seats.push({ type: "blocked", seatIndex: i });
    }
  }

  return (
    <div style={{
      display: "grid", gridTemplateColumns: "72px 1fr", gap: 12,
      padding: "10px 16px", borderBottom: `1px solid ${BRAND.greyLight}`,
      background: BRAND.white, alignItems: "start",
    }}>
      {/* Time */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", alignSelf: "stretch" }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: BRAND.text, fontVariantNumeric: "tabular-nums" }}>{displayTime}</div>
      </div>

      {/* Both seats stacked */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {seats.map((seat, i) => (
          <div key={i}>
            {seat.type === "booking" ? (
              <BookingCard booking={seat.booking} onRemove={onRemove} onOpenHuman={onOpenHuman} onOpenDog={onOpenDog} onUpdate={onUpdate} currentDateStr={currentDateStr} currentDateObj={currentDateObj} bookingsByDate={bookingsByDate} dayOpenState={dayOpenState} dogs={dogs} humans={humans} onUpdateDog={onUpdateDog} onRebook={onRebook} />
            ) : seat.type === "available" ? (
              showForm && formSeat === i ? (
                <AddBookingForm slot={slot} bookings={bookings} activeSlots={activeSlots} dogs={dogs} humans={humans} onAdd={(b) => { onAdd(b); setShowForm(false); setFormSeat(null); }} onCancel={() => { setShowForm(false); setFormSeat(null); }} />
              ) : (
                <AvailableSeat
                  onAddBooking={() => { setShowForm(true); setFormSeat(i); }}
                  onBlock={() => onOverride(slot, i, "blocked")}
                />
              )
            ) : (
              showForm && formSeat === i ? (
                <AddBookingForm slot={slot} bookings={bookings} activeSlots={activeSlots} dogs={dogs} humans={humans} onAdd={(b) => { onAdd(b); setShowForm(false); setFormSeat(null); }} onCancel={() => { setShowForm(false); setFormSeat(null); }} />
              ) : (
                <BlockedSeat
                  onAddBooking={() => { setShowForm(true); setFormSeat(i); }}
                  onOpen={() => onOverride(slot, i, "open")}
                />
              )
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

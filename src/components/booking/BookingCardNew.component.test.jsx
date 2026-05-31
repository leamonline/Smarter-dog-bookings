import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SalonProvider } from "../../contexts/SalonContext.tsx";
import { ToastProvider } from "../../contexts/ToastContext.jsx";
import { BookingCardNew } from "./BookingCardNew.jsx";

function bookingFixture(overrides = {}) {
  return {
    id: "b-1",
    slot: "09:00",
    dogName: "Bella",
    breed: "Labrador",
    size: "small",
    service: "Full Groom",
    owner: "Jane Smith",
    status: "Booked",
    addons: [],
    pickupBy: "",
    payment: "Due at Pick-up",
    depositAmount: null,
    confirmed: false,
    dogNameSnapshot: "Bella",
    breedSnapshot: "Labrador",
    ownerNameSnapshot: "Jane",
    whatsappConversationId: null,
    whatsappMessageId: null,
    staffCapacityOverride: false,
    staffCapacityOverrideBy: null,
    staffCapacityOverrideAt: null,
    reminderConfirmedAt: null,
    _dogId: "d-1",
    _ownerId: "h-1",
    _pickupById: null,
    _bookingDate: "2026-06-01",
    _groupId: null,
    ...overrides,
  };
}

function renderCard(booking) {
  return render(
    <ToastProvider>
      <SalonProvider
        dogs={{}}
        humans={{}}
        bookingsByDate={{}}
        daySettings={{}}
        dayOpenState={true}
        currentDateStr="2026-06-01"
        currentDateObj={new Date("2026-06-01")}
        onAdd={vi.fn()}
        onUpdate={vi.fn()}
        onRemove={vi.fn()}
        onUpdateDog={vi.fn()}
        onOpenHuman={vi.fn()}
        onOpenDog={vi.fn()}
        onRebook={vi.fn()}
      >
        <BookingCardNew
          booking={booking}
          currentDateStr="2026-06-01"
          onUpdate={vi.fn()}
          onOpen={vi.fn()}
        />
      </SalonProvider>
    </ToastProvider>,
  );
}

describe("BookingCardNew — confirm tick", () => {
  it("renders the green tick when reminderConfirmedAt is set", () => {
    renderCard(bookingFixture({ reminderConfirmedAt: "2026-05-31T15:53:00Z" }));
    const tick = screen.getByRole("img", { name: /customer confirmed/i });
    expect(tick).toBeInTheDocument();
  });

  it("includes the timestamp in the tooltip", () => {
    renderCard(bookingFixture({ reminderConfirmedAt: "2026-05-31T15:53:00Z" }));
    const tick = screen.getByRole("img", { name: /customer confirmed/i });
    expect(tick.getAttribute("title")).toMatch(/confirmed via whatsapp/i);
  });

  it("does not render the tick when reminderConfirmedAt is null", () => {
    renderCard(bookingFixture({ reminderConfirmedAt: null }));
    expect(screen.queryByRole("img", { name: /customer confirmed/i })).toBeNull();
  });
});

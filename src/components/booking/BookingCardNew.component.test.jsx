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
        onUpdateHuman={vi.fn()}
        onOpenHuman={vi.fn()}
        onOpenDog={vi.fn()}
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

describe("BookingCardNew — appointment value & payment state", () => {
  // full-groom / small = £42 base, no add-ons → subtotal £42.
  it("shows the full appointment value as the main number for a plain booking", () => {
    renderCard(bookingFixture({ service: "full-groom", size: "small", payment: "Due at Pick-up" }));
    expect(screen.getByText("£42")).toBeInTheDocument();
    // Nothing still owed beyond the headline number, so no separate "due" line.
    expect(screen.queryByText(/due/i)).toBeNull();
  });

  it("keeps the full value as the main number AND shows the amount still due for a deposit-paid booking", () => {
    renderCard(
      bookingFixture({ service: "full-groom", size: "small", payment: "Deposit Paid", depositAmount: null }),
    );
    // Main number is the appointment value (£42), not the £32 still due.
    expect(screen.getByText("£42")).toBeInTheDocument();
    // Secondary figure tells the till what to collect.
    expect(screen.getByText(/£32 due/i)).toBeInTheDocument();
  });

  it("shows the full value plus a 'Paid' chip for a paid-in-full booking", () => {
    renderCard(bookingFixture({ service: "full-groom", size: "small", payment: "Paid in Full" }));
    // The headline number must still be the appointment value, even when settled.
    expect(screen.getByText("£42")).toBeInTheDocument();
    expect(screen.getByText("Paid")).toBeInTheDocument();
  });
});

describe("BookingCardNew — wordless override marker", () => {
  it("marks a staff capacity override without the shouty 'Over' word", () => {
    renderCard(
      bookingFixture({
        service: "full-groom",
        size: "small",
        staffCapacityOverride: true,
        staffCapacityOverrideAt: "2026-05-31T10:00:00Z",
      }),
    );
    // The meaning survives for screen readers / hover...
    expect(screen.getByRole("img", { name: /capacity overridden/i })).toBeInTheDocument();
    // ...but the visible "Over" text is gone.
    expect(screen.queryByText("Over")).toBeNull();
  });
});

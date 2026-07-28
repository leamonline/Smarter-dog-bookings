// Regression test for the "Can't update this customer's number here" bug.
//
// When a booking is opened from the week-calendar card (BookingCardNew →
// BookingDetailModal), the DeliveryFailureCard's inline "Fix the number" save
// calls onUpdateHuman. That handler lives on the SalonContext, so the card
// MUST thread it through to the modal — otherwise the save hits the
// `!onUpdateHuman` guard and staff can't correct a failed-delivery number.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SalonProvider } from "../../contexts/SalonContext.tsx";
import { ToastProvider } from "../../contexts/ToastContext.jsx";

// Capture the props the (lazy) BookingDetailModal is mounted with.
let capturedProps = null;
vi.mock("../modals/BookingDetailModal.jsx", () => ({
  BookingDetailModal: (props) => {
    capturedProps = props;
    return <div data-testid="booking-detail-modal" />;
  },
}));

const { BookingCardNew } = await import("./BookingCardNew.jsx");

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

function renderCard(onUpdateHuman, trustedHumanCallbacks = {}) {
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
        onUpdateHuman={onUpdateHuman}
        onOpenHuman={vi.fn()}
        onOpenDog={vi.fn()}
        {...trustedHumanCallbacks}
      >
        <BookingCardNew booking={bookingFixture()} currentDateStr="2026-06-01" />
      </SalonProvider>
    </ToastProvider>,
  );
}

describe("BookingCardNew → BookingDetailModal delivery-failure wiring", () => {
  it("threads onUpdateHuman from the salon context into the booking detail modal", async () => {
    capturedProps = null;
    const onUpdateHuman = vi.fn();
    renderCard(onUpdateHuman);

    fireEvent.click(screen.getByRole("button", { name: /open booking for bella/i }));
    await screen.findByTestId("booking-detail-modal");

    // The bug: onUpdateHuman never reached the modal, so the inline number fix
    // failed with "Can't update this customer's number here."
    expect(capturedProps.onUpdateHuman).toBe(onUpdateHuman);
  });

  it("threads every trusted-human callback into week-calendar appointment cards", async () => {
    capturedProps = null;
    const callbacks = {
      onAddHuman: vi.fn(),
      fetchHumanById: vi.fn(),
      findHumanByFullName: vi.fn(),
      searchHumansByTerm: vi.fn(),
    };
    renderCard(vi.fn(), callbacks);

    fireEvent.click(screen.getByRole("button", { name: /open booking for bella/i }));
    await screen.findByTestId("booking-detail-modal");

    expect(capturedProps.onAddHuman).toBe(callbacks.onAddHuman);
    expect(capturedProps.fetchHumanById).toBe(callbacks.fetchHumanById);
    expect(capturedProps.findHumanByFullName).toBe(callbacks.findHumanByFullName);
    expect(capturedProps.searchHumansByTerm).toBe(callbacks.searchHumansByTerm);
  });
});

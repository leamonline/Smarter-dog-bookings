import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SalonProvider } from "../../contexts/SalonContext.tsx";
import { ToastProvider } from "../../contexts/ToastContext.jsx";
import { BOOKING_STATUS } from "../../constants/index";
import { BookingCardNew } from "./BookingCardNew.jsx";

// The inline status picker used to fire-and-forget and toast "Marked as …"
// at once. updateBooking answers null when a gate refused the change, so the
// toast must wait for the answer (#987).

function makeBooking(overrides = {}) {
  return {
    id: "b-1",
    dogName: "Bella",
    breed: "Labrador",
    owner: "Jane",
    size: "medium",
    service: "full-groom",
    slot: "09:00",
    status: BOOKING_STATUS.BOOKED,
    payment: "Due at Pick-up",
    addons: [],
    pickupBy: "Jane",
    _dogId: "d-1",
    _ownerId: "h-1",
    _bookingDate: "2026-06-01",
    ...overrides,
  };
}

function renderCard(booking, onUpdate) {
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
        // The card reads onUpdate from the salon context, not from a prop.
        onUpdate={onUpdate}
        onRemove={vi.fn()}
        onUpdateDog={vi.fn()}
        onUpdateHuman={vi.fn()}
        onOpenHuman={vi.fn()}
        onOpenDog={vi.fn()}
      >
        <BookingCardNew booking={booking} />
      </SalonProvider>
    </ToastProvider>,
  );
}

function pickStatus(label) {
  fireEvent.click(screen.getByRole("button", { name: /^Change status/ }));
  fireEvent.click(screen.getByRole("option", { name: new RegExp(label) }));
}

describe("BookingCardNew — the status picker reads the saved result", () => {
  it("says the change did not land when updateBooking answers null", async () => {
    const onUpdate = vi.fn().mockResolvedValue(null);
    renderCard(makeBooking(), onUpdate);
    pickStatus("Arrived");
    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
    expect(onUpdate.mock.calls[0][0].status).toBe(BOOKING_STATUS.ARRIVED);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Couldn't mark Bella as Arrived");
    expect(screen.queryByText(/^Marked as/)).toBeNull();
  });

  it("only says Marked as once the row came back", async () => {
    const onUpdate = vi.fn().mockImplementation(async (b) => b);
    renderCard(makeBooking(), onUpdate);
    pickStatus("Arrived");
    expect(await screen.findByText("Marked as Arrived")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("uses the shared skip rule: Booked → Arrived needs no confirmation, Booked → Ready does", async () => {
    const onUpdate = vi.fn().mockImplementation(async (b) => b);
    renderCard(makeBooking(), onUpdate);
    pickStatus("Ready");
    expect(screen.getByText("Skip ahead?")).toBeTruthy();
    expect(screen.getByText(/won't have been marked as arrived/)).toBeTruthy();
    expect(onUpdate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Skip and update" }));
    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
    expect(onUpdate.mock.calls[0][0].status).toBe(BOOKING_STATUS.READY_FOR_COLLECTION);
  });
});

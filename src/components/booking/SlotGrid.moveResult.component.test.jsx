import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ToastProvider } from "../../contexts/ToastContext.jsx";
import { SalonProvider } from "../../contexts/SalonContext.tsx";
import { BOOKING_STATUS } from "../../constants/index";
import { SlotGrid } from "./SlotGrid.jsx";

// A drag move is useBookings.updateBooking, which answers null when a gate
// refused the write and never throws. The grid must read that answer: a green
// "Moved" over a card that snapped back was the audit's H1 (#987).

const SLOTS = ["08:30", "09:00", "09:30"];
const DATE = "2026-06-01";

const booking = {
  id: "b1",
  slot: "08:30",
  size: "small",
  service: "full-groom",
  status: BOOKING_STATUS.BOOKED,
  dogName: "Booked Dog",
  breed: "Cockapoo",
  owner: "Owner One",
  addons: [],
  pickupBy: "Owner One",
  payment: "Due at Pick-up",
  _dogId: "d1",
};

function renderGrid(onMoveBooking) {
  return render(
    <ToastProvider>
      <SalonProvider
        dogs={{}}
        humans={{}}
        bookingsByDate={{ [DATE]: [booking] }}
        daySettings={{}}
        dayOpenState={true}
        currentDateStr={DATE}
        currentDateObj={new Date(DATE)}
        onAdd={vi.fn()}
        onUpdate={vi.fn()}
        onRemove={vi.fn()}
        onUpdateDog={vi.fn()}
        onUpdateHuman={vi.fn()}
        onOpenHuman={vi.fn()}
        onOpenDog={vi.fn()}
      >
        <SlotGrid
          bookings={[booking]}
          loading={false}
          activeSlots={SLOTS}
          onOpenNewBooking={vi.fn()}
          onMoveBooking={onMoveBooking}
          currentDateStr={DATE}
          overrides={{}}
        />
      </SalonProvider>
    </ToastProvider>,
  );
}

const dataTransfer = { setData: vi.fn(), effectAllowed: "", dropEffect: "" };

function dragCardToFirstFreeSeat() {
  const card = screen.getByText("Booked Dog").closest("[draggable]");
  fireEvent.dragStart(card, { dataTransfer });
  // Two seats per slot; 08:30 holds the dog, so the first free seat is its
  // partner. Pick a seat in the next slot instead.
  const seats = screen.getAllByRole("button", { name: "Book this seat" });
  const target = seats[seats.length - 1];
  fireEvent.dragOver(target, { dataTransfer });
  fireEvent.drop(target, { dataTransfer });
}

describe("SlotGrid — a drag move reads the saved result", () => {
  it("reports failure and offers Retry when the move was refused", async () => {
    const onMoveBooking = vi.fn().mockResolvedValue(null);
    renderGrid(onMoveBooking);
    dragCardToFirstFreeSeat();
    await waitFor(() => expect(onMoveBooking).toHaveBeenCalledTimes(1));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Couldn't move Booked Dog");
    expect(alert.textContent).toContain("still at 08:30");
    expect(screen.queryByText(/^Moved /)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(onMoveBooking).toHaveBeenCalledTimes(2));
  });

  it("reports failure when the save rejected", async () => {
    const onMoveBooking = vi.fn().mockRejectedValue(new Error("network"));
    renderGrid(onMoveBooking);
    dragCardToFirstFreeSeat();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Couldn't move Booked Dog");
  });

  it("only says Moved once the database returned the row", async () => {
    const onMoveBooking = vi.fn().mockResolvedValue({ ...booking, slot: "09:30" });
    renderGrid(onMoveBooking);
    dragCardToFirstFreeSeat();
    const status = await screen.findByText(/Moved Booked Dog to 09:30/);
    expect(status).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

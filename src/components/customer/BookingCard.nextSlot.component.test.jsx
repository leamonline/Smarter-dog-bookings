import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../supabase/customerClient", () => ({
  customerSupabase: { rpc: vi.fn() },
}));

vi.mock("../../supabase/repositories/bookingsRepo", () => ({
  cancelCustomerBooking: vi.fn(),
  listIdsInGroup: vi.fn(),
  cancelMany: vi.fn(),
  getDepositSettings: () => Promise.resolve({ bank: null, releaseHours: 12 }),
}));

vi.mock("./AddToCalendarButton.tsx", () => ({
  AddToCalendarButton: () => <span>Calendar action</span>,
}));

import { BookingCard } from "./BookingCard.jsx";

function renderEmpty(nextSlot) {
  return render(
    <MemoryRouter>
      <BookingCard
        upcomingBookings={[]}
        dogs={[{ id: "d1", name: "Tipi" }]}
        dataLoaded
        nextSlot={nextSlot}
        nextSlotDogName="Tipi"
        onBook={vi.fn()}
        onBookingChanged={vi.fn()}
      />
    </MemoryRouter>,
  );
}

describe("BookingCard next free slot", () => {
  it("shows the next free slot beside the booking prompt", () => {
    renderEmpty({ status: "found", slot: { date: "2026-11-17", dropOffTime: "09:00" } });
    const panel = screen.getByRole("region", { name: "Next free slot" });
    expect(panel).toHaveTextContent("Next free slot for Tipi");
    expect(panel).toHaveTextContent("Tuesday 17 November");
    expect(panel).toHaveTextContent("9:00am drop-off");
    // The prompt and its action are still there.
    expect(screen.getByText(/Ready to book Tipi in\?/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Book a groom/ })).toBeInTheDocument();
  });

  it("says plainly when nothing is free in the window", () => {
    renderEmpty({ status: "none" });
    expect(screen.getByRole("region", { name: "Next free slot" })).toHaveTextContent(
      "Nothing free in the next four weeks",
    );
  });

  it("marks the panel busy while it checks the diary", () => {
    renderEmpty({ status: "loading" });
    const panel = screen.getByRole("region", { name: "Next free slot" });
    expect(panel).toHaveAttribute("aria-busy", "true");
    expect(panel).toHaveTextContent("Checking the diary");
  });

  it.each([["idle"], ["unavailable"]])(
    "shows no slot at all when the preview is %s — never a guess",
    (status) => {
      renderEmpty({ status });
      expect(screen.queryByRole("region", { name: "Next free slot" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Book a groom/ })).toBeInTheDocument();
    },
  );

  it("does not show a slot preview once a groom is booked", () => {
    render(
      <MemoryRouter>
        <BookingCard
          upcomingBookings={[{
            id: "00000000-0000-4000-8000-000000000001",
            bookingDate: "2099-11-17",
            slot: "09:00",
            service: "full-groom",
            status: "Booked",
            dogId: "d1",
            dog: { name: "Tipi" },
          }]}
          dogs={[{ id: "d1", name: "Tipi" }]}
          dataLoaded
          nextSlot={{ status: "found", slot: { date: "2099-11-18", dropOffTime: "10:00" } }}
          nextSlotDogName="Tipi"
          onBook={vi.fn()}
          onBookingChanged={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("region", { name: "Next free slot" })).not.toBeInTheDocument();
    const card = screen.getByRole("region", { name: /Appointment for Tipi/ });
    expect(within(card).getByRole("button", { name: "Reschedule" })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });
});

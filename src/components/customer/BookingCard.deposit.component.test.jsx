import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../supabase/customerClient", () => ({
  customerSupabase: { rpc: vi.fn() },
}));

vi.mock("../../supabase/repositories/bookingsRepo", () => ({
  cancelCustomerBooking: vi.fn(),
  listIdsInGroup: vi.fn(),
  cancelMany: vi.fn(),
  getDepositSettings: () =>
    Promise.resolve({
      bank: { accountName: "Smarter Dog", sortCode: "01-02-03", accountNumber: "12345678" },
      releaseHours: 12,
    }),
}));

vi.mock("./AddToCalendarButton.tsx", () => ({
  AddToCalendarButton: () => <span>Calendar action</span>,
}));

import { BookingCard } from "./BookingCard.jsx";

const base = {
  id: "40000000-0000-4000-8000-000000000001",
  booking_date: "2099-06-15",
  slot: "09:00",
  service: "full-groom",
  status: "Booked",
  payment: "Due at Pick-up",
  dogs: { name: "Alfie" },
};

const awaiting = {
  ...base,
  deposit_required: true,
  deposit_reference: "SDG-7K3M",
  deposit_due_by: "2099-06-14T09:00:00Z",
  deposit_received_at: null,
  deposit_amount: 10,
};

function renderCard(next) {
  return render(
    <MemoryRouter>
      <BookingCard
        upcomingBookings={[next]}
        dogs={[{ name: "Alfie" }]}
        onBook={() => {}}
        onBookingChanged={() => {}}
      />
    </MemoryRouter>,
  );
}

describe("BookingCard — awaiting deposit", () => {
  it("shows amount, bank details, reference, due time and the policy line", async () => {
    renderCard(awaiting);
    expect(await screen.findByText(/deposit needed to hold this booking/i)).toBeInTheDocument();
    expect(screen.getByText("SDG-7K3M")).toBeInTheDocument();
    expect(await screen.findByText(/01-02-03/)).toBeInTheDocument();
    expect(
      screen.getByText(/confirmed once your deposit arrives/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/non-refundable/i)).toBeInTheDocument();
  });

  it("shows nothing deposit-related for a normal booking", () => {
    renderCard(base);
    expect(screen.queryByText(/deposit needed/i)).toBeNull();
  });

  it("shows nothing once the deposit is received", () => {
    renderCard({ ...awaiting, payment: "Deposit Paid", deposit_received_at: "2099-06-13T10:00:00Z" });
    expect(screen.queryByText(/deposit needed/i)).toBeNull();
  });
});

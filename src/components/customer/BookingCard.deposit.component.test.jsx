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
  bookingDate: "2099-06-15",
  slot: "09:00",
  service: "full-groom",
  status: "Booked",
  payment: "Due at Pick-up",
  dog: { name: "Alfie" },
};

const awaiting = {
  ...base,
  depositRequired: true,
  depositReference: "SDG-7K3M",
  depositDueBy: "2099-06-14T09:00:00Z",
  depositReceivedAt: null,
  depositAmount: 10,
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
  it("states the payment deadline and automatic-release consequence", async () => {
    renderCard(awaiting);
    expect(await screen.findByText(/deposit needed to hold this booking/i)).toBeInTheDocument();
    expect(screen.getByText("SDG-7K3M")).toBeInTheDocument();
    expect(await screen.findByText(/01-02-03/)).toBeInTheDocument();
    const notice = screen.getByRole("status", { name: "Deposit needed" });
    expect(notice).toHaveTextContent(
      /please send the £10 deposit by .* using reference SDG-7K3M to hold this appointment/i,
    );
    expect(notice).toHaveTextContent(
      /if we can.t match it by then, the appointment will be released automatically/i,
    );
    expect(screen.queryByText(/confirmed once your deposit arrives/i)).toBeNull();
    expect(screen.getByText(/non-refundable/i)).toBeInTheDocument();
  });

  it("shows nothing deposit-related for a normal booking", () => {
    renderCard(base);
    expect(screen.queryByText(/deposit needed/i)).toBeNull();
  });

  it("shows nothing once the deposit is received", () => {
    renderCard({ ...awaiting, payment: "Deposit Paid", depositReceivedAt: "2099-06-13T10:00:00Z" });
    expect(screen.queryByText(/deposit needed/i)).toBeNull();
  });
});

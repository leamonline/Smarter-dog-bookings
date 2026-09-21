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
  getDepositSettings: () => Promise.resolve({ bank: null, releaseHours: 12 }),
}));

vi.mock("./AddToCalendarButton.tsx", () => ({
  AddToCalendarButton: () => <span>Calendar action</span>,
}));

import { BookingCard } from "./BookingCard.jsx";
import { AppointmentsSection } from "./AppointmentsSection.jsx";

/**
 * Loading, empty and error are three different states and must never share
 * copy. These cover the error half: after a failed fetch the lists are still
 * their initial [], and saying "nothing booked" then would tell a customer
 * with an appointment tomorrow that they have none.
 */

function renderBookingCard(props) {
  return render(
    <MemoryRouter>
      <BookingCard
        upcomingBookings={[]}
        dogs={[{ id: "d1", name: "Alfie" }]}
        onBook={vi.fn()}
        onBookingChanged={vi.fn()}
        {...props}
      />
    </MemoryRouter>,
  );
}

describe("portal empty states wait for a fetch that succeeded", () => {
  it("offers the booking prompt when the fetch succeeded and returned no bookings", () => {
    renderBookingCard({ dataLoaded: true });
    expect(screen.getByText(/Ready to book Alfie in\?/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Book a groom/ })).toBeInTheDocument();
  });

  it("says nothing about bookings when the fetch failed", () => {
    renderBookingCard({ dataLoaded: false });
    // The dashboard's error banner is the whole message. Crucially the
    // "Book a groom" call to action is gone too: acting on it while the real
    // diary is unknown is how a customer ends up double-booked.
    expect(screen.queryByText(/Ready to book/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Book a groom/ })).not.toBeInTheDocument();
  });

  it("still lists bookings that did load, whatever the flag says", () => {
    // dataLoaded only gates the empty CLAIM. Rows that arrived are real.
    renderBookingCard({
      dataLoaded: false,
      upcomingBookings: [{
        id: "b1",
        groupId: "g1",
        bookingDate: "2099-06-15",
        slot: "09:00",
        service: "full-groom",
        dog: { name: "Alfie" },
      }],
    });
    expect(screen.queryByText(/Ready to book/)).not.toBeInTheDocument();
    expect(screen.getAllByText(/Alfie/).length).toBeGreaterThan(0);
  });

  it("defaults to showing the empty state, so callers that pass nothing are unchanged", () => {
    renderBookingCard({});
    expect(screen.getByText(/Ready to book Alfie in\?/)).toBeInTheDocument();
  });

  it("drops the past-appointments 'Nothing yet' claim when the fetch failed", () => {
    const { rerender } = render(
      <AppointmentsSection
        pastBookings={[]}
        pastExpanded={false}
        setPastExpanded={vi.fn()}
        hasMorePast={false}
        loadingMore={false}
        onLoadMore={vi.fn()}
        onSubscribe={null}
        dataLoaded
      />,
    );
    expect(screen.getByText("Nothing yet")).toBeInTheDocument();

    rerender(
      <AppointmentsSection
        pastBookings={[]}
        pastExpanded={false}
        setPastExpanded={vi.fn()}
        hasMorePast={false}
        loadingMore={false}
        onLoadMore={vi.fn()}
        onSubscribe={null}
        dataLoaded={false}
      />,
    );
    expect(screen.queryByText("Nothing yet")).not.toBeInTheDocument();
    // The card itself stays, so the page keeps its shape.
    expect(screen.getByText("Past appointments")).toBeInTheDocument();
  });
});

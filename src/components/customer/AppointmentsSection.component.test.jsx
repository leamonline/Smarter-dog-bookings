import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppointmentsSection } from "./AppointmentsSection.jsx";

/**
 * A past appointment's price is history, not a quote. It used to be looked
 * up from today's price table for the dog's current size, which can show a
 * customer an amount they never paid. Now it is the amount recorded as taken
 * (`paid_amount`, in pounds, recorded only on Paid in Full) — or nothing.
 */

function pastBooking(overrides = {}) {
  return {
    id: "40000000-0000-4000-8000-000000000001",
    bookingDate: "2026-09-01",
    slot: "09:00",
    size: "small",
    service: "full-groom",
    status: "Completed",
    payment: "Paid in Full",
    dogId: "42000000-0000-4000-8000-000000000001",
    paidAmount: null,
    dog: { name: "Alfie", breed: "Poodle", size: "small" },
    ...overrides,
  };
}

function renderPast(bookings) {
  return render(
    <AppointmentsSection
      pastBookings={bookings}
      pastExpanded
      setPastExpanded={vi.fn()}
      hasMorePast={false}
      loadingMore={false}
      onLoadMore={vi.fn()}
      onSubscribe={null}
      dataLoaded
    />,
  );
}

describe("AppointmentsSection — past prices", () => {
  it("shows the amount recorded as taken, not today's list price", () => {
    // Today's small Full Groom is £42; this visit was paid at £46.
    renderPast([pastBooking({ paidAmount: 46 })]);

    expect(screen.getByText("£46")).toBeInTheDocument();
    expect(screen.queryByText("£42")).not.toBeInTheDocument();
  });

  it("shows no price at all when nothing was recorded", () => {
    renderPast([pastBooking({ paidAmount: null, payment: "Due at Pick-up" })]);

    expect(screen.getByText("Full Groom")).toBeInTheDocument();
    expect(screen.queryByText(/£/)).not.toBeInTheDocument();
  });

  it("keeps pence when the recorded amount has them", () => {
    renderPast([pastBooking({ paidAmount: 42.5 })]);

    expect(screen.getByText("£42.50")).toBeInTheDocument();
  });
});

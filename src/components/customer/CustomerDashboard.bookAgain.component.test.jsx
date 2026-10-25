import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ useCustomerDashboardData: vi.fn() }));

vi.mock("../../supabase/customerClient", () => ({
  customerSupabase: { rpc: vi.fn() },
}));

vi.mock("../../supabase/hooks/useCustomerDashboardData", () => ({
  useCustomerDashboardData: mocks.useCustomerDashboardData,
}));

vi.mock("./AddToCalendarButton.tsx", () => ({
  AddToCalendarButton: () => <span>Calendar action</span>,
}));

import { CustomerDashboard } from "./CustomerDashboard.jsx";
import { ToastProvider } from "../../contexts/ToastContext.jsx";

const HUMAN = { id: "41000000-0000-4000-8000-000000000001", name: "Sam" };

const past = (over) => ({
  id: crypto.randomUUID(),
  status: "Completed",
  slot: "09:00",
  dog: { name: "Alfie" },
  ...over,
});

function hookResult(bookings) {
  return {
    dogs: [{ id: "dog-1", name: "Alfie" }],
    bookings,
    olderBookings: [],
    trustedHumans: [],
    loading: false,
    retrying: false,
    loadError: null,
    trustedHumansError: null,
    loaded: { dogs: true, bookings: true, trustedHumans: true },
    hasMorePast: false,
    loadingMore: false,
    loadMore: vi.fn(),
    refreshBookings: vi.fn(),
    retryLoad: vi.fn(),
    retryTrustedHumans: vi.fn(),
    saveContactDetails: vi.fn(),
    updateDog: vi.fn(),
    addDog: vi.fn(),
  };
}

function Destination() {
  const location = useLocation();
  return (
    <div data-testid="destination">
      {location.pathname}
      {location.search}
      {JSON.stringify(location.state)}
    </div>
  );
}

function renderDashboard(bookings) {
  mocks.useCustomerDashboardData.mockReturnValue(hookResult(bookings));
  render(
    <MemoryRouter>
      <ToastProvider>
        <Routes>
          <Route path="/" element={<CustomerDashboard humanRecord={HUMAN} onSignOut={vi.fn()} />} />
          <Route path="/new" element={<Destination />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe("CustomerDashboard book the same groom again", () => {
  it("hands the last real visit to the wizard", () => {
    renderDashboard([
      past({ dogId: "dog-1", service: "bath-and-brush", bookingDate: "2026-09-08" }),
      // A later no-show is not a visit that happened.
      past({ dogId: "dog-2", service: "full-groom", bookingDate: "2026-10-06", status: "No-show" }),
      past({ dogId: "dog-9", service: "full-groom", bookingDate: "2026-07-01" }),
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Book the same groom again" }));

    const destination = screen.getByTestId("destination").textContent;
    expect(destination).toContain("/new?again=1");
    expect(destination).toContain('"dogId":"dog-1"');
    expect(destination).toContain('"service":"bath-and-brush"');
    expect(destination).not.toContain("dog-2");
    expect(destination).not.toContain("dog-9");
  });

  it("is not offered to a customer with no history", () => {
    renderDashboard([]);
    expect(screen.getAllByRole("button", { name: "Book a groom" }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Book the same groom again" })).not.toBeInTheDocument();
  });
});

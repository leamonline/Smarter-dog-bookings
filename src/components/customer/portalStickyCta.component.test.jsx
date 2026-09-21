import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
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

/**
 * The sticky bar is `display: none` above 640px, so it is the phone's only
 * persistent booking action. It used to render unconditionally, which meant a
 * failed booking fetch still offered "Book a groom" on mobile — the exact
 * duplicate-booking path the in-page card drops in that state. A CSS-hidden
 * element is still in the DOM, so jsdom sees what a phone would show.
 */

const HUMAN = { id: "41000000-0000-4000-8000-000000000001", name: "Sam" };

function hookResult(loaded, overrides = {}) {
  return {
    dogs: [],
    bookings: [],
    olderBookings: [],
    trustedHumans: [],
    loading: false,
    loadError: null,
    loaded: { dogs: true, bookings: true, trustedHumans: true, ...loaded },
    hasMorePast: false,
    loadingMore: false,
    loadMore: vi.fn(),
    refreshBookings: vi.fn(),
    saveContactDetails: vi.fn(),
    updateDog: vi.fn(),
    addDog: vi.fn(),
    ...overrides,
  };
}

function renderDashboard(loaded, overrides) {
  mocks.useCustomerDashboardData.mockReturnValue(hookResult(loaded, overrides));
  return render(
    <MemoryRouter>
      <ToastProvider>
        <CustomerDashboard humanRecord={HUMAN} onSignOut={vi.fn()} />
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe("the mobile sticky booking action", () => {
  it("is offered once the booking fetch has succeeded", () => {
    renderDashboard({});
    expect(screen.getAllByRole("button", { name: /Book a groom/ }).length)
      .toBeGreaterThan(0);
  });

  it("is withheld when the booking fetch failed", () => {
    renderDashboard(
      { bookings: false },
      { loadError: new Error("permission denied") },
    );
    // Nothing anywhere on the page may offer a booking while the real diary
    // is unknown — not the in-page card, and not the phone's sticky bar.
    expect(screen.queryByRole("button", { name: /Book a groom/ }))
      .not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("survives an unrelated trusted-humans failure", () => {
    // Bookings loaded fine; only a later request in the same chain failed.
    // The customer keeps their booking action.
    renderDashboard(
      { trustedHumans: false },
      { loadError: new Error("permission denied") },
    );
    expect(screen.getAllByRole("button", { name: /Book a groom/ }).length)
      .toBeGreaterThan(0);
  });
});

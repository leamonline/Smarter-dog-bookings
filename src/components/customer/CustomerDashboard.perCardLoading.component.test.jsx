import { fireEvent, render, screen, within } from "@testing-library/react";
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
 * Each region of the dashboard owns its loading and failure. The page-level
 * alert is for the reads the booking card depends on (dogs → bookings); the
 * trusted-humans card reports and retries its own read, so an outage there
 * neither raises a page alert nor passes for "no trusted humans".
 */

const HUMAN = { id: "41000000-0000-4000-8000-000000000001", name: "Sam" };

function hookResult(overrides = {}) {
  const { loaded, ...rest } = overrides;
  return {
    dogs: [],
    bookings: [],
    olderBookings: [],
    trustedHumans: [],
    loading: false,
    retrying: false,
    loadError: null,
    trustedHumansError: null,
    loaded: { dogs: true, bookings: true, trustedHumans: true, ...loaded },
    hasMorePast: false,
    loadingMore: false,
    loadMore: vi.fn(),
    refreshBookings: vi.fn(),
    retryLoad: vi.fn(),
    retryTrustedHumans: vi.fn(),
    saveContactDetails: vi.fn(),
    updateDog: vi.fn(),
    addDog: vi.fn(),
    ...rest,
  };
}

function renderDashboard(overrides) {
  const result = hookResult(overrides);
  mocks.useCustomerDashboardData.mockReturnValue(result);
  render(
    <MemoryRouter>
      <ToastProvider>
        <CustomerDashboard humanRecord={HUMAN} onSignOut={vi.fn()} />
      </ToastProvider>
    </MemoryRouter>,
  );
  return result;
}

function trustedHumansCard() {
  return screen.getByRole("heading", { name: "Trusted humans" }).closest(".portal-card");
}

describe("CustomerDashboard per-card loading", () => {
  it("keeps a trusted-humans failure inside its own card", () => {
    const hook = renderDashboard({
      trustedHumansError: new Error("permission denied"),
      loaded: { trustedHumans: false },
    });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    const card = within(trustedHumansCard());
    expect(card.getByText(/couldn.t load your trusted humans/i)).toBeInTheDocument();

    fireEvent.click(card.getByRole("button", { name: "Try again" }));
    expect(hook.retryTrustedHumans).toHaveBeenCalledTimes(1);
  });

  it("shows the booking action while trusted humans are still on their way", () => {
    renderDashboard({ loaded: { trustedHumans: false } });

    expect(
      within(trustedHumansCard()).getByText(/fetching your trusted humans/i),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Book a groom/ }).length)
      .toBeGreaterThan(0);
  });

  it("offers a retry on the page-level alert when the booking reads failed", () => {
    const hook = renderDashboard({
      loadError: new Error("permission denied"),
      loaded: { bookings: false },
    });

    const alert = within(screen.getByRole("alert"));
    fireEvent.click(alert.getByRole("button", { name: "Try again" }));
    expect(hook.retryLoad).toHaveBeenCalledTimes(1);
  });

  it("disables the page-level retry while one is already running", () => {
    renderDashboard({
      loadError: new Error("permission denied"),
      loaded: { bookings: false },
      retrying: true,
    });

    const button = within(screen.getByRole("alert")).getByRole("button", {
      name: "Trying again…",
    });
    expect(button).toBeDisabled();
  });
});

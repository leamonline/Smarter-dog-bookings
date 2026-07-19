import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cancelCustomerBooking: vi.fn(),
  listIdsInGroup: vi.fn(),
  cancelMany: vi.fn(),
}));

vi.mock("../../supabase/customerClient.js", () => ({
  customerSupabase: { rpc: vi.fn() },
}));

vi.mock("../../supabase/repositories/bookingsRepo", () => ({
  cancelCustomerBooking: mocks.cancelCustomerBooking,
  listIdsInGroup: mocks.listIdsInGroup,
  cancelMany: mocks.cancelMany,
}));

vi.mock("./AddToCalendarButton.tsx", () => ({
  AddToCalendarButton: () => <span>Calendar action</span>,
}));

import { BookingCard } from "./BookingCard.jsx";

const booking = {
  id: "40000000-0000-4000-8000-000000000001",
  group_id: "40000000-0000-4000-8000-000000000010",
  booking_date: "2099-06-15",
  slot: "09:00",
  service: "full-groom",
  dogs: { name: "Alfie" },
};

const receipt = {
  targetBookingId: booking.id,
  bookingGroupId: booking.group_id,
  cancelledBookingIds: [booking.id],
  cancelledCount: 1,
  cancelledAt: "2026-07-12T14:30:00.000Z",
};

function renderCard(onBookingChanged = vi.fn().mockResolvedValue(undefined)) {
  function LocationProbe() {
    const location = useLocation();
    return (
      <output data-testid="location">
        {location.pathname + location.search}
      </output>
    );
  }

  render(
    <MemoryRouter>
      <BookingCard
        upcomingBookings={[booking]}
        dogs={[]}
        onBook={vi.fn()}
        onBookingChanged={onBookingChanged}
      />
      <LocationProbe />
    </MemoryRouter>,
  );
  return onBookingChanged;
}

async function submitCancellation() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  const region = screen.getByRole("region", { name: "Cancel booking" });
  await user.selectOptions(within(region).getByRole("combobox"), "Changed plans");
  await user.click(
    within(region).getByRole("button", { name: "Confirm cancellation" }),
  );
}

describe("BookingCard cancellation", () => {
  beforeEach(() => {
    mocks.cancelCustomerBooking.mockReset();
    mocks.listIdsInGroup.mockReset();
    mocks.cancelMany.mockReset();
    mocks.listIdsInGroup.mockResolvedValue([booking.id]);
    mocks.cancelMany.mockResolvedValue({ error: null });
  });

  it("retains the form and booking when the cancellation fails", async () => {
    mocks.cancelCustomerBooking.mockResolvedValue({
      receipt: null,
      error: { code: "42501", message: "row level security" },
    });
    const onBookingChanged = renderCard();

    await submitCancellation();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /couldn.t cancel/i,
    );
    const region = screen.getByRole("region", { name: "Cancel booking" });
    expect(within(region).getByRole("combobox")).toHaveValue("Changed plans");
    expect(screen.getByText(/Next groom:/i)).toBeInTheDocument();
    expect(onBookingChanged).not.toHaveBeenCalled();
  });

  it("keeps the original booking ID in the reschedule URL", async () => {
    const user = userEvent.setup();
    renderCard();

    await user.click(screen.getByRole("button", { name: "Reschedule" }));
    await user.click(screen.getByRole("button", { name: "Pick a new time" }));

    expect(screen.getByTestId("location")).toHaveTextContent(
      `/customer/book?reschedule=${booking.id}`,
    );
  });

  it.each([
    ["SDC01", /online cancellation.*unavailable|contact us/i],
    ["SDC02", /too close.*cancel online|contact us/i],
  ])("shows friendly copy for %s", async (code, copy) => {
    mocks.cancelCustomerBooking.mockResolvedValue({
      receipt: null,
      error: { code, message: `raw_${code}_database_message` },
    });
    renderCard();

    await submitCancellation();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(copy);
    expect(alert).not.toHaveTextContent(`raw_${code}_database_message`);
  });

  it("awaits refresh before closing a confirmed cancellation", async () => {
    mocks.cancelCustomerBooking.mockResolvedValue({ receipt, error: null });
    let resolveRefresh;
    const refreshPromise = new Promise((resolve) => {
      resolveRefresh = resolve;
    });
    const onBookingChanged = vi.fn(() => refreshPromise);
    renderCard(onBookingChanged);

    await submitCancellation();

    expect(onBookingChanged).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("region", { name: "Cancel booking" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancelling…" })).toBeDisabled();

    await act(async () => {
      resolveRefresh();
      await refreshPromise;
    });

    await waitFor(() => {
      expect(
        screen.queryByRole("region", { name: "Cancel booking" }),
      ).not.toBeInTheDocument();
    });
  });

  it("reports a committed cancellation when refresh fails", async () => {
    mocks.cancelCustomerBooking.mockResolvedValue({ receipt, error: null });
    const onBookingChanged = vi
      .fn()
      .mockRejectedValue(new Error("refresh offline"));
    renderCard(onBookingChanged);

    await submitCancellation();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Your cancellation was saved, but we couldn't refresh your bookings. Refresh the page to see the latest status.",
    );
    expect(screen.getByText(/Next groom:/i)).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Cancel booking" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Cancellation saved" }),
    ).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Reschedule" }),
    ).not.toBeInTheDocument();
  });
});

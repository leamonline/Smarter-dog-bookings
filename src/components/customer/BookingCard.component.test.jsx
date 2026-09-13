import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cancelCustomerBooking: vi.fn(),
  listIdsInGroup: vi.fn(),
  cancelMany: vi.fn(),
}));

vi.mock("../../supabase/customerClient", () => ({
  customerSupabase: { rpc: vi.fn() },
}));

vi.mock("../../supabase/repositories/bookingsRepo", () => ({
  cancelCustomerBooking: mocks.cancelCustomerBooking,
  listIdsInGroup: mocks.listIdsInGroup,
  cancelMany: mocks.cancelMany,
  getDepositSettings: () => Promise.resolve({ bank: null, releaseHours: 12 }),
}));

vi.mock("./AddToCalendarButton.tsx", () => ({
  AddToCalendarButton: () => <span>Calendar action</span>,
}));

import { BookingCard } from "./BookingCard.jsx";

const booking = {
  id: "40000000-0000-4000-8000-000000000001",
  groupId: "40000000-0000-4000-8000-000000000010",
  bookingDate: "2099-06-15",
  slot: "09:00",
  service: "full-groom",
  dog: { name: "Alfie" },
};

const receipt = {
  targetBookingId: booking.id,
  bookingGroupId: booking.groupId,
  cancelledBookingIds: [booking.id],
  cancelledCount: 1,
  cancelledAt: "2026-07-12T14:30:00.000Z",
};

function renderCard(
  onBookingChanged = vi.fn().mockResolvedValue(undefined),
  upcomingBookings = [booking],
) {
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
        upcomingBookings={upcomingBookings}
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
      `/new?reschedule=${booking.id}`,
    );
  });

  it("routes staff-overridden bookings into an approval request", async () => {
    const user = userEvent.setup();
    renderCard(
      vi.fn().mockResolvedValue(undefined),
      [{ ...booking, staffCapacityOverride: true }],
    );

    await user.click(
      screen.getByRole("button", { name: "Request a change" }),
    );

    expect(screen.getByText(/current appointment stays booked/i)).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Choose a preferred time" }),
    );

    expect(screen.getByTestId("location")).toHaveTextContent(
      `/new?reschedule=${booking.id}&approval=request`,
    );
  });

  it("preserves approval routing for ungrouped siblings in the same visit", async () => {
    const visitId = "41000000-0000-4000-8000-000000000001";
    renderCard(
      vi.fn().mockResolvedValue(undefined),
      [
        {
          ...booking,
          groupId: null,
          visitId,
          staffCapacityOverride: false,
        },
        {
          ...booking,
          id: "40000000-0000-4000-8000-000000000002",
          dogId: "42000000-0000-4000-8000-000000000002",
          groupId: null,
          visitId,
          staffCapacityOverride: true,
          dog: { name: "Mabel" },
        },
      ],
    );

    expect(
      screen.getAllByRole("button", { name: "Request a change" }),
    ).toHaveLength(2);
    expect(
      screen.queryByRole("button", { name: "Reschedule" }),
    ).not.toBeInTheDocument();
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


describe("upcoming appointment visibility", () => {
  const sibling = { ...booking, id: "booking-2", dog: { name: "Mabel" }, service: "nail-trim", slot: "09:30" };

  it("lists every dog, service and drop-off time in a grouped appointment", () => {
    renderCard(undefined, [booking, sibling]);
    const card = screen.getByRole("region", { name: /Appointment for Alfie and Mabel/ });
    expect(within(card).getAllByRole("listitem")).toHaveLength(2);
    expect(within(card).getByText(/Nail Trim/)).toHaveTextContent("Mabel · Nail Trim · Drop off at 9:30am");
    expect(within(card).getAllByRole("button", { name: "Cancel" })).toHaveLength(1);
  });

  it("keeps unrelated same-time bookings and recurring dates separate, in date order", () => {
    renderCard(undefined, [
      { ...booking, id: "later", bookingDate: "2099-07-15" },
      { ...sibling, groupId: null, slot: booking.slot },
      booking,
    ]);
    const cards = screen.getAllByRole("region", { name: /Appointment for/ });
    expect(cards).toHaveLength(3);
    expect(cards[0]).toHaveTextContent("Next groom:");
    expect(cards[2]).toHaveTextContent("15 Jul 2099");
  });

  it("names every affected dog in reschedule and cancellation confirmation", async () => {
    const user = userEvent.setup();
    renderCard(undefined, [booking, sibling]);
    await user.click(screen.getByRole("button", { name: "Reschedule" }));
    expect(screen.getByText(/Pick a new time for Alfie and Mabel/)).toHaveTextContent("all these dogs");
    await user.click(screen.getByRole("button", { name: "Keep this slot" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("region", { name: "Cancel booking" })).toHaveTextContent("Cancel the appointment for Alfie and Mabel?");
  });

  it("cancels a later appointment using its own booking ID", async () => {
    mocks.cancelCustomerBooking.mockResolvedValue({ receipt, error: null });
    const user = userEvent.setup();
    renderCard(undefined, [booking, { ...sibling, bookingDate: "2099-07-15" }]);
    const card = screen.getByRole("region", { name: /Appointment for Mabel/ });
    await user.click(within(card).getByRole("button", { name: "Cancel" }));
    await user.selectOptions(within(card).getByRole("combobox"), "Changed plans");
    await user.click(within(card).getByRole("button", { name: "Confirm cancellation" }));
    expect(mocks.cancelCustomerBooking).toHaveBeenLastCalledWith(expect.anything(), { bookingId: sibling.id, reason: "Changed plans" });
  });

  it("shows an outstanding sibling deposit even if the first dog needs none", async () => {
    renderCard(undefined, [booking, { ...sibling, status: "Booked", depositRequired: true, depositAmount: 15, depositReference: "SDG-TEST", depositReceivedAt: null }]);
    const deposit = await screen.findByRole("status", { name: "Deposit needed" });
    expect(deposit).toHaveTextContent("For Mabel");
    expect(deposit).toHaveTextContent("SDG-TEST");
    expect(deposit).toHaveTextContent("15");
  });
});

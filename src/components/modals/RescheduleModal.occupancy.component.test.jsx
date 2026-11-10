// The reschedule picker against the REAL capacity engine. The sibling test
// file mocks the engine to exercise the UI rules; these cover what the picker
// feeds the engine, which is where both faults below lived:
//   - on the booking's own day the occupancy read includes the booking being
//     moved, and it was counted as somebody else's seat;
//   - a failed occupancy read came back as an empty list, so a full day
//     looked free.
// A far-future month is used so no day is ever "in the past".

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DAY_CAPACITY } from "../../engine/utilisation";

let monthState;
vi.mock("../../supabase/hooks/useMonthBookings", () => ({
  useMonthBookings: () => ({ monthBookingsByDate: monthState.bookingsByDate, monthBookingsLoading: false }),
}));
vi.mock("../../supabase/hooks/useMonthDaySettings", () => ({
  useMonthDaySettings: () => ({ monthDaySettings: {}, monthDayOpenState: monthState.openState, monthDaySettingsLoading: false }),
}));
vi.mock("../../supabase/client", () => ({ supabase: {} }));
vi.mock("../../supabase/repositories/bookingsRepo", () => ({
  listOnDateForCapacity: vi.fn(),
}));

import { listOnDateForCapacity } from "../../supabase/repositories/bookingsRepo";
import { RescheduleModal } from "./RescheduleModal.jsx";

const OWN_DAY = "2099-06-15";
const OTHER_DAY = "2099-06-16";
const BELLA = {
  id: "bella-booking",
  dogName: "Bella",
  size: "small",
  status: "Booked",
  slot: "08:30",
  _dogId: "d1",
  _bookingDate: OWN_DAY,
};
// What get_slot_occupancy returns: slot and size only, no ids.
const seat = (slot, size = "small") => ({ id: "", slot, size, status: "Booked", _dogId: "" });

const renderPicker = (over = {}) =>
  render(
    <RescheduleModal
      booking={BELLA}
      currentDateObj={new Date(2099, 5, 15)}
      sizeTheme={{ primary: "#2D8B7A", headerText: "#fff" }}
      onConfirm={vi.fn()}
      onClose={vi.fn()}
      {...over}
    />,
  );

beforeEach(() => {
  vi.clearAllMocks();
  monthState = { openState: { [OWN_DAY]: true, [OTHER_DAY]: true }, bookingsByDate: {} };
});

describe("RescheduleModal — the booking being moved is not counted against itself", () => {
  // Bella and one other small dog share 08:30, which makes that slot full.
  const twoAtHalfEight = [seat("08:30"), seat("08:30")];

  it("on its own day, the slot the booking already holds is not shown as full", async () => {
    const user = userEvent.setup();
    listOnDateForCapacity.mockResolvedValue({ bookings: twoAtHalfEight, error: null });
    renderPicker();

    await user.click(screen.getByRole("button", { name: /15 June, available/i }));

    expect(await screen.findByRole("button", { name: "08:30" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /08:30, fully booked/i })).toBeNull();
  });

  it("on another day the same occupancy still reads as full", async () => {
    const user = userEvent.setup();
    listOnDateForCapacity.mockResolvedValue({ bookings: twoAtHalfEight, error: null });
    renderPicker();

    await user.click(screen.getByRole("button", { name: /16 June, available/i }));

    expect(await screen.findByRole("button", { name: /08:30, fully booked/i })).toBeInTheDocument();
  });

  it("a cancelled booking is not in the occupancy, so nothing is taken out for it", async () => {
    const user = userEvent.setup();
    listOnDateForCapacity.mockResolvedValue({ bookings: twoAtHalfEight, error: null });
    renderPicker({ booking: { ...BELLA, status: "Cancelled" } });

    await user.click(screen.getByRole("button", { name: /15 June, available/i }));

    expect(await screen.findByRole("button", { name: /08:30, fully booked/i })).toBeInTheDocument();
  });

  it("its own day stays selectable when it is only full because of this booking", () => {
    monthState.bookingsByDate = {
      [OWN_DAY]: [{ id: BELLA.id }, ...Array(DAY_CAPACITY - 1).fill({ id: "other" })],
      [OTHER_DAY]: Array(DAY_CAPACITY).fill({ id: "other" }),
    };
    renderPicker();

    expect(screen.getByRole("button", { name: /15 June, available/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /16 June, fully booked/i })).toBeDisabled();
  });
});

describe("RescheduleModal — a failed availability read is not an empty day", () => {
  it("says it could not check and offers no times", async () => {
    const user = userEvent.setup();
    listOnDateForCapacity.mockResolvedValue({ bookings: [], error: new Error("timeout") });
    renderPicker();

    await user.click(screen.getByRole("button", { name: /16 June, available/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't check/i);
    expect(screen.queryByRole("button", { name: /^\d\d:\d\d/ })).toBeNull();
    expect(screen.getByRole("button", { name: /confirm move/i })).toBeDisabled();
  });

  it("treats a thrown read the same way", async () => {
    const user = userEvent.setup();
    listOnDateForCapacity.mockRejectedValue(new Error("network"));
    renderPicker();

    await user.click(screen.getByRole("button", { name: /16 June, available/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't check/i);
    expect(screen.queryByRole("button", { name: /^\d\d:\d\d/ })).toBeNull();
  });

  it("Try again reads the day again and shows the times once it answers", async () => {
    const user = userEvent.setup();
    listOnDateForCapacity
      .mockResolvedValueOnce({ bookings: [], error: new Error("timeout") })
      .mockResolvedValueOnce({ bookings: [seat("09:00"), seat("09:00")], error: null });
    renderPicker();

    await user.click(screen.getByRole("button", { name: /16 June, available/i }));
    await user.click(await screen.findByRole("button", { name: /try again/i }));

    expect(await screen.findByRole("button", { name: /09:00, fully booked/i })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

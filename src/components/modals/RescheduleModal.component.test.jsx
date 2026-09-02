// Tests for the calendar-based staff reschedule picker. The month availability
// and per-slot occupancy are mocked so we can exercise the UI rules:
//   - days: available (green, selectable) vs closed / fully-booked (greyed).
//   - times: free (selectable) vs full (greyed → staff overbook, red tag).
// A far-future month is used so no day is ever "in the past" regardless of
// when the suite runs.

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

let monthState;
vi.mock("../../supabase/hooks/useMonthBookings", () => ({
  useMonthBookings: () => ({ monthBookingsByDate: monthState.bookingsByDate, monthBookingsLoading: false }),
}));
vi.mock("../../supabase/hooks/useMonthDaySettings", () => ({
  useMonthDaySettings: () => ({ monthDaySettings: {}, monthDayOpenState: monthState.openState, monthDaySettingsLoading: false }),
}));
vi.mock("../../supabase/client", () => ({ supabase: {} }));
vi.mock("../../supabase/repositories/bookingsRepo", () => ({
  listOnDateForCapacity: vi.fn().mockResolvedValue({ bookings: [], error: null }),
}));
// 09:00 is the one over-capacity (overbookable) slot; everything else is free.
vi.mock("../../engine/capacity", () => ({
  canBookSlot: (_db, slot) => (slot === "09:00" ? { allowed: false, reason: "capacity" } : { allowed: true }),
  isCapacityRejection: (reason) => reason === "capacity",
}));

import { RescheduleModal } from "./RescheduleModal.jsx";

const MONTH = new Date(2099, 5, 1); // June 2099 — always in the future
const props = (over = {}) => ({
  booking: { dogName: "Bella", size: "small", _dogId: "d1", slot: "08:30" },
  currentDateObj: MONTH,
  sizeTheme: { primary: "#2D8B7A", headerText: "#fff" },
  onConfirm: vi.fn(),
  onClose: vi.fn(),
  ...over,
});

describe("RescheduleModal — calendar day picker", () => {
  it("greys closed and fully-booked days, leaves available days selectable", () => {
    monthState = {
      openState: { "2099-06-15": true, "2099-06-16": false, "2099-06-17": true },
      bookingsByDate: { "2099-06-17": Array(99).fill({ id: "x" }) }, // over day capacity
    };
    render(<RescheduleModal {...props()} />);
    expect(screen.getByRole("button", { name: /15 June, available/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /16 June, closed/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /17 June, fully booked/i })).toBeDisabled();
  });
});

describe("RescheduleModal — times + overbook", () => {
  it("a full slot is overbookable: select it → 'Overbook' + capacityOverride", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    monthState = { openState: { "2099-06-15": true }, bookingsByDate: {} };
    render(<RescheduleModal {...props({ onConfirm })} />);

    await user.click(screen.getByRole("button", { name: /15 June, available/i }));

    const full = await screen.findByRole("button", { name: /09:00, fully booked, select to overbook/i });
    await user.click(full);
    expect(full).toHaveTextContent(/overbook/i);
    expect(full.className).toMatch(/bg-red/); // selected overbook slot goes red

    await user.click(screen.getByRole("button", { name: /overbook & move/i }));
    expect(onConfirm).toHaveBeenCalledWith("2099-06-15", "09:00", { capacityOverride: true });
  });

  it("a free slot confirms without an override", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    monthState = { openState: { "2099-06-15": true }, bookingsByDate: {} };
    render(<RescheduleModal {...props({ onConfirm })} />);

    await user.click(screen.getByRole("button", { name: /15 June, available/i }));
    await user.click(await screen.findByRole("button", { name: "08:30" }));
    await user.click(screen.getByRole("button", { name: /confirm move/i }));
    expect(onConfirm).toHaveBeenCalledWith("2099-06-15", "08:30", {});
  });
});

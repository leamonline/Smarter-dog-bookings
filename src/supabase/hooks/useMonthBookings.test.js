import { describe, it, expect } from "vitest";
import { groupByDate } from "./useMonthBookings.js";
import { BOOKING_STATUS } from "../../constants/salon";

// The month grid (MiniCalendarCard) and the reschedule picker only need a
// per-day count of live occupancy — cancelled rows are soft-deletes that
// free their seat and must not inflate the counts.
describe("useMonthBookings groupByDate", () => {
  it("drops cancelled bookings so month counts match live occupancy", () => {
    const grouped = groupByDate([
      { id: "a", booking_date: "2026-07-06", status: BOOKING_STATUS.BOOKED },
      { id: "b", booking_date: "2026-07-06", status: BOOKING_STATUS.CANCELLED },
      { id: "c", booking_date: "2026-07-07", status: BOOKING_STATUS.COMPLETED },
    ]);
    expect(grouped["2026-07-06"].map((b) => b.id)).toEqual(["a"]);
    expect(grouped["2026-07-07"]).toHaveLength(1);
  });
});

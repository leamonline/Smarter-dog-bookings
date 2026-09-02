import { describe, expect, it } from "vitest";
import { BOOKING_STATUS } from "../../../constants/salon";
import type { Booking } from "../../../types/index";
import { resolveEditDay } from "./resolveEditDay";

// Local-time dates: toDateStr reads getFullYear/getMonth/getDate.
const monday = new Date(2026, 4, 18); // 18 May 2026, an open weekday
const sunday = new Date(2026, 4, 17);

const booked = (id: string, status: Booking["status"] = BOOKING_STATUS.BOOKED) => ({ id, status });

describe("resolveEditDay", () => {
  it("uses the stored day_settings row and lets dayOpenState decide open/closed", () => {
    const row = { isOpen: false, overrides: { "09:00": { maxSeats: 1 } }, extraSlots: ["13:30"] };
    const result = resolveEditDay({
      editDate: monday,
      bookingId: "b1",
      daySettings: { "2026-05-18": row },
      dayOpenState: { "2026-05-18": true },
      bookingsByDate: {},
    });
    expect(result.editDateStr).toBe("2026-05-18");
    expect(result.editSettings).toBe(row);
    // The pre-resolved map wins over the row's own flag.
    expect(result.editDayOpen).toBe(true);
  });

  it("falls back to the row's own isOpen when dayOpenState has no entry", () => {
    const result = resolveEditDay({
      editDate: monday,
      bookingId: "b1",
      daySettings: { "2026-05-18": { isOpen: false, overrides: {}, extraSlots: [] } },
      dayOpenState: {},
      bookingsByDate: {},
    });
    expect(result.editDayOpen).toBe(false);
  });

  it("synthesises settings from dayOpenState when there is no row", () => {
    const result = resolveEditDay({
      editDate: sunday,
      bookingId: "b1",
      daySettings: {},
      dayOpenState: { "2026-05-17": true },
      bookingsByDate: {},
    });
    expect(result.editSettings).toEqual({ isOpen: true, overrides: {}, extraSlots: [] });
    expect(result.editDayOpen).toBe(true);
  });

  it("falls back to the weekday default when neither a row nor the map knows the date", () => {
    const open = resolveEditDay({ editDate: monday, bookingId: "b1", bookingsByDate: {} });
    const closed = resolveEditDay({ editDate: sunday, bookingId: "b1", bookingsByDate: {} });
    expect(open.editDayOpen).toBe(true);
    expect(open.editSettings.isOpen).toBe(true);
    expect(closed.editDayOpen).toBe(false);
    expect(closed.editSettings.isOpen).toBe(false);
  });

  it("lists the other live bookings on the day — not this one, not cancelled ones", () => {
    const result = resolveEditDay({
      editDate: monday,
      bookingId: "b1",
      bookingsByDate: {
        "2026-05-18": [booked("b1"), booked("b2"), booked("b3", BOOKING_STATUS.CANCELLED)],
        "2026-05-19": [booked("b9")],
      },
    });
    expect(result.otherBookings.map((b) => b.id)).toEqual(["b2"]);
  });

  it("treats a day with no bookings as empty", () => {
    const result = resolveEditDay({ editDate: monday, bookingId: "b1", bookingsByDate: {} });
    expect(result.otherBookings).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { BOOKING_STATUS } from "../../../constants/salon";
import {
  selectUpcomingBookings,
  structuredRequestDates,
} from "./upcomingBookings";

const today = "2026-11-14";

function booking(overrides: Record<string, string | null>) {
  return {
    id: "b1",
    date: "2026-11-17",
    slot: "09:00",
    service: "full-groom",
    status: BOOKING_STATUS.BOOKED,
    dogName: "Luna",
    dogId: "d1",
    ...overrides,
  };
}

describe("selectUpcomingBookings", () => {
  it("keeps every live visit from today onward, soonest first", () => {
    const selected = selectUpcomingBookings([
      booking({ id: "later", date: "2026-11-24", slot: "08:30", dogName: "Biscuit" }),
      booking({ id: "done", date: "2026-11-17", status: BOOKING_STATUS.COMPLETED }),
      booking({ id: "past", date: "2026-11-10" }),
      booking({ id: "cancelled", status: BOOKING_STATUS.CANCELLED }),
      booking({ id: "noshow", status: BOOKING_STATUS.NO_SHOW }),
      booking({ id: "same-later", date: "2026-11-17", slot: "11:00", dogName: "Luna" }),
      booking({ id: "same-early", date: "2026-11-17", slot: "08:30", dogName: "Biscuit" }),
      booking({ id: "today", date: today, slot: "12:00", status: BOOKING_STATUS.ARRIVED, dogName: "Luna" }),
      booking({ id: "blank", date: "2026-11-18", status: null }),
    ], today);

    expect(selected.map((item) => item.id)).toEqual([
      "today",
      "same-early",
      "same-later",
      "blank",
      "later",
    ]);
  });
});

describe("structuredRequestDates", () => {
  it("accepts only real calendar dates", () => {
    expect(structuredRequestDates([
      "weekday",
      "Monday or Tuesday",
      "23,24,27 November",
      "2026-11-17",
      "2026-02-31",
      " 2026-11-18 ",
      "2026-11-17",
      null,
    ])).toEqual(["2026-11-17", "2026-11-18"]);
  });
});

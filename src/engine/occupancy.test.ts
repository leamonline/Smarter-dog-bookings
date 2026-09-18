import { describe, it, expect } from "vitest";

import { excludeCancelled } from "./occupancy";
import { BOOKING_STATUS } from "../constants/index";
import type { Booking } from "../types/index";

const booking = (id: string, status: Booking["status"]) => ({ id, status });

describe("excludeCancelled", () => {
  it("drops cancelled bookings", () => {
    const result = excludeCancelled([
      booking("a", BOOKING_STATUS.BOOKED),
      booking("b", BOOKING_STATUS.CANCELLED),
      booking("c", BOOKING_STATUS.COMPLETED),
    ]);
    expect(result.map((b) => b.id)).toEqual(["a", "c"]);
  });

  it("keeps everything when none are cancelled", () => {
    const input = [
      booking("a", BOOKING_STATUS.BOOKED),
      booking("b", BOOKING_STATUS.ARRIVED),
    ];
    expect(excludeCancelled(input)).toHaveLength(2);
  });

  it("keeps rows with a missing/undefined status (not cancelled)", () => {
    const result = excludeCancelled([
      booking("a", undefined as unknown as Booking["status"]),
      booking("b", BOOKING_STATUS.CANCELLED),
    ]);
    expect(result.map((b) => b.id)).toEqual(["a"]);
  });

  it("returns a new array and does not mutate the input", () => {
    const input = [booking("a", BOOKING_STATUS.CANCELLED)];
    const result = excludeCancelled(input);
    expect(result).not.toBe(input);
    expect(input).toHaveLength(1);
    expect(result).toHaveLength(0);
  });
});

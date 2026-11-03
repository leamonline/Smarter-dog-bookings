import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

import { excludeCancelled } from "./occupancy";
import { BOOKING_STATUS, occupyingStatusOr } from "../constants/index";
import { occupyingStatusOr as denoOccupyingStatusOr } from "../../supabase/functions/_shared/salonConstants.ts";
import type { Booking } from "../types/index";

const booking = (id: string, status: Booking["status"]) => ({ id, status });

describe("excludeCancelled", () => {
  it("drops cancelled bookings and keeps a completed visit", () => {
    const result = excludeCancelled([
      booking("a", BOOKING_STATUS.BOOKED),
      booking("b", BOOKING_STATUS.CANCELLED),
      booking("c", BOOKING_STATUS.COMPLETED),
    ]);
    expect(result.map((b) => b.id)).toEqual(["a", "c"]);
  });

  it("drops a no-show, which frees its seat the same way a cancellation does", () => {
    const result = excludeCancelled([
      booking("a", BOOKING_STATUS.BOOKED),
      booking("b", BOOKING_STATUS.NO_SHOW),
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

describe("occupyingStatusOr", () => {
  it("keeps a NULL status and excludes Cancelled and No-show", () => {
    // Same predicate as booking_occupies_seat(): coalesce(status, 'Booked')
    // is not one of the two terminal statuses. The or-list is parenthesised
    // so the comma inside the not.in values does not split the or-clause.
    expect(occupyingStatusOr()).toBe(
      'status.is.null,status.not.in.("Cancelled","No-show")',
    );
    expect(denoOccupyingStatusOr()).toBe(occupyingStatusOr());
  });

  it("is what every status-blind occupancy query uses", () => {
    const root = join(process.cwd());
    for (const path of [
      "src/supabase/repositories/bookingsRepo.ts",
      "supabase/functions/whatsapp-flow-endpoint/db.ts",
      "supabase/functions/slack-alerts/index.ts",
    ]) {
      const text = readFileSync(join(root, path), "utf8");
      expect(text, path).toMatch(/\.or\(\s*occupyingStatusOr\(\)\s*\)/);
      expect(text, path).not.toMatch(/\.not\(\s*"status"\s*,\s*"in"/);
    }
  });
});

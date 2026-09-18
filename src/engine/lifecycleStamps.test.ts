import { describe, it, expect } from "vitest";
import { applyLifecycleStamps } from "./lifecycleStamps";
import { BOOKING_STATUS, NO_SHOW_REASON } from "../constants/index";

// These assertions are the two migrations restated:
//   20260702180000_booking_lifecycle_timestamps  (checked_in_at, ready_at)
//   20260627160000_booking_completion            (completed_at)
// If this file and those triggers ever disagree, the trigger is right — this
// is a mirror for offline mode, not a second authority.

const NOW = "2026-07-14T09:15:00.000Z";
const EARLIER = "2026-07-14T08:00:00.000Z";

const stamp = (booking: Record<string, unknown>, previous: string | null) =>
  applyLifecycleStamps(booking as never, previous, NOW) as Record<string, unknown>;

describe("applyLifecycleStamps", () => {
  it("does nothing when the status has not moved", () => {
    const booking = { status: BOOKING_STATUS.CHECKED_IN, checkedInAt: null };
    expect(stamp(booking, BOOKING_STATUS.CHECKED_IN)).toBe(booking);
  });

  it("stamps the arrival on reaching Checked in", () => {
    const out = stamp({ status: BOOKING_STATUS.CHECKED_IN }, BOOKING_STATUS.BOOKED);
    expect(out.checkedInAt).toBe(NOW);
    expect(out.readyAt).toBeNull();
  });

  it("keeps the original arrival through the later stages", () => {
    const out = stamp(
      { status: BOOKING_STATUS.IN_BATH, checkedInAt: EARLIER },
      BOOKING_STATUS.CHECKED_IN,
    );
    expect(out.checkedInAt).toBe(EARLIER);
  });

  it("stamps ready on reaching Ready, keeping the arrival", () => {
    const out = stamp(
      { status: BOOKING_STATUS.READY_FOR_PICKUP, checkedInAt: EARLIER },
      BOOKING_STATUS.IN_BATH,
    );
    expect(out.checkedInAt).toBe(EARLIER);
    expect(out.readyAt).toBe(NOW);
  });

  it("keeps both marks once a dog is collected", () => {
    const out = stamp(
      { status: BOOKING_STATUS.COMPLETED, checkedInAt: EARLIER, readyAt: EARLIER },
      BOOKING_STATUS.READY_FOR_PICKUP,
    );
    expect(out.checkedInAt).toBe(EARLIER);
    expect(out.readyAt).toBe(EARLIER);
    expect(out.completedAt).toBe(NOW);
  });

  it("clears ready when a booking regresses below it — a staff correction", () => {
    const out = stamp(
      { status: BOOKING_STATUS.IN_BATH, checkedInAt: EARLIER, readyAt: EARLIER },
      BOOKING_STATUS.READY_FOR_PICKUP,
    );
    expect(out.readyAt).toBeNull();
    expect(out.checkedInAt).toBe(EARLIER);
  });

  it("clears the arrival only on a regression all the way back to Booked", () => {
    const out = stamp(
      { status: BOOKING_STATUS.BOOKED, checkedInAt: EARLIER, readyAt: EARLIER },
      BOOKING_STATUS.CHECKED_IN,
    );
    expect(out.checkedInAt).toBeNull();
    expect(out.readyAt).toBeNull();
  });

  it("clears the completion when a collected dog is put back", () => {
    const out = stamp(
      { status: BOOKING_STATUS.READY_FOR_PICKUP, completedAt: EARLIER, readyAt: EARLIER },
      BOOKING_STATUS.COMPLETED,
    );
    expect(out.completedAt).toBeNull();
  });

  it("re-stamps a completion rather than keeping the first one", () => {
    // Deliberately unlike checked_in_at / ready_at. set_booking_completed_at
    // assigns now() outright, so re-completing moves the time.
    const out = stamp(
      { status: BOOKING_STATUS.COMPLETED, completedAt: EARLIER },
      BOOKING_STATUS.READY_FOR_PICKUP,
    );
    expect(out.completedAt).toBe(NOW);
  });

  it("preserves arrival history when a booking is cancelled", () => {
    // A no-show that arrived and was then cancelled still arrived, and the
    // trigger deliberately leaves the stamps alone for any off-progression
    // status.
    const out = stamp(
      {
        status: BOOKING_STATUS.CANCELLED,
        cancelReason: NO_SHOW_REASON,
        checkedInAt: EARLIER,
        readyAt: EARLIER,
      },
      BOOKING_STATUS.READY_FOR_PICKUP,
    );
    expect(out.checkedInAt).toBe(EARLIER);
    expect(out.readyAt).toBe(EARLIER);
  });

  it("leaves an unrecognised status entirely alone", () => {
    const booking = { status: "Awaiting deposit", checkedInAt: EARLIER };
    expect(stamp(booking, BOOKING_STATUS.BOOKED).checkedInAt).toBe(EARLIER);
  });
});

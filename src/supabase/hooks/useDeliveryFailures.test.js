import { describe, it, expect } from "vitest";
import { applyDismissals } from "./useDeliveryFailures";

const f = (bookingId, latestAt) => ({ bookingId, latestAt, customerName: "X" });

describe("applyDismissals", () => {
  it("keeps a failure with no dismissal", () => {
    const out = applyDismissals([f("b1", "2026-06-24T10:00:00Z")], new Map());
    expect(out.map((x) => x.bookingId)).toEqual(["b1"]);
  });

  it("hides a failure dismissed at or after its latest failure", () => {
    const dismissals = new Map([["b1", "2026-06-24T10:00:00Z"]]);
    const out = applyDismissals([f("b1", "2026-06-24T10:00:00Z")], dismissals);
    expect(out).toEqual([]);
  });

  it("re-surfaces a booking that failed again after it was dismissed", () => {
    const dismissals = new Map([["b1", "2026-06-24T10:00:00Z"]]);
    // newer failure than the dismissal → show again
    const out = applyDismissals([f("b1", "2026-06-24T11:30:00Z")], dismissals);
    expect(out.map((x) => x.bookingId)).toEqual(["b1"]);
  });

  it("keeps a failure with a missing latestAt (safety)", () => {
    const dismissals = new Map([["b1", "2026-06-24T10:00:00Z"]]);
    const out = applyDismissals([f("b1", null)], dismissals);
    expect(out.map((x) => x.bookingId)).toEqual(["b1"]);
  });

  it("filters per booking independently", () => {
    const dismissals = new Map([["b1", "2026-06-24T10:00:00Z"]]);
    const out = applyDismissals(
      [f("b1", "2026-06-24T09:00:00Z"), f("b2", "2026-06-24T09:00:00Z")],
      dismissals,
    );
    expect(out.map((x) => x.bookingId)).toEqual(["b2"]);
  });
});

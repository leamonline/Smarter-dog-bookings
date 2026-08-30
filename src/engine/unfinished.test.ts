import { describe, expect, it } from "vitest";

import { BOOKING_STATUS } from "../constants/salon";
import {
  ageInDays,
  buildUnfinishedQueue,
  classifyUnfinished,
  isTerminalStatus,
  type UnfinishedCandidate,
} from "./unfinished";

const TODAY = "2026-08-20";

function booking(over: Partial<UnfinishedCandidate> & { id: string }): UnfinishedCandidate {
  return {
    status: BOOKING_STATUS.BOOKED,
    _bookingDate: "2026-08-10",
    paidAt: null,
    ...over,
  };
}

describe("ageInDays", () => {
  it("counts whole calendar days", () => {
    expect(ageInDays("2026-08-19", TODAY)).toBe(1);
    expect(ageInDays("2026-08-10", TODAY)).toBe(10);
    expect(ageInDays("2026-06-02", TODAY)).toBe(79);
  });

  it("does not drift across the BST boundary", () => {
    // 25 October 2026 is the UK clock change. A millisecond-difference
    // implementation returns 30.04 days here and rounds inconsistently;
    // calendar arithmetic must not care.
    expect(ageInDays("2026-10-20", "2026-11-19")).toBe(30);
  });
});

describe("classifyUnfinished", () => {
  it("ignores anything dated today or later", () => {
    expect(classifyUnfinished(booking({ id: "a", _bookingDate: TODAY }), TODAY)).toBeNull();
    expect(classifyUnfinished(booking({ id: "b", _bookingDate: "2026-09-01" }), TODAY)).toBeNull();
  });

  it("leaves finished bookings alone", () => {
    expect(
      classifyUnfinished(
        booking({ id: "c", status: BOOKING_STATUS.CANCELLED }),
        TODAY,
      ),
    ).toBeNull();
    expect(
      classifyUnfinished(
        booking({ id: "d", status: BOOKING_STATUS.COMPLETED, paidAt: "2026-08-10T12:00:00Z" }),
        TODAY,
      ),
    ).toBeNull();
  });

  it("separates the lifecycle states by the action each needs", () => {
    const cases: Array<[string, string]> = [
      [BOOKING_STATUS.CHECKED_IN, "mid_groom"],
      [BOOKING_STATUS.IN_BATH, "mid_groom"],
      [BOOKING_STATUS.READY_FOR_PICKUP, "awaiting_collection"],
      [BOOKING_STATUS.BOOKED, "never_started"],
    ];
    for (const [status, kind] of cases) {
      expect(classifyUnfinished(booking({ id: status, status }), TODAY), status).toBe(kind);
    }
  });

  it("treats a completed booking with no payment as unfinished business", () => {
    expect(
      classifyUnfinished(
        booking({ id: "e", status: BOOKING_STATUS.COMPLETED, paidAt: null }),
        TODAY,
      ),
    ).toBe("unpaid");
  });

  it("skips a booking with no date rather than guessing", () => {
    expect(classifyUnfinished(booking({ id: "f", _bookingDate: null }), TODAY)).toBeNull();
  });
});

describe("isTerminalStatus", () => {
  it("recognises exactly the two finished states", () => {
    expect(isTerminalStatus(BOOKING_STATUS.COMPLETED)).toBe(true);
    expect(isTerminalStatus(BOOKING_STATUS.CANCELLED)).toBe(true);
    expect(isTerminalStatus(BOOKING_STATUS.READY_FOR_PICKUP)).toBe(false);
    expect(isTerminalStatus(null)).toBe(false);
  });
});

describe("buildUnfinishedQueue", () => {
  it("is empty when every booking is finished or still ahead", () => {
    const q = buildUnfinishedQueue(
      [
        booking({ id: "1", status: BOOKING_STATUS.COMPLETED, paidAt: "2026-08-11T09:00:00Z" }),
        booking({ id: "2", status: BOOKING_STATUS.CANCELLED }),
        booking({ id: "3", _bookingDate: "2026-08-25" }),
      ],
      TODAY,
    );
    expect(q.total).toBe(0);
    expect(q.groups).toEqual([]);
    expect(q.oldestAgeDays).toBe(0);
  });

  it("groups by required action and orders groups most-stale first", () => {
    const q = buildUnfinishedQueue(
      [
        booking({ id: "u", status: BOOKING_STATUS.COMPLETED, paidAt: null }),
        booking({ id: "n", status: BOOKING_STATUS.BOOKED }),
        booking({ id: "r", status: BOOKING_STATUS.READY_FOR_PICKUP }),
        booking({ id: "m", status: BOOKING_STATUS.IN_BATH }),
      ],
      TODAY,
    );
    expect(q.groups.map((g) => g.kind)).toEqual([
      "mid_groom",
      "awaiting_collection",
      "never_started",
      "unpaid",
    ]);
    expect(q.total).toBe(4);
    expect(q.counts).toEqual({
      mid_groom: 1,
      awaiting_collection: 1,
      never_started: 1,
      unpaid: 1,
    });
  });

  it("puts the longest-neglected booking at the top of its group", () => {
    const q = buildUnfinishedQueue(
      [
        booking({ id: "recent", status: BOOKING_STATUS.READY_FOR_PICKUP, _bookingDate: "2026-08-18" }),
        booking({ id: "ancient", status: BOOKING_STATUS.READY_FOR_PICKUP, _bookingDate: "2026-06-02" }),
        booking({ id: "middling", status: BOOKING_STATUS.READY_FOR_PICKUP, _bookingDate: "2026-07-15" }),
      ],
      TODAY,
    );
    const [group] = q.groups;
    expect(group.items.map((i) => i.booking.id)).toEqual(["ancient", "middling", "recent"]);
    expect(group.items[0].ageDays).toBe(79);
    expect(q.oldestAgeDays).toBe(79);
  });

  it("orders deterministically when two bookings are equally stale", () => {
    // Same date, so the age tiebreak can't decide. Without a stable second key
    // the list would reshuffle between renders.
    const q = buildUnfinishedQueue(
      [
        booking({ id: "bbb", status: BOOKING_STATUS.BOOKED, _bookingDate: "2026-08-01" }),
        booking({ id: "aaa", status: BOOKING_STATUS.BOOKED, _bookingDate: "2026-08-01" }),
      ],
      TODAY,
    );
    expect(q.groups[0].items.map((i) => i.booking.id)).toEqual(["aaa", "bbb"]);
  });

  it("carries an action for every group it can produce", () => {
    const q = buildUnfinishedQueue(
      [
        booking({ id: "a", status: BOOKING_STATUS.IN_BATH }),
        booking({ id: "b", status: BOOKING_STATUS.READY_FOR_PICKUP }),
        booking({ id: "c", status: BOOKING_STATUS.BOOKED }),
        booking({ id: "d", status: BOOKING_STATUS.COMPLETED, paidAt: null }),
      ],
      TODAY,
    );
    for (const group of q.groups) {
      expect(group.label.length, group.kind).toBeGreaterThan(0);
      expect(group.action.length, group.kind).toBeGreaterThan(0);
    }
  });

  it("reproduces the production shape measured on 20 August 2026", () => {
    // 36 awaiting collection, 18 never started, 4 checked in, 2 in bath —
    // the 60 past-dated non-terminal bookings the audit found — plus a
    // sample of the 215 completed-but-unpaid.
    const rows: UnfinishedCandidate[] = [
      ...Array.from({ length: 36 }, (_, i) =>
        booking({ id: `r${i}`, status: BOOKING_STATUS.READY_FOR_PICKUP })),
      ...Array.from({ length: 18 }, (_, i) =>
        booking({ id: `n${i}`, status: BOOKING_STATUS.BOOKED })),
      ...Array.from({ length: 4 }, (_, i) =>
        booking({ id: `c${i}`, status: BOOKING_STATUS.CHECKED_IN })),
      ...Array.from({ length: 2 }, (_, i) =>
        booking({ id: `i${i}`, status: BOOKING_STATUS.IN_BATH })),
      ...Array.from({ length: 5 }, (_, i) =>
        booking({ id: `u${i}`, status: BOOKING_STATUS.COMPLETED, paidAt: null })),
    ];
    const q = buildUnfinishedQueue(rows, TODAY);
    expect(q.counts.awaiting_collection).toBe(36);
    expect(q.counts.never_started).toBe(18);
    expect(q.counts.mid_groom).toBe(6);
    expect(q.counts.unpaid).toBe(5);
    // The lifecycle leak the audit reported, independent of the unpaid half.
    expect(
      q.counts.awaiting_collection + q.counts.never_started + q.counts.mid_groom,
    ).toBe(60);
  });
});

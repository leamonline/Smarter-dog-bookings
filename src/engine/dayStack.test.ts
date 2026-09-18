import { describe, it, expect } from "vitest";
import {
  buildCollectedRows,
  buildDayStack,
  checkoutChain,
  nextCheckoutStep,
  selectCollected,
  READY_OVERDUE_MINUTES,
} from "./dayStack";
import { buildTakingsByMethod } from "./today";
import { BOOKING_STATUS, NO_SHOW_REASON } from "../constants/index";
import type { Booking } from "../types/index";

// 10:15 in London, British Summer Time. Chosen so the BST offset is doing real
// work: a stamp written as UTC has to come back as the London wall clock.
const NOW = new Date("2026-07-02T09:15:00Z");
const TODAY = "2026-07-02";
const OTHER_DAY = "2026-07-09";

function bk(partial: Partial<Booking>): Booking {
  return { _bookingDate: TODAY, service: "full-groom", ...partial } as Booking;
}

/** Minutes before NOW, as an ISO stamp. */
function agoIso(minutes: number): string {
  return new Date(NOW.getTime() - minutes * 60_000).toISOString();
}

const stack = (bookings: Booking[], dateStr = TODAY, breedById = {}) =>
  buildDayStack({ bookings, dateStr, now: NOW, breedById });

describe("buildDayStack ordering", () => {
  it("keeps strict appointment order regardless of status", () => {
    // Deliberately adversarial: the statuses are in reverse order of time, so
    // any grouping or re-sort by status would be visible immediately.
    const rows = stack([
      bk({ id: "d", slot: "13:00", status: BOOKING_STATUS.BOOKED }),
      bk({ id: "a", slot: "08:30", status: BOOKING_STATUS.READY_FOR_PICKUP, readyAt: agoIso(10) }),
      bk({ id: "c", slot: "11:00", status: BOOKING_STATUS.CHECKED_IN, checkedInAt: agoIso(20) }),
      bk({ id: "b", slot: "09:30", status: BOOKING_STATUS.IN_BATH, checkedInAt: agoIso(40) }),
    ]);
    expect(rows.map((r) => r.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("puts a booking with no slot last rather than dropping it", () => {
    const rows = stack([
      bk({ id: "none", status: BOOKING_STATUS.BOOKED }),
      bk({ id: "timed", slot: "12:00", status: BOOKING_STATUS.BOOKED }),
    ]);
    expect(rows.map((r) => r.id)).toEqual(["timed", "none"]);
    expect(rows[1].time).toBeNull();
  });
});

describe("buildDayStack membership", () => {
  it("includes a staff-confirmed no-show, in its time position", () => {
    const rows = stack([
      bk({ id: "later", slot: "12:00", status: BOOKING_STATUS.BOOKED }),
      bk({
        id: "ns",
        slot: "09:00",
        status: BOOKING_STATUS.CANCELLED,
        cancelReason: NO_SHOW_REASON,
      }),
    ]);
    expect(rows.map((r) => r.id)).toEqual(["ns", "later"]);
  });

  it("leaves an ordinary cancellation out", () => {
    const rows = stack([
      bk({
        id: "c",
        slot: "09:00",
        status: BOOKING_STATUS.CANCELLED,
        cancelReason: "Rescheduled via WhatsApp",
      }),
    ]);
    expect(rows).toEqual([]);
  });

  it("drops a collected dog — it belongs in the summary, not the stack", () => {
    const rows = stack([
      bk({ id: "done", slot: "09:00", status: BOOKING_STATUS.COMPLETED, completedAt: agoIso(5) }),
    ]);
    expect(rows).toEqual([]);
  });
});

describe("buildDayStack timing", () => {
  it("counts a checked-in dog's time on site from checked_in_at", () => {
    const [row] = stack([
      bk({ id: "x", slot: "08:30", status: BOOKING_STATUS.CHECKED_IN, checkedInAt: agoIso(135) }),
    ]);
    expect(row.timing).toBe("2 hrs 15 min");
    expect(row.urgent).toBe(false);
  });

  it("reads elapsed time correctly across the BST offset", () => {
    // 08:30 London on a BST day is 07:30 UTC. If the stamp were read as a naive
    // local time the answer would be an hour out.
    const [row] = stack([
      bk({
        id: "bst",
        slot: "08:30",
        status: BOOKING_STATUS.IN_BATH,
        checkedInAt: "2026-07-02T07:30:00Z",
      }),
    ]);
    expect(row.timing).toBe("1 hr 45 min");
  });

  it("marks a long stay on site as urgent", () => {
    const [row] = stack([
      bk({ id: "x", slot: "08:30", status: BOOKING_STATUS.IN_BATH, checkedInAt: agoIso(200) }),
    ]);
    expect(row.urgent).toBe(true);
  });

  it("counts a ready dog's wait from ready_at", () => {
    const [row] = stack([
      bk({ id: "x", slot: "09:00", status: BOOKING_STATUS.READY_FOR_PICKUP, readyAt: agoIso(20) }),
    ]);
    expect(row.timing).toBe("waiting 20 min");
    expect(row.readyOverdue).toBe(false);
  });

  it(`flags a wait past ${READY_OVERDUE_MINUTES} minutes as overdue`, () => {
    const under = stack([
      bk({
        id: "u",
        slot: "09:00",
        status: BOOKING_STATUS.READY_FOR_PICKUP,
        readyAt: agoIso(READY_OVERDUE_MINUTES - 1),
      }),
    ])[0];
    const over = stack([
      bk({
        id: "o",
        slot: "09:00",
        status: BOOKING_STATUS.READY_FOR_PICKUP,
        readyAt: agoIso(READY_OVERDUE_MINUTES),
      }),
    ])[0];
    expect(under.readyOverdue).toBe(false);
    expect(over.readyOverdue).toBe(true);
    expect(over.urgent).toBe(true);
  });

  it("counts down to an upcoming appointment", () => {
    const [row] = stack([bk({ id: "x", slot: "11:00", status: BOOKING_STATUS.BOOKED })]);
    expect(row.timing).toBe("45 min away");
    expect(row.urgent).toBe(false);
  });

  it("states lateness once a dog is overdue", () => {
    const [row] = stack([bk({ id: "x", slot: "09:00", status: BOOKING_STATUS.BOOKED })]);
    expect(row.timing).toBe("1 hr 15 min late");
    expect(row.urgent).toBe(true);
  });

  it("stops counting and says 'No arrival' once lateness stops meaning anything", () => {
    // 08:00 against a 10:15 clock is 2 hrs 15 min. Nobody reads that as late.
    const [row] = stack([bk({ id: "x", slot: "08:00", status: BOOKING_STATUS.BOOKED })]);
    expect(row.timing).toBe("No arrival");
    expect(row.urgent).toBe(true);
  });

  it("says a no-show did not arrive, without calling it urgent", () => {
    const [row] = stack([
      bk({
        id: "ns",
        slot: "09:00",
        status: BOOKING_STATUS.CANCELLED,
        cancelReason: NO_SHOW_REASON,
      }),
    ]);
    expect(row.timing).toBe("Did not arrive");
    expect(row.urgent).toBe(false);
  });
});

describe("buildDayStack degrades quietly", () => {
  // Bookings from before July 2026 carry no lifecycle stamps and never will:
  // the migration that added them could not backfill. A row that says "n/a" is
  // worse than one that simply does not mention the time.
  it("says nothing about a checked-in dog with no arrival stamp", () => {
    const [row] = stack([
      bk({ id: "legacy", slot: "09:00", status: BOOKING_STATUS.CHECKED_IN, checkedInAt: null }),
    ]);
    expect(row.timing).toBeNull();
    expect(row.urgent).toBe(false);
  });

  it("says nothing about a ready dog with no ready stamp", () => {
    const [row] = stack([
      bk({ id: "legacy", slot: "09:00", status: BOOKING_STATUS.READY_FOR_PICKUP, readyAt: null }),
    ]);
    expect(row.timing).toBeNull();
    expect(row.readyOverdue).toBe(false);
  });

  it("shows no live timing at all on a browsed date", () => {
    const rows = buildDayStack({
      bookings: [
        bk({
          id: "x",
          _bookingDate: OTHER_DAY,
          slot: "09:00",
          status: BOOKING_STATUS.CHECKED_IN,
          checkedInAt: agoIso(60),
        }),
      ],
      dateStr: OTHER_DAY,
      now: NOW,
    });
    expect(rows[0].timing).toBeNull();
    expect(rows[0].urgent).toBe(false);
  });
});

describe("buildDayStack subtitle", () => {
  it("joins breed and service", () => {
    const [row] = stack(
      [bk({ id: "x", slot: "09:00", status: BOOKING_STATUS.BOOKED, service: "bath-and-brush" })],
      TODAY,
      { x: "Cockapoo" },
    );
    expect(row.subtitle).toBe("Cockapoo · Bath & Brush");
  });

  it("omits an unknown breed without leaving a stray separator", () => {
    const [row] = stack([bk({ id: "x", slot: "09:00", status: BOOKING_STATUS.BOOKED })]);
    expect(row.subtitle).toBe("Full Groom");
  });
});

describe("selectCollected", () => {
  it("returns collected dogs, most recent first, and nothing else", () => {
    const collected = selectCollected(
      [
        bk({ id: "early", slot: "09:00", status: BOOKING_STATUS.COMPLETED, completedAt: agoIso(90) }),
        bk({ id: "late", slot: "10:00", status: BOOKING_STATUS.COMPLETED, completedAt: agoIso(5) }),
        bk({ id: "waiting", slot: "11:00", status: BOOKING_STATUS.READY_FOR_PICKUP }),
      ],
      TODAY,
      NOW,
    );
    expect(collected.map((b) => b.id)).toEqual(["late", "early"]);
  });

  it("sorts a dog with no completion stamp last rather than dropping it", () => {
    const collected = selectCollected(
      [
        bk({ id: "nostamp", slot: "09:00", status: BOOKING_STATUS.COMPLETED, completedAt: null }),
        bk({ id: "stamped", slot: "10:00", status: BOOKING_STATUS.COMPLETED, completedAt: agoIso(5) }),
      ],
      TODAY,
      NOW,
    );
    expect(collected.map((b) => b.id)).toEqual(["stamped", "nostamp"]);
  });
});

// ---- The check-out chain ------------------------------------------------------

describe("checkoutChain", () => {
  const owing = { amountDue: 42, method: null } as const;

  it("starts as a single press", () => {
    expect(checkoutChain({ step: null, ...owing }).map((b) => b.label)).toEqual(["Check out"]);
  });

  it("offers the balance by method, with a way back", () => {
    expect(checkoutChain({ step: "method", ...owing }).map((b) => b.label))
      .toEqual(["Cash £42", "Card £42", "Back"]);
  });

  it("names the method and the figure on the confirming press", () => {
    expect(checkoutChain({ step: "confirm", amountDue: 42, method: "cash" })[0].label)
      .toBe("Collected · £42 cash");
  });

  it("prints pence when a balance has them, so it matches the card machine", () => {
    expect(checkoutChain({ step: "method", amountDue: 42.5, method: null })[0].label)
      .toBe("Cash £42.50");
  });

  it("has no payment step at all when nothing is owed", () => {
    expect(checkoutChain({ step: "confirm", amountDue: 0, method: null }).map((b) => b.label))
      .toEqual(["Collected", "Back"]);
  });

  it("treats a null balance as nothing to take", () => {
    expect(checkoutChain({ step: "confirm", amountDue: null, method: null })[0].label)
      .toBe("Collected");
  });
});

describe("nextCheckoutStep", () => {
  it("goes through the method choice when there is money to take", () => {
    expect(nextCheckoutStep("start", { step: null, amountDue: 42 })).toBe("method");
  });

  it("skips straight to confirming when there is not", () => {
    expect(nextCheckoutStep("start", { step: null, amountDue: 0 })).toBe("confirm");
  });

  it("moves from either method to confirming", () => {
    expect(nextCheckoutStep("cash", { step: "method", amountDue: 42 })).toBe("confirm");
    expect(nextCheckoutStep("card", { step: "method", amountDue: 42 })).toBe("confirm");
  });

  it("only writes on the final press", () => {
    expect(nextCheckoutStep("collect", { step: "confirm", amountDue: 42 })).toBe("done");
  });

  it("steps back one place rather than abandoning a chain mid-way", () => {
    // The mistake this exists to fix is usually "wrong method", not "wrong dog".
    expect(nextCheckoutStep("back", { step: "confirm", amountDue: 42 })).toBe("method");
    expect(nextCheckoutStep("back", { step: "method", amountDue: 42 })).toBeNull();
  });

  it("backs all the way out of a two-step chain, which has nowhere in between", () => {
    expect(nextCheckoutStep("back", { step: "confirm", amountDue: 0 })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The collected list (#878, finding 2)
//
// A dog handed back without paying was invisible on /today: it left the stack
// when it reached `collected`, and the summary below the stack only listed
// bookings that `buildTakingsByMethod` had counted — which is Paid-in-Full
// rows only. So the one case that costs the salon money was the one case the
// screen said nothing about. The board it replaced showed every collected dog.
describe("buildCollectedRows", () => {
  const NOW_C = new Date("2026-07-02T13:00:00Z");
  const DAY = "2026-07-02";

  const collectedBooking = (over: Record<string, unknown>) => ({
    dogName: "Dog",
    slot: "09:00",
    status: BOOKING_STATUS.COMPLETED,
    service: "full-groom",
    size: "small",
    _bookingDate: DAY,
    ...over,
  }) as never;

  const BOOKINGS_C = [
    collectedBooking({
      id: "settled",
      dogName: "Luna",
      payment: "Paid in Full",
      paymentMethod: "card",
      paidAmount: 42,
      completedAt: "2026-07-02T12:00:00Z",
    }),
    collectedBooking({
      id: "walked",
      dogName: "Bramble",
      payment: "Due at Pick-up",
      completedAt: "2026-07-02T12:30:00Z",
    }),
  ];

  const rowsFor = (bookings = BOOKINGS_C) => buildCollectedRows(
    selectCollected(bookings, DAY, NOW_C),
    buildTakingsByMethod(bookings as never),
  );

  it("lists the dog that went home without paying", () => {
    const rows = rowsFor();
    expect(rows.map((r) => String(r.booking.id))).toContain("walked");
  });

  it("marks it as owing, with the amount still outstanding", () => {
    const owing = rowsFor().find((r) => String(r.booking.id) === "walked");
    expect(owing?.settled).toBe(false);
    expect(owing?.amount).toBe(42);
    expect(owing?.label).toBe("owed");
  });

  it("takes a settled row's figure from the takings, so the list adds up", () => {
    const settled = rowsFor().find((r) => String(r.booking.id) === "settled");
    expect(settled?.settled).toBe(true);
    expect(settled?.amount).toBe(42);
    expect(settled?.label).toBe("Card");
  });

  it("keeps the whole list in collection order, newest first", () => {
    // Not settled-first, and not unpaid-first: the question staff ask of this
    // list is "who has just gone?", and an unpaid dog is not less recent.
    expect(rowsFor().map((r) => String(r.booking.id))).toEqual(["walked", "settled"]);
  });

  it("counts only what was actually taken toward the total", () => {
    const takings = buildTakingsByMethod(BOOKINGS_C as never);
    expect(takings.total).toBe(42);
    expect(rowsFor()).toHaveLength(2);
  });
});

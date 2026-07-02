import { describe, it, expect } from "vitest";
import {
  londonNowParts,
  londonDateStr,
  statusRank,
  minutesPastSlotStart,
  isLateArrival,
  minutesOverdue,
  needsConfirmation,
  collectionWaitMinutes,
  timeInSalonMinutes,
  paymentState,
  isPaymentOutstanding,
  buildSlotOpportunities,
  buildDaySummary,
  buildImmediateAttention,
  buildArrivalsBySlot,
  buildCollectionQueue,
  buildPaymentsList,
} from "./today";
import { SALON_SLOTS } from "../constants/salon";
import type { Booking } from "../types/index";

// A fixed instant that is 10:15 in London during British Summer Time.
const NOW_SUMMER = new Date("2026-07-02T09:15:00Z"); // BST (+1) => 10:15 London
const TODAY = "2026-07-02";

function bk(partial: Partial<Booking>): Booking {
  return partial as Booking;
}

describe("londonNowParts", () => {
  it("reads British Summer Time (UTC+1) wall clock", () => {
    const p = londonNowParts(new Date("2026-07-02T08:15:00Z"));
    expect(p.hour).toBe(9);
    expect(p.minute).toBe(15);
    expect(p.minutesOfDay).toBe(9 * 60 + 15);
    expect(p.dateStr).toBe("2026-07-02");
  });

  it("reads GMT (UTC+0) wall clock in winter", () => {
    const p = londonNowParts(new Date("2026-01-15T08:15:00Z"));
    expect(p.hour).toBe(8);
    expect(p.minute).toBe(15);
    expect(p.dateStr).toBe("2026-01-15");
  });

  it("rolls the date forward across midnight in BST", () => {
    const p = londonNowParts(new Date("2026-07-01T23:30:00Z")); // 00:30 next day London
    expect(p.dateStr).toBe("2026-07-02");
    expect(p.hour).toBe(0);
    expect(p.minute).toBe(30);
  });

  it("handles the spring-forward DST boundary", () => {
    // 2026-03-29 01:00 GMT -> clocks jump to 02:00 BST.
    const p = londonNowParts(new Date("2026-03-29T01:30:00Z"));
    expect(p.hour).toBe(2);
    expect(p.minute).toBe(30);
    expect(p.dateStr).toBe("2026-03-29");
  });

  it("londonDateStr is the parts dateStr", () => {
    expect(londonDateStr(NOW_SUMMER)).toBe(TODAY);
  });
});

describe("statusRank", () => {
  it("orders the progression and puts Cancelled/unknown off it", () => {
    expect(statusRank("Booked")).toBe(0);
    expect(statusRank("Checked in")).toBe(1);
    expect(statusRank("In bath")).toBe(2);
    expect(statusRank("Ready for pick-up")).toBe(3);
    expect(statusRank("Completed")).toBe(4);
    expect(statusRank("Cancelled")).toBe(-1);
    expect(statusRank(undefined)).toBe(-1);
    expect(statusRank("nonsense")).toBe(-1);
  });
});

describe("minutesPastSlotStart", () => {
  it("is positive after the slot start (London clock)", () => {
    expect(minutesPastSlotStart("09:00", NOW_SUMMER)).toBe(75); // 10:15 - 09:00
  });
  it("is negative before the slot start", () => {
    expect(minutesPastSlotStart("11:00", NOW_SUMMER)).toBe(-45); // 10:15 - 11:00
  });
});

describe("isLateArrival + minutesOverdue", () => {
  const late = bk({ _bookingDate: TODAY, slot: "10:00", status: "Booked" });

  it("flags a Booked dog whose slot passed beyond the grace period", () => {
    expect(isLateArrival(late, NOW_SUMMER, 5)).toBe(true); // 15 min past 10:00
    expect(minutesOverdue(late, NOW_SUMMER)).toBe(15);
  });

  it("does not flag within the grace period", () => {
    expect(isLateArrival(late, NOW_SUMMER, 20)).toBe(false);
  });

  it("uses the default grace (~5 min) when none is passed", () => {
    // 10:15 now vs a 10:12-start booking = 3 min past => within default grace.
    const justLate = bk({ _bookingDate: TODAY, slot: "10:00", status: "Booked" });
    expect(isLateArrival(justLate, new Date("2026-07-02T09:03:00Z"))).toBe(false); // 09:03Z=10:03, 3 past
    expect(isLateArrival(justLate, new Date("2026-07-02T09:06:00Z"))).toBe(true); // 6 past > 5
  });

  it("ignores dogs already checked in, cancelled, or not booked today", () => {
    expect(isLateArrival(bk({ _bookingDate: TODAY, slot: "10:00", status: "Checked in" }), NOW_SUMMER, 5)).toBe(false);
    expect(isLateArrival(bk({ _bookingDate: TODAY, slot: "10:00", status: "Cancelled" }), NOW_SUMMER, 5)).toBe(false);
    expect(isLateArrival(bk({ _bookingDate: "2026-07-03", slot: "10:00", status: "Booked" }), NOW_SUMMER, 5)).toBe(false);
    expect(minutesOverdue(bk({ _bookingDate: TODAY, slot: "11:00", status: "Booked" }), NOW_SUMMER)).toBe(0);
  });
});

describe("needsConfirmation", () => {
  it("flags only a sent-but-unconfirmed reminder that asked for confirmation", () => {
    expect(needsConfirmation(bk({ reminderState: "sent", confirmationChannel: "whatsapp" }))).toBe(true);
    expect(needsConfirmation(bk({ reminderState: "sent", confirmationChannel: "none" }))).toBe(false);
    expect(needsConfirmation(bk({ reminderState: "confirmed", confirmationChannel: "whatsapp" }))).toBe(false);
    expect(needsConfirmation(bk({ reminderState: "none", confirmationChannel: "whatsapp" }))).toBe(false);
    expect(needsConfirmation(bk({}))).toBe(false);
  });
});

describe("wait-time helpers", () => {
  it("collectionWaitMinutes measures minutes since ready_at", () => {
    const readyAt = new Date(NOW_SUMMER.getTime() - 25 * 60000).toISOString();
    expect(collectionWaitMinutes(bk({ readyAt }), NOW_SUMMER)).toBe(25);
    expect(collectionWaitMinutes(bk({ readyAt: null }), NOW_SUMMER)).toBeNull();
  });

  it("timeInSalonMinutes measures minutes since checked_in_at", () => {
    const checkedInAt = new Date(NOW_SUMMER.getTime() - 90 * 60000).toISOString();
    expect(timeInSalonMinutes(bk({ checkedInAt }), NOW_SUMMER)).toBe(90);
    expect(timeInSalonMinutes(bk({ checkedInAt: undefined }), NOW_SUMMER)).toBeNull();
  });
});

describe("paymentState (G4 mapping)", () => {
  const base = { service: "full-groom", size: "small" } as const; // full-groom small = £42

  it("maps Paid in Full to paid, nothing due", () => {
    const p = paymentState(bk({ ...base, payment: "Paid in Full" }));
    expect(p.kind).toBe("paid");
    expect(p.amountDue).toBe(0);
  });

  it("maps Deposit Paid to the balance after the £10 deposit", () => {
    const p = paymentState(bk({ ...base, payment: "Deposit Paid" }));
    expect(p.kind).toBe("deposit");
    expect(p.depositPaid).toBe(10);
    expect(p.amountDue).toBe(32);
  });

  it("maps Due at Pick-up to the full balance", () => {
    const p = paymentState(bk({ ...base, payment: "Due at Pick-up" }));
    expect(p.kind).toBe("due");
    expect(p.amountDue).toBe(42);
  });

  it("renders an unknown legacy value neutrally with no implied balance", () => {
    const p = paymentState(bk({ ...base, payment: "Refunded" }));
    expect(p.kind).toBe("other");
    expect(p.label).toBe("Refunded");
    expect(p.amountDue).toBeNull();
  });

  it("treats a missing payment as a balance due (the DB default)", () => {
    expect(paymentState(bk({ ...base, payment: "" })).kind).toBe("due");
  });
});

describe("isPaymentOutstanding", () => {
  it("is true for any non-paid, non-cancelled booking", () => {
    expect(isPaymentOutstanding(bk({ payment: "Paid in Full", status: "Completed" }))).toBe(false);
    expect(isPaymentOutstanding(bk({ payment: "Due at Pick-up", status: "Checked in" }))).toBe(true);
    expect(isPaymentOutstanding(bk({ payment: "Deposit Paid", status: "Ready for pick-up" }))).toBe(true);
    expect(isPaymentOutstanding(bk({ payment: "Due at Pick-up", status: "Cancelled" }))).toBe(false);
  });
});

describe("buildSlotOpportunities", () => {
  const opps = buildSlotOpportunities({
    bookings: [],
    activeSlots: SALON_SLOTS,
    immediateSlots: ["11:00"],
    now: NOW_SUMMER, // 10:15 London
    todayStr: TODAY,
  });
  const bySlot = (s: string) => opps.find((o) => o.slot === s)!;

  it("marks slots whose end has passed as past", () => {
    expect(bySlot("08:30").isPast).toBe(true);
    expect(bySlot("09:30").isPast).toBe(true);
    expect(bySlot("10:00").isPast).toBe(false);
  });

  it("marks the in-progress slot as current", () => {
    expect(bySlot("10:00").isCurrent).toBe(true);
    expect(bySlot("11:00").isCurrent).toBe(false);
  });

  it("reports free seats on an empty day", () => {
    expect(bySlot("11:00").seatsFree).toBe(2);
  });

  it("marks large-dog eligibility per the LARGE_DOG_SLOTS rules", () => {
    expect(bySlot("08:30").largeDogEligible).toBe(true);
    expect(bySlot("11:00").largeDogEligible).toBe(false);
  });

  it("is customer-reachable only when immediate-flagged and before the 30-min cutoff", () => {
    expect(bySlot("11:00").customerReachable).toBe(true); // flagged, 10:15 <= 10:30 cutoff
    expect(bySlot("10:00").customerReachable).toBe(false); // not flagged
    expect(bySlot("09:00").customerReachable).toBe(false); // past
  });
});

describe("buildDaySummary", () => {
  const bookings = [
    bk({ status: "Booked", payment: "Due at Pick-up", service: "full-groom", size: "small" }),
    bk({ status: "Checked in", payment: "Deposit Paid", service: "full-groom", size: "small" }),
    bk({ status: "Ready for pick-up", payment: "Paid in Full", service: "full-groom", size: "small" }),
    bk({ status: "Completed", payment: "Paid in Full", service: "full-groom", size: "small" }),
    bk({ status: "Cancelled", payment: "Refunded", service: "full-groom", size: "small" }),
  ];
  const s = buildDaySummary(bookings, null);

  it("counts the day, excluding cancellations", () => {
    expect(s.total).toBe(4);
    expect(s.expected).toBe(1);
    expect(s.arrived).toBe(3);
    expect(s.ready).toBe(1);
    expect(s.collected).toBe(1);
    expect(s.unpaidCount).toBe(2);
  });

  it("splits expected vs recorded-as-paid revenue via computeRevenue", () => {
    expect(s.expectedRevenue).toBe(168); // 4 x £42
    expect(s.collectedRevenue).toBe(84); // 2 x £42 paid in full
  });

  it("reports capacity used against the daily cap", () => {
    expect(s.capacityUsedPct).toBe(29); // round(4/14*100)
  });
});

describe("buildImmediateAttention", () => {
  const readyAt = new Date(NOW_SUMMER.getTime() - 30 * 60000).toISOString();
  const items = buildImmediateAttention(
    [
      bk({ _bookingDate: TODAY, slot: "09:00", status: "Booked", dogName: "A" }), // late, 75 over
      bk({ _bookingDate: TODAY, slot: "10:00", status: "Booked", dogName: "B" }), // late, 15 over
      bk({ _bookingDate: TODAY, slot: "08:30", status: "Ready for pick-up", readyAt, payment: "Due at Pick-up", service: "full-groom", size: "small", dogName: "C" }), // ready + payment
      bk({ _bookingDate: TODAY, slot: "11:00", status: "Booked", reminderState: "sent", confirmationChannel: "whatsapp", dogName: "D" }), // unconfirmed
      bk({ _bookingDate: TODAY, slot: "09:30", status: "Checked in", payment: "Due at Pick-up", service: "full-groom", size: "small", dogName: "E" }), // payment
      bk({ _bookingDate: TODAY, slot: "09:00", status: "Completed", payment: "Paid in Full", dogName: "F" }), // nothing
      bk({ _bookingDate: TODAY, slot: "10:00", status: "Cancelled", dogName: "G" }), // excluded
    ],
    NOW_SUMMER,
  );

  it("includes only bookings that need action, ranked late > ready > unconfirmed > payment", () => {
    expect(items.map((i) => i.primary)).toEqual(["late", "late", "ready", "unconfirmed", "payment"]);
  });

  it("orders late arrivals by how overdue they are", () => {
    expect(items[0].booking.dogName).toBe("A"); // 75 over
    expect(items[1].booking.dogName).toBe("B"); // 15 over
  });

  it("keeps a booking to a single row but records all its reasons", () => {
    const ready = items.find((i) => i.primary === "ready")!;
    expect(ready.kinds).toContain("payment");
  });
});

describe("buildArrivalsBySlot", () => {
  const groups = buildArrivalsBySlot(
    [
      bk({ slot: "09:00", status: "Booked" }),
      bk({ slot: "09:00", status: "Checked in" }),
      bk({ slot: "10:00", status: "Booked" }),
      bk({ slot: "11:00", status: "Cancelled" }),
    ],
    SALON_SLOTS,
    NOW_SUMMER,
  );

  it("groups by slot, drops cancellations, and orders chronologically", () => {
    expect(groups.map((g) => g.slot)).toEqual(["09:00", "10:00"]);
    expect(groups[0].bookings).toHaveLength(2);
  });

  it("flags past and current slots", () => {
    expect(groups[0].isPast).toBe(true); // 09:00
    expect(groups[1].isCurrent).toBe(true); // 10:00
  });
});

describe("buildCollectionQueue", () => {
  it("lists only Ready dogs, longest wait first", () => {
    const q = buildCollectionQueue(
      [
        bk({ status: "Ready for pick-up", readyAt: new Date(NOW_SUMMER.getTime() - 40 * 60000).toISOString(), dogName: "long" }),
        bk({ status: "Ready for pick-up", readyAt: new Date(NOW_SUMMER.getTime() - 10 * 60000).toISOString(), dogName: "short" }),
        bk({ status: "Ready for pick-up", readyAt: null, dogName: "unknown" }),
        bk({ status: "Completed" }),
        bk({ status: "Cancelled" }),
      ],
      NOW_SUMMER,
    );
    expect(q.map((e) => e.booking.dogName)).toEqual(["long", "short", "unknown"]);
    expect(q[0].waitMinutes).toBe(40);
  });
});

describe("buildPaymentsList", () => {
  it("lists outstanding, non-cancelled bookings by amount due", () => {
    const list = buildPaymentsList([
      bk({ status: "Checked in", payment: "Due at Pick-up", service: "full-groom", size: "small" }), // 42
      bk({ status: "Ready for pick-up", payment: "Deposit Paid", service: "full-groom", size: "small" }), // 32
      bk({ status: "Completed", payment: "Paid in Full", service: "full-groom", size: "small" }), // excluded
      bk({ status: "Cancelled", payment: "Due at Pick-up" }), // excluded
    ]);
    expect(list.map((e) => e.payment.kind)).toEqual(["due", "deposit"]);
    expect(list[0].payment.amountDue).toBe(42);
  });
});

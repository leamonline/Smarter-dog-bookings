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
  minutesUntilSlot,
  splitArrivalGroups,
  isGroupSettled,
  buildInSalonList,
  buildTakingsByMethod,
  buildTodayFeed,
  buildAvailabilityView,
  entryOpStatus,
  selectLiveFocus,
  liveFocusContext,
  groupFeedBySlot,
  buildFutureDayFeed,
  countDogsPerOwner,
} from "./today";
import { SALON_SLOTS } from "../constants/salon";
import type { Booking, Dog } from "../types/index";

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

  it("uses the configured salon guide price for the displayed balance", () => {
    const p = paymentState(
      bk({ ...base, payment: "Due at Pick-up" }),
      null,
      { "full-groom": { small: 5000 } },
    );

    expect(p.subtotal).toBe(50);
    expect(p.amountDue).toBe(50);
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

describe("buildAvailabilityView", () => {
  const opps = buildSlotOpportunities({
    bookings: [],
    activeSlots: SALON_SLOTS,
    immediateSlots: ["10:30", "11:00"],
    now: NOW_SUMMER, // 10:15 London
    todayStr: TODAY,
  });
  const view = buildAvailabilityView(opps, ["10:30", "11:00"]);

  it("lists only unbooked, non-past slots, chronological", () => {
    // 08:30 / 09:00 / 09:30 have passed by 10:15; 10:00 is current but not past.
    expect(view.rows[0].slot).toBe("10:00");
    expect(view.rows.every((r) => r.seatsFree > 0)).toBe(true);
    expect(view.rows.some((r) => r.slot === "08:30")).toBe(false);
  });

  it("derives every count from the rows it shows", () => {
    expect(view.unbookedSlots).toBe(view.rows.length);
    expect(view.onlineCount).toBe(view.rows.filter((r) => r.isOnline).length);
    expect(view.onlineCount).toBe(2); // 10:30 + 11:00 flagged
  });

  it("next online slot is the earliest reachable online slot (before the cutoff)", () => {
    // 10:30 is flagged but only 15 min away (< 30-min cutoff) → not reachable.
    // 11:00 is flagged and 45 min away → reachable.
    expect(view.nextOnlineSlot).toBe("11:00");
  });

  it("reports size fit from the capacity engine (large only where eligible)", () => {
    const at11 = view.rows.find((r) => r.slot === "11:00")!;
    expect(at11.sizes).toEqual({ small: true, medium: true, large: false });
    const at1230 = view.rows.find((r) => r.slot === "12:30")!;
    expect(at1230.sizes.large).toBe(true); // 12:30 is a large-dog slot
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
    expect(s.onSite).toBe(2);
    expect(s.ready).toBe(1);
    expect(s.collected).toBe(1);
    expect(s.unpaidCount).toBe(2);
  });

  it("splits expected vs recorded-as-paid revenue via computeRevenue", () => {
    expect(s.expectedRevenue).toBe(168); // 4 x £42
    expect(s.collectedRevenue).toBe(84); // 2 x £42 paid in full
  });

  it("uses configured guide prices for day revenue summaries", () => {
    const summary = buildDaySummary(
      [bk({ status: "Booked", payment: "Due at Pick-up", service: "full-groom", size: "small" })],
      null,
      { "full-groom": { small: 5000 } },
    );

    expect(summary.expectedRevenue).toBe(50);
  });

  it("reports capacity used against the daily cap", () => {
    expect(s.capacityUsedPct).toBe(29); // round(4/14*100)
  });

  it("counts a bare-status row as expected, matching the feed's Booked fallback", () => {
    const bare = buildDaySummary([bk({ slot: "09:00" })], null);
    expect(bare.total).toBe(1);
    expect(bare.expected).toBe(1);
    expect(bare.arrived).toBe(0);
  });

  it("counts only dogs physically on site", () => {
    const summary = buildDaySummary([
      bk({ status: "Booked" }),
      bk({ status: "Checked in" }),
      bk({ status: "In bath" }),
      bk({ status: "Ready for pick-up" }),
      bk({ status: "Completed" }),
      bk({ status: "Cancelled" }),
    ]);

    expect(summary.dogsBooked).toBe(5);
    expect(summary.onSite).toBe(3);
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

  it("keeps a freshly-Ready dog out of attention until it has waited a while", () => {
    const justReady = bk({
      _bookingDate: TODAY,
      slot: "09:00",
      status: "Ready for pick-up",
      payment: "Paid in Full",
      readyAt: new Date(NOW_SUMMER.getTime() - 5 * 60000).toISOString(),
    });
    expect(buildImmediateAttention([justReady], NOW_SUMMER)).toEqual([]);
    // …but a missing ready_at stamp surfaces rather than hides.
    const unstamped = bk({ _bookingDate: TODAY, slot: "09:00", status: "Ready for pick-up", payment: "Paid in Full", readyAt: null });
    expect(buildImmediateAttention([unstamped], NOW_SUMMER).map((i) => i.primary)).toEqual(["ready"]);
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

describe("minutesUntilSlot", () => {
  it("counts down to a future slot and goes negative once started", () => {
    // NOW_SUMMER is 10:15 London.
    expect(minutesUntilSlot("10:30", NOW_SUMMER)).toBe(15);
    expect(minutesUntilSlot("10:00", NOW_SUMMER)).toBe(-15);
  });
});

describe("splitArrivalGroups", () => {
  const groups = buildArrivalsBySlot(
    [
      bk({ slot: "09:00", status: "Checked in" }), // past, settled
      bk({ slot: "09:30", status: "Booked" }), // past but unarrived → earlier (late list owns it)
      bk({ slot: "10:30", status: "Booked", dogName: "next" }),
      bk({ slot: "11:00", status: "Checked in" }), // future, fully arrived → settled
      bk({ slot: "12:00", status: "Booked", dogName: "later" }),
    ],
    SALON_SLOTS,
    NOW_SUMMER,
  );

  it("puts the soonest still-expected group first and settles the rest", () => {
    const split = splitArrivalGroups(groups);
    expect(split.next?.slot).toBe("10:30");
    expect(split.upcoming.map((g) => g.slot)).toEqual(["12:00"]);
    expect(split.earlier.map((g) => g.slot)).toEqual(["09:00", "09:30", "11:00"]);
  });

  it("isGroupSettled needs every dog at least arrived", () => {
    const mixed = buildArrivalsBySlot(
      [bk({ slot: "12:30", status: "Checked in" }), bk({ slot: "12:30", status: "Booked" })],
      SALON_SLOTS,
      NOW_SUMMER,
    );
    expect(isGroupSettled(mixed[0])).toBe(false);
    expect(splitArrivalGroups(mixed).next?.slot).toBe("12:30");
  });

  it("handles an empty day", () => {
    expect(splitArrivalGroups([])).toEqual({ next: null, upcoming: [], earlier: [] });
  });
});

describe("buildInSalonList", () => {
  it("lists Checked in / In bath dogs, longest in first, and skips the rest", () => {
    const list = buildInSalonList(
      [
        bk({ status: "Checked in", checkedInAt: new Date(NOW_SUMMER.getTime() - 50 * 60000).toISOString(), dogName: "longest" }),
        bk({ status: "In bath", checkedInAt: new Date(NOW_SUMMER.getTime() - 20 * 60000).toISOString(), dogName: "bathing" }),
        bk({ status: "Checked in", checkedInAt: null, dogName: "unstamped" }),
        bk({ status: "Ready for pick-up", dogName: "ready" }), // its own queue
        bk({ status: "Booked" }),
        bk({ status: "Cancelled" }),
      ],
      NOW_SUMMER,
    );
    expect(list.map((e) => e.booking.dogName)).toEqual(["longest", "bathing", "unstamped"]);
    expect(list[0].inSalonMinutes).toBe(50);
    expect(list[2].inSalonMinutes).toBeNull();
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

describe("buildTodayFeed", () => {
  const feed = buildTodayFeed(
    [
      bk({ id: "z", _bookingDate: TODAY, slot: "13:00", status: "Booked", dogName: "Zed" }), // upcoming (future slot)
      bk({ id: "a", _bookingDate: TODAY, slot: "09:00", status: "Booked", dogName: "Amber" }), // late (75 over)
      bk({ id: "e", _bookingDate: TODAY, slot: "09:30", status: "Checked in", payment: "Due at Pick-up", service: "full-groom", size: "small", dogName: "Ember" }), // in salon + owes
      bk({ id: "g", _bookingDate: TODAY, slot: "08:30", status: "Cancelled", dogName: "Ghost" }), // excluded
      bk({ id: "n", _bookingDate: TODAY, slot: "11:00", status: "Booked", dogName: "Nova" }), // next (future, not late)
    ],
    NOW_SUMMER,
  );

  it("drops cancelled rows and orders every booking by appointment time", () => {
    expect(feed.map((e) => e.booking.id)).toEqual(["a", "e", "n", "z"]);
  });

  it("flags the soonest not-yet-arrived, not-late booking as Next (not a late one)", () => {
    const next = feed.filter((e) => e.isNext);
    expect(next).toHaveLength(1);
    expect(next[0].booking.id).toBe("n"); // Amber (09:00) is late, so Nova (11:00) is Next
  });

  it("folds each booking's reasons onto its one entry", () => {
    const late = feed.find((e) => e.booking.id === "a")!;
    expect(late.isLate).toBe(true);
    expect(late.needsAction).toBe(true);
    const inSalon = feed.find((e) => e.booking.id === "e")!;
    expect(inSalon.stage).toBe("inSalon");
    expect(inSalon.owes).toBe(true);
    expect(inSalon.needsAction).toBe(true); // arrived + owes
  });

  it("needsAction membership matches buildImmediateAttention exactly", () => {
    const sample = [
      bk({ id: "1", _bookingDate: TODAY, slot: "09:00", status: "Booked", dogName: "late" }),
      bk({ id: "2", _bookingDate: TODAY, slot: "11:00", status: "Booked", reminderState: "sent", confirmationChannel: "whatsapp", dogName: "unconf" }),
      bk({ id: "3", _bookingDate: TODAY, slot: "13:00", status: "Booked", dogName: "calm" }),
    ];
    const attn = new Set(buildImmediateAttention(sample, NOW_SUMMER).map((i) => i.booking.id));
    const flagged = new Set(buildTodayFeed(sample, NOW_SUMMER).filter((e) => e.needsAction).map((e) => e.booking.id));
    expect(flagged).toEqual(attn);
  });
});

describe("entryOpStatus — one priority order for rails, labels and actions", () => {
  /** Minimal TodayFeedEntry with sensible defaults. */
  const fe = (over: Record<string, unknown>) => ({
    booking: bk({ id: "x" }),
    slotMinutes: 540,
    stage: "booked",
    isNext: false,
    isLate: false,
    isUnconfirmed: false,
    owes: false,
    needsAction: false,
    overdueMinutes: 0,
    waitMinutes: null,
    ...over,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;

  it("ranks late above everything, even a ready or owing dog", () => {
    expect(entryOpStatus(fe({ isLate: true, isUnconfirmed: true, owes: true })).kind).toBe("overdue");
    expect(entryOpStatus(fe({ isLate: true })).tone).toBe("coral");
  });

  it("a collected dog that still owes is a payment issue, not 'done'", () => {
    const s = entryOpStatus(fe({ stage: "collected", owes: true }));
    expect(s.kind).toBe("paymentDue");
    expect(s.tone).toBe("coral");
  });

  it("a settled collected dog fades to muted", () => {
    const s = entryOpStatus(fe({ stage: "collected", owes: false }));
    expect(s.kind).toBe("collected");
    expect(s.tone).toBe("muted");
  });

  it("unconfirmed beats ready/inSalon states but not late", () => {
    expect(entryOpStatus(fe({ isUnconfirmed: true })).kind).toBe("unconfirmed");
    expect(entryOpStatus(fe({ isUnconfirmed: true })).tone).toBe("amber");
  });

  it("splits calm-ready from ready-waiting via needsAction", () => {
    expect(entryOpStatus(fe({ stage: "ready", needsAction: false })).kind).toBe("ready");
    expect(entryOpStatus(fe({ stage: "ready", needsAction: true })).kind).toBe("readyWaiting");
    expect(entryOpStatus(fe({ stage: "ready", needsAction: true })).tone).toBe("amber");
  });

  it("in-salon and next/upcoming map to calm tones", () => {
    expect(entryOpStatus(fe({ stage: "inSalon" })).tone).toBe("cyan");
    expect(entryOpStatus(fe({ isNext: true })).kind).toBe("next");
    expect(entryOpStatus(fe({ isNext: true })).tone).toBe("teal");
    expect(entryOpStatus(fe({})).kind).toBe("upcoming");
  });

  it("urgency strictly increases down the priority order", () => {
    const order = [
      fe({ isLate: true }),
      fe({ stage: "collected", owes: true }),
      fe({ isUnconfirmed: true }),
      fe({ stage: "ready", needsAction: true }),
      fe({ stage: "ready" }),
      fe({ stage: "inSalon" }),
      fe({ isNext: true }),
      fe({}),
      fe({ stage: "collected" }),
    ].map((e) => entryOpStatus(e).urgency);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(new Set(order).size).toBe(order.length);
  });
});

describe("selectLiveFocus", () => {
  const feedOf = (bookings: Booking[]) => buildTodayFeed(bookings, NOW_SUMMER);

  it("keeps the earliest overdue Booked arrival ahead of newer arrivals", () => {
    const focus = selectLiveFocus(feedOf([
      bk({ id: "old", _bookingDate: TODAY, slot: "08:30", status: "Booked" }),
      bk({ id: "new", _bookingDate: TODAY, slot: "10:30", status: "Booked" }),
    ]));
    expect(focus?.booking.id).toBe("old");
  });

  it("advances to the nearest upcoming arrival after check-in", () => {
    const focus = selectLiveFocus(feedOf([
      bk({ id: "done", _bookingDate: TODAY, slot: "08:30", status: "Checked in" }),
      bk({ id: "next", _bookingDate: TODAY, slot: "10:30", status: "Booked" }),
    ]));
    expect(focus?.booking.id).toBe("next");
  });

  it("falls back from arrivals to longest-waiting ready, then longest in-salon", () => {
    const ready = selectLiveFocus(feedOf([
      bk({ id: "bath", status: "In bath", checkedInAt: "2026-07-02T08:30:00Z" }),
      bk({ id: "ready", status: "Ready for pick-up", readyAt: "2026-07-02T09:00:00Z" }),
    ]));
    expect(ready?.booking.id).toBe("ready");
  });
});

describe("liveFocusContext", () => {
  it.each([
    ["10:20", "Due to arrive in 5 mins"],
    ["10:15", "Due now"],
    ["10:00", "15 mins overdue"],
  ])("formats %s against the current London time", (slot, text) => {
    const entry = buildTodayFeed([bk({ dogName: "Minnie", slot, status: "Booked" })], NOW_SUMMER)[0];
    expect(liveFocusContext(entry, NOW_SUMMER)).toMatchObject({ text, ariaLabel: `Minnie — ${text.toLowerCase()}` });
  });
});

describe("buildTakingsByMethod (improvement #3 — till view)", () => {
  it("sums recorded takings by method, falling back to the total when amount is unrecorded", () => {
    const t = buildTakingsByMethod([
      bk({ payment: "Paid in Full", paymentMethod: "card", paidAmount: 42, service: "full-groom", size: "small", status: "Completed" }),
      bk({ payment: "Paid in Full", paymentMethod: "cash", paidAmount: 38, service: "bath-and-brush", size: "small", status: "Completed" }),
      bk({ payment: "Paid in Full", paymentMethod: "card", paidAmount: null, service: "full-groom", size: "small", status: "Completed" }), // fallback £42
      bk({ payment: "Paid in Full", paymentMethod: null, paidAmount: 60, service: "full-groom", size: "large", status: "Completed" }), // method not recorded
      bk({ payment: "Due at Pick-up", service: "full-groom", size: "small", status: "Checked in" }), // not paid — excluded
    ]);
    expect(t.count).toBe(4); // paid bookings
    expect(t.total).toBe(182); // 42 + 38 + 42 + 60
    expect(t.byMethod.find((m) => m.method === "card")).toMatchObject({ amount: 84, count: 2 });
    expect(t.byMethod.find((m) => m.method === "cash")).toMatchObject({ amount: 38, count: 1 });
    expect(t.byMethod.find((m) => m.method === "unrecorded")).toMatchObject({ amount: 60, count: 1 });
  });

  it("is empty and safe when nothing is paid", () => {
    const t = buildTakingsByMethod([bk({ payment: "Due at Pick-up", status: "Booked" })]);
    expect(t.total).toBe(0);
    expect(t.count).toBe(0);
    expect(t.byMethod).toEqual([]);
  });
});

describe("groupFeedBySlot", () => {
  const b = (slot?: string, id = slot ?? "x") =>
    ({ id, slot, status: "Booked", dogName: "Rex" }) as unknown as Booking;
  const entryFor = (booking: Booking, slotMinutes: number): ReturnType<typeof buildTodayFeed>[0] => ({
    booking, slotMinutes, stage: "booked", isNext: false, isLate: false,
    isUnconfirmed: false, owes: false, needsAction: false, overdueMinutes: 0, waitMinutes: null,
  });

  it("groups chronological entries by slot, preserving order", () => {
    const groups = groupFeedBySlot([
      entryFor(b("08:30", "a"), 510), entryFor(b("08:30", "b"), 510), entryFor(b("09:00", "c"), 540),
    ]);
    expect(groups.map((g) => g.label)).toEqual(["08:30", "09:00"]);
    expect(groups[0].entries.map((e) => e.booking.id)).toEqual(["a", "b"]);
  });

  it("puts missing or unparseable slots in a final Unscheduled group", () => {
    const bad = entryFor(b(undefined, "no-slot"), Number.POSITIVE_INFINITY);
    const junk = entryFor(b("banana", "junk"), NaN);
    const groups = groupFeedBySlot([entryFor(b("08:30", "a"), 510), bad, junk]);
    expect(groups[groups.length - 1].label).toBe("Unscheduled");
    expect(groups[groups.length - 1].entries.map((e) => e.booking.id)).toEqual(["no-slot", "junk"]);
    expect(groups[groups.length - 1].slot).toBeNull();
  });

  it("returns [] for an empty feed", () => {
    expect(groupFeedBySlot([])).toEqual([]);
  });
});

describe("buildFutureDayFeed", () => {
  it("drops cancelled, sorts by slot, and carries zero time-relative state", () => {
    const feed = buildFutureDayFeed([
      { id: "later", slot: "09:00", status: "Booked", payment: "Due at Pick-up" },
      { id: "gone", slot: "08:30", status: "Cancelled" },
      { id: "first", slot: "08:30", status: "Booked", payment: "Paid in Full" },
    ] as unknown as Booking[]);
    expect(feed.map((e) => e.booking.id)).toEqual(["first", "later"]);
    for (const e of feed) {
      expect(e.isLate).toBe(false);
      expect(e.isNext).toBe(false);
      expect(e.isUnconfirmed).toBe(false);
      expect(e.owes).toBe(false);
      expect(e.needsAction).toBe(false);
      expect(e.overdueMinutes).toBe(0);
      expect(e.waitMinutes).toBeNull();
    }
  });

  it("keeps a slot-less booking (sorts last) rather than hiding it", () => {
    const feed = buildFutureDayFeed([
      { id: "b", status: "Booked" }, { id: "a", slot: "08:30", status: "Booked" },
    ] as unknown as Booking[]);
    expect(feed.map((e) => e.booking.id)).toEqual(["a", "b"]);
  });
});

describe("countDogsPerOwner", () => {
  const dogs = {
    d1: { id: "d1", _humanId: "h1" }, d2: { id: "d2", _humanId: "h1" }, d3: { id: "d3", _humanId: "h2" },
  } as unknown as Record<string, Dog>;
  const e = (dogId: string | null, status = "Booked"): ReturnType<typeof buildTodayFeed>[0] => ({
    booking: { id: dogId ?? "x", _dogId: dogId, status } as unknown as Booking,
    slotMinutes: 0, stage: "booked", isNext: false, isLate: false, isUnconfirmed: false,
    owes: false, needsAction: false, overdueMinutes: 0, waitMinutes: null,
  });

  it("counts by stable owner id across entries", () => {
    expect(countDogsPerOwner([e("d1"), e("d2"), e("d3")], dogs)).toEqual({ h1: 2, h2: 1 });
  });

  it("ignores dogs it cannot resolve and never falls back to names", () => {
    expect(countDogsPerOwner([e("d1"), e(null), e("missing")], dogs)).toEqual({ h1: 1 });
  });
});

import { describe, expect, it } from "vitest";
import { BOOKING_STATUS } from "../constants/index";
import type { Booking } from "../types/index";
import {
  buildDailyBriefBoard,
  buildDailyBriefFeed,
  buildJourneyActions,
  buildMiniInvoicePatch,
  paymentVisual,
  requiresCareSkipConfirmation,
} from "./dailyBrief";

const booking = (overrides: Partial<Booking> = {}): Booking => ({
  id: "b1",
  dogName: "Jack",
  breed: "Springer Spaniel",
  size: "small",
  service: "full-groom",
  owner: "David Law",
  status: BOOKING_STATUS.BOOKED,
  slot: "09:00",
  addons: [],
  pickupBy: "",
  payment: "Due at Pick-up",
  confirmed: true,
  dogNameSnapshot: null,
  breedSnapshot: null,
  ownerNameSnapshot: null,
  whatsappConversationId: null,
  whatsappMessageId: null,
  staffCapacityOverride: false,
  staffCapacityOverrideBy: null,
  staffCapacityOverrideAt: null,
  reminderConfirmedAt: null,
  _dogId: "d1",
  _ownerId: "o1",
  _pickupById: null,
  _bookingDate: "2026-07-14",
  _groupId: null,
  ...overrides,
});

describe("Daily Brief journey", () => {
  it("shows one ready action before readiness and one waiting action afterwards", () => {
    expect(buildJourneyActions(booking()).map((action) => action.id)).toEqual([
      "checkIn",
      "startGroom",
      "ready",
      "collected",
      "paid",
    ]);
    expect(
      buildJourneyActions(booking({ status: BOOKING_STATUS.READY_FOR_PICKUP })).map(
        (action) => action.id,
      ),
    ).toEqual(["checkIn", "startGroom", "waiting", "collected", "paid"]);
  });

  it("marks only the next incomplete care action as next while keeping payment available", () => {
    const actions = buildJourneyActions(booking({ status: BOOKING_STATUS.CHECKED_IN }));
    expect(actions.find((action) => action.id === "startGroom")?.next).toBe(true);
    expect(actions.find((action) => action.id === "paid")?.next).toBe(false);
  });

  it("maps every recorded paid method to its approved visual", () => {
    expect(paymentVisual(booking())).toEqual({ visual: "unpaid", label: "Record payment" });
    expect(
      paymentVisual(booking({ payment: "Paid in Full", paidAmount: 42, paymentMethod: "cash" })),
    ).toEqual({
      visual: "cash",
      label: "Paid £42 by cash",
    });
    expect(
      paymentVisual(booking({ payment: "Paid in Full", paidAmount: 42, paymentMethod: "card" })),
    ).toEqual({
      visual: "card",
      label: "Paid £42 by card",
    });
    expect(
      paymentVisual(
        booking({ payment: "Paid in Full", paidAmount: 42, paymentMethod: "bank_transfer" }),
      ),
    ).toEqual({
      visual: "bankTransfer",
      label: "Paid £42 by bank transfer",
    });
  });

  it("uses a neutral paid visual when legacy payment metadata is unavailable", () => {
    expect(
      paymentVisual(
        booking({ payment: "Paid in Full", paidAmount: null, paymentMethod: null }),
      ),
    ).toEqual({
      visual: "paidUnknown",
      label: "Paid",
    });
  });

  it("confirms care-stage skips but never early payment", () => {
    expect(requiresCareSkipConfirmation(BOOKING_STATUS.BOOKED, BOOKING_STATUS.IN_BATH)).toEqual(
      "been checked in",
    );
    expect(
      requiresCareSkipConfirmation(BOOKING_STATUS.CHECKED_IN, BOOKING_STATUS.IN_BATH),
    ).toBeNull();
  });

  it("advances the next care action through the groom journey", () => {
    const grooming = buildJourneyActions(booking({ status: BOOKING_STATUS.IN_BATH }));
    expect(grooming.find((action) => action.id === "ready")?.next).toBe(true);

    const ready = buildJourneyActions(booking({ status: BOOKING_STATUS.READY_FOR_PICKUP }));
    expect(ready.find((action) => action.id === "collected")?.next).toBe(true);

    const completed = buildJourneyActions(booking({ status: BOOKING_STATUS.COMPLETED }));
    expect(completed.find((action) => action.id === "collected")).toMatchObject({
      label: "Complete",
      completed: true,
      next: false,
    });
  });

  it("uses live urgency only for real today", () => {
    const now = new Date("2026-07-14T11:00:00+01:00");
    expect(buildDailyBriefFeed([booking()], "2026-07-14", now)[0].isLate).toBe(true);
    expect(buildDailyBriefFeed([booking()], "2026-07-15", now)[0].isLate).toBe(false);
  });

  it("keeps past-date care and payment states actionable without clock-relative urgency", () => {
    const now = new Date("2026-07-14T11:00:00+01:00");
    const feed = buildDailyBriefFeed(
      [
        booking({
          id: "ready",
          status: BOOKING_STATUS.READY_FOR_PICKUP,
          readyAt: "2026-07-13T08:00:00Z",
        }),
        booking({ id: "owing", status: BOOKING_STATUS.CHECKED_IN }),
      ],
      "2026-07-13",
      now,
    );

    expect(feed.find((entry) => entry.booking.id === "ready")).toMatchObject({
      stage: "ready",
      owes: true,
      needsAction: true,
      isLate: false,
      isNext: false,
      overdueMinutes: 0,
      waitMinutes: null,
    });
    expect(feed.find((entry) => entry.booking.id === "owing")).toMatchObject({
      stage: "inSalon",
      owes: true,
      needsAction: true,
    });
  });

  it("keeps future-date confirmation state actionable without clock-relative urgency", () => {
    const now = new Date("2026-07-14T11:00:00+01:00");
    const [entry] = buildDailyBriefFeed(
      [
        booking({
          reminderState: "sent",
          confirmationChannel: "whatsapp",
        }),
      ],
      "2026-07-15",
      now,
    );

    expect(entry).toMatchObject({
      stage: "booked",
      isUnconfirmed: true,
      owes: true,
      needsAction: true,
      actionReasons: ["confirmation"],
      isLate: false,
      isNext: false,
      overdueMinutes: 0,
      waitMinutes: null,
    });
  });

  it("derives the action count and row reasons from the same rules", () => {
    const now = new Date("2026-07-14T10:15:00+01:00");
    const feed = buildDailyBriefFeed(
      [
        booking({ id: "late", slot: "09:00", payment: "Paid in Full" }),
        booking({
          id: "confirmation",
          slot: "11:00",
          payment: "Paid in Full",
          reminderState: "sent",
          confirmationChannel: "whatsapp",
        }),
        booking({
          id: "collection",
          status: BOOKING_STATUS.READY_FOR_PICKUP,
          readyAt: "2026-07-14T08:00:00Z",
          payment: "Paid in Full",
        }),
        booking({ id: "payment", status: BOOKING_STATUS.CHECKED_IN }),
        booking({ id: "calm", slot: "12:00", payment: "Paid in Full" }),
      ],
      "2026-07-14",
      now,
    );

    expect(
      Object.fromEntries(feed.map((entry) => [entry.booking.id, entry.actionReasons])),
    ).toEqual({
      late: ["late"],
      confirmation: ["confirmation"],
      collection: ["collection"],
      payment: ["payment"],
      calm: [],
    });
    expect(feed.filter((entry) => entry.needsAction)).toHaveLength(4);
    expect(feed.every((entry) => entry.needsAction === (entry.actionReasons.length > 0))).toBe(true);
  });
});

describe("Daily Brief status board", () => {
  const now = new Date("2026-07-14T10:15:00+01:00");

  it("maps only the canonical active statuses into one operational lane", () => {
    const board = buildDailyBriefBoard(
      [
        booking({ id: "due", status: BOOKING_STATUS.BOOKED }),
        booking({ id: "checked-in", status: BOOKING_STATUS.CHECKED_IN }),
        booking({ id: "in-bath", status: BOOKING_STATUS.IN_BATH }),
        booking({ id: "ready", status: BOOKING_STATUS.READY_FOR_PICKUP }),
        booking({ id: "home", status: BOOKING_STATUS.COMPLETED }),
        booking({ id: "cancelled", status: BOOKING_STATUS.CANCELLED }),
        booking({ id: "unknown", status: "Awaiting magic" as Booking["status"] }),
      ],
      "2026-07-14",
      now,
    );

    expect(board.due.map((entry) => entry.booking.id)).toEqual(["due"]);
    expect(board.withUs.map((entry) => entry.booking.id)).toEqual([
      "checked-in",
      "in-bath",
    ]);
    expect(board.ready.map((entry) => entry.booking.id)).toEqual(["ready"]);
    expect(board.home.map((entry) => entry.booking.id)).toEqual(["home"]);
    expect(board.excludedCount).toBe(1);
    expect(board.excludedBookings.map((entry) => entry.id)).toEqual(["unknown"]);
  });

  it("orders overdue arrivals first, then upcoming arrivals, with a stable id tie-break", () => {
    const board = buildDailyBriefBoard(
      [
        booking({ id: "upcoming", slot: "11:00" }),
        booking({ id: "late-b", slot: "09:00" }),
        booking({ id: "late-a", slot: "09:00" }),
        booking({ id: "later-upcoming", slot: "12:00" }),
        booking({ id: "missing-time", slot: "" }),
      ],
      "2026-07-14",
      now,
    );

    expect(board.due.map((entry) => entry.booking.id)).toEqual([
      "late-a",
      "late-b",
      "upcoming",
      "later-upcoming",
      "missing-time",
    ]);
    expect(board.due[0].timingLabel).toBe("1 hr 15 mins late");
    expect(board.due[2].timingLabel).toBe("Due in 45 mins");
    expect(board.due[4].timingLabel).toBe("Time missing");
  });

  it("keeps multiple slotless arrivals stable after every finite appointment", () => {
    const board = buildDailyBriefBoard(
      [
        booking({ id: "slotless-z", slot: "" }),
        booking({ id: "finite", slot: "11:00" }),
        booking({ id: "slotless-a", slot: "not-a-time" }),
      ],
      "2026-07-14",
      now,
    );

    expect(board.due.map((entry) => entry.booking.id)).toEqual([
      "finite",
      "slotless-a",
      "slotless-z",
    ]);
    expect(board.due.slice(1).map((entry) => entry.timingLabel)).toEqual([
      "Time missing",
      "Time missing",
    ]);
  });

  it("orders dogs on site and ready by the longest elapsed wait", () => {
    const board = buildDailyBriefBoard(
      [
        booking({
          id: "on-site-recent",
          status: BOOKING_STATUS.CHECKED_IN,
          checkedInAt: "2026-07-14T09:00:00Z",
          slot: "09:30",
        }),
        booking({
          id: "on-site-longest",
          status: BOOKING_STATUS.IN_BATH,
          checkedInAt: "2026-07-14T07:30:00Z",
          slot: "08:30",
        }),
        booking({
          id: "on-site-unstamped",
          status: BOOKING_STATUS.CHECKED_IN,
          checkedInAt: null,
          slot: "08:00",
        }),
        booking({
          id: "ready-recent",
          status: BOOKING_STATUS.READY_FOR_PICKUP,
          readyAt: "2026-07-14T09:00:00Z",
        }),
        booking({
          id: "ready-longest",
          status: BOOKING_STATUS.READY_FOR_PICKUP,
          readyAt: "2026-07-14T08:00:00Z",
        }),
      ],
      "2026-07-14",
      now,
    );

    expect(board.withUs.map((entry) => entry.booking.id)).toEqual([
      "on-site-longest",
      "on-site-recent",
      "on-site-unstamped",
    ]);
    expect(board.withUs[0].timingLabel).toBe("On site 1 hr 45 mins");
    expect(board.ready.map((entry) => entry.booking.id)).toEqual([
      "ready-longest",
      "ready-recent",
    ]);
    expect(board.ready[0].timingLabel).toBe("Ready 1 hr 15 mins");
  });

  it("orders completed bookings most recently collected first", () => {
    const board = buildDailyBriefBoard(
      [
        booking({
          id: "earlier",
          status: BOOKING_STATUS.COMPLETED,
          completedAt: "2026-07-14T10:15:00Z",
        }),
        booking({
          id: "latest",
          status: BOOKING_STATUS.COMPLETED,
          completedAt: "2026-07-14T13:22:00Z",
        }),
        booking({ id: "unstamped", status: BOOKING_STATUS.COMPLETED, completedAt: null }),
      ],
      "2026-07-14",
      now,
    );

    expect(board.home.map((entry) => entry.booking.id)).toEqual([
      "latest",
      "earlier",
      "unstamped",
    ]);
    expect(board.home[0].timingLabel).toBe("Collected 14:22");
  });

  it("does not fabricate clock-relative timing for a non-today board", () => {
    const board = buildDailyBriefBoard(
      [
        booking({ id: "due", slot: "09:00", _bookingDate: "2026-07-15" }),
        booking({
          id: "ready",
          status: BOOKING_STATUS.READY_FOR_PICKUP,
          readyAt: "2026-07-15T08:00:00Z",
          _bookingDate: "2026-07-15",
        }),
      ],
      "2026-07-15",
      now,
    );

    expect(board.due[0]).toMatchObject({ isLate: false, timingLabel: null });
    expect(board.ready[0]).toMatchObject({ waitMinutes: null, timingLabel: null });
  });
});

describe("buildMiniInvoicePatch", () => {
  const input = {
    booking: booking({ service: "full-groom", size: "small" }),
    basePrice: 42,
    addons: [],
    depositAmount: 10,
    paymentReceived: 32,
    paymentMethod: "card",
  };

  it("stores the appointment total, final method and retained deposit", () => {
    expect(buildMiniInvoicePatch(input)).toEqual({
      ok: true,
      subtotal: 42,
      amountDue: 32,
      patch: {
        priceOverride: 42,
        addons: [],
        payment: "Paid in Full",
        depositAmount: 10,
        paymentMethod: "card",
        paidAmount: 42,
      },
    });
  });

  it("does not mark a partial final payment as paid", () => {
    expect(buildMiniInvoicePatch({ ...input, paymentReceived: 20 })).toEqual({
      ok: false,
      error: "Enter the full £32 balance or update the deposit amount",
    });
  });

  it("saves deposit-only state without a payment method", () => {
    expect(
      buildMiniInvoicePatch({ ...input, paymentReceived: 0, paymentMethod: null }),
    ).toMatchObject({
      ok: true,
      patch: {
        payment: "Deposit Paid",
        depositAmount: 10,
        paymentMethod: null,
        paidAmount: null,
      },
    });
  });

  it.each([-5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "rejects an invalid deposit amount of %s",
    (depositAmount) => {
      expect(buildMiniInvoicePatch({ ...input, depositAmount })).toEqual({
        ok: false,
        error: "Enter a valid deposit amount",
      });
    },
  );

  it.each([0, ""])("treats a zero or blank deposit of %j as no deposit", (depositAmount) => {
    expect(
      buildMiniInvoicePatch({
        ...input,
        depositAmount,
        paymentReceived: 42,
      }),
    ).toMatchObject({
      ok: true,
      amountDue: 42,
      patch: {
        payment: "Paid in Full",
        depositAmount: null,
        paidAmount: 42,
      },
    });
  });
});

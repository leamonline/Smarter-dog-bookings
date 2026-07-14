import { describe, expect, it } from "vitest";
import { BOOKING_STATUS } from "../constants/index";
import type { Booking } from "../types/index";
import {
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
  it("shows two collection alternatives before readiness and one waiting action afterwards", () => {
    expect(buildJourneyActions(booking()).map((action) => action.id)).toEqual([
      "checkIn",
      "startGroom",
      "ready",
      "messageCollection",
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
      isLate: false,
      isNext: false,
      overdueMinutes: 0,
      waitMinutes: null,
    });
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
});

import { describe, expect, it } from "vitest";
import { BOOKING_STATUS } from "../constants/index";
import type { Booking } from "../types/index";
import {
  buildDailyBriefFeed,
  buildJourneyActions,
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

  it("maps paid methods to the approved visuals", () => {
    expect(paymentVisual(booking())).toEqual({ visual: "unpaid", label: "Record payment" });
    expect(
      paymentVisual(
        booking({ payment: "Paid in Full", paidAmount: 42, paymentMethod: "bank_transfer" }),
      ),
    ).toEqual({
      visual: "bankTransfer",
      label: "Paid £42 by bank transfer",
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

  it("uses live urgency only for real today", () => {
    const now = new Date("2026-07-14T11:00:00+01:00");
    expect(buildDailyBriefFeed([booking()], "2026-07-14", now)[0].isLate).toBe(true);
    expect(buildDailyBriefFeed([booking()], "2026-07-15", now)[0].isLate).toBe(false);
  });
});

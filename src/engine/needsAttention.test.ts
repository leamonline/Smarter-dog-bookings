import { describe, it, expect } from "vitest";
import {
  classifyNeedsAttention,
  attentionDetail,
  buildNeedsAttention,
  NEEDS_ATTENTION_SECTIONS,
} from "./needsAttention";
import { BOOKING_STATUS } from "../constants/salon";
import type { Booking } from "../types/index";

const TODAY = "2026-08-20";
const YESTERDAY = "2026-08-19";

function booking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: "b1",
    slot: "09:00",
    dogName: "Rex",
    breed: "",
    size: "small",
    service: "full-groom",
    owner: "Sam Smith",
    status: BOOKING_STATUS.BOOKED,
    addons: [],
    pickupBy: "",
    payment: "Due at Pick-up",
    confirmed: false,
    dogNameSnapshot: null,
    breedSnapshot: null,
    ownerNameSnapshot: null,
    whatsappConversationId: null,
    whatsappMessageId: null,
    staffCapacityOverride: false,
    staffCapacityOverrideBy: null,
    staffCapacityOverrideAt: null,
    reminderConfirmedAt: null,
    paidAt: null,
    _dogId: "d1",
    _ownerId: null,
    _pickupById: null,
    _bookingDate: YESTERDAY,
    _groupId: null,
    ...overrides,
  } as Booking;
}

describe("classifyNeedsAttention", () => {
  it("flags a previous-day Ready for pick-up as ready for collection", () => {
    expect(
      classifyNeedsAttention(
        booking({ status: BOOKING_STATUS.READY_FOR_PICKUP }),
        TODAY,
      ),
    ).toBe("readyForCollection");
  });

  it.each([
    BOOKING_STATUS.BOOKED,
    BOOKING_STATUS.CHECKED_IN,
    BOOKING_STATUS.IN_BATH,
  ])("flags a previous-day '%s' booking for review", (status) => {
    expect(classifyNeedsAttention(booking({ status }), TODAY)).toBe(
      "pastAppointmentReview",
    );
  });

  it("treats an unknown/missing status as review (never hides a row)", () => {
    expect(classifyNeedsAttention({ ...booking(), status: null }, TODAY)).toBe(
      "pastAppointmentReview",
    );
    expect(classifyNeedsAttention({ ...booking(), status: "Weird" }, TODAY)).toBe(
      "pastAppointmentReview",
    );
  });

  it("flags a completed booking whose payment state was never settled", () => {
    expect(
      classifyNeedsAttention(
        booking({ status: BOOKING_STATUS.COMPLETED, payment: "Due at Pick-up" }),
        TODAY,
      ),
    ).toBe("paymentInformation");
    expect(
      classifyNeedsAttention(
        booking({ status: BOOKING_STATUS.COMPLETED, payment: "Deposit Paid" }),
        TODAY,
      ),
    ).toBe("paymentInformation");
  });

  it("flags Paid in Full without a paid_at stamp as evidence-incomplete", () => {
    expect(
      classifyNeedsAttention(
        booking({ status: BOOKING_STATUS.COMPLETED, payment: "Paid in Full", paidAt: null }),
        TODAY,
      ),
    ).toBe("paymentInformation");
  });

  it("leaves a fully-recorded completed booking alone", () => {
    expect(
      classifyNeedsAttention(
        booking({
          status: BOOKING_STATUS.COMPLETED,
          payment: "Paid in Full",
          paidAt: "2026-08-19T12:00:00Z",
        }),
        TODAY,
      ),
    ).toBeNull();
  });

  it("excludes cancelled bookings", () => {
    expect(
      classifyNeedsAttention(booking({ status: BOOKING_STATUS.CANCELLED }), TODAY),
    ).toBeNull();
  });

  it("excludes today and future dates — the Daily Brief owns those", () => {
    expect(
      classifyNeedsAttention(booking({ _bookingDate: TODAY }), TODAY),
    ).toBeNull();
    expect(
      classifyNeedsAttention(booking({ _bookingDate: "2026-08-25" }), TODAY),
    ).toBeNull();
  });

  it("excludes rows with no booking date rather than misfiling them", () => {
    expect(classifyNeedsAttention(booking({ _bookingDate: "" }), TODAY)).toBeNull();
  });
});

describe("attentionDetail — payment language stays neutral", () => {
  it("says information missing / evidence incomplete, never owes", () => {
    const missing = attentionDetail(
      "paymentInformation",
      booking({ status: BOOKING_STATUS.COMPLETED, payment: "Due at Pick-up" }),
    );
    const incomplete = attentionDetail(
      "paymentInformation",
      booking({ status: BOOKING_STATUS.COMPLETED, payment: "Paid in Full", paidAt: null }),
    );
    expect(missing).toBe("Payment information missing");
    expect(incomplete).toBe("Payment evidence incomplete");
    for (const text of [
      missing,
      incomplete,
      NEEDS_ATTENTION_SECTIONS.paymentInformation.title,
      NEEDS_ATTENTION_SECTIONS.paymentInformation.description,
    ]) {
      expect(text.toLowerCase()).not.toContain("owe");
      expect(text.toLowerCase()).not.toContain("unpaid");
      expect(text.toLowerCase()).not.toContain("due");
    }
  });

  it("names the leftover status for review items", () => {
    expect(
      attentionDetail("pastAppointmentReview", booking({ status: BOOKING_STATUS.IN_BATH })),
    ).toBe('Still marked "In bath"');
  });
});

describe("buildNeedsAttention", () => {
  it("groups multi-dog bookings into one task per reason", () => {
    const summary = buildNeedsAttention(
      [
        booking({ id: "a", _groupId: "g1", slot: "09:30", dogName: "Rex", status: BOOKING_STATUS.READY_FOR_PICKUP }),
        booking({ id: "b", _groupId: "g1", slot: "09:00", dogName: "Fido", status: BOOKING_STATUS.READY_FOR_PICKUP }),
      ],
      TODAY,
    );
    expect(summary.total).toBe(1);
    const ready = summary.sections.find((s) => s.kind === "readyForCollection");
    expect(ready?.items).toHaveLength(1);
    expect(ready?.items[0].bookings.map((b) => b.id)).toEqual(["b", "a"]); // slot order
    expect(ready?.items[0].booking.id).toBe("b"); // earliest slot opens
  });

  it("keeps group members with different reasons as separate tasks", () => {
    const summary = buildNeedsAttention(
      [
        booking({ id: "a", _groupId: "g1", status: BOOKING_STATUS.READY_FOR_PICKUP }),
        booking({ id: "b", _groupId: "g1", status: BOOKING_STATUS.COMPLETED, payment: "Due at Pick-up" }),
      ],
      TODAY,
    );
    expect(summary.total).toBe(2);
  });

  it("ungrouped bookings never fold together", () => {
    const summary = buildNeedsAttention(
      [
        booking({ id: "a", status: BOOKING_STATUS.READY_FOR_PICKUP }),
        booking({ id: "b", status: BOOKING_STATUS.READY_FOR_PICKUP }),
      ],
      TODAY,
    );
    expect(summary.total).toBe(2);
  });

  it("always returns the three sections, newest day first within each", () => {
    const summary = buildNeedsAttention(
      [
        booking({ id: "old", _bookingDate: "2026-08-10", status: BOOKING_STATUS.CHECKED_IN }),
        booking({ id: "new", _bookingDate: YESTERDAY, status: BOOKING_STATUS.CHECKED_IN }),
      ],
      TODAY,
    );
    expect(summary.sections.map((s) => s.kind)).toEqual([
      "readyForCollection",
      "pastAppointmentReview",
      "paymentInformation",
    ]);
    const review = summary.sections[1];
    expect(review.items.map((i) => i.booking.id)).toEqual(["new", "old"]);
  });

  it("counts nothing when everything is resolved", () => {
    const summary = buildNeedsAttention(
      [
        booking({ status: BOOKING_STATUS.CANCELLED }),
        booking({
          status: BOOKING_STATUS.COMPLETED,
          payment: "Paid in Full",
          paidAt: "2026-08-19T12:00:00Z",
        }),
      ],
      TODAY,
    );
    expect(summary.total).toBe(0);
    expect(summary.sections.every((s) => s.items.length === 0)).toBe(true);
  });
});

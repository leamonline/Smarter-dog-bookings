import { describe, expect, it } from "vitest";
import {
  DEFAULT_DEPOSIT_NOTICE_HOURS,
  SQUARE_DEPOSIT_PENCE,
  squareDepositOutcome,
} from "./depositOutcome";

const APPOINTMENT = { bookingDate: "2026-12-01", slot: "09:00" };
// 1 December 2026 09:00 London is GMT, so the 24-hour deadline is
// 30 November 2026 09:00 UTC.
const ON_DEADLINE = new Date("2026-11-30T09:00:00.000Z");
const AFTER_DEADLINE = new Date("2026-11-30T09:00:01.000Z");
const WELL_BEFORE = new Date("2026-11-28T09:00:00.000Z");

describe("square deposit refund and forfeit", () => {
  it("holds £10", () => {
    expect(SQUARE_DEPOSIT_PENCE).toBe(1000);
    expect(DEFAULT_DEPOSIT_NOTICE_HOURS).toBe(24);
  });

  it("refunds a customer cancellation more than 24 hours before", () => {
    expect(
      squareDepositOutcome({
        status: "Cancelled",
        cancellationCause: "customer",
        decidedAt: WELL_BEFORE,
        ...APPOINTMENT,
      }),
    ).toBe("refund_due");
  });

  it("refunds a customer cancellation exactly on the 24-hour deadline", () => {
    expect(
      squareDepositOutcome({
        status: "Cancelled",
        cancellationCause: "customer",
        decidedAt: ON_DEADLINE,
        ...APPOINTMENT,
      }),
    ).toBe("refund_due");
  });

  it("keeps the deposit when the customer cancels after the deadline", () => {
    expect(
      squareDepositOutcome({
        status: "Cancelled",
        cancellationCause: "customer",
        decidedAt: AFTER_DEADLINE,
        ...APPOINTMENT,
      }),
    ).toBe("forfeited");
  });

  it("uses British Summer Time, not a fixed UTC offset", () => {
    // 15 July 2026 09:00 London is 08:00 UTC. The deadline is 14 July 09:00
    // London, which is 08:00 UTC, not 09:00 UTC.
    expect(
      squareDepositOutcome({
        status: "Cancelled",
        cancellationCause: "customer",
        bookingDate: "2026-07-15",
        slot: "09:00",
        decidedAt: new Date("2026-07-14T08:00:00.000Z"),
      }),
    ).toBe("refund_due");
    expect(
      squareDepositOutcome({
        status: "Cancelled",
        cancellationCause: "customer",
        bookingDate: "2026-07-15",
        slot: "09:00",
        decidedAt: new Date("2026-07-14T08:00:01.000Z"),
      }),
    ).toBe("forfeited");
  });

  it("follows a longer notice window instead of a hardcoded 24 hours", () => {
    expect(
      squareDepositOutcome({
        status: "Cancelled",
        cancellationCause: "customer",
        decidedAt: ON_DEADLINE,
        noticeHours: 48,
        ...APPOINTMENT,
      }),
    ).toBe("forfeited");
    expect(
      squareDepositOutcome({
        status: "Cancelled",
        cancellationCause: "customer",
        decidedAt: new Date("2026-11-29T09:00:00.000Z"),
        noticeHours: 48,
        ...APPOINTMENT,
      }),
    ).toBe("refund_due");
  });

  it("keeps the deposit on a no-show even when the slot is days away", () => {
    expect(
      squareDepositOutcome({
        status: "No-show",
        cancellationCause: "customer",
        decidedAt: WELL_BEFORE,
        ...APPOINTMENT,
      }),
    ).toBe("forfeited");
  });

  it("carries the deposit on a reschedule, including a late one", () => {
    expect(
      squareDepositOutcome({
        status: "Cancelled",
        cancellationCause: "reschedule",
        decidedAt: AFTER_DEADLINE,
        ...APPOINTMENT,
      }),
    ).toBe("carry_pending");
  });

  it("refunds a salon cancellation even inside the notice window", () => {
    expect(
      squareDepositOutcome({
        status: "Cancelled",
        cancellationCause: "salon",
        decidedAt: AFTER_DEADLINE,
        ...APPOINTMENT,
      }),
    ).toBe("refund_due");
  });

  it("refunds when the cancellation has no customer cause", () => {
    expect(
      squareDepositOutcome({
        status: "Cancelled",
        cancellationCause: null,
        decidedAt: AFTER_DEADLINE,
        ...APPOINTMENT,
      }),
    ).toBe("refund_due");
  });

  it("does not decide the money while the booking is still going ahead", () => {
    expect(
      squareDepositOutcome({
        status: "Booked",
        cancellationCause: "customer",
        decidedAt: AFTER_DEADLINE,
        ...APPOINTMENT,
      }),
    ).toBeNull();
  });

  it("refunds a customer cancellation whose date cannot be read", () => {
    expect(
      squareDepositOutcome({
        status: "Cancelled",
        cancellationCause: "customer",
        bookingDate: "soon",
        slot: "09:00",
        decidedAt: AFTER_DEADLINE,
      }),
    ).toBe("refund_due");
  });

  it("refunds a customer cancellation whose slot cannot be read", () => {
    expect(
      squareDepositOutcome({
        status: "Cancelled",
        cancellationCause: "customer",
        bookingDate: "2026-12-01",
        slot: "morning",
        decidedAt: AFTER_DEADLINE,
      }),
    ).toBe("refund_due");
  });
});

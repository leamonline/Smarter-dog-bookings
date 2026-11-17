// A reminder that never reached the owner still needs confirming.
import { describe, expect, it } from "vitest";
import { applyReminderFailures, failedReminderBookingIds } from "./reminderFailure";
import { applyChatConfirmations } from "./replyConfirmation";
import { BOOKING_STATUS } from "../constants/index";
import type { NeedActionReason } from "./today";

function entry(id: string, booking: Record<string, unknown> = {}, extra: Partial<{ isUnconfirmed: boolean; actionReasons: NeedActionReason[] }> = {}) {
  return {
    booking: { id, status: BOOKING_STATUS.BOOKED, reminderState: "none", ...booking },
    isUnconfirmed: false,
    needsAction: false,
    actionReasons: [] as NeedActionReason[],
    ...extra,
  };
}

describe("failedReminderBookingIds", () => {
  it("picks out bookings with a live failed reminder, including its SMS fallback", () => {
    const failures = new Map([
      ["a", [{ trigger_type: "reminder" }]],
      ["b", [{ trigger_type: "reminder_sms_fallback" }]],
      ["c", [{ trigger_type: "confirmed" }, { trigger_type: "ready" }]],
    ]);
    expect([...failedReminderBookingIds(failures)].sort()).toEqual(["a", "b"]);
  });

  it("is empty when nothing has failed or the store has not loaded", () => {
    expect(failedReminderBookingIds(new Map()).size).toBe(0);
    expect(failedReminderBookingIds(null).size).toBe(0);
  });
});

describe("applyReminderFailures", () => {
  it("counts a Booked dog whose reminder failed as unconfirmed, for the same reason the strip counts", () => {
    const [out] = applyReminderFailures([entry("a")], new Set(["a"]));
    expect(out.isUnconfirmed).toBe(true);
    expect(out.needsAction).toBe(true);
    expect(out.actionReasons).toEqual(["confirmation"]);
    expect(out.reminderFailed).toBe(true);
  });

  it("does not double-count a dog that was already unconfirmed", () => {
    const [out] = applyReminderFailures(
      [entry("a", { reminderState: "sent" }, { isUnconfirmed: true, actionReasons: ["confirmation"] })],
      new Set(["a"]),
    );
    expect(out.actionReasons).toEqual(["confirmation"]);
  });

  it("leaves a recorded confirmation alone", () => {
    const [out] = applyReminderFailures([entry("a", { reminderState: "confirmed" })], new Set(["a"]));
    expect(out.isUnconfirmed).toBe(false);
  });

  it("leaves every status past Booked alone", () => {
    const out = applyReminderFailures(
      [
        entry("r", { status: BOOKING_STATUS.RECONFIRMED }),
        entry("x", { status: BOOKING_STATUS.ARRIVED }),
      ],
      new Set(["r", "x"]),
    );
    expect(out.map((row) => row.isUnconfirmed)).toEqual([false, false]);
  });

  it("leaves dogs without a failure alone", () => {
    const [out] = applyReminderFailures([entry("a")], new Set(["b"]));
    expect(out).toMatchObject({ isUnconfirmed: false, reminderFailed: false, actionReasons: [] });
  });

  // The ordering, not the lookup: a reply signal only exists once a reminder
  // has actually been sent (a successful resend), because useReplyConfirmations
  // reads replies from a sent reminder. A reminder that only ever failed has no
  // signal and stays unconfirmed — by decision, not omission.
  it("is cleared by a reply signal when one exists, because the chat fold runs after it", () => {
    const folded = applyReminderFailures([entry("a")], new Set(["a"]));
    const [out] = applyChatConfirmations(folded, {
      a: { messageId: "m1", text: "yes see you then", receivedAt: "2026-07-02T08:00:00Z" },
    } as never);
    expect(out.isUnconfirmed).toBe(false);
    expect(out.actionReasons).toEqual([]);
  });
});

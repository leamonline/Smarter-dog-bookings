// useReminderSentOverride — the optimistic "reminder sent" flip of the
// booking detail modal (Debt 9; pure move). Pins: the flip applies after
// onSent, confirmed always wins, and a booking swap drops both the override
// and the open send modal.
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  applyReminderSentOverride,
  useReminderSentOverride,
  type ReminderSentOverride,
} from "./useReminderSentOverride";
import type { Booking } from "../../../types/index";

const booking = (overrides: Partial<Booking> = {}): Booking =>
  ({
    id: "b1",
    dogName: "Bella",
    reminderState: "pending",
    reminderSentAt: null,
    reminderConfirmedAt: null,
    ...overrides,
  }) as unknown as Booking;

const sent: ReminderSentOverride = { reminderState: "sent", reminderSentAt: "2026-09-14T09:00:00.000Z" };

describe("applyReminderSentOverride", () => {
  it("returns the booking untouched without an override", () => {
    const b = booking();
    expect(applyReminderSentOverride(b, null)).toBe(b);
  });

  it("applies the sent flip to an unconfirmed booking", () => {
    expect(applyReminderSentOverride(booking(), sent)).toMatchObject(sent);
  });

  it("never downgrades a confirmed booking back to sent", () => {
    const byState = booking({ reminderState: "confirmed" });
    const byStamp = booking({ reminderConfirmedAt: "2026-09-13T10:00:00.000Z" });
    expect(applyReminderSentOverride(byState, sent)).toBe(byState);
    expect(applyReminderSentOverride(byStamp, sent)).toBe(byStamp);
  });
});

describe("useReminderSentOverride", () => {
  it("opens and closes the send modal", () => {
    const { result } = renderHook(() => useReminderSentOverride(booking()));
    expect(result.current.showSendReminder).toBe(false);
    act(() => result.current.openSendReminder());
    expect(result.current.showSendReminder).toBe(true);
    act(() => result.current.closeSendReminder());
    expect(result.current.showSendReminder).toBe(false);
  });

  it("onSent flips the rendered booking to sent (with a timestamp) and closes the modal", () => {
    const { result } = renderHook(() => useReminderSentOverride(booking()));
    act(() => result.current.openSendReminder());
    act(() => result.current.handleReminderSent());
    expect(result.current.showSendReminder).toBe(false);
    expect(result.current.reminderBooking.reminderState).toBe("sent");
    expect(typeof result.current.reminderBooking.reminderSentAt).toBe("string");
  });

  it("a different booking in the same instance inherits neither the override nor the open modal", () => {
    const { result, rerender } = renderHook(({ b }: { b: Booking }) => useReminderSentOverride(b), {
      initialProps: { b: booking() },
    });
    act(() => result.current.handleReminderSent());
    act(() => result.current.openSendReminder());
    rerender({ b: booking({ id: "b2" }) });
    expect(result.current.showSendReminder).toBe(false);
    expect(result.current.reminderBooking.reminderState).toBe("pending");
  });

  it("keeps the override across re-renders of the same booking", () => {
    const { result, rerender } = renderHook(({ b }: { b: Booking }) => useReminderSentOverride(b), {
      initialProps: { b: booking() },
    });
    act(() => result.current.handleReminderSent());
    rerender({ b: booking({ dogName: "Bella (renamed)" }) });
    expect(result.current.reminderBooking.reminderState).toBe("sent");
  });
});

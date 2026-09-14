// The optimistic "reminder sent" flip for the booking detail modal (Debt 9;
// extracted from BookingDetailModal.jsx as a pure move).
//
// SendReminderModal.onSent does not report which channel was used, so the
// open modal only flips state + time locally; the realtime refetch
// (useBookings) backfills the real channel on reopen. The override never
// downgrades a confirmed booking back to "sent" — confirmed always wins —
// and it is dropped, along with the open send modal, whenever a different
// booking is shown in the same modal instance.
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Booking } from "../../../types/index";

export interface ReminderSentOverride {
  reminderState: "sent";
  reminderSentAt: string;
}

/** Pure: the booking the ReminderCard should render given the override. */
export function applyReminderSentOverride<B extends Booking>(
  booking: B,
  override: ReminderSentOverride | null,
): B {
  if (!override) return booking;
  if (booking.reminderState === "confirmed" || booking.reminderConfirmedAt) return booking;
  return { ...booking, ...override };
}

export function useReminderSentOverride(booking: Booking) {
  const [showSendReminder, setShowSendReminder] = useState(false);
  const [override, setOverride] = useState<ReminderSentOverride | null>(null);

  // Keyed on booking.id only: a different booking must not inherit the
  // previous one's override or open send modal.
  useEffect(() => {
    setOverride(null);
    setShowSendReminder(false);
  }, [booking.id]);

  const reminderBooking = useMemo(
    () => applyReminderSentOverride(booking, override),
    [booking, override],
  );

  const openSendReminder = useCallback(() => setShowSendReminder(true), []);
  const closeSendReminder = useCallback(() => setShowSendReminder(false), []);
  const handleReminderSent = useCallback(() => {
    setOverride({ reminderState: "sent", reminderSentAt: new Date().toISOString() });
    setShowSendReminder(false);
  }, []);

  return {
    reminderBooking,
    showSendReminder,
    openSendReminder,
    closeSendReminder,
    handleReminderSent,
  };
}

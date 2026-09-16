/**
 * useBookingDeepLink — `/today?booking=<id>&date=<YYYY-MM-DD>` opens that
 * booking's detail modal.
 *
 * WHY THIS EXISTS
 *
 * Dogs, humans and inbox conversations have all had shareable URLs for a
 * while (`/dogs/:id`, `/humans/:id`, `/inbox?conversation=`). Bookings did
 * not: the detail modal only ever opened from in-memory state, so anything
 * outside the app could at best drop staff on the calendar and leave them to
 * find the appointment themselves. The staff Web Push feature hit exactly
 * this wall and settled for linking to `/staff/`.
 *
 * The #salon-today Slack alerts need a real "Open booking" link, so this
 * closes the gap. It deliberately mirrors useInboxDeepLinks: both params are
 * one-shot and removed once acted on (a replace, not a push), so navigating
 * back into /today doesn't keep re-opening the same modal.
 *
 * WHY THE DATE IS IN THE URL
 *
 * The booking modal can only open a booking that is in the loaded calendar
 * data. Most alerts are about today, which is already loaded — but not all:
 * a cancellation freeing tomorrow's first slot is alertable too, and its
 * booking is on tomorrow. Carrying the date lets the hook move the calendar
 * there first, so the link works for both.
 */
import { useCallback, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";

export interface UseBookingDeepLinkOptions {
  /** Bookings keyed by "YYYY-MM-DD", as the staff shell holds them. */
  bookingsByDate: Record<string, { id: string }[]> | null | undefined;
  /** True while the calendar data is in flight. */
  bookingsLoading: boolean;
  /** The date the calendar is currently showing, "YYYY-MM-DD". */
  currentDateStr: string;
  /** Move the calendar to a date, so its bookings get loaded. */
  onPickDate: (date: Date) => void;
  /** Open a booking's detail modal by id. */
  onOpenBooking: (bookingId: string) => void;
}

export function useBookingDeepLink({
  bookingsByDate,
  bookingsLoading,
  currentDateStr,
  onPickDate,
  onOpenBooking,
}: UseBookingDeepLinkOptions): void {
  const [searchParams, setSearchParams] = useSearchParams();
  // Remembers the date we have already navigated to for this link, so the
  // effect cannot bounce the calendar around while the fetch settles.
  const navigatedFor = useRef<string | null>(null);

  const targetBookingId = searchParams.get("booking");
  const targetDate = searchParams.get("date");

  const clearParams = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete("booking");
    next.delete("date");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (!targetBookingId) return;

    // Step 1 — get the calendar onto the right date, once.
    if (targetDate && targetDate !== currentDateStr) {
      if (navigatedFor.current !== targetDate) {
        navigatedFor.current = targetDate;
        // Midday avoids any chance of a timezone shift moving the date.
        onPickDate(new Date(`${targetDate}T12:00:00`));
      }
      return;
    }

    // Step 2 — wait for the data, so the id can be verified before opening.
    // Without this the modal would be asked for a booking that has not
    // arrived yet and would open empty.
    if (bookingsLoading) return;

    const found = Object.values(bookingsByDate || {})
      .some((list) => (list || []).some((b) => b.id === targetBookingId));

    if (found) onOpenBooking(targetBookingId);

    // Clear either way. A booking that is genuinely not there — deleted, or
    // the link carried the wrong date — must not leave the param in the URL
    // re-running this effect forever.
    navigatedFor.current = null;
    clearParams();
  }, [
    targetBookingId,
    targetDate,
    currentDateStr,
    bookingsLoading,
    bookingsByDate,
    onPickDate,
    onOpenBooking,
    clearParams,
  ]);
}

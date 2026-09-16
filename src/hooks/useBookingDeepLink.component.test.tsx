// useBookingDeepLink — `/today?booking=<id>&date=<date>` opens that booking.
//
// The link is what makes the #salon-today Slack alerts actionable, so the
// cases that matter are the awkward ones: data still loading, a booking on a
// date the calendar is not showing, and a link to something that no longer
// exists (which must not leave the app looping on a sticky URL).
import { renderHook } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { useBookingDeepLink } from "./useBookingDeepLink";

const TODAY = "2026-09-16";
const TOMORROW = "2026-09-17";

interface Options {
  url: string;
  currentDateStr?: string;
  bookingsLoading?: boolean;
  bookingsByDate?: Record<string, { id: string }[]>;
}

function render({
  url,
  currentDateStr = TODAY,
  bookingsLoading = false,
  bookingsByDate = { [TODAY]: [{ id: "b-1" }] },
}: Options) {
  const onOpenBooking = vi.fn();
  const onPickDate = vi.fn();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>
  );
  const hook = renderHook(
    () => {
      useBookingDeepLink({
        bookingsByDate,
        bookingsLoading,
        currentDateStr,
        onPickDate,
        onOpenBooking,
      });
      return useLocation().search;
    },
    { wrapper },
  );
  return { ...hook, onOpenBooking, onPickDate };
}

describe("useBookingDeepLink", () => {
  it("opens the booking named in the URL", () => {
    const { onOpenBooking } = render({ url: `/today?booking=b-1&date=${TODAY}` });
    expect(onOpenBooking).toHaveBeenCalledWith("b-1");
  });

  it("does nothing without a booking param", () => {
    const { onOpenBooking, onPickDate } = render({ url: "/today" });
    expect(onOpenBooking).not.toHaveBeenCalled();
    expect(onPickDate).not.toHaveBeenCalled();
  });

  it("waits for the calendar data rather than opening an empty modal", () => {
    const { onOpenBooking } = render({
      url: `/today?booking=b-1&date=${TODAY}`,
      bookingsLoading: true,
    });
    expect(onOpenBooking).not.toHaveBeenCalled();
  });

  it("moves the calendar to the booking's date first", () => {
    // The tomorrow-first-slot cancellation alert links to a booking that is
    // not on the day the board is showing. Without this the link would open
    // an empty board and the alert would be useless.
    const { onPickDate, onOpenBooking } = render({
      url: `/today?booking=b-2&date=${TOMORROW}`,
      currentDateStr: TODAY,
    });
    expect(onPickDate).toHaveBeenCalledTimes(1);
    const picked = onPickDate.mock.calls[0][0] as Date;
    expect(picked.toISOString().slice(0, 10)).toBe(TOMORROW);
    // Not opened yet — that waits for the new date's bookings to arrive.
    expect(onOpenBooking).not.toHaveBeenCalled();
  });

  it("opens a booking once the calendar has moved to its date", () => {
    const { onOpenBooking, onPickDate } = render({
      url: `/today?booking=b-2&date=${TOMORROW}`,
      currentDateStr: TOMORROW,
      bookingsByDate: { [TOMORROW]: [{ id: "b-2" }] },
    });
    expect(onPickDate).not.toHaveBeenCalled();
    expect(onOpenBooking).toHaveBeenCalledWith("b-2");
  });

  it("still works when the link carries no date", () => {
    const { onOpenBooking } = render({ url: "/today?booking=b-1" });
    expect(onOpenBooking).toHaveBeenCalledWith("b-1");
  });

  it("gives up quietly on a booking that is not there", () => {
    // Deleted, or the link carried the wrong date. The param must be cleared
    // either way, or the effect re-runs forever on a sticky URL.
    const { onOpenBooking } = render({
      url: `/today?booking=gone&date=${TODAY}`,
    });
    expect(onOpenBooking).not.toHaveBeenCalled();
  });

  it("opens the booking only once", () => {
    const { onOpenBooking, rerender } = render({
      url: `/today?booking=b-1&date=${TODAY}`,
    });
    rerender();
    rerender();
    expect(onOpenBooking).toHaveBeenCalledTimes(1);
  });

  it("strips the params once acted on, so the modal cannot re-open", () => {
    const { result } = render({ url: `/today?booking=b-1&date=${TODAY}` });
    expect(result.current).not.toContain("booking=");
    expect(result.current).not.toContain("date=");
  });

  it("strips the params even when the booking was not found", () => {
    const { result } = render({ url: `/today?booking=gone&date=${TODAY}` });
    expect(result.current).not.toContain("booking=");
  });

  it("leaves other query params alone", () => {
    // ?filter= belongs to the view, not to us.
    const { onOpenBooking, result } = render({
      url: `/today?filter=ready&booking=b-1&date=${TODAY}`,
    });
    expect(onOpenBooking).toHaveBeenCalledWith("b-1");
    expect(result.current).toContain("filter=ready");
  });
});

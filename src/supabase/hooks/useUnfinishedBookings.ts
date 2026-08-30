// Bookings the day-scoped surfaces can no longer reach.
//
// useBookings loads exactly one week (weekStart → weekStart + 6), so a booking
// left unfinished stops being visible the day after it happened. This hook is
// the only read in the app that deliberately looks backwards without a window:
// it asks for every past-dated booking that still needs something, however
// long ago it was.
//
// It is a separate hook rather than a widened useBookings on purpose. The week
// query is on the boot path and is shared with the prefetch; making it
// unbounded would slow every page load to serve one view that is opened
// occasionally.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { supabase } from "../client";
import { BOOKING_STATUS } from "../../constants/salon";
import { dbBookingsToArray, toDateStr } from "../transforms";
import { buildUnfinishedQueue, type UnfinishedQueue } from "../../engine/unfinished";
import { logger } from "../../lib/logger";
import type { Booking } from "../../types/index";

/**
 * How far back to look. Two years is far longer than any real backlog and
 * keeps the query bounded, so a pathological history can't turn this into an
 * unbounded table scan the salon waits on.
 */
const LOOKBACK_DAYS = 730;

/** Statuses that mean the booking still wants something from staff. */
const OPEN_STATUSES = [
  BOOKING_STATUS.BOOKED,
  BOOKING_STATUS.CHECKED_IN,
  BOOKING_STATUS.IN_BATH,
  BOOKING_STATUS.READY_FOR_PICKUP,
];

export interface UseUnfinishedBookings {
  queue: UnfinishedQueue<Booking & { _bookingDate?: string | null }>;
  loading: boolean;
  error: string | null;
  refetch: () => void;
  /** Close a booking out. Resolves to null on success, or a message to show. */
  completeBooking: (bookingId: string) => Promise<string | null>;
  /** Ids currently being written, so rows can disable themselves. */
  pendingIds: ReadonlySet<string>;
}

export function useUnfinishedBookings(
  dogsById: Record<string, never> | null,
  humansById: Record<string, never> | null,
  humans: Record<string, never> | null = null,
): UseUnfinishedBookings {
  const [rows, setRows] = useState<unknown[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Today is captured once per fetch rather than read per render, so the
  // classification can't shift underneath a list the user is looking at when
  // the clock passes midnight.
  const todayRef = useRef(toDateStr(new Date()));

  useEffect(() => {
    if (!supabase) {
      setRows(null);
      setLoading(false);
      return;
    }

    const client = supabase;
    const controller = new AbortController();
    const todayStr = toDateStr(new Date());
    todayRef.current = todayStr;

    const floor = new Date();
    floor.setDate(floor.getDate() - LOOKBACK_DAYS);
    const floorStr = toDateStr(floor);

    async function fetchUnfinished() {
      setLoading(true);
      setError(null);

      // Two populations in one round trip: anything past-dated that never
      // reached a terminal status, plus completed grooms with no payment
      // recorded. `or` keeps it to a single request; both halves are filtered
      // to past dates by the shared range below.
      const openList = OPEN_STATUSES.map((s) => `"${s}"`).join(",");
      const { data, error: err } = await client
        .from("bookings")
        .select("*")
        .gte("booking_date", floorStr)
        .lt("booking_date", todayStr)
        .or(`status.in.(${openList}),and(status.eq.${BOOKING_STATUS.COMPLETED},paid_at.is.null)`)
        .order("booking_date", { ascending: true })
        .abortSignal(controller.signal);

      if (controller.signal.aborted) return;

      if (err) {
        logger.error("useUnfinishedBookings: fetch failed", err);
        setError("Could not load unfinished bookings. Try again in a moment.");
        setRows(null);
        setLoading(false);
        return;
      }

      setRows(data ?? []);
      setLoading(false);
    }

    void fetchUnfinished();
    return () => controller.abort();
  }, [refreshKey]);

  const refetch = useCallback(() => setRefreshKey((k) => k + 1), []);

  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());

  /**
   * Close a booking out with a status-only write.
   *
   * Deliberately not routed through useBookings.updateBooking: that sends the
   * whole booking (date, slot, service, pickup) and optimistically patches the
   * week it has loaded. These rows are months outside that week, so the patch
   * would find nothing and the heavier payload would risk rewriting fields
   * this view never showed the user.
   *
   * A status-only update is also the safe shape against the triggers:
   * enforce_booking_calendar returns early for staff, and even for non-staff
   * only re-validates when booking_date changes — so completing an old
   * booking cannot trip the past-date gate.
   */
  const completeBooking = useCallback(async (bookingId: string): Promise<string | null> => {
    const client = supabase;
    if (!client) return "You appear to be offline.";
    setPendingIds((prev) => new Set(prev).add(bookingId));
    try {
      const { error: err } = await client
        .from("bookings")
        .update({ status: BOOKING_STATUS.COMPLETED })
        .eq("id", bookingId);

      if (err) {
        logger.error("useUnfinishedBookings: complete failed", err);
        return "Could not mark that booking completed. Try again in a moment.";
      }

      // Drop it locally so the row leaves the list immediately, rather than
      // waiting on a refetch the user did not ask for.
      setRows((prev) =>
        prev ? prev.filter((r) => (r as { id?: string }).id !== bookingId) : prev,
      );
      return null;
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(bookingId);
        return next;
      });
    }
  }, []);

  const queue = useMemo(() => {
    if (!rows) {
      return { groups: [], counts: { mid_groom: 0, awaiting_collection: 0, never_started: 0, unpaid: 0 }, total: 0, oldestAgeDays: 0 };
    }
    const bookings = dbBookingsToArray(
      rows as never[],
      (dogsById ?? {}) as never,
      (humansById ?? {}) as never,
      (humans ?? null) as never,
    );
    return buildUnfinishedQueue(
      bookings as Array<Booking & { _bookingDate?: string | null }>,
      todayRef.current,
    );
  }, [rows, dogsById, humansById, humans]);

  return { queue, loading, error, refetch, completeBooking, pendingIds };
}

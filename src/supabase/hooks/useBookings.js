import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { supabase } from "../client.js";
import { CHANNELS, uniqueChannelName } from "../realtimeChannels";
import { takeBootPrefetch } from "../bootPrefetch.js";
import { fetchBookingsWeek } from "../queries/bootQueries.js";
import { registerResume } from "../refreshOnResume.js";
import { dbBookingsToArray, toDateStr } from "../transforms";
import { createStaffBookingGroup } from "../rpc";
import { BOOKING_STATUS } from "../../constants/salon";
import { isCapacityRejection } from "../../engine/capacity";
import { logger } from "../../lib/logger";

// Translate a raw Postgres error from the STAFF booking insert into copy a
// groomer can act on. Staff bypass the calendar + pregnancy gates (is_staff()),
// so the realistic late failure is a capacity (2-2-1) or duplicate-slot race:
// the client preflights capacity and a staff override is stamped when they
// confirm one, so a DB rejection here means another booking landed first.
// Anything unmapped falls through to the raw message — never swallowed — so an
// unmapped failure can't be mistaken for success upstream.
function friendlyBookingError(err) {
  const code = err?.code;
  const raw = err?.message || "";
  if (code === "23505") {
    return "That dog is already booked at that time — refresh to see the latest.";
  }
  if (isCapacityRejection(raw)) {
    return "That slot just filled up — please pick another time.";
  }
  return raw || "Couldn't save the booking — please try again.";
}

// Map a modal-built booking to the bookings INSERT column shape. Shared by
// the single insert (addBooking) and the atomic group path (addBookingGroup)
// so the two can't drift.
function toInsertPayload(dateStr, booking, dogId, pickupHumanId) {
  return {
    booking_date: dateStr,
    slot: booking.slot,
    dog_id: dogId,
    size: booking.size,
    service: booking.service,
    status: booking.status || BOOKING_STATUS.BOOKED,
    addons: booking.addons || [],
    pickup_by_id: pickupHumanId || null,
    payment: booking.payment || "Due at Pick-up",
    confirmed: booking.confirmed ?? false,
    ...(booking.group_id ? { group_id: booking.group_id } : {}),
    ...(booking.staff_capacity_override ? { staff_capacity_override: true } : {}),
    // Explicit notification recipients (owner + chosen trusted humans).
    // Omitted when only the owner is selected — the notify functions then
    // fall back to the dog owner (the default for every other booking).
    ...(booking.notify_human_ids?.length
      ? { notify_human_ids: booking.notify_human_ids }
      : {}),
    // Staff confirmation choice from the New Booking dialog
    // ('auto' | 'whatsapp' | 'sms' | 'email' | 'none'). Omitted when unset
    // so the column DEFAULT 'auto' applies — the behaviour every other
    // insert path (customer RPC, AI agent) keeps.
    ...(booking.confirmation_channel
      ? { confirmation_channel: booking.confirmation_channel }
      : {}),
  };
}

function groupBookingsByDate(rows, dogsById, humansById) {
  const transformed = dbBookingsToArray(rows, dogsById, humansById);
  const grouped = {};

  for (let i = 0; i < transformed.length; i++) {
    const dateKey = rows[i].booking_date;
    if (!grouped[dateKey]) grouped[dateKey] = [];
    grouped[dateKey].push(transformed[i]);
  }

  return grouped;
}

// Online-only hook. Offline mode is served by useOfflineState upstream
// (useBookingActions picks offline.* when !supabase), so the !supabase
// branches here are defensive — the app never drives them.
export function useBookings(weekStart, dogsById, humansById, { onError, onReadyForPickup } = {}) {
  // Raw DB rows for the current week are the single source of truth.
  // `bookingsByDate` is DERIVED from them + the dogs/humans maps, so:
  //   - the schedule paints as soon as the rows arrive (names fall back
  //     to the booking's *_snapshot columns until the join resolves), and
  //   - names + owner ids re-resolve automatically as the paginated
  //     dogs/humans maps fill in, WITHOUT re-fetching the week.
  // Previously the fetch effect depended on the map identities, so
  // ensureDogsByIds/ensureHumansByIds growing the maps re-ran it and
  // re-pulled the whole week 1-2 extra times — and it blocked the first
  // fetch until both maps were populated (a load waterfall).
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const onErrorRef = useRef(onError);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  const onReadyForPickupRef = useRef(onReadyForPickup);
  useEffect(() => { onReadyForPickupRef.current = onReadyForPickup; }, [onReadyForPickup]);

  useEffect(() => {
    if (!supabase || !weekStart) {
      setRows(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const startStr = toDateStr(weekStart);
    const endStr = toDateStr(weekEnd);
    const inRange = (d) => !!d && d >= startStr && d <= endStr;

    async function fetchBookings() {
      setLoading(true);
      setError(null);

      // Consume the boot prefetch when one is in flight for this exact
      // week (primed by useAuth alongside the staff-profile fetch);
      // otherwise run the same query ourselves, as before.
      const { data, error: err } = await (takeBootPrefetch("bookingsWeek", {
        startStr,
      }) ?? fetchBookingsWeek(supabase, startStr, endStr, controller.signal));

      if (controller.signal.aborted) return;

      if (err) {
        setError(err.message);
        setRows([]);
        setLoading(false);
        return;
      }

      setRows(data || []);
      setLoading(false);
    }

    fetchBookings();

    // Realtime keeps the raw rows in sync within the current week; the
    // memo below re-derives the grouped/transformed view. Handlers only
    // need the row + the week range now — no transform or dogs/humans
    // lookup here (that moved into the memo).
    const channel = supabase
      .channel(uniqueChannelName(CHANNELS.bookingsRealtime))
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "bookings" },
        (payload) => {
          const newRow = payload.new;
          if (!inRange(newRow?.booking_date)) return;
          setRows((prev) => {
            const base = prev || [];
            const existing = base.find((r) => r.id === newRow.id);
            // Realtime payloads omit the notification_log embed; keep the
            // one we already fetched so reminderState survives the patch.
            const merged = existing?.notification_log
              ? { ...newRow, notification_log: existing.notification_log }
              : newRow;
            return base.some((r) => r.id === newRow.id)
              ? base.map((r) => (r.id === newRow.id ? merged : r))
              : [...base, merged];
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "bookings" },
        (payload) => {
          const newRow = payload.new;
          const oldRow = payload.old;
          const id = newRow?.id ?? oldRow?.id;
          if (!id) return;
          setRows((prev) => {
            const base = prev || [];
            // Moved outside the visible week → drop it.
            if (!inRange(newRow?.booking_date)) {
              return base.filter((r) => r.id !== id);
            }
            const existing = base.find((r) => r.id === id);
            const merged = existing?.notification_log
              ? { ...newRow, notification_log: existing.notification_log }
              : newRow;
            return base.some((r) => r.id === id)
              ? base.map((r) => (r.id === id ? merged : r))
              : [...base, merged];
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "bookings" },
        (payload) => {
          const id = payload.old?.id;
          if (!id) return;
          setRows((prev) => (prev || []).filter((r) => r.id !== id));
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notification_log" },
        (payload) => {
          // Reminder sends write notification_log, not bookings. Re-pull the
          // week (which embeds notification_log) so reminderState re-derives.
          // Reminder events are rare, so a full refetch is acceptable.
          const triggerType = payload.new?.trigger_type ?? payload.old?.trigger_type;
          if (triggerType === "reminder") refetch();
        },
      )
      .subscribe();

    return () => {
      controller.abort();
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch is a stable useCallback([]) ref, so it needn't be a dep; the effect already re-subscribes on refreshKey, which refetch bumps
  }, [weekStart, refreshKey]);

  // Derived view. Recomputes when the rows change OR when the dogs/humans
  // maps change — the latter re-resolves names without a network round
  // trip, which is what lets us drop the maps from the fetch effect.
  const bookingsByDate = useMemo(
    () => groupBookingsByDate(rows || [], dogsById, humansById),
    [rows, dogsById, humansById],
  );

  const addBooking = useCallback(
    async (dateStr, booking) => {
      if (!supabase) return booking;

      setError(null);

      const dogId =
        booking._dogId ||
        Object.values(dogsById || {}).find((d) => d.name === booking.dogName)
          ?.id;

      if (!dogId) {
        const message = `Dog not found for booking: ${booking.dogName}`;
        logger.error(message, undefined, {
          tags: { hook: "useBookings", op: "addBooking" },
          extra: { dogName: booking.dogName },
        });
        setError(message);
        onErrorRef.current?.(message);
        return null;
      }

      const pickupHumanId =
        booking._pickupById ||
        (booking.pickupBy
          ? Object.values(humansById || {}).find(
              (h) => h.fullName === booking.pickupBy,
            )?.id
          : null);

      const insertPayload = toInsertPayload(dateStr, booking, dogId, pickupHumanId);

      // Optimistic: insert a RAW row keyed by a client-generated id that we
      // ALSO send to the DB, so the row's id stays stable across the
      // optimistic insert, the server response, AND the realtime INSERT
      // echo. With a temp id the echo (carrying the server id) couldn't be
      // matched to the optimistic row and got appended as a duplicate —
      // which made two-dog group bookings briefly show doubled until a
      // manual refetch. Always a FRESH uuid (never booking.id) so a flow
      // prefilled from a persisted booking can't cause a PK collision.
      const newId = crypto.randomUUID();
      const rowPayload = { id: newId, ...insertPayload };
      setRows((prev) => [...(prev || []), rowPayload]);

      const { data, error: err } = await supabase
        .from("bookings")
        .insert(rowPayload)
        .select("*")
        .single();

      if (err) {
        setRows((prev) => (prev || []).filter((r) => r.id !== newId));
        logger.error("Failed to add booking", err, {
          tags: { hook: "useBookings", op: "addBooking" },
        });
        const friendly = friendlyBookingError(err);
        setError(friendly);
        onErrorRef.current?.(friendly);
        return null;
      }

      setRows((prev) => (prev || []).map((r) => (r.id === newId ? data : r)));

      return dbBookingsToArray([data], dogsById, humansById)[0];
    },
    [dogsById, humansById],
  );

  // Atomic multi-dog save for one date (AUDIT-3). The single-insert path
  // above saves each dog independently, so a mid-group rejection (capacity
  // race, duplicate) used to leave a partial booking behind. This path sends
  // the whole group to create_staff_booking_group — all rows insert in one
  // transaction, so a rejection on any dog rolls back every dog and the
  // caller gets one clear error. Same contract as addBooking: resolves to
  // the saved bookings, or null on a DB rejection.
  const addBookingGroup = useCallback(
    async (dateStr, bookings) => {
      if (!supabase) return bookings;

      setError(null);

      const payloads = [];
      for (const booking of bookings) {
        const dogId =
          booking._dogId ||
          Object.values(dogsById || {}).find((d) => d.name === booking.dogName)
            ?.id;

        if (!dogId) {
          const message = `Dog not found for booking: ${booking.dogName}`;
          logger.error(message, undefined, {
            tags: { hook: "useBookings", op: "addBookingGroup" },
            extra: { dogName: booking.dogName },
          });
          setError(message);
          onErrorRef.current?.(message);
          return null;
        }

        const pickupHumanId =
          booking._pickupById ||
          (booking.pickupBy
            ? Object.values(humansById || {}).find(
                (h) => h.fullName === booking.pickupBy,
              )?.id
            : null);

        // Fresh client id per row (same reasoning as addBooking): the RPC
        // inserts with these ids, so the optimistic rows, the returned rows
        // AND the realtime INSERT echoes all match in place.
        payloads.push({
          id: crypto.randomUUID(),
          ...toInsertPayload(dateStr, booking, dogId, pickupHumanId),
        });
      }

      // Optimistic: the whole group appears at once.
      setRows((prev) => [...(prev || []), ...payloads]);

      const { data, error: err } = await createStaffBookingGroup(supabase, {
        bookingDate: dateStr,
        bookings: payloads,
      });

      if (err) {
        const ids = new Set(payloads.map((p) => p.id));
        setRows((prev) => (prev || []).filter((r) => !ids.has(r.id)));
        logger.error("Failed to add booking group", err, {
          tags: { hook: "useBookings", op: "addBookingGroup" },
        });
        const friendly = friendlyBookingError(err);
        setError(friendly);
        onErrorRef.current?.(friendly);
        return null;
      }

      const byId = new Map((data || []).map((r) => [r.id, r]));
      setRows((prev) => (prev || []).map((r) => byId.get(r.id) || r));

      return dbBookingsToArray(data || [], dogsById, humansById);
    },
    [dogsById, humansById],
  );

  const removeBooking = useCallback(
    async (_dateStr, bookingId) => {
      if (!supabase) return { success: true };

      setError(null);

      // Snapshot the raw row for rollback, then remove optimistically.
      let removedRow = null;
      setRows((prev) => {
        const base = prev || [];
        removedRow = base.find((r) => r.id === bookingId) || null;
        return base.filter((r) => r.id !== bookingId);
      });

      const { error: err } = await supabase
        .from("bookings")
        .delete()
        .eq("id", bookingId);

      if (err) {
        if (removedRow) setRows((prev) => [...(prev || []), removedRow]);
        logger.error("Failed to remove booking", err, {
          tags: { hook: "useBookings", op: "removeBooking" },
        });
        setError(err.message);
        onErrorRef.current?.(err.message);
        return { success: false, error: err.message };
      }

      const removed = removedRow
        ? dbBookingsToArray([removedRow], dogsById, humansById)[0]
        : null;
      return { success: true, removed };
    },
    [dogsById, humansById],
  );

  const updateBooking = useCallback(
    async (updatedBooking, _fromDateStr, toDateStrValue) => {
      if (!supabase) return updatedBooking;

      setError(null);

      const pickupHumanId =
        updatedBooking._pickupById ||
        (updatedBooking.pickupBy
          ? Object.values(humansById || {}).find(
              (h) => h.fullName === updatedBooking.pickupBy,
            )?.id
          : null);

      const updatePayload = {
        booking_date: toDateStrValue,
        slot: updatedBooking.slot,
        service: updatedBooking.service,
        addons: updatedBooking.addons || [],
        pickup_by_id: pickupHumanId || null,
        payment: updatedBooking.payment || "Due at Pick-up",
        deposit_amount: updatedBooking.depositAmount ?? null,
        status: updatedBooking.status || BOOKING_STATUS.BOOKED,
        // Round-trips the cancellation reason so the Today view's "Didn't show"
        // action can persist cancel_reason='No-show' through this same path.
        // Normal edits write back the booking's current value (usually null).
        cancel_reason: updatedBooking.cancelReason ?? null,
        confirmed: updatedBooking.confirmed ?? false,
        // Reschedule / Edit flows that override capacity flip
        // this flag on the in-memory booking before calling onUpdate.
        // Mirrors the insert path: trigger validates and stamps _by/_at.
        ...(updatedBooking.staff_capacity_override
          ? { staff_capacity_override: true }
          : updatedBooking.staffCapacityOverride
            ? { staff_capacity_override: true }
            : {}),
      };

      // Optimistic: patch the raw row (incl. booking_date, so a move to
      // another day regroups automatically). Snapshot the previous row
      // for rollback + the ready-for-pickup transition check.
      let prevRow = null;
      setRows((prev) => {
        const base = prev || [];
        prevRow = base.find((r) => r.id === updatedBooking.id) || null;
        return base.map((r) =>
          r.id === updatedBooking.id ? { ...r, ...updatePayload } : r,
        );
      });

      const { data, error: err } = await supabase
        .from("bookings")
        .update(updatePayload)
        .eq("id", updatedBooking.id)
        .select("*")
        .single();

      if (err) {
        if (prevRow) {
          setRows((prev) =>
            (prev || []).map((r) => (r.id === prevRow.id ? prevRow : r)),
          );
        }
        logger.error("Failed to update booking", err, {
          tags: { hook: "useBookings", op: "updateBooking" },
        });
        setError(err.message);
        onErrorRef.current?.(err.message);
        return null;
      }

      setRows((prev) => (prev || []).map((r) => (r.id === data.id ? data : r)));

      const persisted = dbBookingsToArray([data], dogsById, humansById)[0];

      // Fire the staff "ready for collection" prompt only on the actual
      // transition into Ready (not on edits to an already-Ready booking,
      // and not on undo, which sets status back to the previous value).
      if (
        prevRow?.status !== BOOKING_STATUS.READY_FOR_PICKUP &&
        persisted.status === BOOKING_STATUS.READY_FOR_PICKUP
      ) {
        onReadyForPickupRef.current?.(persisted);
      }

      return persisted;
    },
    [dogsById, humansById],
  );

  const fetchBookingHistoryForDog = useCallback(async (dogId) => {
    if (!supabase) return [];

    const { data, error: err } = await supabase
      .from("bookings")
      .select("*")
      .eq("dog_id", dogId)
      .order("booking_date", { ascending: false })
      .limit(10);

    if (err) {
      logger.error("Failed to fetch booking history", err, {
        tags: { hook: "useBookings", op: "fetchBookingHistoryForDog" },
      });
      return [];
    }

    return (data || []).map((row) => ({
      id: row.id,
      date: row.booking_date,
      slot: row.slot,
      service: row.service,
      status: row.status,
      size: row.size,
      addons: row.addons || [],
      payment: row.payment,
    }));
  }, []);

  const refetch = useCallback(() => setRefreshKey((k) => k + 1), []);

  // On resume (tab visible again / reconnect) refetch the week so a
  // booking made elsewhere while the device slept is backfilled — its
  // realtime delta would have been missed.
  useEffect(() => registerResume(refetch), [refetch]);

  return {
    bookingsByDate,
    loading,
    error,
    addBooking,
    addBookingGroup,
    removeBooking,
    updateBooking,
    fetchBookingHistoryForDog,
    refetch,
  };
}

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { supabase } from "../client";
import { CHANNELS, uniqueChannelName } from "../realtimeChannels";
import { takeBootPrefetch } from "../bootPrefetch.js";
import { fetchBookingsWeek } from "../queries/bootQueries.js";
import { registerResume } from "../refreshOnResume.js";
import { dbBookingsToArray, toDateStr } from "../transforms";
import { londonDateStr } from "../../engine/londonTime";
import type { DbBookingRow } from "../transforms";
import { createStaffBookingGroup } from "../rpc";
import type { StaffBookingGroupRow } from "../rpc";
import { BOOKING_STATUS } from "../../constants/salon";
import { isCapacityRejection } from "../../engine/capacity";
import { logger } from "../../lib/logger";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import type { Booking, BookingsByDate } from "../../types/index";

// The dogs/humans maps are exactly what the transform consumes; naming
// them here keeps the hook's contract identical to dbBookingsToArray's.
type DogsById = Parameters<typeof dbBookingsToArray>[1];
type HumansById = Parameters<typeof dbBookingsToArray>[2];

/**
 * A booking as the New Booking modal hands it over: the app Booking fields it
 * fills, plus the snake_case write-only flags the insert path reads.
 */
export type StaffBookingInput = Partial<Booking> &
  Pick<Booking, "slot" | "size" | "service" | "dogName"> & {
    group_id?: string | null;
    staff_capacity_override?: boolean;
    notify_human_ids?: string[];
    confirmation_channel?: string;
  };

/** An edited booking; the reschedule/edit flows may set the snake_case override flag. */
export type StaffBookingUpdate = Booking & { staff_capacity_override?: boolean };

export interface UseBookingsOptions {
  onError?: (message: string) => void;
  onReadyForPickup?: (booking: Booking) => void;
}

export type RemoveBookingResult =
  | { success: true; removed?: Booking | null }
  | { success: false; error: string };

export type FetchBookingForVisitResult =
  | { ok: true; booking: Booking }
  | { ok: false; error: string };

/**
 * The INSERT column shape both write paths build. StaffBookingGroupRow is
 * the RPC's row contract; the single insert additionally needs the date,
 * and both always carry a concrete size.
 */
type StaffInsertPayload = StaffBookingGroupRow & { booking_date: string; size: string };

/** A raw Postgres error as supabase-js surfaces it. */
interface PostgrestErrorLike {
  code?: string;
  message?: string;
}

/** Realtime `old` is only the primary key without REPLICA IDENTITY FULL, so both sides are partial. */
type BookingPayload = RealtimePostgresChangesPayload<Record<string, unknown>>;

// Translate a raw Postgres error from the STAFF booking insert into copy a
// groomer can act on. Staff bypass the calendar + pregnancy gates (is_staff()),
// so the realistic late failure is a capacity (2-2-1) or duplicate-slot race:
// the client preflights capacity and a staff override is stamped when they
// confirm one, so a DB rejection here means another booking landed first.
// Anything unmapped falls through to the raw message — never swallowed — so an
// unmapped failure can't be mistaken for success upstream.
function friendlyBookingError(err: PostgrestErrorLike | null | undefined): string {
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
function toInsertPayload(
  dateStr: string,
  booking: StaffBookingInput,
  dogId: string,
  pickupHumanId: string | null | undefined,
): StaffInsertPayload {
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

// Exported for useInboxDiaryData, which groups its own (dogs/humans-map-free)
// booking rows by date the same way — keeps the grouping in one place rather
// than re-deriving it for a second range.
export function groupBookingsByDate(
  rows: DbBookingRow[],
  dogsById: DogsById,
  humansById: HumansById,
): BookingsByDate {
  const transformed = dbBookingsToArray(rows, dogsById, humansById);
  const grouped: BookingsByDate = {};

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
export function useBookings(
  weekStart: Date | null | undefined,
  dogsById: DogsById,
  humansById: HumansById,
  { onError, onReadyForPickup }: UseBookingsOptions = {},
) {
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
  const [rows, setRows] = useState<DbBookingRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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

    // Narrowed once here; the nested async function and cleanup below would
    // otherwise lose the null checks.
    const client = supabase;
    const controller = new AbortController();

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const startStr = toDateStr(weekStart);
    const endStr = toDateStr(weekEnd);
    const inRange = (d: unknown): d is string => typeof d === "string" && d >= startStr && d <= endStr;

    async function fetchBookings() {
      setLoading(true);
      setError(null);

      // Consume the boot prefetch when one is in flight for this exact
      // week (primed by useAuth alongside the staff-profile fetch);
      // otherwise run the same query ourselves, as before.
      const { data, error: err } = await (takeBootPrefetch("bookingsWeek", {
        startStr,
      }) ?? fetchBookingsWeek(client, startStr, endStr, controller.signal));

      if (controller.signal.aborted) return;

      if (err) {
        setError(err.message);
        // Keep the last confirmed schedule visible when a refresh fails.
        // On the initial fetch rows is still null, so the derived view remains
        // naturally empty while the error and retry state are exposed.
        setLoading(false);
        return;
      }

      setRows((data || []) as DbBookingRow[]);
      setLoading(false);
    }

    fetchBookings();

    // Realtime keeps the raw rows in sync within the current week; the
    // memo below re-derives the grouped/transformed view. Handlers only
    // need the row + the week range now — no transform or dogs/humans
    // lookup here (that moved into the memo).
    const channel = client
      .channel(uniqueChannelName(CHANNELS.bookingsRealtime))
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "bookings" },
        (payload: BookingPayload) => {
          const newRow = payload.new as DbBookingRow;
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
        (payload: BookingPayload) => {
          const newRow = payload.new as DbBookingRow;
          const oldRow = payload.old as Partial<DbBookingRow>;
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
        (payload: BookingPayload) => {
          const id = (payload.old as Partial<DbBookingRow>)?.id;
          if (!id) return;
          setRows((prev) => (prev || []).filter((r) => r.id !== id));
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notification_log" },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          // Reminder sends write notification_log, not bookings. Re-pull the
          // week (which embeds notification_log) so reminderState re-derives.
          // Reminder events are rare, so a full refetch is acceptable.
          const newLog = payload.new as { trigger_type?: string };
          const oldLog = payload.old as { trigger_type?: string };
          const triggerType = newLog?.trigger_type ?? oldLog?.trigger_type;
          if (triggerType === "reminder") refetch();
        },
      )
      .subscribe();

    return () => {
      controller.abort();
      client.removeChannel(channel);
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
    async (dateStr: string, booking: StaffBookingInput): Promise<Booking | StaffBookingInput | null> => {
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
      // The optimistic row needs the transform's full shape; the DB payload
      // stays exactly what the insert contract sends.
      setRows((prev) => [...(prev || []), { group_id: null, ...rowPayload } as DbBookingRow]);

      const { data: inserted, error: err } = await supabase
        .from("bookings")
        .insert(rowPayload)
        .select("*")
        .single();
      const data = inserted as DbBookingRow | null;

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

      if (!data) return null;
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
    async (dateStr: string, bookings: StaffBookingInput[]): Promise<Booking[] | StaffBookingInput[] | null> => {
      if (!supabase) return bookings;

      setError(null);

      const payloads: Array<StaffInsertPayload & { id: string }> = [];
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
      setRows((prev) => [
        ...(prev || []),
        ...payloads.map((p) => ({ group_id: null, ...p }) as DbBookingRow),
      ]);

      const { data: created, error: err } = await createStaffBookingGroup(supabase, {
        bookingDate: dateStr,
        bookings: payloads,
      });
      const data = (created ?? []) as DbBookingRow[];

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

      const byId = new Map(data.map((r) => [r.id, r]));
      setRows((prev) => (prev || []).map((r) => byId.get(r.id) || r));

      return dbBookingsToArray(data, dogsById, humansById);
    },
    [dogsById, humansById],
  );

  const removeBooking = useCallback(
    async (_dateStr: string, bookingId: string): Promise<RemoveBookingResult> => {
      if (!supabase) return { success: true };

      setError(null);

      // Snapshot the raw row for rollback, then remove optimistically. Held in
      // an object because the updater runs synchronously in React's queue
      // and TypeScript can't see the assignment through the closure.
      const snapshot: { row: DbBookingRow | null } = { row: null };
      setRows((prev) => {
        const base = prev || [];
        snapshot.row = base.find((r) => r.id === bookingId) || null;
        return base.filter((r) => r.id !== bookingId);
      });

      const { error: err } = await supabase
        .from("bookings")
        .delete()
        .eq("id", bookingId);

      // Read only after the await: React runs the updater when it flushes,
      // which is before the network round-trip resolves.
      const removedRow = snapshot.row;

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
    async (updatedBooking: StaffBookingUpdate, _fromDateStr: string, toDateStrValue: string): Promise<Booking | null> => {
      if (!supabase) return updatedBooking;

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
        // Payment ledger (improvement #3): round-trip method + amount; paid_at is
        // trigger-stamped/cleared on the payment transition. Mark-paid sets these
        // on the in-memory booking; normal edits write back the current values.
        payment_method: updatedBooking.paymentMethod ?? null,
        paid_amount: updatedBooking.paidAmount ?? null,
        // This booking's one-off agreed price. Explicitly null when the
        // edited price matches the dog's usual/guide price, so clearing an
        // old override round-trips.
        price_override: updatedBooking.priceOverride ?? null,
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
        // Staff confirmation (Daily Brief "Confirm"). Written ONLY on the
        // explicit marker so ordinary edits never touch the confirmation pair
        // — a customer's WhatsApp confirm (source 'customer') must survive
        // every unrelated save. mark_reminder_confirmed() later overwrites a
        // 'staff' stamp when the customer really confirms.
        ...(updatedBooking._confirmArrival
          ? {
              reminder_confirmed_at: new Date().toISOString(),
              reminder_confirmed_source: "staff",
              // A staff Confirm advances the lifecycle the same way a customer
              // reply does, under the same two guards as
              // mark_reminder_confirmed(): only out of Booked, and only for a
              // booking that has not already happened.
              //
              // Only out of Booked, because staff also press Confirm on a dog
              // already in the salon, and Reconfirmed ranks BELOW Arrived — the
              // lifecycle trigger would clear checked_in_at and lose the
              // arrival time. Only today or later, because confirming an
              // appointment that is already over is closing paperwork, not a
              // statement that the dog is coming.
              ...(( updatedBooking.status || BOOKING_STATUS.BOOKED) === BOOKING_STATUS.BOOKED
                && toDateStrValue >= londonDateStr()
                ? { status: BOOKING_STATUS.RECONFIRMED }
                : {}),
            }
          : {}),
        // Undo of a staff confirmation (mis-tap). Clears the pair — but only
        // through the staff-source guard below, so a customer confirmation
        // that raced in is never wiped.
        ...(updatedBooking._unconfirmArrival
          ? {
              reminder_confirmed_at: null,
              reminder_confirmed_source: null,
            }
          : {}),
      };

      // Optimistic: patch the raw row (incl. booking_date, so a move to
      // another day regroups automatically). Snapshot the previous row
      // for rollback + the ready-for-pickup transition check.
      const snapshot: { row: DbBookingRow | null } = { row: null };
      setRows((prev) => {
        const base = prev || [];
        snapshot.row = base.find((r) => r.id === updatedBooking.id) || null;
        return base.map((r) =>
          r.id === updatedBooking.id ? { ...r, ...updatePayload } : r,
        );
      });

      let updateQuery = supabase
        .from("bookings")
        .update(updatePayload)
        .eq("id", updatedBooking.id);
      // Unconfirm only ever clears a STAFF stamp: if the customer's own
      // confirmation landed in between, this matches 0 rows and .single()
      // errors — the rollback below then restores the local row untouched.
      if (updatedBooking._unconfirmArrival) {
        updateQuery = updateQuery.eq("reminder_confirmed_source", "staff");
      }
      const { data: updated, error: err } = await updateQuery.select("*").single();
      const data = updated as DbBookingRow | null;
      // Read only after the await, for the same reason as removeBooking.
      const prevRow = snapshot.row;

      if (err || !data) {
        if (prevRow) {
          setRows((prev) =>
            (prev || []).map((r) => (r.id === prevRow.id ? prevRow : r)),
          );
        }
        logger.error("Failed to update booking", err, {
          tags: { hook: "useBookings", op: "updateBooking" },
        });
        onErrorRef.current?.(err?.message ?? "Couldn't save the booking — please try again.");
        return null;
      }

      setRows((prev) => (prev || []).map((r) => (r.id === data.id ? data : r)));

      const persisted = dbBookingsToArray([data], dogsById, humansById)[0];

      // Fire the staff "ready for collection" prompt only on the actual
      // transition into Ready (not on edits to an already-Ready booking,
      // and not on undo, which sets status back to the previous value).
      if (
        !updatedBooking._skipCollectionPrompt &&
        prevRow?.status !== BOOKING_STATUS.READY_FOR_COLLECTION &&
        persisted.status === BOOKING_STATUS.READY_FOR_COLLECTION
      ) {
        onReadyForPickupRef.current?.(persisted);
      }

      return persisted;
    },
    [dogsById, humansById],
  );

  const fetchBookingHistoryForDog = useCallback(async (dogId: string): Promise<Array<Booking & { date: string }>> => {
    if (!supabase) return [];

    const { data: history, error: err } = await supabase
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

    const data = (history || []) as DbBookingRow[];
    return dbBookingsToArray(data, dogsById, humansById).map((booking) => ({
      ...booking,
      // GroomingHistory keeps a display-friendly `date` field, while the
      // appointment card uses the canonical `_bookingDate`.
      date: booking._bookingDate,
    }));
  }, [dogsById, humansById]);

  const fetchBookingForVisit = useCallback(async (visitId: string | null | undefined): Promise<FetchBookingForVisitResult> => {
    if (!supabase || !visitId) {
      return {
        ok: false,
        error: "Couldn't open that appointment from here.",
      };
    }

    const { data: visitRows, error: err } = await supabase
      .from("bookings")
      .select("*, notification_log(trigger_type, status, sent_at, channel)")
      .eq("visit_id", visitId)
      .eq("visit_membership_state", "included")
      .order("booking_date", { ascending: true })
      .order("slot")
      .limit(20);

    if (err) {
      logger.error("Failed to fetch booking for closure task", err, {
        tags: { hook: "useBookings", op: "fetchBookingForVisit" },
      });
      return {
        ok: false,
        error: err.message || "Couldn't open that appointment from here.",
      };
    }

    const data = (visitRows || []) as DbBookingRow[];
    const activeRow = data.find(
      (row) =>
        row.status !== BOOKING_STATUS.CANCELLED &&
        row.status !== BOOKING_STATUS.COMPLETED,
    );
    if (!activeRow) {
      return {
        ok: false,
        error:
          "That appointment has moved or been cancelled. You can check and complete the task.",
      };
    }

    const booking = dbBookingsToArray(
      [activeRow],
      dogsById,
      humansById,
    )[0];
    if (!booking) {
      return {
        ok: false,
        error: "Couldn't open that appointment from here.",
      };
    }

    return { ok: true, booking };
  }, [dogsById, humansById]);

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
    fetchBookingForVisit,
    refetch,
  };
}

// ============================================================
// src/supabase/hooks/useOwnerBookingEvents.js
//
// Booking-event timeline for ONE owner, used by the Human Profile. Scopes
// booking_events to the bookings of this owner's dogs:
//   1. resolve the owner's dog ids → their booking ids (all time), then
//   2. read booking_events for those booking ids, newest first.
//
// booking_events has no dog/owner id, only booking_id, so we join through
// bookings rather than matching on the denormalised name (two owners can each
// have a "Daisy"). Staff RLS allows reading every booking, so this is a plain
// two-step read — no RPC needed. Subscribes to realtime so a new event on this
// owner's bookings appears without a reload.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../client";
import { CHANNELS, uniqueChannelName } from "../realtimeChannels";
import { logger } from "../../lib/logger";

const EVENT_COLUMNS =
  "id, booking_id, event_type, customer_name, dog_name, dog_breed, service, booking_date, slot, previous_booking_date, previous_slot, cancel_reason, actor_id, actor_role, actor_name, occurred_at";

export function useOwnerBookingEvents({ dogIds, limit = 20 } = {}) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Stable key so the effect doesn't re-run when the caller passes a fresh
  // array holding the same ids on every render.
  const dogIdKey = useMemo(
    () => [...new Set((dogIds || []).filter(Boolean))].sort().join(","),
    [dogIds],
  );

  const refresh = useCallback(async () => {
    const ids = dogIdKey ? dogIdKey.split(",") : [];
    if (!supabase || ids.length === 0) {
      setEvents([]);
      setLoading(false);
      return;
    }
    try {
      setError(null);
      // 1. This owner's booking ids (all time), via their dogs.
      const { data: bookingRows, error: bErr } = await supabase
        .from("bookings")
        .select("id")
        .in("dog_id", ids);
      if (bErr) throw bErr;
      const bookingIds = (bookingRows ?? []).map((b) => b.id);
      if (bookingIds.length === 0) {
        setEvents([]);
        return;
      }
      // 2. The events on those bookings, newest first.
      const { data, error: eErr } = await supabase
        .from("booking_events")
        .select(EVENT_COLUMNS)
        .in("booking_id", bookingIds)
        .order("occurred_at", { ascending: false })
        .limit(limit);
      if (eErr) throw eErr;
      setEvents(data ?? []);
    } catch (err) {
      logger.error("useOwnerBookingEvents fetch failed", err, {
        tags: { hook: "useOwnerBookingEvents", op: "fetch" },
      });
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [dogIdKey, limit]);

  useEffect(() => {
    if (!supabase) return;
    setLoading(true);
    refresh();
    // booking_events realtime can't be server-filtered to this owner's
    // booking ids, so refresh on any insert — cheap while a single profile
    // modal is open, and the re-query re-scopes to this owner.
    const channel = supabase
      .channel(uniqueChannelName(CHANNELS.humanCardBookingEvents))
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "booking_events" },
        () => refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [refresh]);

  return { events, loading, error, refresh };
}

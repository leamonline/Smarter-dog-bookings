// ============================================================
// src/supabase/hooks/useBookingEvents.ts
//
// Lightweight feed of recent booking life-cycle events for the
// dashboard's BookingHistoryCard. Reads from booking_events (an
// append-only log written by triggers on the bookings table) and
// subscribes to realtime so new bookings appear instantly without
// a page reload.
//
// Returns up to `limit` (default 10) events, newest first.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../client";
import { CHANNELS } from "../realtimeChannels";
import { registerResume } from "../refreshOnResume.js";
import { logger } from "../../lib/logger";
import type { Database } from "../database.types";

type BookingEventRow = Database["public"]["Tables"]["booking_events"]["Row"];

/** The projection the dashboard feed reads (a subset of booking_events). */
export type BookingEvent = Pick<
  BookingEventRow,
  | "id"
  | "booking_id"
  | "event_type"
  | "customer_name"
  | "dog_name"
  | "dog_breed"
  | "service"
  | "booking_date"
  | "slot"
  | "previous_booking_date"
  | "previous_slot"
  | "cancel_reason"
  | "actor_id"
  | "actor_role"
  | "actor_name"
  | "occurred_at"
>;

export interface UseBookingEventsResult {
  events: BookingEvent[];
  loading: boolean;
  error: unknown;
  refresh: () => Promise<void>;
}

export function useBookingEvents({ limit = 10 }: { limit?: number } = {}): UseBookingEventsResult {
  const [events, setEvents] = useState<BookingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const refresh = useCallback(async () => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    try {
      setError(null);
      const { data, error: queryErr } = await supabase
        .from("booking_events")
        .select(
          "id, booking_id, event_type, customer_name, dog_name, dog_breed, service, booking_date, slot, previous_booking_date, previous_slot, cancel_reason, actor_id, actor_role, actor_name, occurred_at",
        )
        .order("occurred_at", { ascending: false })
        .limit(limit);
      if (queryErr) throw queryErr;
      setEvents(data ?? []);
    } catch (err) {
      logger.error("useBookingEvents fetch failed", err, {
        tags: { hook: "useBookingEvents", op: "fetch" },
      });
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    if (!supabase) return;
    refresh();
    const channel = supabase
      .channel(CHANNELS.dashboardBookingEvents)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "booking_events" },
        () => refresh(),
      )
      .subscribe();
    return () => { supabase!.removeChannel(channel); };
  }, [refresh]);

  // Reconcile on resume so booking_events missed while asleep appear.
  useEffect(() => registerResume(refresh), [refresh]);

  return { events, loading, error, refresh };
}

import { useCallback, useEffect, useState } from "react";
import { logger } from "../../lib/logger";
import { supabase } from "../client";
import type { Database } from "../database.types";

type HistoryRow = Database["public"]["Tables"]["booking_payment_history"]["Row"];

export type BookingPaymentHistoryEvent = HistoryRow & {
  actorName: string | null;
};

export interface UseBookingPaymentHistoryResult {
  available: boolean;
  events: BookingPaymentHistoryEvent[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  restore: (eventId: number, expectedLatestId: number, reason: string) => Promise<number>;
}

function recoveryError(error: { code?: string; message?: string }): string {
  const message = error.message || "";
  if (error.code === "40001" || /changed since/i.test(message)) {
    return "The payment record changed. Reload the history and review it before trying again.";
  }
  if (error.code === "42501") return "Staff access is required to restore payment details.";
  if (error.code === "P0002") return "This booking no longer exists, so it cannot be restored.";
  if (error.code === "22023") return message || "That payment record cannot be restored.";
  return "Couldn’t restore the payment record. Check the latest history before trying again.";
}

export function useBookingPaymentHistory(
  bookingId: string | undefined,
  { enabled = true }: { enabled?: boolean } = {},
): UseBookingPaymentHistoryResult {
  const [events, setEvents] = useState<BookingPaymentHistoryEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!supabase || !bookingId || !enabled) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: historyError } = await supabase
        .from("booking_payment_history")
        .select("id, booking_id, operation, before_values, after_values, actor_id, actor_role, recorded_at, restored_from, reason")
        .eq("booking_id", bookingId)
        .order("id", { ascending: false })
        .limit(50);
      if (historyError) throw historyError;

      const rows = data ?? [];
      const actorIds = [...new Set(rows.map((row) => row.actor_id).filter((id): id is string => Boolean(id)))];
      const names = new Map<string, string>();
      if (actorIds.length > 0) {
        const { data: profiles, error: profilesError } = await supabase
          .from("staff_profiles")
          .select("user_id, display_name")
          .in("user_id", actorIds);
        if (profilesError) {
          logger.warn("Payment history actor names unavailable", {
            tags: { hook: "useBookingPaymentHistory", op: "actorNames" },
            extra: { error: profilesError },
          });
        } else {
          for (const profile of profiles ?? []) {
            if (profile.display_name) names.set(profile.user_id, profile.display_name);
          }
        }
      }
      setEvents(rows.map((row) => ({ ...row, actorName: row.actor_id ? names.get(row.actor_id) ?? null : null })));
    } catch (caught) {
      logger.error("Payment history fetch failed", caught, {
        tags: { hook: "useBookingPaymentHistory", op: "fetch" },
      });
      setError("Payment history is unavailable. Try again before making a correction.");
    } finally {
      setLoading(false);
    }
  }, [bookingId, enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const restore = useCallback(async (eventId: number, expectedLatestId: number, reason: string) => {
    if (!supabase || !bookingId) throw new Error("Payment history is unavailable in sample data.");
    const { data, error: rpcError } = await supabase.rpc("restore_booking_payment", {
      p_booking_id: bookingId,
      p_event_id: eventId,
      p_expected_latest_id: expectedLatestId,
      p_reason: reason.trim(),
    });
    if (rpcError) {
      logger.error("Payment recovery failed", rpcError, {
        tags: { hook: "useBookingPaymentHistory", op: "restore" },
      });
      throw new Error(recoveryError(rpcError));
    }
    return Number(data);
  }, [bookingId]);

  return { available: Boolean(supabase), events, loading, error, refresh, restore };
}

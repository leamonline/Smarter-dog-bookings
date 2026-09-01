import { useState, useEffect, useCallback } from "react";
import { supabase } from "../client";
import type { Database } from "../database.types";

type BookingRow = Database["public"]["Tables"]["bookings"]["Row"];

/** The projection RecurringBookingModal renders for each booking in the chain. */
export type ChainBooking = Pick<
  BookingRow,
  "id" | "booking_date" | "slot" | "service" | "size" | "status"
>;

export type CancelBookingsResult = { success: true } | { success: false; error?: string };

export interface UseGroupBookingsResult {
  chainBookings: ChainBooking[];
  loading: boolean;
  cancelBookings: (ids: string[]) => Promise<CancelBookingsResult>;
}

/**
 * useGroupBookings — fetches and manages bookings in a recurring group chain.
 * Replaces direct supabase calls in RecurringBookingModal.
 */
export function useGroupBookings(groupId: string | null | undefined): UseGroupBookingsResult {
  const [chainBookings, setChainBookings] = useState<ChainBooking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase || !groupId) {
      setLoading(false);
      return;
    }
    // Narrowed once here; the nested async function would otherwise lose
    // both null checks.
    const client = supabase;
    const id = groupId;

    const controller = new AbortController();

    async function fetchChain() {
      setLoading(true);
      const { data, error } = await client
        .from("bookings")
        .select("id, booking_date, slot, service, size, status")
        .eq("group_id", id)
        .order("booking_date")
        .order("slot")
        .abortSignal(controller.signal);

      if (controller.signal.aborted) return;
      if (!error && data) setChainBookings(data);
      setLoading(false);
    }

    fetchChain();
    return () => { controller.abort(); };
  }, [groupId]);

  const cancelBookings = useCallback(async (ids: string[]): Promise<CancelBookingsResult> => {
    if (!supabase || ids.length === 0) return { success: false };

    const { error } = await supabase
      .from("bookings")
      .delete()
      .in("id", ids);

    if (error) return { success: false, error: error.message };
    return { success: true };
  }, []);

  return { chainBookings, loading, cancelBookings };
}

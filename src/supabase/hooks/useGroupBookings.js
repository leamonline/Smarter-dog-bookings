import { useState, useEffect, useCallback } from "react";
import { supabase } from "../client";

/**
 * useGroupBookings — fetches and manages bookings in a recurring group chain.
 * Replaces direct supabase calls in RecurringBookingModal.
 */
export function useGroupBookings(groupId) {
  const [chainBookings, setChainBookings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase || !groupId) {
      setLoading(false);
      return;
    }

    const controller = new AbortController();

    async function fetchChain() {
      setLoading(true);
      const { data, error } = await supabase
        .from("bookings")
        .select("id, booking_date, slot, service, size, status")
        .eq("group_id", groupId)
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

  const cancelBookings = useCallback(async (ids) => {
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

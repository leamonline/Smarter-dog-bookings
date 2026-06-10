import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../client.js";
import { toDateStr } from "../transforms";
import { logger } from "../../lib/logger";

export function useWaitlist(targetDateObj) {
  const [waitlist, setWaitlist] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Shared across the initial load and every realtime-triggered refetch
  // so the cleanup below can cancel any in-flight query. Stored in a ref
  // so the imperative fetchWaitlist callback can read the latest signal.
  const controllerRef = useRef(null);

  const fetchWaitlist = useCallback(async () => {
    if (!supabase || !targetDateObj || isNaN(targetDateObj.getTime())) return;

    const signal = controllerRef.current?.signal;
    setLoading(true);
    const dateStr = toDateStr(targetDateObj);

    const query = supabase
      .from("waitlist_entries")
      .select("*, humans(id, name, surname, phone)")
      .eq("target_date", dateStr);

    const { data, error } = await (signal ? query.abortSignal(signal) : query);

    if (signal?.aborted) return;
    if (error) {
      logger.error("Error fetching waitlist", error, {
        tags: { hook: "useWaitlist", op: "fetch" },
      });
      setError(error.message);
    } else {
      setWaitlist(data || []);
    }
    setLoading(false);
  }, [targetDateObj]);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }

    const controller = new AbortController();
    controllerRef.current = controller;

    fetchWaitlist();

    const channel = supabase
      .channel("waitlist_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "waitlist_entries" },
        () => {
          fetchWaitlist();
        }
      )
      .subscribe();

    return () => {
      controller.abort();
      supabase.removeChannel(channel);
    };
  }, [fetchWaitlist]);

  const joinWaitlist = useCallback(async (humanId, dateStr) => {
    if (!supabase) throw new Error("Not connected");
    const { data, error } = await supabase
      .from("waitlist_entries")
      .insert({ human_id: humanId, target_date: dateStr })
      .select("*, humans(id, name, surname, phone)")
      .single();

    if (error) throw error;
    setWaitlist(prev => [...prev, data]);
    return data;
  }, []);

  const leaveWaitlist = useCallback(async (entryId) => {
    if (!supabase) throw new Error("Not connected");
    const { error } = await supabase
      .from("waitlist_entries")
      .delete()
      .eq("id", entryId);

    if (error) throw error;
    setWaitlist(prev => prev.filter(e => e.id !== entryId));
  }, []);

  return {
    waitlist,
    loading,
    error,
    joinWaitlist,
    leaveWaitlist,
    fetchWaitlist
  };
}

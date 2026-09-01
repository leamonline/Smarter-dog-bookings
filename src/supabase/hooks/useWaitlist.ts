import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../client";
import { CHANNELS } from "../realtimeChannels";
import { toDateStr } from "../transforms";
import { logger } from "../../lib/logger";
import type { Database } from "../database.types";

type WaitlistRow = Database["public"]["Tables"]["waitlist_entries"]["Row"];
type HumanRow = Database["public"]["Tables"]["humans"]["Row"];

/** The columns the waitlist joins from humans for display. */
export type WaitlistHuman = Pick<HumanRow, "id" | "name" | "surname" | "phone">;

/** One waitlist row with its owner joined; `humans` is null when the owner was deleted. */
export type WaitlistEntry = WaitlistRow & { humans: WaitlistHuman | null };

const ENTRY_SELECT = "*, humans(id, name, surname, phone)";

export interface UseWaitlistResult {
  waitlist: WaitlistEntry[];
  loading: boolean;
  error: string | null;
  joinWaitlist: (humanId: string, dateStr: string) => Promise<WaitlistEntry>;
  leaveWaitlist: (entryId: string) => Promise<void>;
  fetchWaitlist: () => Promise<void>;
}

export function useWaitlist(targetDateObj: Date | null | undefined): UseWaitlistResult {
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Shared across the initial load and every realtime-triggered refetch
  // so the cleanup below can cancel any in-flight query. Stored in a ref
  // so the imperative fetchWaitlist callback can read the latest signal.
  const controllerRef = useRef<AbortController | null>(null);

  const fetchWaitlist = useCallback(async () => {
    if (!supabase || !targetDateObj || isNaN(targetDateObj.getTime())) return;

    const signal = controllerRef.current?.signal;
    setLoading(true);
    const dateStr = toDateStr(targetDateObj);

    const query = supabase
      .from("waitlist_entries")
      .select(ENTRY_SELECT)
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
    const client = supabase;

    const controller = new AbortController();
    controllerRef.current = controller;

    fetchWaitlist();

    const channel = client
      .channel(CHANNELS.waitlistChanges)
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
      client.removeChannel(channel);
    };
  }, [fetchWaitlist]);

  const joinWaitlist = useCallback(async (humanId: string, dateStr: string): Promise<WaitlistEntry> => {
    if (!supabase) throw new Error("Not connected");
    const { data, error } = await supabase
      .from("waitlist_entries")
      .insert({ human_id: humanId, target_date: dateStr })
      .select(ENTRY_SELECT)
      .single();

    if (error) throw error;
    setWaitlist(prev => [...prev, data]);
    return data;
  }, []);

  const leaveWaitlist = useCallback(async (entryId: string): Promise<void> => {
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

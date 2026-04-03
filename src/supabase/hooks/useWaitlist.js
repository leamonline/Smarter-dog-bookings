import { useState, useEffect, useCallback } from "react";
import { supabase } from "../client.js";
import { toDateStr } from "../transforms.js";

export function useWaitlist(targetDateObj) {
  const [waitlist, setWaitlist] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchWaitlist = useCallback(async () => {
    if (!targetDateObj || isNaN(targetDateObj.getTime())) return;
    
    setLoading(true);
    const dateStr = toDateStr(targetDateObj);
    
    // We want the humans that are waiting
    const { data, error } = await supabase
      .from("waitlist_entries")
      .select("*, humans(id, name, surname, phone)")
      .eq("target_date", dateStr);

    if (error) {
      console.error("Error fetching waitlist:", error);
      setError(error.message);
    } else {
      setWaitlist(data || []);
    }
    setLoading(false);
  }, [targetDateObj]);

  useEffect(() => {
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
      supabase.removeChannel(channel);
    };
  }, [fetchWaitlist]);

  const joinWaitlist = useCallback(async (humanId, dateStr) => {
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

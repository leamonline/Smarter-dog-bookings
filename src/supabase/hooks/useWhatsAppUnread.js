// ============================================================
// src/supabase/hooks/useWhatsAppUnread.js
//
// Tiny hook for the AppToolbar unread badge. Separate from
// useWhatsAppInbox deliberately — the full inbox hook fetches
// joined humans + draft flags + subscribes to three tables. The
// toolbar only needs one number, on every page. Running the heavy
// hook everywhere would waste realtime slots and render time.
//
// What it does:
//   - Fetches sum(unread_count) from whatsapp_conversations once
//   - Subscribes to whatsapp_conversations UPDATE events and refreshes
//     when the count might have changed
//   - Returns { unread, loading }
//
// What it does NOT do:
//   - List conversations, load messages, or anything else the inbox
//     does. Use useWhatsAppInbox for that.
// ============================================================

import { useState, useEffect, useCallback } from "react";
import { supabase } from "../client.js";

export function useWhatsAppUnread() {
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    // Sum the column. We could use a head-count RPC but a select is
    // fine at this scale (tens of conversations at most) and saves
    // us a DB function to maintain.
    const { data, error } = await supabase
      .from("whatsapp_conversations")
      .select("unread_count");

    if (error) {
      console.warn("useWhatsAppUnread refresh:", error.message);
      setLoading(false);
      return;
    }
    const total = (data ?? []).reduce((s, r) => s + (r.unread_count || 0), 0);
    setUnread(total);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!supabase) return;
    refresh();

    // Only subscribe to UPDATEs — INSERTs start at 0 (trigger will
    // fire later when a message arrives), DELETEs are exceptional.
    // This keeps realtime noise minimal.
    const channel = supabase
      .channel("whatsapp-toolbar-unread")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "whatsapp_conversations" },
        () => refresh(),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "whatsapp_conversations" },
        () => refresh(),
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [refresh]);

  return { unread, loading };
}

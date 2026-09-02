// ============================================================
// src/components/views/inbox/hooks/useInboxMessageSearch.js
//
// Powers the inbox search box. Given a free-text query it searches
// the FULL message history (whatsapp_messages.content), not just the
// last-message preview the list already holds, and returns the set of
// conversation ids that have at least one matching message.
//
// Staff RLS already permits broad message reads (the inbox list-fetch
// runs the same kind of cross-conversation query), so this needs no
// special grant. The query is debounced and bounded; it no-ops below
// MIN_QUERY_LENGTH so a single keystroke doesn't hammer the DB.
// ============================================================

import { useEffect, useState } from "react";
import { useStaffInboxReads } from "../../../../supabase/hooks/useStaffInboxReads";
import { logger } from "../../../../lib/logger";

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 300;
// Cap the rows scanned back so a very common word can't pull thousands
// of message rows over the wire — we only need the distinct set of
// conversation ids, and the list itself is the recent window anyway.
const MATCH_LIMIT = 2000;

export function useInboxMessageSearch(query) {
  const inboxReads = useStaffInboxReads();
  const [messageMatchIds, setMessageMatchIds] = useState(() => new Set());
  const [searching, setSearching] = useState(false);
  const trimmed = (query ?? "").trim();

  useEffect(() => {
    // No client in offline / sample-data mode (VITE_FORCE_OFFLINE), and
    // nothing to search below the minimum query length.
    if (!inboxReads.connected || trimmed.length < MIN_QUERY_LENGTH) {
      setMessageMatchIds(new Set());
      setSearching(false);
      return undefined;
    }

    let cancelled = false;
    setSearching(true);

    const handle = window.setTimeout(async () => {
      try {
        // LIKE-wildcard escaping lives in the repository with the query.
        const { conversationIds, error } = await inboxReads.searchMessageConversationIds(
          trimmed,
          MATCH_LIMIT,
        );
        if (error) throw error;
        if (cancelled) return;
        setMessageMatchIds(new Set(conversationIds));
      } catch (err) {
        if (cancelled) return;
        logger.error("inbox message search failed", err, {
          tags: { hook: "useInboxMessageSearch" },
        });
        setMessageMatchIds(new Set());
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [trimmed, inboxReads]);

  return { messageMatchIds, searching };
}

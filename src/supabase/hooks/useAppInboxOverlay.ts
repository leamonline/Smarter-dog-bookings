/**
 * Staff inbox overlay for in-app messages.
 *
 * With the flag off, or with no Supabase client (sample data, tests), every
 * value passed in is returned unchanged and nothing is fetched. With the flag
 * on, the list and the open thread come from list_staff_unified_inbox and
 * list_staff_unified_thread. A failure leaves the WhatsApp list in place.
 *
 * TODO(app-push): a new app message is not pushed. Realtime refreshes this
 * inbox; APNs and staff Web Push stay with the work that owns them.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../client";
import { logger } from "../../lib/logger";
import { uniqueChannelName, CHANNELS } from "../realtimeChannels";
import {
  applyUnifiedInbox,
  isAppThreadId,
  parseAppThreadId,
  replyChannelForMessages,
  sendAppReplyWithClient,
  toInboxMessage,
  type UnifiedInboxRow,
  type UnifiedThreadMessage,
} from "../appInbox";
import type { InboxMessage } from "./inbox/inboxTypes";

interface OverlayConversation {
  id: string;
  human_id?: string | null;
  channel?: string | null;
  channels?: string[] | null;
  app_conversation_id?: string | null;
  reply_channel?: string | null;
}

interface OverlayClient {
  rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
  channel: (name: string) => {
    on: (event: string, filter: Record<string, string>, callback: () => void) => OverlayChannel;
    subscribe: () => void;
  };
  removeChannel: (channel: unknown) => void;
}

interface OverlayChannel {
  on: (event: string, filter: Record<string, string>, callback: () => void) => OverlayChannel;
  subscribe: () => void;
}

export interface UseAppInboxOverlayArgs<C extends OverlayConversation, M> {
  enabled: boolean;
  conversations: C[];
  messages: M[];
  selectedId: string | null | undefined;
  client?: OverlayClient | null;
}

export function useAppInboxOverlay<C extends OverlayConversation, M>({
  enabled,
  conversations,
  messages,
  selectedId,
  client,
}: UseAppInboxOverlayArgs<C, M>) {
  const db = (client === undefined ? supabase : client) as OverlayClient | null;
  const active = Boolean(enabled && db);
  const [unified, setUnified] = useState<UnifiedInboxRow[] | null>(null);
  const [thread, setThread] = useState<InboxMessage[] | null>(null);
  const [threadFor, setThreadFor] = useState<string | null>(null);
  const [threadError, setThreadError] = useState<string | null>(null);

  const merged = useMemo(
    () => (active && unified ? applyUnifiedInbox(conversations, unified) : conversations),
    [active, unified, conversations],
  );
  const selectedRow = useMemo(
    () => (active ? merged.find((row) => row.id === selectedId) ?? null : null),
    [active, merged, selectedId],
  );

  const loadList = useCallback(async () => {
    if (!db) return;
    const { data, error } = await db.rpc("list_staff_unified_inbox");
    if (error) {
      logger.warn("app inbox list failed; showing WhatsApp only", {
        tags: { hook: "useAppInboxOverlay", op: "list" },
        extra: { message: error.message },
      });
      return;
    }
    setUnified((data as UnifiedInboxRow[] | null) ?? []);
  }, [db]);

  const loadThread = useCallback(async (conversationId: string | null | undefined) => {
    if (!db || !conversationId) return;
    const row = merged.find((item) => item.id === conversationId);
    const humanId = row?.human_id ?? null;
    const whatsappId = isAppThreadId(conversationId) ? null : conversationId;
    if (!humanId && !whatsappId) return;
    const { data, error } = await db.rpc("list_staff_unified_thread", {
      p_human_id: humanId,
      p_whatsapp_conversation_id: whatsappId,
    });
    if (error) {
      logger.warn("app inbox thread failed", {
        tags: { hook: "useAppInboxOverlay", op: "thread" },
        extra: { message: error.message },
      });
      if (isAppThreadId(conversationId)) setThreadError("Couldn't load this conversation.");
      return;
    }
    setThreadError(null);
    setThread(((data as UnifiedThreadMessage[] | null) ?? []).map(toInboxMessage));
    setThreadFor(conversationId);
  }, [db, merged]);

  const loadListRef = useRef(loadList);
  const loadThreadRef = useRef(loadThread);
  loadListRef.current = loadList;
  loadThreadRef.current = loadThread;

  useEffect(() => {
    if (!active) return undefined;
    void loadList();
    return undefined;
  }, [active, loadList]);

  useEffect(() => {
    if (!active) return undefined;
    setThread(null);
    setThreadFor(null);
    setThreadError(null);
    void loadThread(selectedId);
    return undefined;
  }, [active, selectedId, loadThread]);

  useEffect(() => {
    if (!active || !db) return undefined;
    const appConversationId = parseAppThreadId(selectedId) ?? selectedRow?.app_conversation_id ?? null;
    if (!appConversationId) return undefined;
    void db.rpc("mark_app_messages_read", { p_conversation_id: appConversationId });
    return undefined;
  }, [active, db, selectedId, selectedRow?.app_conversation_id]);

  useEffect(() => {
    if (!active || !db) return undefined;
    let channel: OverlayChannel;
    try {
      channel = db.channel(uniqueChannelName(CHANNELS.appInbox));
      channel
        .on("postgres_changes", { event: "*", schema: "public", table: "app_messages" }, () => {
          void loadListRef.current();
          void loadThreadRef.current(selectedId);
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "app_conversations" }, () => {
          void loadListRef.current();
        })
        .subscribe();
    } catch (err) {
      logger.warn("app inbox realtime failed", {
        tags: { hook: "useAppInboxOverlay", op: "realtime" },
        extra: { message: err instanceof Error ? err.message : String(err) },
      });
      return undefined;
    }
    return () => {
      db.removeChannel(channel);
    };
  }, [active, db, selectedId]);

  const shownMessages = active && thread && threadFor === selectedId ? thread as unknown as M[] : messages;
  const appOnly = isAppThreadId(selectedId) || selectedRow?.channel === "app";
  const replyChannel = !active
    ? null
    : appOnly || (threadFor === selectedId && replyChannelForMessages(shownMessages as InboxMessage[]) === "app")
      ? "app"
      : null;
  const replyNote = replyChannel === "app"
    ? "This reply goes to their app, not WhatsApp."
    : active && threadFor === selectedId && selectedRow?.channels?.includes("app")
      ? "This reply goes on WhatsApp."
      : null;

  const refresh = useCallback(() => {
    void loadList();
    void loadThread(selectedId);
  }, [loadList, loadThread, selectedId]);

  const sendAppReply = useCallback(async ({ text }: { text?: string | null } = {}) => {
    if (!db) return { ok: false, reason: "Not connected" };
    const result = await sendAppReplyWithClient(db, selectedRow?.human_id, text);
    if (result.ok) {
      await loadThread(selectedId);
      await loadList();
    }
    return result;
  }, [db, selectedRow?.human_id, loadThread, selectedId, loadList]);

  if (!active) {
    return {
      conversations,
      messages,
      selectedConversation: null as C | null,
      replyChannel: null as "app" | null,
      replyNote: null as string | null,
      loadingThread: false,
      threadError: null as string | null,
      sendAppReply,
      refresh,
    };
  }

  return {
    conversations: merged,
    messages: shownMessages,
    selectedConversation: selectedRow,
    replyChannel,
    replyNote,
    loadingThread: Boolean(appOnly && threadFor !== selectedId && !threadError),
    threadError: appOnly ? threadError : null,
    sendAppReply,
    refresh,
  };
}

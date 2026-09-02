/**
 * inboxFetchers — the two reads behind the staff WhatsApp inbox (Debt 6;
 * split out of useWhatsAppInbox.ts). The hook owns the fetch/subscribe
 * lifecycle and state; these own the queries and the one narrowing cast
 * at the boundary.
 */
import type { supabase } from "../../client";
import { logger } from "../../../lib/logger";
import { latestMessagesChronological, mergeFailedMessageFlags } from "./inboxListHelpers";
import type { ConversationDetail, ConversationListRow, InboxConversation } from "./inboxTypes";

/** The connected client (the hook throws "Not connected" before calling in without one). */
export type Client = NonNullable<typeof supabase>;

export async function fetchConversationsList(
  client: Client,
  { includeBookingWorkspaceData = false }: { includeBookingWorkspaceData?: boolean } = {},
): Promise<InboxConversation[]> {
  // We denormalise unread_count, last_customer_text, last_inbound_at
  // onto the conversation row specifically so this query is cheap.
  const humanSelection = includeBookingWorkspaceData
    ? "humans:human_id ( name, surname, dogs ( id, name, breed, size ) )"
    : "humans:human_id ( name, surname )";
  const draftSelection = includeBookingWorkspaceData
    ? "whatsapp_drafts ( id, state, intent, risk_level, handoff_required, created_at )"
    : "whatsapp_drafts ( id, state, risk_level, handoff_required )";
  const bookingActionSelection = includeBookingWorkspaceData
    ? "whatsapp_booking_actions ( id, state, action, payload, created_at )"
    : "whatsapp_booking_actions ( id, state )";
  // Widened to `string` on purpose: with the literal template the typed
  // client tries to parse three ternary-dependent embeds and gives up
  // ("union type too complex"); the result is narrowed once below.
  const selectColumns: string = `
      id,
      phone_e164,
      channel,
      state,
      human_id,
      last_inbound_at,
      last_outbound_at,
      last_customer_text,
      last_message_text,
      last_message_direction,
      last_message_at,
      unread_count,
      auto_send_enabled,
      autonomous_booking_enabled,
      ${includeBookingWorkspaceData ? "agent_state," : ""}
      lead_status,
      lead_payload,
      closed_at,
      closed_by,
      closure_reason,
      closure_suggested_at,
      closure_suggested_reason,
      notes,
      ${humanSelection},
      ${draftSelection},
      ${bookingActionSelection}
      `;
  const { data, error } = await client
    .from("whatsapp_conversations")
    .select(selectColumns)
    // Sort by the same "last activity" value the row now displays
    // (last message in either direction), falling back to last_inbound_at
    // for any row not yet backfilled.
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("last_inbound_at", { ascending: false, nullsFirst: false })
    .limit(200);

  if (error) throw error;

  // Fold "has a pending draft" into a boolean so the list item can
  // render a badge without keeping the draft array around.
  // Also surface a "needs_human_review" flag when any pending draft on
  // the conversation is high-risk or has handoff_required set, so the
  // list view can pin those to the top with a red marker.
  // The template-string select above is opaque to the typed client, so
  // narrow once here to the row shape it actually returns.
  const rows = (data ?? []) as unknown as ConversationListRow[];
  const list = rows.map((c) => {
    const pendingDrafts = Array.isArray(c.whatsapp_drafts)
      ? c.whatsapp_drafts.filter((d) => d.state === "pending")
      : [];
    const pendingBookingActions = Array.isArray(c.whatsapp_booking_actions)
      ? c.whatsapp_booking_actions.filter((a) => a.state === "pending")
      : [];
    const newestFirst = (a: { created_at?: string | null }, b: { created_at?: string | null }) =>
      String(b?.created_at || "").localeCompare(String(a?.created_at || ""));
    return {
      ...c,
      has_pending_draft: pendingDrafts.length > 0,
      pending_draft: [...pendingDrafts].sort(newestFirst)[0] ?? null,
      has_pending_booking_action: pendingBookingActions.length > 0,
      pending_booking_action:
        [...pendingBookingActions].sort(newestFirst)[0] ?? null,
      needs_human_review: pendingDrafts.some(
        (d) => d.handoff_required === true || d.risk_level === "high",
      ),
    };
  });

  if (list.length === 0) return mergeFailedMessageFlags(list, []);

  const { data: failedMessages, error: failedError } = await client
    .from("whatsapp_messages")
    .select("id, conversation_id, error_message, sent_at")
    .in("conversation_id", list.map((c) => c.id))
    .eq("direction", "outbound")
    .eq("status", "failed")
    .order("sent_at", { ascending: false })
    .limit(500);

  if (failedError) {
    logger.warn("useWhatsAppInbox failed-message lookup failed", {
      tags: { hook: "useWhatsAppInbox", op: "fetchFailedMessages" },
      extra: { message: failedError.message },
    });
    return mergeFailedMessageFlags(list, []);
  }

  return mergeFailedMessageFlags(list, failedMessages ?? []);
}

export async function fetchConversationDetail(
  client: Client,
  conversationId: string,
  signal: AbortSignal,
): Promise<ConversationDetail> {
  const [messagesRes, draftRes, bookingActionsRes] = await Promise.all([
    client
      .from("whatsapp_messages")
      .select("id, direction, content, sent_at, status, error_message, meta_message_id, channel, reaction_emoji, in_reply_to_meta_id, media_path, media_mime")
      .eq("conversation_id", conversationId)
      .order("sent_at", { ascending: false })
      .limit(200)
      .abortSignal(signal),
    client
      .from("whatsapp_drafts")
      .select(
        "id, proposed_text, intent, confidence, state, created_at, tokens_input, tokens_output, model, risk_level, handoff_required, auto_send_eligible",
      )
      .eq("conversation_id", conversationId)
      .eq("state", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .abortSignal(signal)
      .maybeSingle(),
    client
      .from("whatsapp_booking_actions")
      .select("id, draft_id, action, payload, target_booking_id, state, rejection_reason, applied_booking_id, applied_at, error_message, created_at")
      .eq("conversation_id", conversationId)
      // Include applied + auto_applied so the thread can render inline
      // "Booking created" cards (task 5 of the May 2026 review pass).
      // BookingActionPanel pre-filters to state='pending' so it only
      // renders the queue waiting on staff approval.
      .in("state", ["pending", "applied", "auto_applied"])
      .order("created_at", { ascending: false })
      .limit(50)
      .abortSignal(signal),
  ]);

  if (messagesRes.error) throw messagesRes.error;
  // draftRes can return PGRST116 if maybeSingle found nothing — swallow
  if (draftRes.error && draftRes.error.code !== "PGRST116") throw draftRes.error;
  if (bookingActionsRes.error) throw bookingActionsRes.error;

  return {
    messages: latestMessagesChronological(messagesRes.data),
    draft: draftRes.data ?? null,
    bookingActions: bookingActionsRes.data ?? [],
  };
}

/**
 * In-app messages beside WhatsApp.
 *
 * The database functions in migration 20261122170000 are the authority.
 * This module is the staff inbox's read model: fold those rows onto the
 * WhatsApp list, decide which channel a reply uses, and call send_app_message.
 * It does not run unless VITE_APP_INBOX_ENABLED=1.
 */
import type { InboxMessage } from "./hooks/inbox/inboxTypes";

export const APP_THREAD_PREFIX = "app:";

export function appThreadId(appConversationId: string): string {
  return `${APP_THREAD_PREFIX}${appConversationId}`;
}

export function parseAppThreadId(id: string | null | undefined): string | null {
  if (!id?.startsWith(APP_THREAD_PREFIX)) return null;
  const rest = id.slice(APP_THREAD_PREFIX.length);
  return rest || null;
}

export function isAppThreadId(id: string | null | undefined): boolean {
  return parseAppThreadId(id) !== null;
}

export interface UnifiedInboxRow {
  thread_key: string;
  human_id: string | null;
  whatsapp_conversation_id: string | null;
  app_conversation_id: string | null;
  channels: string[] | null;
  last_channel: string | null;
  last_message_at: string | null;
  last_message_text: string | null;
  last_message_direction: string | null;
  staff_unread_count: number | null;
  phone_e164: string | null;
  customer_name: string | null;
  customer_surname: string | null;
  app_unread_count?: number | null;
}

export interface UnifiedThreadMessage {
  id: string;
  channel: string;
  direction: string;
  body: string | null;
  sent_at: string;
  status: string | null;
  sender: string;
  staff_user_id: string | null;
  error_message: string | null;
  reaction_emoji: string | null;
  media_path: string | null;
  media_mime: string | null;
  meta_message_id: string | null;
  in_reply_to_meta_id: string | null;
}

interface MergeConversation {
  id: string;
  human_id?: string | null;
  channel?: string | null;
  channels?: string[] | null;
  app_conversation_id?: string | null;
  reply_channel?: string | null;
  phone_e164?: string | null;
  unread_count?: number | null;
  last_message_at?: string | null;
  last_message_text?: string | null;
  last_message_direction?: string | null;
  last_customer_text?: string | null;
  last_inbound_at?: string | null;
  last_outbound_at?: string | null;
  humans?: { name?: string | null; surname?: string | null } | null;
  closed_at?: string | null;
  has_pending_draft?: boolean | null;
  has_failed_message?: boolean | null;
  has_pending_booking_action?: boolean | null;
  needs_human_review?: boolean | null;
  whatsapp_drafts?: unknown[] | null;
  whatsapp_booking_actions?: unknown[] | null;
}

/** The WhatsApp row plus the app fields the merge writes, so callers can read both. */
export type MergedInboxRow<T> = T & Pick<
  MergeConversation,
  | "channels"
  | "app_conversation_id"
  | "reply_channel"
  | "last_customer_text"
  | "humans"
  | "has_pending_draft"
  | "whatsapp_drafts"
>;

function activityAt(row: {
  last_message_at?: string | null;
  last_inbound_at?: string | null;
  last_outbound_at?: string | null;
}): string {
  return row.last_message_at || row.last_inbound_at || row.last_outbound_at || "";
}

function appIsLatest(waAt: string, unifiedAt: string | null): boolean {
  return Boolean(unifiedAt && (!waAt || unifiedAt > waAt));
}

function decorate<T extends MergeConversation>(wa: T, unified: UnifiedInboxRow): T {
  const waAt = activityAt(wa);
  const latest = appIsLatest(waAt, unified.last_message_at);
  const appUnread = unified.app_unread_count ?? 0;
  const next: T = {
    ...wa,
    channels: unified.channels ?? [],
    app_conversation_id: unified.app_conversation_id,
    reply_channel: unified.last_channel,
    // Keep this row's own live WhatsApp unread and add only the app unread.
    // A folded sibling keeps its own badge, so a stale sum cannot hide a
    // message that arrived after the unified list was fetched.
    unread_count: (wa.unread_count ?? 0) + appUnread,
  };
  if (
    wa.closed_at
    && unified.app_conversation_id
    && unified.last_message_at
    && unified.last_message_at > wa.closed_at
  ) {
    next.closed_at = null;
  }
  if (!latest) return next;
  next.last_message_at = unified.last_message_at;
  next.last_message_text = unified.last_message_text;
  next.last_message_direction = unified.last_message_direction;
  if (unified.last_message_direction === "inbound") {
    next.last_inbound_at = unified.last_message_at;
    next.last_customer_text = unified.last_message_text;
  } else if (unified.last_message_direction === "outbound") {
    next.last_outbound_at = unified.last_message_at;
  }
  return next;
}

function syntheticAppThread(unified: UnifiedInboxRow): MergeConversation {
  const inbound = unified.last_message_direction === "inbound";
  return {
    id: appThreadId(unified.app_conversation_id || unified.thread_key),
    human_id: unified.human_id,
    channel: "app",
    channels: unified.channels ?? ["app"],
    app_conversation_id: unified.app_conversation_id,
    reply_channel: "app",
    phone_e164: unified.phone_e164,
    unread_count: unified.staff_unread_count ?? 0,
    last_message_at: unified.last_message_at,
    last_message_text: unified.last_message_text,
    last_message_direction: unified.last_message_direction,
    last_customer_text: inbound ? unified.last_message_text : null,
    last_inbound_at: inbound ? unified.last_message_at : null,
    last_outbound_at: inbound ? null : unified.last_message_at,
    humans: unified.customer_name
      ? { name: unified.customer_name, surname: unified.customer_surname }
      : null,
    closed_at: null,
    has_pending_draft: false,
    has_failed_message: false,
    has_pending_booking_action: false,
    needs_human_review: false,
    whatsapp_drafts: [],
    whatsapp_booking_actions: [],
    state: "human_takeover",
    auto_send_enabled: false,
    notes: null,
  } as MergeConversation;
}

function needsItsOwnRow(row: MergeConversation): boolean {
  return Boolean(
    (row.unread_count ?? 0) > 0
    || row.has_pending_draft
    || row.has_failed_message
    || row.has_pending_booking_action
    || row.needs_human_review
  );
}

/**
 * One row per customer when every extra WhatsApp/SMS row is quiet.
 * A row with unread messages, a draft, a failed send or a booking proposal
 * stays on its own so staff can open the conversation that owns that work.
 * App-only customers are added. Anything the merge did not mention is kept.
 */
export function applyUnifiedInbox<T extends MergeConversation>(
  whatsappConversations: readonly T[],
  unifiedRows: readonly UnifiedInboxRow[],
): MergedInboxRow<T>[] {
  const byWaId = new Map(whatsappConversations.map((row) => [row.id, row]));
  const usedWa = new Set<string>();
  const merged: MergedInboxRow<T>[] = [];

  for (const unified of unifiedRows) {
    const wa = unified.whatsapp_conversation_id
      ? byWaId.get(unified.whatsapp_conversation_id)
      : undefined;
    if (wa) {
      usedWa.add(wa.id);
      merged.push(decorate(wa, unified));
      continue;
    }
    if (unified.app_conversation_id && !unified.whatsapp_conversation_id) {
      merged.push(syntheticAppThread(unified) as T);
      continue;
    }
    if (unified.whatsapp_conversation_id) {
      merged.push(syntheticAppThread({
        ...unified,
        channels: unified.channels ?? ["whatsapp"],
      }) as T);
      (merged[merged.length - 1] as MergeConversation).id = unified.whatsapp_conversation_id;
      (merged[merged.length - 1] as MergeConversation).channel = unified.last_channel ?? "whatsapp";
    }
  }

  const representedHumans = new Set(
    merged.map((row) => row.human_id).filter((id): id is string => Boolean(id)),
  );
  for (const wa of whatsappConversations) {
    if (usedWa.has(wa.id)) continue;
    // A quiet extra WhatsApp/SMS row is folded into the customer's thread.
    // One that still has unread messages, a draft, a failed send or a booking
    // proposal stays, so staff can open the conversation that owns that work.
    if (wa.human_id && representedHumans.has(wa.human_id) && !needsItsOwnRow(wa)) continue;
    merged.push(wa);
  }

  merged.sort((a, b) => activityAt(b).localeCompare(activityAt(a)));
  return merged;
}

const KNOWN_CHANNELS = new Set(["app", "whatsapp", "sms"]);

export function replyChannelForMessages(
  messages: readonly { channel?: string | null; direction?: string | null; sent_at?: string | null }[],
): "app" | "whatsapp" | "sms" | null {
  const sorted = [...messages]
    .filter((message) => message.sent_at)
    .sort((a, b) => String(a.sent_at).localeCompare(String(b.sent_at)));
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    const channel = sorted[i].channel;
    if (sorted[i].direction === "inbound" && channel && KNOWN_CHANNELS.has(channel)) {
      return channel as "app" | "whatsapp" | "sms";
    }
  }
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    const channel = sorted[i].channel;
    if (channel && KNOWN_CHANNELS.has(channel)) return channel as "app" | "whatsapp" | "sms";
  }
  return null;
}

const CHANNEL_MARKER_LABELS: Record<string, string> = {
  whatsapp: "WhatsApp",
  sms: "SMS",
  app: "App",
};

/** A list chip only when the app is part of the thread, so WhatsApp-only rows stay as they are. */
export function channelMarkerLabel(channels: readonly string[] | null | undefined): string | null {
  if (!channels?.includes("app")) return null;
  return channels.map((channel) => CHANNEL_MARKER_LABELS[channel] ?? channel).join(" · ");
}

export function toInboxMessage(row: UnifiedThreadMessage): InboxMessage {
  return {
    id: row.id,
    direction: row.direction,
    content: row.body,
    sent_at: row.sent_at,
    status: row.status ?? "sent",
    error_message: row.error_message,
    meta_message_id: row.meta_message_id,
    channel: row.channel,
    reaction_emoji: row.reaction_emoji,
    in_reply_to_meta_id: row.in_reply_to_meta_id,
    media_path: row.media_path,
    media_mime: row.media_mime,
  };
}

const SEND_REASONS: Record<string, string> = {
  empty_message: "Write a message before sending.",
  message_too_long: "That message is too long. Keep it under 2,000 characters.",
  human_required: "Choose a customer before sending.",
  human_not_found: "That customer could not be found.",
  no_linked_human: "This account is not linked to a customer.",
  account_archived: "This customer is archived.",
  not_authenticated: "Sign in again, then send.",
  not_staff: "Only staff can send this.",
  not_found: "That conversation could not be found.",
};

export function plainAppSendError(message: string): string {
  const trimmed = message.trim();
  if (SEND_REASONS[trimmed]) return SEND_REASONS[trimmed];
  const tail = trimmed.split(/[:\s]/).filter(Boolean).pop() ?? "";
  if (SEND_REASONS[tail]) return SEND_REASONS[tail];
  return trimmed || "Send failed";
}

export interface AppSendResult {
  ok: boolean;
  reason?: string;
}

export async function sendAppReplyWithClient(
  client: { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ error: { message: string } | null }> },
  humanId: string | null | undefined,
  text: string | null | undefined,
): Promise<AppSendResult> {
  const trimmed = typeof text === "string" ? text.trim() : "";
  if (!humanId) return { ok: false, reason: "Choose a customer before sending." };
  if (!trimmed) return { ok: false, reason: "Write a message before sending." };
  try {
    const { error } = await client.rpc("send_app_message", {
      p_body: trimmed,
      p_human_id: humanId,
    });
    if (error) return { ok: false, reason: plainAppSendError(error.message) };
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "Send failed" };
  }
}

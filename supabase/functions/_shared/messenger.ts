// Pure Messenger inbox rules. No Supabase client, no fetch, no secrets.
//
// WhatsApp, SMS and email stay keyed by (phone_e164, channel). Messenger
// has a page-scoped id instead of a phone, so nothing in this file invents
// a phone number or matches one. The AI may draft; it must never auto-send
// and must never use the HUMAN_AGENT tag.

export const MESSENGER_CHANNEL = "messenger";
export const MESSENGER_STANDARD_WINDOW_MS = 24 * 60 * 60 * 1000;
export const MESSENGER_HUMAN_AGENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
/** Meta's Send API text must be UTF-8 and under 2,000 characters. */
export const MESSENGER_MAX_TEXT_LENGTH = 2000;
export const MESSENGER_GRAPH_VERSION = "v22.0";

export type MessengerSender = "staff" | "ai";

export function messengerFlagEnabled(value: string | undefined | null): boolean {
  return (value ?? "").trim().toLowerCase() === "true";
}

/** whatsapp-send speaks the WhatsApp Cloud API. Messenger must not go through it. */
export function whatsappCloudSendAllowed(channel: string | null | undefined): boolean {
  return channel !== MESSENGER_CHANNEL;
}

/**
 * Ceiling for the booking agent on this channel. Callers may create a draft
 * for staff to approve. They must not auto-send, and they must not attach
 * HUMAN_AGENT — that tag is human-typed only, and it is not approved yet.
 */
export function messengerAgentPolicy(): {
  draftOnly: true;
  autoSend: false;
  humanAgent: false;
} {
  return { draftOnly: true, autoSend: false, humanAgent: false };
}

export interface MessengerWindowInput {
  lastInboundAt: string | null | undefined;
  nowMs: number;
  humanAgentEnabled: boolean;
  sender: MessengerSender;
}

export interface MessengerWindowDecision {
  mode: "standard" | "human_agent" | "closed";
  remainingMs: number;
  /** "Reply window closes in 3h 4m", or null once the window has closed. */
  label: string | null;
}

export function formatReplyWindow(remainingMs: number): string | null {
  if (remainingMs <= 0) return null;
  const hours = Math.floor(remainingMs / 3_600_000);
  const mins = Math.floor((remainingMs % 3_600_000) / 60_000);
  if (hours === 0 && mins === 0) return "Reply window closes in under a minute";
  if (hours >= 1) return `Reply window closes in ${hours}h ${mins}m`;
  return `Reply window closes in ${mins}m`;
}

/**
 * Standard replies use messaging_type RESPONSE for 24 hours after the
 * customer's last message. The 7-day HUMAN_AGENT tag is offered only when
 * the flag is on AND the sender is a person. The AI always falls through
 * to closed once the 24-hour window has ended, even if the flag is on.
 */
export function decideMessengerWindow(input: MessengerWindowInput): MessengerWindowDecision {
  const at = input.lastInboundAt ? new Date(input.lastInboundAt).getTime() : Number.NaN;
  if (!Number.isFinite(at)) return { mode: "closed", remainingMs: 0, label: null };
  const age = Math.max(0, input.nowMs - at);
  const standardRemaining = MESSENGER_STANDARD_WINDOW_MS - age;
  if (standardRemaining > 0) {
    return {
      mode: "standard",
      remainingMs: standardRemaining,
      label: formatReplyWindow(standardRemaining),
    };
  }
  const humanRemaining = MESSENGER_HUMAN_AGENT_WINDOW_MS - age;
  if (input.sender === "staff" && input.humanAgentEnabled && humanRemaining > 0) {
    return {
      mode: "human_agent",
      remainingMs: humanRemaining,
      label: formatReplyWindow(humanRemaining),
    };
  }
  return { mode: "closed", remainingMs: 0, label: null };
}

export type MessengerGraphResult =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; status: number; error: string; detail: string };

export function buildMessengerGraphBody(args: {
  psid: string;
  text: string;
  decision: MessengerWindowDecision;
  sender: MessengerSender;
}): MessengerGraphResult {
  const text = args.text.trim();
  if (!text) {
    return { ok: false, status: 400, error: "empty message", detail: "Write a message before sending." };
  }
  if ([...text].length > MESSENGER_MAX_TEXT_LENGTH) {
    return {
      ok: false,
      status: 400,
      error: "message too long",
      detail: `Messenger text is limited to ${MESSENGER_MAX_TEXT_LENGTH} characters.`,
    };
  }
  if (args.decision.mode === "closed" || !args.psid) {
    return {
      ok: false,
      status: 422,
      error: "reply window closed",
      detail:
        "The 24-hour Messenger reply window has closed. Meta only allows a standard reply within 24 hours of the customer's last message.",
    };
  }
  if (args.decision.mode === "human_agent") {
    if (args.sender !== "staff") {
      return {
        ok: false,
        status: 422,
        error: "human agent refused",
        detail: "The AI must never use the HUMAN_AGENT tag.",
      };
    }
    return {
      ok: true,
      body: {
        recipient: { id: args.psid },
        messaging_type: "MESSAGE_TAG",
        tag: "HUMAN_AGENT",
        message: { text },
      },
    };
  }
  return {
    ok: true,
    body: {
      recipient: { id: args.psid },
      messaging_type: "RESPONSE",
      message: { text },
    },
  };
}

/** Token stays in the Authorization header. It must never be part of the URL. */
export function messengerSendUrl(pageId: string, version = MESSENGER_GRAPH_VERSION): string {
  return `https://graph.facebook.com/${version}/${encodeURIComponent(pageId)}/messages`;
}

export function redactSecret(text: string, secret: string): string {
  if (!secret) return text;
  return text.split(secret).join("[redacted]");
}

export interface MessengerAttachment {
  type: string;
  url: string | null;
}

export type MessengerIngress =
  | {
    kind: "inbound";
    pageId: string;
    psid: string;
    mid: string;
    text: string;
    attachments: MessengerAttachment[];
    sentAt: string;
  }
  | {
    kind: "echo";
    pageId: string;
    psid: string;
    mid: string;
    text: string;
    sentAt: string;
  }
  | {
    kind: "delivery";
    pageId: string;
    psid: string;
    mids: string[];
    at: string;
  }
  | {
    kind: "read";
    pageId: string;
    psid: string;
    watermark: string;
  };

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function textOf(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Messenger timestamps are milliseconds. A seconds value is still accepted. */
export function messengerTimeIso(value: unknown, fallbackMs: number): string {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return new Date(fallbackMs).toISOString();
  const ms = n > 10_000_000_000 ? n : n * 1000;
  return new Date(ms).toISOString();
}

function attachmentLabel(type: string): string {
  if (type === "image") return "[image]";
  if (type === "video") return "[video]";
  if (type === "audio") return "[audio]";
  if (type === "file") return "[file]";
  return "[attachment]";
}

function readAttachments(message: Record<string, unknown>): MessengerAttachment[] {
  if (!Array.isArray(message.attachments)) return [];
  const out: MessengerAttachment[] = [];
  for (const item of message.attachments) {
    const row = record(item);
    if (!row) continue;
    const type = textOf(row.type) ?? "attachment";
    const payload = record(row.payload);
    out.push({ type, url: payload ? textOf(payload.url) : null });
  }
  return out;
}

function messageBody(message: Record<string, unknown>, attachments: MessengerAttachment[]): string {
  const text = textOf(message.text) ?? "";
  if (text) return text;
  if (attachments.length === 0) return "";
  return attachments.map((item) => attachmentLabel(item.type)).join(" ");
}

/**
 * Page webhook → ingress actions. A WhatsApp payload (object
 * whatsapp_business_account) parses to nothing, so this URL cannot
 * create a phone conversation. Echoes are outbound, keyed by mid, so a
 * reply we already stored and a Business Suite echo of the same mid
 * collapse to one row.
 */
export function parseMessengerWebhook(body: unknown, nowMs: number): MessengerIngress[] {
  const root = record(body);
  if (!root || root.object !== "page" || !Array.isArray(root.entry)) return [];
  const events: MessengerIngress[] = [];
  for (const entryValue of root.entry) {
    const entry = record(entryValue);
    if (!entry || !Array.isArray(entry.messaging)) continue;
    const entryPageId = textOf(entry.id);
    for (const itemValue of entry.messaging) {
      const item = record(itemValue);
      if (!item) continue;
      const sender = textOf(record(item.sender)?.id);
      const recipient = textOf(record(item.recipient)?.id);
      const sentAt = messengerTimeIso(item.timestamp, nowMs);
      const messagePreview = record(item.message);
      const echoLikely = messagePreview?.is_echo === true;
      const pageId = entryPageId ?? (echoLikely ? sender : recipient);
      if (!pageId || !sender || !recipient) continue;
      const psid = sender === pageId ? recipient : sender;
      if (!psid || psid === pageId) continue;

      const read = record(item.read);
      if (read && read.watermark != null) {
        events.push({
          kind: "read",
          pageId,
          psid,
          watermark: messengerTimeIso(read.watermark, nowMs),
        });
        continue;
      }
      const delivery = record(item.delivery);
      if (delivery) {
        const mids = Array.isArray(delivery.mids)
          ? delivery.mids.filter((mid): mid is string => typeof mid === "string" && mid.length > 0)
          : [];
        events.push({ kind: "delivery", pageId, psid, mids, at: messengerTimeIso(delivery.watermark, nowMs) });
        continue;
      }
      const postback = record(item.postback);
      if (postback) {
        const title = textOf(postback.title) ?? textOf(postback.payload) ?? "[postback]";
        const mid = textOf(postback.mid) ?? `postback:${psid}:${sentAt}`;
        events.push({
          kind: "inbound",
          pageId,
          psid,
          mid,
          text: title,
          attachments: [],
          sentAt,
        });
        continue;
      }
      const message = record(item.message);
      if (!message) continue;
      const attachments = readAttachments(message);
      const text = messageBody(message, attachments);
      const mid = textOf(message.mid);
      if (!mid || !text) continue;
      const echo = message.is_echo === true || sender === pageId;
      events.push(echo
        ? { kind: "echo", pageId, psid, mid, text, sentAt }
        : { kind: "inbound", pageId, psid, mid, text, attachments, sentAt });
    }
  }
  return events;
}

export function filterToConfiguredPage(
  events: MessengerIngress[],
  configuredPageId: string | null | undefined,
): MessengerIngress[] {
  const pageId = textOf(configuredPageId ?? null);
  if (!pageId) return events;
  return events.filter((event) => event.pageId === pageId);
}

export interface StoredConversation {
  id: string;
  human_id: string | null;
}

export interface MessengerMessageInsert {
  conversationId: string;
  direction: "inbound" | "outbound";
  mid: string;
  content: string;
  sentAt: string;
  status: "delivered" | "sent";
  raw: Record<string, unknown>;
}

/** The writes the webhook performs. Implementations must treat a repeated mid as one row. */
export interface MessengerStore {
  findIdentityHumanId(pageId: string, psid: string): Promise<string | null>;
  findConversation(pageId: string, psid: string): Promise<StoredConversation | null>;
  insertConversation(row: {
    pageId: string;
    psid: string;
    humanId: string | null;
    lastInboundAt: string | null;
    lastCustomerText: string | null;
  }): Promise<StoredConversation>;
  noteInbound(
    id: string,
    lastInboundAt: string,
    lastCustomerText: string,
    humanIdToFill: string | null,
  ): Promise<void>;
  hasMessage(direction: "inbound" | "outbound", mid: string): Promise<boolean>;
  insertMessage(row: MessengerMessageInsert): Promise<"inserted" | "duplicate">;
  noteOutbound(conversationId: string, sentAt: string): Promise<void>;
  markDelivered(mids: string[], atIso: string): Promise<void>;
  markReadBefore(conversationId: string, watermarkIso: string): Promise<void>;
}

export interface IngressApplyResult {
  inserted: number;
  duplicates: number;
  statusUpdates: number;
}

async function ensureConversation(
  store: MessengerStore,
  pageId: string,
  psid: string,
  inbound: { at: string; text: string } | null,
): Promise<StoredConversation> {
  const existing = await store.findConversation(pageId, psid);
  const linked = await store.findIdentityHumanId(pageId, psid);
  if (!existing) {
    try {
      return await store.insertConversation({
        pageId,
        psid,
        humanId: linked,
        lastInboundAt: inbound?.at ?? null,
        lastCustomerText: inbound?.text ?? null,
      });
    } catch (err) {
      const raced = await store.findConversation(pageId, psid);
      if (raced) return raced;
      throw err;
    }
  }
  if (inbound) {
    await store.noteInbound(existing.id, inbound.at, inbound.text, existing.human_id ? null : linked);
  }
  return existing;
}

/** Apply a parsed webhook. Echoes and redeliveries insert once. */
export async function applyMessengerIngress(
  store: MessengerStore,
  events: MessengerIngress[],
): Promise<IngressApplyResult> {
  const result: IngressApplyResult = { inserted: 0, duplicates: 0, statusUpdates: 0 };
  for (const event of events) {
    if (event.kind === "inbound") {
      const conversation = await ensureConversation(store, event.pageId, event.psid, {
        at: event.sentAt,
        text: event.text,
      });
      if (await store.hasMessage("inbound", event.mid)) {
        result.duplicates += 1;
        continue;
      }
      const written = await store.insertMessage({
        conversationId: conversation.id,
        direction: "inbound",
        mid: event.mid,
        content: event.text,
        sentAt: event.sentAt,
        status: "delivered",
        raw: { source: "messenger", attachments: event.attachments },
      });
      if (written === "duplicate") result.duplicates += 1;
      else result.inserted += 1;
      continue;
    }
    if (event.kind === "echo") {
      const conversation = await ensureConversation(store, event.pageId, event.psid, null);
      if (await store.hasMessage("outbound", event.mid)) {
        result.duplicates += 1;
        continue;
      }
      const written = await store.insertMessage({
        conversationId: conversation.id,
        direction: "outbound",
        mid: event.mid,
        content: event.text,
        sentAt: event.sentAt,
        status: "sent",
        raw: { source: "message_echo" },
      });
      if (written === "duplicate") {
        result.duplicates += 1;
        continue;
      }
      result.inserted += 1;
      await store.noteOutbound(conversation.id, event.sentAt);
      continue;
    }
    const conversation = await store.findConversation(event.pageId, event.psid);
    if (!conversation) continue;
    if (event.kind === "delivery") {
      if (event.mids.length > 0) await store.markDelivered(event.mids, event.at);
      result.statusUpdates += 1;
      continue;
    }
    await store.markReadBefore(conversation.id, event.watermark);
    result.statusUpdates += 1;
  }
  return result;
}

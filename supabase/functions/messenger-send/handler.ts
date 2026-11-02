// Staff replies, approved drafts, and "link to customer" for Messenger.
//
// There is no internal-secret path. The booking agent cannot call this
// function, and an approved draft is sent as the AI (RESPONSE only, never
// HUMAN_AGENT). HUMAN_AGENT is staff-typed text, and only when
// MESSENGER_HUMAN_AGENT_ENABLED is exactly "true" (default off).
//
// META_PAGE_ACCESS_TOKEN is sent as an Authorization header and redacted
// from logs. It is never written to the URL or the database.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildAllowedOrigins, buildCorsHeaders } from "../_shared/cors.ts";
import {
  buildMessengerGraphBody,
  decideMessengerWindow,
  messengerAgentPolicy,
  messengerFlagEnabled,
  messengerSendUrl,
  redactSecret,
  type MessengerSender,
} from "../_shared/messenger.ts";

const ALLOWED_ORIGINS = buildAllowedOrigins("MESSENGER_SEND_ALLOWED_ORIGINS");
const corsFor = (req: Request) => buildCorsHeaders(req, ALLOWED_ORIGINS);

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsFor(req), "Content-Type": "application/json" },
  });
}

export interface GraphPostResult {
  ok: boolean;
  messageId?: string | null;
  error?: string;
}

export async function postMessengerGraph(
  url: string,
  token: string,
  body: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch,
): Promise<GraphPostResult> {
  const res = await fetchImpl(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  if (!res.ok) {
    console.error(`messenger-send graph ${res.status}: ${redactSecret(raw, token).slice(0, 400)}`);
    return { ok: false, error: "Meta send failed" };
  }
  try {
    const parsed = JSON.parse(raw) as { message_id?: string };
    return { ok: true, messageId: parsed.message_id ?? null };
  } catch {
    return { ok: true, messageId: null };
  }
}

interface ConversationRow {
  id: string;
  channel: string;
  messenger_psid: string | null;
  messenger_page_id: string | null;
  last_inbound_at: string | null;
}

export interface MessengerSendOverrides {
  enabled?: boolean;
  humanAgentEnabled?: boolean;
  pageId?: string;
  pageToken?: string;
  nowMs?: number;
  authorise?: (req: Request) => Promise<
    { ok: true; userId: string } | { ok: false; reason: string; status: number }
  >;
  loadConversation?: (id: string) => Promise<ConversationRow | null>;
  loadDraft?: (id: string) => Promise<
    { id: string; conversation_id: string; proposed_text: string; state: string } | null
  >;
  postGraph?: (url: string, token: string, body: Record<string, unknown>) => Promise<GraphPostResult>;
  recordOutbound?: (row: {
    conversationId: string;
    mid: string | null;
    text: string;
    sentAt: string;
    userId: string;
  }) => Promise<void>;
  supersedeDrafts?: (conversationId: string, sentAt: string, keepDraftId?: string) => Promise<void>;
  claimDraft?: (id: string, state: string, edited: string | null, userId: string) => Promise<boolean>;
  linkCustomer?: (conversation: ConversationRow, humanId: string, userId: string) => Promise<void>;
  humanExists?: (humanId: string) => Promise<boolean>;
}

function serviceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Supabase is not configured");
  return createClient(url, key);
}

async function authoriseStaff(req: Request): Promise<
  { ok: true; userId: string } | { ok: false; reason: string; status: number }
> {
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anon) return { ok: false, reason: "not configured", status: 500 };
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return { ok: false, reason: "missing authorization", status: 401 };
  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userRes, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userRes?.user) return { ok: false, reason: "invalid token", status: 401 };
  const { data: staffCheck, error: staffErr } = await userClient.rpc("is_staff");
  if (staffErr) {
    console.error("is_staff rpc failed:", staffErr.message);
    return { ok: false, reason: "staff check failed", status: 500 };
  }
  if (!staffCheck) return { ok: false, reason: "not staff", status: 403 };
  return { ok: true, userId: userRes.user.id };
}

async function defaultLoadConversation(id: string): Promise<ConversationRow | null> {
  const { data, error } = await serviceClient()
    .from("whatsapp_conversations")
    .select("id, channel, messenger_psid, messenger_page_id, last_inbound_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ConversationRow | null) ?? null;
}

async function defaultRecordOutbound(row: {
  conversationId: string;
  mid: string | null;
  text: string;
  sentAt: string;
  userId: string;
}): Promise<void> {
  const supabase = serviceClient();
  const raw = { sent_by: "staff", message_id: row.mid };
  const { error } = await supabase.from("whatsapp_messages").insert({
    conversation_id: row.conversationId,
    direction: "outbound",
    role: "assistant",
    meta_message_id: row.mid,
    content: row.text,
    raw,
    status: "sent",
    sent_at: row.sentAt,
    channel: "messenger",
  });
  if (error && error.code !== "23505") throw new Error(error.message);
  if (error?.code === "23505" && row.mid) {
    await supabase
      .from("whatsapp_messages")
      .update({ raw })
      .eq("direction", "outbound")
      .eq("meta_message_id", row.mid);
  }
  const { error: convError } = await supabase
    .from("whatsapp_conversations")
    .update({ last_outbound_at: row.sentAt })
    .eq("id", row.conversationId);
  if (convError) throw new Error(convError.message);
}

async function defaultSupersedeDrafts(
  conversationId: string,
  sentAt: string,
  keepDraftId?: string,
): Promise<void> {
  const supabase = serviceClient();
  const { data, error } = await supabase
    .from("whatsapp_drafts")
    .select("id, tool_calls")
    .eq("conversation_id", conversationId)
    .eq("state", "pending")
    .lt("created_at", sentAt);
  if (error) throw new Error(error.message);
  const ids = ((data ?? []) as { id: string; tool_calls: Record<string, unknown> | null }[])
    .filter((row) => row.id !== keepDraftId)
    .filter((row) => String(row.tool_calls?.opt_out_acknowledgement) !== "true")
    .map((row) => row.id);
  if (ids.length === 0) return;
  const { error: updateError } = await supabase
    .from("whatsapp_drafts")
    .update({ state: "superseded", rejected_reason: "staff_replied", decided_at: sentAt })
    .in("id", ids)
    .eq("state", "pending");
  if (updateError) throw new Error(updateError.message);
}

async function sendText(
  req: Request,
  overrides: MessengerSendOverrides,
  conversation: ConversationRow,
  text: string,
  sender: MessengerSender,
  userId: string,
  keepDraftId?: string,
): Promise<Response> {
  const pageId = overrides.pageId ?? Deno.env.get("META_PAGE_ID") ?? "";
  const token = overrides.pageToken ?? Deno.env.get("META_PAGE_ACCESS_TOKEN") ?? "";
  if (!pageId || !token) {
    return json(req, { ok: false, error: "Messenger is not configured" }, 500);
  }
  if (conversation.channel !== "messenger" || !conversation.messenger_psid) {
    return json(req, { ok: false, error: "This conversation is not a Messenger thread" }, 422);
  }
  if (conversation.messenger_page_id !== pageId) {
    return json(req, { ok: false, error: "This thread belongs to a different Facebook Page" }, 422);
  }
  const humanAgentEnabled = overrides.humanAgentEnabled ??
    messengerFlagEnabled(Deno.env.get("MESSENGER_HUMAN_AGENT_ENABLED"));
  const policy = messengerAgentPolicy();
  if (policy.autoSend || policy.humanAgent || !policy.draftOnly) {
    return json(req, { ok: false, error: "Messenger agent policy refused the send" }, 500);
  }
  const decision = decideMessengerWindow({
    lastInboundAt: conversation.last_inbound_at,
    nowMs: overrides.nowMs ?? Date.now(),
    // Staff-typed only. An approved draft is sender "ai" and stays on the 24-hour window.
    humanAgentEnabled: sender === "staff" && humanAgentEnabled,
    sender,
  });
  if (sender === "ai" && decision.mode === "human_agent") {
    return json(req, { ok: false, error: "The AI must never use the HUMAN_AGENT tag." }, 422);
  }
  const graph = buildMessengerGraphBody({
    psid: conversation.messenger_psid,
    text,
    decision,
    sender,
  });
  if (!graph.ok) return json(req, { ok: false, error: graph.error, detail: graph.detail }, graph.status);
  if (sender === "ai" && "tag" in graph.body) {
    return json(req, { ok: false, error: "The AI must never use the HUMAN_AGENT tag." }, 422);
  }
  const post = overrides.postGraph ?? postMessengerGraph;
  const sent = await post(messengerSendUrl(pageId), token, graph.body);
  if (!sent.ok) return json(req, { ok: false, error: sent.error ?? "Meta send failed" }, 502);
  const sentAt = new Date(overrides.nowMs ?? Date.now()).toISOString();
  const record = overrides.recordOutbound ?? defaultRecordOutbound;
  await record({
    conversationId: conversation.id,
    mid: sent.messageId ?? null,
    text: text.trim(),
    sentAt,
    userId,
  });
  const supersede = overrides.supersedeDrafts ?? defaultSupersedeDrafts;
  await supersede(conversation.id, sentAt, keepDraftId);
  return json(req, { ok: true, meta_message_id: sent.messageId ?? null, conversation_id: conversation.id });
}

export async function handleMessengerSendRequest(
  req: Request,
  overrides: MessengerSendOverrides = {},
): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsFor(req) });
  if (req.method !== "POST") return json(req, { ok: false, error: "method not allowed" }, 405);

  const auth = overrides.authorise
    ? await overrides.authorise(req)
    : await authoriseStaff(req);
  if (!auth.ok) return json(req, { ok: false, error: auth.reason }, auth.status);

  const enabled = overrides.enabled ?? messengerFlagEnabled(Deno.env.get("MESSENGER_INBOX_ENABLED"));
  if (!enabled) {
    return json(req, { ok: false, error: "Messenger inbox is switched off" }, 403);
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return json(req, { ok: false, error: "invalid JSON" }, 400);
  }

  const load = overrides.loadConversation ?? defaultLoadConversation;

  if (body.mode === "link") {
    const conversationId = typeof body.conversation_id === "string" ? body.conversation_id : "";
    const humanId = typeof body.human_id === "string" ? body.human_id : "";
    if (!conversationId || !humanId) {
      return json(req, { ok: false, error: "conversation_id and human_id are required" }, 400);
    }
    const conversation = await load(conversationId);
    if (!conversation || conversation.channel !== "messenger" || !conversation.messenger_psid || !conversation.messenger_page_id) {
      return json(req, { ok: false, error: "This conversation is not a Messenger thread" }, 422);
    }
    const exists = overrides.humanExists
      ? await overrides.humanExists(humanId)
      : await humanRowExists(humanId);
    if (!exists) return json(req, { ok: false, error: "Customer not found" }, 404);
    const link = overrides.linkCustomer ?? defaultLinkCustomer;
    await link(conversation, humanId, auth.userId);
    return json(req, { ok: true, conversation_id: conversation.id, human_id: humanId });
  }

  if (body.mode === "manual") {
    const conversationId = typeof body.conversation_id === "string" ? body.conversation_id : "";
    const text = typeof body.text === "string" ? body.text : "";
    if (!conversationId) return json(req, { ok: false, error: "conversation_id is required" }, 400);
    const conversation = await load(conversationId);
    if (!conversation) return json(req, { ok: false, error: "conversation not found" }, 404);
    return await sendText(req, overrides, conversation, text, "staff", auth.userId);
  }

  if (body.mode === "draft") {
    const draftId = typeof body.draft_id === "string" ? body.draft_id : "";
    if (!draftId) return json(req, { ok: false, error: "draft_id is required" }, 400);
    const draft = overrides.loadDraft
      ? await overrides.loadDraft(draftId)
      : await defaultLoadDraft(draftId);
    if (!draft) return json(req, { ok: false, error: "draft not found" }, 404);
    if (draft.state !== "pending") {
      return json(req, { ok: false, error: `draft is ${draft.state}, not pending` }, 409);
    }
    const conversation = await load(draft.conversation_id);
    if (!conversation) return json(req, { ok: false, error: "conversation not found" }, 404);
    const edited = typeof body.edited_text === "string" ? body.edited_text : null;
    const text = (edited ?? draft.proposed_text).trim();
    const claim = overrides.claimDraft ?? defaultClaimDraft;
    const claimed = await claim(
      draft.id,
      edited ? "sent_after_edit" : "approved",
      edited,
      auth.userId,
    );
    if (!claimed) return json(req, { ok: false, error: "draft already claimed" }, 409);
    const response = await sendText(req, overrides, conversation, text, "ai", auth.userId, draft.id);
    if (response.status >= 400) {
      await (overrides.claimDraft
        ? Promise.resolve()
        : serviceClient().from("whatsapp_drafts").update({
          state: "pending",
          decided_at: null,
          decided_by: null,
        }).eq("id", draft.id));
    }
    return response;
  }

  return json(req, { ok: false, error: "unknown mode" }, 400);
}

async function humanRowExists(humanId: string): Promise<boolean> {
  const { data, error } = await serviceClient().from("humans").select("id").eq("id", humanId).maybeSingle();
  if (error) throw new Error(error.message);
  return !!data;
}

async function defaultLinkCustomer(
  conversation: ConversationRow,
  humanId: string,
  userId: string,
): Promise<void> {
  const supabase = serviceClient();
  const { error: identityError } = await supabase.from("messaging_identities").upsert({
    channel: "messenger",
    page_id: conversation.messenger_page_id,
    psid: conversation.messenger_psid,
    human_id: humanId,
    linked_by: userId,
  }, { onConflict: "channel,page_id,psid" });
  if (identityError) throw new Error(identityError.message);
  const { error } = await supabase
    .from("whatsapp_conversations")
    .update({ human_id: humanId })
    .eq("id", conversation.id)
    .eq("channel", "messenger");
  if (error) throw new Error(error.message);
}

async function defaultLoadDraft(id: string) {
  const { data, error } = await serviceClient()
    .from("whatsapp_drafts")
    .select("id, conversation_id, proposed_text, state")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as { id: string; conversation_id: string; proposed_text: string; state: string } | null;
}

async function defaultClaimDraft(
  id: string,
  state: string,
  edited: string | null,
  userId: string,
): Promise<boolean> {
  const { data, error } = await serviceClient()
    .from("whatsapp_drafts")
    .update({
      state,
      edited_text: edited,
      decided_by: userId,
      decided_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("state", "pending")
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return !!data;
}

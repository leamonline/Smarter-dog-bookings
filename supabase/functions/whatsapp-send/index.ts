// ============================================================
// supabase/functions/whatsapp-send/index.ts
//
// Sends WhatsApp messages via Meta Cloud API. This is the "mouth"
// of the pipeline — everything that goes out to customers goes
// through here. whatsapp-webhook is the "ears", whatsapp-agent is
// the "brain", this is the "mouth".
//
// Four modes:
//
//   mode: "draft"
//     Sends a free-form text message based on an approved AI draft.
//     Caller (admin inbox UI) passes { mode, draft_id, edited_text? }.
//
//   mode: "manual"
//     Sends a free-form text message typed by staff — no draft row
//     involved. Caller (admin inbox compose box) passes
//     { mode, conversation_id, text }. Used when staff take over a
//     conversation and write their own reply, or when they want to
//     send an ad-hoc message alongside the AI's suggestions.
//
//   mode: "template"
//     Sends a pre-approved Meta template message. Used for
//     appointment reminders and for re-engaging outside the 24h
//     customer service window.
//
//   mode: "confirm_buttons"
//     Sends an interactive button message asking the customer to
//     confirm a booking action (book / reschedule / cancel). Called
//     by whatsapp-agent after autonomy gates pass. On success the
//     whatsapp_booking_actions row transitions to
//     'awaiting_customer_confirm' with a 24h TTL. On Meta failure
//     the row stays at 'pending' for staff to handle via the inbox.
//
// Auth:
//   Gateway JWT verification is DISABLED (verify_jwt=false) because
//   the Supabase gateway currently rejects ES256-signed user session
//   JWTs with UNAUTHORIZED_UNSUPPORTED_TOKEN_ALGORITHM. We instead
//   verify the JWT ourselves inside authorise() via
//   userClient.auth.getUser() — which hits Supabase Auth (GOTRUE),
//   which supports all signing algorithms — and then check is_staff().
//
//   For service-role callers (no JWT), we accept the shared
//   SEND_INTERNAL_SECRET header as a backup.
//
// CORS:
//   Browser callers (staff inbox) need a preflight OPTIONS response.
//   Origins are restricted to the staging dashboard and localhost dev
//   ports via ALLOWED_ORIGINS. Server-to-server callers (no Origin
//   header, x-internal-secret auth) are unaffected.
//
// Env vars required:
//   SUPABASE_URL                (auto)
//   SUPABASE_SERVICE_ROLE_KEY   (auto)
//   SUPABASE_ANON_KEY           (auto)
//   META_ACCESS_TOKEN           (user-added — permanent system user)
//   META_PHONE_NUMBER_ID        (user-added — e.g. 1060731703795077)
//   SEND_INTERNAL_SECRET        (user-added — for service-role callers)
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { timingSafeEqualHeader } from "../_shared/webhook-auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const META_ACCESS_TOKEN = Deno.env.get("META_ACCESS_TOKEN")!;
const META_PHONE_NUMBER_ID = Deno.env.get("META_PHONE_NUMBER_ID")!;
const SEND_INTERNAL_SECRET = Deno.env.get("SEND_INTERNAL_SECRET") ?? "";

const META_GRAPH_VERSION = "v22.0";

// Max characters for a single outbound text. Meta's hard limit is
// 4096 but anything that long is almost certainly a bug; cap at 2000
// to protect against accidental paste-the-whole-document disasters.
const MAX_MANUAL_TEXT_LEN = 2000;

// Browser origins permitted to invoke this function. Server-to-server
// callers (pg_net triggers, scripts using x-internal-secret) don't send
// an Origin header and are unaffected. When the origin is not in this
// set we omit Access-Control-Allow-Origin entirely so the browser blocks
// the response — that's the correct CORS-deny behaviour.
const ALLOWED_ORIGINS = new Set([
  "https://smarterdog.vercel.app",
  "http://localhost:5173",
  "http://localhost:5174",
]);

function buildCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-internal-secret",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (ALLOWED_ORIGINS.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

interface DraftMode {
  mode: "draft";
  draft_id: string;
  edited_text?: string;
}

interface ManualMode {
  mode: "manual";
  conversation_id: string;
  text: string;
}

interface TemplateMode {
  mode: "template";
  to: string;
  template_name: string;
  language?: string;
  params?: string[];
  conversation_id?: string;
}

interface ConfirmButtonsMode {
  mode: "confirm_buttons";
  conversation_id: string;
  booking_action_id: string;
  summary_text: string;
  action_kind: "book" | "reschedule" | "cancel";
}

type SendBody = DraftMode | ManualMode | TemplateMode | ConfirmButtonsMode;

interface MetaSendSuccess {
  messaging_product: "whatsapp";
  contacts: Array<{ input: string; wa_id: string }>;
  messages: Array<{ id: string; message_status?: string }>;
}

interface MetaSendError {
  error?: {
    code?: number;
    message?: string;
    error_subcode?: number;
    error_user_msg?: string;
    error_user_title?: string;
    fbtrace_id?: string;
    type?: string;
  };
}

function toMetaTo(phone: string): string {
  return phone.replace(/\D/g, "");
}

function toE164(digits: string): string {
  const d = digits.replace(/\D/g, "");
  return d ? `+${d}` : "";
}

async function callMeta(body: unknown): Promise<MetaSendSuccess> {
  const url = `https://graph.facebook.com/${META_GRAPH_VERSION}/${META_PHONE_NUMBER_ID}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${META_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const json: MetaSendSuccess & MetaSendError = await res.json();
  if (!res.ok) {
    const err = json.error;
    throw new Error(
      `Meta ${res.status} — ${err?.type ?? "error"} ${err?.code ?? ""}: ${
        err?.message ?? JSON.stringify(json)
      }`,
    );
  }
  return json;
}

// Note: whatsapp_messages.role has a CHECK constraint allowing only
// 'user'|'assistant'|'system'|'tool'. All outbound goes in as 'assistant'
// regardless of whether it came from the AI or from a staff compose box.
// If we later want the inbox to visually distinguish staff vs AI replies,
// extend the CHECK with 'staff' in a follow-up migration.
async function recordOutbound(
  supabase: SupabaseClient,
  conversationId: string | null,
  metaMessageId: string | null,
  content: string | null,
  raw: unknown,
) {
  if (!conversationId) return;
  const sentAt = new Date().toISOString();
  const { error } = await supabase.from("whatsapp_messages").insert({
    conversation_id: conversationId,
    direction: "outbound",
    role: "assistant",
    meta_message_id: metaMessageId,
    content,
    raw,
    status: "sent",
    sent_at: sentAt,
  });
  if (error) console.error("recordOutbound failed:", error);

  const { error: convError } = await supabase
    .from("whatsapp_conversations")
    .update({ last_outbound_at: sentAt })
    .eq("id", conversationId);
  if (convError) console.error("recordOutbound conversation update failed:", convError);
}

function isWindowOpen(lastInboundAt: string | null | undefined): boolean {
  if (!lastInboundAt) return false;
  const ms = Date.now() - new Date(lastInboundAt).getTime();
  return ms < 24 * 60 * 60 * 1000;
}

async function authorise(req: Request): Promise<
  | { ok: true; userId?: string; internal?: boolean }
  | { ok: false; reason: string; status: number }
> {
  // timingSafeEqualHeader returns false if either side is empty, so the
  // original `SEND_INTERNAL_SECRET && …` guard is preserved.
  if (
    timingSafeEqualHeader(
      req.headers.get("x-internal-secret"),
      SEND_INTERNAL_SECRET,
    )
  ) {
    return { ok: true, internal: true };
  }

  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    return { ok: false, reason: "missing authorization", status: 401 };
  }

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userRes, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userRes?.user) {
    console.error("getUser failed:", userErr);
    return { ok: false, reason: "invalid token", status: 401 };
  }

  const { data: staffCheck, error: staffErr } = await userClient.rpc("is_staff");
  if (staffErr) {
    console.error("is_staff rpc failed:", staffErr);
    return { ok: false, reason: "staff check failed", status: 500 };
  }
  if (!staffCheck) {
    return { ok: false, reason: "not staff", status: 403 };
  }

  return { ok: true, userId: userRes.user.id };
}

async function handleDraftMode(
  req: Request,
  supabase: SupabaseClient,
  body: DraftMode,
  userId: string | undefined,
): Promise<Response> {
  const { data: draft, error: draftErr } = await supabase
    .from("whatsapp_drafts")
    .select(
      "id, conversation_id, proposed_text, state, whatsapp_conversations!inner(id, phone_e164, last_inbound_at)",
    )
    .eq("id", body.draft_id)
    .single();

  if (draftErr || !draft) {
    return json(req, { error: "draft not found", detail: draftErr?.message }, 404);
  }

  if (draft.state !== "pending") {
    return json(
      req,
      { error: `draft is ${draft.state}, not pending`, draft_id: draft.id },
      409,
    );
  }

  const conv = (draft as any).whatsapp_conversations as {
    id: string;
    phone_e164: string;
    last_inbound_at: string | null;
  };

  if (!isWindowOpen(conv.last_inbound_at)) {
    return json(
      req,
      {
        error: "24h window closed",
        detail:
          "Cannot send free-form text — last inbound message was more than 24 hours ago. Use a template instead.",
        last_inbound_at: conv.last_inbound_at,
      },
      422,
    );
  }

  const textToSend = body.edited_text?.trim() || draft.proposed_text;
  if (!textToSend) {
    return json(req, { error: "empty message body" }, 400);
  }

  const { data: claimed, error: claimErr } = await supabase
    .from("whatsapp_drafts")
    .update({
      state: body.edited_text ? "sent_after_edit" : "approved",
      edited_text: body.edited_text ?? null,
      decided_by: userId ?? null,
      decided_at: new Date().toISOString(),
    })
    .eq("id", draft.id)
    .eq("state", "pending")
    .select("id")
    .single();

  if (claimErr || !claimed) {
    return json(
      req,
      { error: "draft already claimed by another request", detail: claimErr?.message },
      409,
    );
  }

  let metaRes: MetaSendSuccess;
  try {
    metaRes = await callMeta({
      messaging_product: "whatsapp",
      to: toMetaTo(conv.phone_e164),
      type: "text",
      text: { body: textToSend },
    });
  } catch (err) {
    await supabase
      .from("whatsapp_drafts")
      .update({
        state: "pending",
        edited_text: null,
        decided_by: null,
        decided_at: null,
      })
      .eq("id", draft.id);

    return json(
      req,
      {
        error: "Meta send failed",
        detail: err instanceof Error ? err.message : String(err),
      },
      502,
    );
  }

  const metaMessageId = metaRes.messages?.[0]?.id ?? null;

  await recordOutbound(supabase, conv.id, metaMessageId, textToSend, metaRes);

  return json(req, {
    ok: true,
    meta_message_id: metaMessageId,
    sent_text: textToSend,
    draft_id: draft.id,
  });
}

// ── Manual-mode handler ────────────────────────────────────
// Free-form text typed directly by staff, no AI draft in the loop.
// Used by the compose box in /whatsapp. Subject to the same 24h
// window rule as draft mode — Meta won't allow non-template text
// outside that window, so we reject early with a clear message.
async function handleManualMode(
  req: Request,
  supabase: SupabaseClient,
  body: ManualMode,
): Promise<Response> {
  if (!body.conversation_id) {
    return json(req, { error: "conversation_id is required" }, 400);
  }

  const text = (body.text ?? "").trim();
  if (!text) {
    return json(req, { error: "empty message body" }, 400);
  }
  if (text.length > MAX_MANUAL_TEXT_LEN) {
    return json(
      req,
      {
        error: "message too long",
        detail: `Manual messages are capped at ${MAX_MANUAL_TEXT_LEN} characters.`,
        length: text.length,
      },
      400,
    );
  }

  const { data: conv, error: convErr } = await supabase
    .from("whatsapp_conversations")
    .select("id, phone_e164, last_inbound_at")
    .eq("id", body.conversation_id)
    .single();

  if (convErr || !conv) {
    return json(req, { error: "conversation not found", detail: convErr?.message }, 404);
  }

  if (!isWindowOpen(conv.last_inbound_at)) {
    return json(
      req,
      {
        error: "24h window closed",
        detail:
          "Cannot send free-form text — last inbound message was more than 24 hours ago. Use a template instead.",
        last_inbound_at: conv.last_inbound_at,
      },
      422,
    );
  }

  let metaRes: MetaSendSuccess;
  try {
    metaRes = await callMeta({
      messaging_product: "whatsapp",
      to: toMetaTo(conv.phone_e164),
      type: "text",
      text: { body: text },
    });
  } catch (err) {
    return json(
      req,
      {
        error: "Meta send failed",
        detail: err instanceof Error ? err.message : String(err),
      },
      502,
    );
  }

  const metaMessageId = metaRes.messages?.[0]?.id ?? null;

  await recordOutbound(supabase, conv.id, metaMessageId, text, metaRes);

  return json(req, {
    ok: true,
    meta_message_id: metaMessageId,
    sent_text: text,
    conversation_id: conv.id,
  });
}

async function handleTemplateMode(
  req: Request,
  supabase: SupabaseClient,
  body: TemplateMode,
): Promise<Response> {
  if (!body.to || !body.template_name) {
    return json(req, { error: "to and template_name are required" }, 400);
  }

  const lang = body.language ?? "en_GB";
  const params = body.params ?? [];

  const components = params.length
    ? [
      {
        type: "body",
        parameters: params.map((text) => ({ type: "text", text })),
      },
    ]
    : undefined;

  let metaRes: MetaSendSuccess;
  try {
    metaRes = await callMeta({
      messaging_product: "whatsapp",
      to: toMetaTo(body.to),
      type: "template",
      template: {
        name: body.template_name,
        language: { code: lang },
        ...(components ? { components } : {}),
      },
    });
  } catch (err) {
    return json(
      req,
      {
        error: "Meta send failed",
        detail: err instanceof Error ? err.message : String(err),
      },
      502,
    );
  }

  const metaMessageId = metaRes.messages?.[0]?.id ?? null;

  let conversationId = body.conversation_id ?? null;
  if (!conversationId) {
    const { data: conv } = await supabase
      .from("whatsapp_conversations")
      .select("id")
      .eq("phone_e164", toE164(body.to))
      .maybeSingle();
    conversationId = conv?.id ?? null;
  }

  const content = `[template:${body.template_name}] ${params.join(" · ")}`.trim();
  await recordOutbound(supabase, conversationId, metaMessageId, content, metaRes);

  return json(req, {
    ok: true,
    meta_message_id: metaMessageId,
    template: body.template_name,
    language: lang,
  });
}

// ── Confirm-buttons mode handler ──────────────────────────────
// Sends a Meta interactive button message asking the customer to
// confirm a booking action. Called by whatsapp-agent (Task 13) after
// autonomy gates pass. On success transitions the booking action row
// to 'awaiting_customer_confirm'; on failure leaves it at 'pending'
// so staff can handle it via the inbox (graceful degrade).
async function handleConfirmButtons(
  req: Request,
  supabase: SupabaseClient,
  body: ConfirmButtonsMode,
): Promise<Response> {
  const { conversation_id, booking_action_id, summary_text, action_kind } = body;

  if (!conversation_id) {
    return json(req, { ok: false, reason: "conversation_id is required" }, 400);
  }
  if (!booking_action_id) {
    return json(req, { ok: false, reason: "booking_action_id is required" }, 400);
  }
  if (!summary_text) {
    return json(req, { ok: false, reason: "summary_text is required" }, 400);
  }
  if (!action_kind || !["book", "reschedule", "cancel"].includes(action_kind)) {
    return json(req, { ok: false, reason: "action_kind must be 'book', 'reschedule', or 'cancel'" }, 400);
  }

  // Pre-check: only send buttons for actions still in the 'pending'
  // staging state. This guards against (a) double-send on retry, and
  // (b) racing with a concurrent send for the same action. Matches the
  // claim-row pattern used by handleDraftMode in this same file.
  const { data: actionRow, error: actionFetchErr } = await supabase
    .from("whatsapp_booking_actions")
    .select("id, conversation_id, state")
    .eq("id", booking_action_id)
    .single();

  if (actionFetchErr || !actionRow) {
    return json(req, { ok: false, reason: "booking action not found" }, 404);
  }
  if (actionRow.conversation_id !== conversation_id) {
    return json(req, { ok: false, reason: "booking action does not belong to this conversation" }, 422);
  }
  if (actionRow.state !== "pending") {
    return json(req, { ok: false, reason: `booking action is ${actionRow.state}, not pending` }, 409);
  }

  // Look up the conversation's phone number.
  const { data: conv, error: convErr } = await supabase
    .from("whatsapp_conversations")
    .select("id, phone_e164")
    .eq("id", conversation_id)
    .single();

  if (convErr || !conv) {
    return json(req, { ok: false, reason: "conversation not found" }, 404);
  }
  if (!conv.phone_e164) {
    return json(req, { ok: false, reason: "conversation has no phone number" }, 422);
  }

  const yesLabel =
    action_kind === "book"
      ? "Yes, book it"
      : action_kind === "reschedule"
      ? "Yes, move it"
      : "Yes, cancel";

  // Build the Meta interactive buttons payload.
  // Meta caps: body.text at 1024 chars, button title at 20 chars.
  const metaBody = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: toMetaTo(conv.phone_e164),
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: summary_text.slice(0, 1024) },
      action: {
        buttons: [
          {
            type: "reply",
            reply: {
              id: `${booking_action_id}:yes`,
              title: yesLabel.slice(0, 20),
            },
          },
          {
            type: "reply",
            reply: {
              id: `${booking_action_id}:no`,
              title: "No, change".slice(0, 20),
            },
          },
        ],
      },
    },
  };

  let metaRes: MetaSendSuccess;
  try {
    metaRes = await callMeta(metaBody);
  } catch (err) {
    // On Meta failure: leave the booking action at 'pending' for staff
    // to handle via the inbox (graceful degrade — no state transition).
    return json(req, {
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
    }, 502);
  }

  const metaMessageId = metaRes.messages?.[0]?.id ?? null;

  // Record the outbound message in whatsapp_messages.
  await recordOutbound(supabase, conv.id, metaMessageId, summary_text, metaBody);

  // Transition the booking action row: set confirm message details and
  // move state to 'awaiting_customer_confirm' with a 24h expiry.
  // Optimistic-lock on state='pending' so a concurrent caller that
  // raced past the pre-check still can't double-transition the row.
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const { data: updatedRows, error: actionErr } = await supabase
    .from("whatsapp_booking_actions")
    .update({
      customer_confirm_message_id: metaMessageId,
      customer_confirm_expires_at: expiresAt,
      state: "awaiting_customer_confirm",
    })
    .eq("id", booking_action_id)
    .eq("state", "pending")
    .select("id");

  if (actionErr) {
    console.error("handleConfirmButtons: booking action update failed:", actionErr);
    return json(req, {
      ok: true,
      meta_message_id: metaMessageId,
      warning: "state_update_failed",
    });
  }

  if (!updatedRows || updatedRows.length === 0) {
    // Lost the race: another caller already transitioned the row. The
    // Meta message is in the customer's hands, but the state matches
    // whoever won the race. Surface a warning so the caller can log.
    console.warn(
      `handleConfirmButtons: booking action ${booking_action_id} no longer pending; state update skipped`,
    );
    return json(req, {
      ok: true,
      meta_message_id: metaMessageId,
      warning: "state_transition_skipped",
    });
  }

  return json(req, { ok: true, meta_message_id: metaMessageId });
}

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...buildCorsHeaders(req),
      "Content-Type": "application/json",
    },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: buildCorsHeaders(req) });
  }

  if (req.method !== "POST") {
    return json(req, { error: "method not allowed" }, 405);
  }

  const auth = await authorise(req);
  if (!auth.ok) {
    return json(req, { error: auth.reason }, auth.status);
  }

  let parsed: SendBody;
  try {
    parsed = await req.json();
  } catch {
    return json(req, { error: "bad json" }, 400);
  }

  if (!parsed || !("mode" in parsed)) {
    return json(req, { error: "mode is required ('draft' | 'manual' | 'template' | 'confirm_buttons')" }, 400);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  try {
    if (parsed.mode === "draft") {
      return await handleDraftMode(req, supabase, parsed, auth.userId);
    } else if (parsed.mode === "manual") {
      return await handleManualMode(req, supabase, parsed);
    } else if (parsed.mode === "template") {
      return await handleTemplateMode(req, supabase, parsed);
    } else if (parsed.mode === "confirm_buttons") {
      return await handleConfirmButtons(req, supabase, parsed);
    } else {
      return json(req, { error: `unknown mode: ${(parsed as any).mode}` }, 400);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("whatsapp-send unhandled error:", message);
    return json(req, { error: "internal error", detail: message }, 500);
  }
});

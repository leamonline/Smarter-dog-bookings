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
//   SUPABASE_URL                       (auto)
//   SUPABASE_SERVICE_ROLE_KEY          (auto)
//   SUPABASE_ANON_KEY                  (auto)
//   META_ACCESS_TOKEN                  (user-added — permanent system user)
//   META_PHONE_NUMBER_ID               (user-added — e.g. 1060731703795077)
//   SEND_INTERNAL_SECRET               (user-added — for service-role callers)
//   WHATSAPP_SEND_ALLOWED_ORIGINS      (optional — comma-separated CORS
//                                       allowlist. Falls back to the
//                                       staging + localhost defaults.)
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { timingSafeEqualHeader } from "../_shared/webhook-auth.ts";
import { buildAllowedOrigins, buildCorsHeaders } from "../_shared/cors.ts";
import {
  type ConfirmButtonsBody,
  type ConfirmButtonsResult,
  runConfirmButtons,
} from "../_shared/confirmButtons.ts";
import { buildFlowMetaBody, validateFlowMessageParams } from "../_shared/flowMessage.ts";
import { SALON_LOCATION, TEMPLATES_WITH_LOCATION_HEADER } from "../_shared/salonConstants.ts";
import {
  decideAiMessagingSend,
  type AiMessagingDecision,
} from "../_shared/aiMessagingGate.ts";

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
//
// Configured via WHATSAPP_SEND_ALLOWED_ORIGINS (comma-separated). The
// hardcoded staging + dev defaults are kept as a safety net so deploys
// without the secret still work in known environments.
const ALLOWED_ORIGINS = buildAllowedOrigins("WHATSAPP_SEND_ALLOWED_ORIGINS");

const corsFor = (req: Request) =>
  buildCorsHeaders(req, ALLOWED_ORIGINS, { allowInternalSecret: true });

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
  // Optional: link the conversation to a known human. Used by the
  // inbox compose-new flow — staff picked the customer from the
  // humans directory, so we know who this is before any reply.
  // Falls back to the phone-lookup + agent-side linking otherwise.
  human_id?: string | null;
}

interface ConfirmButtonsMode {
  mode: "confirm_buttons";
  conversation_id: string;
  booking_action_id: string;
  summary_text: string;
  action_kind: "book" | "reschedule" | "cancel";
}

interface FlowMode {
  mode: "flow";
  to: string;
  flow_id: string;
  human_id?: string | null;
  flow_type?: "appointment_booking" | "new_client_intake" | "cancel_reschedule";
  initial_screen?: string;
  initial_data?: Record<string, unknown>;
  // Pre-seeded session state (e.g. a reschedule: dogs/services/old-visit
  // snapshot) persisted into the flow session so the Flow can open mid-way
  // (on SELECT_DATE) with the form already filled. initial_data is only the
  // WELCOME greeting/intro; initial_state is the full server-side form state.
  initial_state?: Record<string, unknown>;
  body_text: string;
  cta: string;
  header_text?: string;
  footer_text?: string;
  // "draft" to test an unpublished Flow; omit for the published one.
  flow_display_mode?: "published" | "draft";
  conversation_id?: string;
}

interface BookEntryMode {
  mode: "book_entry";
  to: string;
  conversation_id: string;
  human_id?: string | null;
}

interface ListMode {
  mode: "list";
  to: string;
  conversation_id: string;
  human_id?: string | null;
  body_text: string;
  button_text: string;
  section_title?: string;
  rows: Array<{ id: string; title: string; description?: string }>;
}

type SendBody = (
  | DraftMode
  | ManualMode
  | TemplateMode
  | ConfirmButtonsMode
  | FlowMode
  | BookEntryMode
  | ListMode
) & { ai_initiated?: boolean };

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

async function resolveAiSendHumanId(
  supabase: SupabaseClient,
  body: SendBody,
): Promise<{ ok: true; humanId: string | null } | { ok: false }> {
  if ("human_id" in body && typeof body.human_id === "string" && body.human_id) {
    return { ok: true, humanId: body.human_id };
  }

  let conversationId =
    "conversation_id" in body && typeof body.conversation_id === "string"
      ? body.conversation_id
      : null;

  if (!conversationId && body.mode === "draft") {
    const { data: draft, error } = await supabase
      .from("whatsapp_drafts")
      .select("conversation_id")
      .eq("id", body.draft_id)
      .single();
    if (error || !draft?.conversation_id) {
      return { ok: false };
    }
    conversationId = draft.conversation_id as string;
  }

  if (!conversationId) {
    return { ok: true, humanId: null };
  }

  const { data: conversation, error } = await supabase
    .from("whatsapp_conversations")
    .select("human_id")
    .eq("id", conversationId)
    .single();
  if (error || !conversation) {
    return { ok: false };
  }
  return {
    ok: true,
    humanId:
      typeof conversation.human_id === "string" ? conversation.human_id : null,
  };
}

async function checkAiMessagingPermission(
  supabase: SupabaseClient,
  body: SendBody,
): Promise<AiMessagingDecision> {
  if (body.ai_initiated !== true) {
    return decideAiMessagingSend({
      aiInitiated: false,
      globalRead: { ok: false },
      customerReadRequired: false,
    });
  }

  const { data: globalSetting, error: globalError } = await supabase
    .from("ai_whatsapp_settings")
    .select("enabled")
    .eq("singleton", true)
    .single();

  const resolvedHuman = await resolveAiSendHumanId(supabase, body);
  if (!resolvedHuman.ok) {
    return decideAiMessagingSend({
      aiInitiated: true,
      globalRead: {
        ok: !globalError && globalSetting?.enabled === true,
        value: globalSetting?.enabled,
      },
      customerReadRequired: true,
      customerRead: { ok: false },
    });
  }

  let customerRead:
    | { ok: true; value: boolean }
    | { ok: false }
    | undefined;
  if (resolvedHuman.humanId) {
    const { data: human, error: humanError } = await supabase
      .from("humans")
      .select("ai_whatsapp_allowed")
      .eq("id", resolvedHuman.humanId)
      .single();
    customerRead =
      !humanError && typeof human?.ai_whatsapp_allowed === "boolean"
        ? { ok: true, value: human.ai_whatsapp_allowed }
        : { ok: false };
  }

  return decideAiMessagingSend({
    aiInitiated: true,
    globalRead:
      !globalError && typeof globalSetting?.enabled === "boolean"
        ? { ok: true, value: globalSetting.enabled }
        : { ok: false },
    customerReadRequired: resolvedHuman.humanId !== null,
    customerRead,
  });
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
    if (draftErr) console.error("whatsapp-send: draft lookup error:", draftErr.message);
    return json(req, { error: "draft not found" }, 404);
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
    if (claimErr) console.error("whatsapp-send: draft claim error:", claimErr.message);
    return json(
      req,
      { error: "draft already claimed by another request" },
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

    console.error(
      "whatsapp-send draft mode: Meta send failed:",
      err instanceof Error ? err.message : String(err),
    );
    return json(req, { error: "Meta send failed" }, 502);
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
    if (convErr) console.error("whatsapp-send: conversation lookup error:", convErr.message);
    return json(req, { error: "conversation not found" }, 404);
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
    console.error(
      "whatsapp-send manual mode: Meta send failed:",
      err instanceof Error ? err.message : String(err),
    );
    return json(req, { error: "Meta send failed" }, 502);
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

  // Templates with a LOCATION header must carry the pin at send time — Meta has
  // no static-location header — so attach the salon's location for those. Other
  // templates get a body-only component (or none). Header goes first.
  const bodyComponent = params.length
    ? [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }]
    : [];
  const headerComponent = TEMPLATES_WITH_LOCATION_HEADER.has(body.template_name)
    ? [{ type: "header", parameters: [{ type: "location", location: SALON_LOCATION }] }]
    : [];
  const componentList = [...headerComponent, ...bodyComponent];
  const components = componentList.length ? componentList : undefined;

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
    console.error(
      "whatsapp-send template mode: Meta send failed:",
      err instanceof Error ? err.message : String(err),
    );
    return json(req, { error: "Meta send failed" }, 502);
  }

  const metaMessageId = metaRes.messages?.[0]?.id ?? null;

  // Resolve (or create) the conversation row this outbound belongs to.
  // The inbox compose-new flow sends to phones we may not have a
  // conversation for yet — without an upsert, recordOutbound would
  // silently no-op and the sent message would never appear in /inbox
  // until the customer replied and the webhook bootstrapped it.
  let conversationId = body.conversation_id ?? null;
  if (!conversationId) {
    const phoneE164 = toE164(body.to);
    // Resolve the WhatsApp conversation for this phone, creating it if it
    // doesn't exist yet. Two things keep the sent template visible in /inbox:
    //   • Filter by channel='whatsapp'. A phone can ALSO have a separate
    //     channel='sms' conversation; without this filter the by-phone lookup
    //     matched both rows, .maybeSingle() errored, and the send silently
    //     never recorded (the reminder-inbox bug).
    //   • Create via upsert ON CONFLICT DO NOTHING on the (phone_e164,
    //     channel) unique index — so a concurrent create can't 23505 and drop
    //     the recording. ignoreDuplicates means we never clobber an existing
    //     conversation's state/human_id. (whatsapp-agent's inbound bootstrap
    //     uses the same composite ON CONFLICT target.)
    // ignoreDuplicates (ON CONFLICT DO NOTHING) + a separate reselect — NOT
    // the agent's single-statement upsert().select().single(), whose DO
    // UPDATE on conflict would reset an existing row's state/human_id.
    const { error: upsertErr } = await supabase
      .from("whatsapp_conversations")
      .upsert(
        {
          phone_e164: phoneE164,
          channel: "whatsapp",
          human_id: body.human_id ?? null,
          state: "ai_handling",
        },
        { onConflict: "phone_e164,channel", ignoreDuplicates: true },
      );
    if (upsertErr) console.error("whatsapp-send template: conversation upsert failed:", upsertErr);
    // Read back the single canonical row (guaranteed unique per the index).
    const { data: conv, error: convSelErr } = await supabase
      .from("whatsapp_conversations")
      .select("id, human_id")
      .eq("phone_e164", phoneE164)
      .eq("channel", "whatsapp")
      .maybeSingle();
    if (convSelErr) console.error("whatsapp-send template: conversation reselect failed:", convSelErr);
    if (conv?.id) {
      conversationId = conv.id;
      // Backfill human_id if the row predates the staff/customer link.
      if (body.human_id && !conv.human_id) {
        await supabase
          .from("whatsapp_conversations")
          .update({ human_id: body.human_id })
          .eq("id", conv.id);
      }
    }
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
// Thin wrapper around runConfirmButtons in _shared/confirmButtons.ts.
// The orchestration (validate → claim → send → record → tag) lives
// in the shared helper so it can be tested under vitest; this wrapper
// only injects Deno-runtime dependencies and maps the structured
// result back to an HTTP Response.
async function handleConfirmButtons(
  req: Request,
  supabase: SupabaseClient,
  body: ConfirmButtonsMode,
): Promise<Response> {
  const inputBody: ConfirmButtonsBody = {
    conversation_id: body.conversation_id,
    booking_action_id: body.booking_action_id,
    summary_text: body.summary_text,
    action_kind: body.action_kind,
  };

  const result: ConfirmButtonsResult = await runConfirmButtons(
    {
      supabase,
      callMeta,
      recordOutbound: (conversationId, metaMessageId, content, raw) =>
        recordOutbound(supabase, conversationId, metaMessageId, content, raw),
      now: () => new Date(),
    },
    inputBody,
  );

  if (!result.ok) {
    return json(req, { ok: false, reason: result.reason }, result.status);
  }

  if (result.warning === "state_update_failed") {
    console.error(
      `handleConfirmButtons: booking action ${body.booking_action_id} state update failed`,
    );
  } else if (result.warning === "state_transition_skipped") {
    console.warn(
      `handleConfirmButtons: booking action ${body.booking_action_id} no longer pending; state update skipped`,
    );
  }

  return json(
    req,
    result.warning
      ? { ok: true, meta_message_id: result.meta_message_id, warning: result.warning }
      : { ok: true, meta_message_id: result.meta_message_id },
  );
}

// ── Flow-mode handler ─────────────────────────────────────────
// Delivers a WhatsApp Flow. Mints the flow_token, creates the
// whatsapp_flow_sessions row (so the Flow Data Endpoint can resolve the
// customer on the first data_exchange), then sends the interactive
// "flow" message. The message builder lives in _shared/flowMessage.ts.
async function handleFlowMode(
  req: Request,
  supabase: SupabaseClient,
  body: FlowMode,
): Promise<Response> {
  const initialScreen = body.initial_screen ?? "WELCOME";
  const flowToken = crypto.randomUUID();

  const v = validateFlowMessageParams({
    toDigits: toMetaTo(body.to),
    flowId: body.flow_id,
    flowToken,
    bodyText: body.body_text,
    ctaLabel: body.cta,
    initialScreen,
  });
  if (!v.ok) return json(req, { error: v.reason }, 400);

  const phoneE164 = toE164(body.to);

  // The WELCOME screen binds greeting + intro; default them (resolving the
  // customer's name when we know who they are) if the caller didn't supply.
  let initialData: Record<string, unknown> = body.initial_data ?? {};
  if (initialScreen === "WELCOME" && (!initialData.greeting || !initialData.intro)) {
    let name = "";
    if (body.human_id) {
      const { data } = await supabase.from("humans").select("name").eq("id", body.human_id).maybeSingle();
      name = (data as { name?: string } | null)?.name ?? "";
    }
    initialData = {
      greeting: name ? `Hi ${name}! 🐾` : "Hi there! 🐾",
      intro: "Let's get your pup booked in for a fresh new groom.",
      ...initialData,
    };
  }

  // Create the session BEFORE sending — the endpoint rejects unknown tokens.
  const { error: sessErr } = await supabase.from("whatsapp_flow_sessions").insert({
    flow_token: flowToken,
    phone_e164: phoneE164,
    human_id: body.human_id ?? null,
    flow_type: body.flow_type ?? "appointment_booking",
    screen: initialScreen,
    state: body.initial_state ?? {},
    status: "active",
  });
  if (sessErr) {
    console.error("whatsapp-send flow mode: flow session create failed:", sessErr.message);
    return json(req, { error: "could not create flow session" }, 500);
  }

  const metaBody = buildFlowMetaBody({
    toDigits: toMetaTo(body.to),
    flowId: body.flow_id,
    flowToken,
    bodyText: body.body_text,
    ctaLabel: body.cta,
    initialScreen,
    initialData,
    headerText: body.header_text,
    footerText: body.footer_text,
    mode: body.flow_display_mode,
  });

  let metaRes: MetaSendSuccess;
  try {
    metaRes = await callMeta(metaBody);
  } catch (err) {
    await supabase.from("whatsapp_flow_sessions").update({ status: "failed" }).eq("flow_token", flowToken);
    console.error(
      "whatsapp-send flow mode: Meta send failed:",
      err instanceof Error ? err.message : String(err),
    );
    return json(req, { error: "Meta send failed" }, 502);
  }

  const metaMessageId = metaRes.messages?.[0]?.id ?? null;

  // Link/record the conversation (mirrors template mode). Channel-scoped to
  // 'whatsapp' and created-if-absent via ON CONFLICT DO NOTHING so a Flow
  // send always lands in /inbox, even for a phone that also has an sms row.
  let conversationId = body.conversation_id ?? null;
  if (!conversationId) {
    const { error: upsertErr } = await supabase
      .from("whatsapp_conversations")
      .upsert(
        {
          phone_e164: phoneE164,
          channel: "whatsapp",
          human_id: body.human_id ?? null,
          state: "ai_handling",
        },
        { onConflict: "phone_e164,channel", ignoreDuplicates: true },
      );
    if (upsertErr) console.error("whatsapp-send flow: conversation upsert failed:", upsertErr);
    const { data: conv, error: convSelErr } = await supabase
      .from("whatsapp_conversations")
      .select("id, human_id")
      .eq("phone_e164", phoneE164)
      .eq("channel", "whatsapp")
      .maybeSingle();
    if (convSelErr) console.error("whatsapp-send flow: conversation reselect failed:", convSelErr);
    if (conv?.id) {
      conversationId = conv.id;
      if (body.human_id && !conv.human_id) {
        await supabase.from("whatsapp_conversations").update({ human_id: body.human_id }).eq("id", conv.id);
      }
    }
  }
  await recordOutbound(supabase, conversationId, metaMessageId, `[flow:${body.flow_id}] ${body.body_text}`, metaBody);

  return json(req, { ok: true, flow_token: flowToken, meta_message_id: metaMessageId });
}

// ── Booking-entry handler ─────────────────────────────────────
// Message 1 of the WhatsApp booking entry: a tap-to-confirm identity
// check sent automatically when a recognised customer asks to book. The
// customer is greeted by name; the dogs are confirmed later inside the
// Flow (server-validated multi-select). On "Yes" the agent follows up with
// the portal link + the "Book on WhatsApp" Flow (see whatsapp-agent's
// bookentry:start routing). Tagged [book_entry] so the agent can debounce.
async function handleBookEntryMode(
  req: Request,
  supabase: SupabaseClient,
  body: BookEntryMode,
): Promise<Response> {
  if (!body.to || !body.conversation_id) {
    return json(req, { error: "book_entry requires to + conversation_id" }, 400);
  }

  let name = "";
  if (body.human_id) {
    const { data } = await supabase.from("humans").select("name").eq("id", body.human_id).maybeSingle();
    name = (data as { name?: string } | null)?.name ?? "";
  }

  const greeting = name ? `Hi ${name} 🐾` : "Hi there 🐾";
  const bodyText =
    `${greeting} — lovely to hear from you. Shall we get you booked in for a groom?\n\n` +
    `Tap below and I'll get you sorted — or let me know if I've got the wrong person.`;

  const metaBody = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: toMetaTo(body.to),
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: bodyText },
      action: {
        buttons: [
          { type: "reply", reply: { id: "bookentry:start", title: "Yes, book in" } },
          { type: "reply", reply: { id: "bookentry:notme", title: "Not me" } },
        ],
      },
    },
  };

  let metaRes: MetaSendSuccess;
  try {
    metaRes = await callMeta(metaBody);
  } catch (err) {
    console.error(
      "whatsapp-send book_entry mode: Meta send failed:",
      err instanceof Error ? err.message : String(err),
    );
    return json(req, { error: "Meta send failed" }, 502);
  }

  const metaMessageId = metaRes.messages?.[0]?.id ?? null;
  await recordOutbound(supabase, body.conversation_id, metaMessageId, `[book_entry] ${bodyText}`, metaBody);

  return json(req, { ok: true, meta_message_id: metaMessageId });
}

// ── Interactive list handler ──────────────────────────────────
// Sends a WhatsApp interactive list ("menu" of rows). Used by the
// manage-booking flow when a customer has more than one upcoming visit to
// pick from. Row ids are nonce-backed (manage:<nonce>:<visit_key>) and are
// only ever hints — the agent re-validates server-side on the list_reply tap.
async function handleListMode(
  req: Request,
  supabase: SupabaseClient,
  body: ListMode,
): Promise<Response> {
  if (!body.to || !body.conversation_id || !Array.isArray(body.rows) || body.rows.length === 0) {
    return json(req, { error: "list requires to + conversation_id + rows" }, 400);
  }
  // Meta limits: ≤10 rows, button ≤20, row title ≤24, description ≤72, id ≤200.
  const rows = body.rows.slice(0, 10).map((r) => ({
    id: String(r.id).slice(0, 200),
    title: String(r.title).slice(0, 24),
    ...(r.description ? { description: String(r.description).slice(0, 72) } : {}),
  }));

  const metaBody = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: toMetaTo(body.to),
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: body.body_text },
      action: {
        button: (body.button_text || "Choose").slice(0, 20),
        sections: [{ title: (body.section_title || "Your bookings").slice(0, 24), rows }],
      },
    },
  };

  let metaRes: MetaSendSuccess;
  try {
    metaRes = await callMeta(metaBody);
  } catch (err) {
    console.error("whatsapp-send list mode: Meta send failed:", err instanceof Error ? err.message : String(err));
    return json(req, { error: "Meta send failed" }, 502);
  }

  const metaMessageId = metaRes.messages?.[0]?.id ?? null;
  await recordOutbound(supabase, body.conversation_id, metaMessageId, `[manage_list] ${body.body_text}`, metaBody);
  return json(req, { ok: true, meta_message_id: metaMessageId });
}

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsFor(req),
      "Content-Type": "application/json",
    },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsFor(req) });
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
    return json(req, { error: "mode is required ('draft' | 'manual' | 'template' | 'confirm_buttons' | 'flow' | 'book_entry' | 'list')" }, 400);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  try {
    const aiMessagingPermission = await checkAiMessagingPermission(
      supabase,
      parsed,
    );
    if (!aiMessagingPermission.allowed) {
      return json(
        req,
        {
          error: "AI-initiated WhatsApp messaging is disabled",
          reason: aiMessagingPermission.reason,
        },
        409,
      );
    }

    if (parsed.mode === "draft") {
      return await handleDraftMode(req, supabase, parsed, auth.userId);
    } else if (parsed.mode === "manual") {
      return await handleManualMode(req, supabase, parsed);
    } else if (parsed.mode === "template") {
      return await handleTemplateMode(req, supabase, parsed);
    } else if (parsed.mode === "confirm_buttons") {
      return await handleConfirmButtons(req, supabase, parsed);
    } else if (parsed.mode === "flow") {
      return await handleFlowMode(req, supabase, parsed);
    } else if (parsed.mode === "book_entry") {
      return await handleBookEntryMode(req, supabase, parsed);
    } else if (parsed.mode === "list") {
      return await handleListMode(req, supabase, parsed);
    } else {
      return json(req, { error: `unknown mode: ${(parsed as any).mode}` }, 400);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("whatsapp-send unhandled error:", message);
    return json(req, { error: "internal error" }, 500);
  }
});

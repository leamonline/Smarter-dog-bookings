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
//     customer service window. A booking_confirmed_v1 send also marks
//     the conversation complete (confirmationCompletes.ts).
//
//   mode: "confirm_buttons"
//     Sends an interactive button message asking the customer to
//     confirm a booking action (book / reschedule / cancel). Called
//     by whatsapp-agent after autonomy gates pass. On success the
//     whatsapp_booking_actions row transitions to
//     'awaiting_customer_confirm' with a 24h TTL. On Meta failure
//     the row stays at 'pending' for staff to handle via the inbox.
//
// Response contract (Stage 1, PR A; see docs/send-outcomes.md):
//   Success:  { ok: true, recorded: boolean, warnings: string[], … }
//             `recorded: false` means the message WENT but is not in the inbox.
//             A warning is never a reason to resend.
//   Failure:  { ok: false, outcome: "not_sent" | "unknown", code, error }
//             `unknown` means it MAY have been sent; do not retry or fall
//             through to another channel.
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

import { bookingEntryInteractive } from "../_shared/bookingEntry.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { timingSafeEqualHeader } from "../_shared/webhook-auth.ts";
import { buildAllowedOrigins, buildCorsHeaders } from "../_shared/cors.ts";
import {
  type ConfirmButtonsBody,
  type ConfirmButtonsDeps,
  type ConfirmButtonsResult,
  type SupabaseLike,
  runConfirmButtons,
} from "../_shared/confirmButtons.ts";
import { buildFlowMetaBody, validateFlowMessageParams } from "../_shared/flowMessage.ts";
import {
  completeConversationAfterConfirmation,
  CONVERSATION_COMPLETING_TEMPLATES,
} from "./confirmationCompletes.ts";
import { SALON_LOCATION, TEMPLATES_WITH_LOCATION_HEADER } from "../_shared/salonConstants.ts";
import {
  decideAiMessagingSend,
  type AiMessagingDecision,
} from "../_shared/aiMessagingGate.ts";
import { fallbackReplyForIntent } from "../_shared/agentRisk.ts";
import {
  decideOptOutSend,
  phoneMatchKey,
  phoneMatchPattern,
  type OptOutRecipient,
} from "../_shared/optOut.ts";
import {
  classifyProviderResponse,
  ProviderNotConfiguredError,
  ProviderOutcomeUnknownError,
  ProviderRejectedError,
  UNKNOWN_OUTCOME_TEXT,
} from "../_shared/sendOutcome.ts";
import { type IdentityDb, observeSendIdentity } from "../_shared/sendIdentity.ts";

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
) & {
  ai_initiated?: boolean;
  /**
   * Staff only: send to a customer who has opted out of WhatsApp. For the
   * rare operational message they must still receive (a cancellation they
   * asked for). Ignored on AI-initiated sends and on internal-secret calls.
   */
  override_opt_out?: boolean;
};

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

// A request that outlives this is an unknown outcome, not a hang.
const META_REQUEST_TIMEOUT_MS = 15_000;

/**
 * Send to Meta. Resolves only for an ACCEPTED message (a message id came
 * back). Otherwise it throws one of three typed errors, and callers must keep
 * them apart (_shared/sendOutcome.ts):
 *   ProviderNotConfiguredError  our credentials are missing: not sent.
 *   ProviderRejectedError       Meta answered and refused: not sent.
 *   ProviderOutcomeUnknownError we cannot tell (network failure, timeout, 5xx,
 *                               2xx with no message id): it MAY have been sent.
 */
async function callMeta(body: unknown): Promise<MetaSendSuccess> {
  if (!META_ACCESS_TOKEN || !META_PHONE_NUMBER_ID) {
    throw new ProviderNotConfiguredError("Meta WhatsApp credentials not configured");
  }
  const url = `https://graph.facebook.com/${META_GRAPH_VERSION}/${META_PHONE_NUMBER_ID}/messages`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${META_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(META_REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    // The request may have reached Meta before the connection failed.
    throw new ProviderOutcomeUnknownError(
      `Meta request failed before an answer arrived: ${err instanceof Error ? err.name : "error"}`,
    );
  }

  let json: MetaSendSuccess & MetaSendError = {} as MetaSendSuccess & MetaSendError;
  let jsonParsed = false;
  try {
    json = await res.json();
    jsonParsed = true;
  } catch {
    // Unreadable body: classified below.
  }
  const messageId = json.messages?.[0]?.id;
  const outcome = classifyProviderResponse({
    ok: res.ok,
    status: res.status,
    jsonParsed,
    hasMessageId: typeof messageId === "string" && messageId.length > 0,
  });
  if (outcome === "accepted") return json;

  const err = json.error;
  const detail = `Meta ${res.status} — ${err?.type ?? "error"} ${err?.code ?? ""}: ${
    err?.message ?? (jsonParsed ? JSON.stringify(json) : "unreadable response")
  }`;
  if (outcome === "rejected") throw new ProviderRejectedError(detail, res.status);
  throw new ProviderOutcomeUnknownError(detail);
}

/**
 * The response for a send that did not return an accepted message. Only a
 * definite refusal says "not sent"; anything else we cannot classify is
 * treated as unknown, never as a clean failure.
 */
function providerFailure(req: Request, err: unknown, where: string): Response {
  console.error(
    `whatsapp-send ${where}: Meta send failed:`,
    err instanceof Error ? err.message : String(err),
  );
  if (err instanceof ProviderNotConfiguredError) {
    return json(req, {
      ok: false,
      outcome: "not_sent",
      code: "provider_not_configured",
      error: "WhatsApp isn't set up on the server, so nothing was sent.",
    }, 500);
  }
  if (err instanceof ProviderRejectedError) {
    return json(req, { ok: false, outcome: "not_sent", code: "provider_rejected", error: "Meta send failed" }, 502);
  }
  return json(req, {
    ok: false,
    outcome: "unknown",
    code: "delivery_outcome_unknown",
    error: UNKNOWN_OUTCOME_TEXT,
  }, 502);
}

/** Only a definite refusal lets the caller undo its claim: after an unknown outcome the message may be out. */
function canUndoAfter(err: unknown): boolean {
  return err instanceof ProviderRejectedError || err instanceof ProviderNotConfiguredError;
}

// Note: whatsapp_messages.role has a CHECK constraint allowing only
// 'user'|'assistant'|'system'|'tool'. All outbound goes in as 'assistant'
// regardless of whether it came from the AI or from a staff compose box.
// If we later want the inbox to visually distinguish staff vs AI replies,
// extend the CHECK with 'staff' in a follow-up migration.
interface RecordResult {
  /** When the row was written, or would have been; null when there was no conversation to write to. */
  sentAt: string | null;
  /** The whatsapp_messages row exists. False means staff will not see this message in the thread. */
  recorded: boolean;
  /** The conversation's last_outbound_at moved. */
  conversationUpdated: boolean;
}

async function recordOutbound(
  supabase: SupabaseClient,
  conversationId: string | null,
  metaMessageId: string | null,
  content: string | null,
  raw: unknown,
): Promise<RecordResult> {
  if (!conversationId) return { sentAt: null, recorded: false, conversationUpdated: false };
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
  return { sentAt, recorded: !error, conversationUpdated: !convError };
}

/**
 * The success body's bookkeeping: `recorded`, and `warnings`, a list of stable
 * codes for things that did not go perfectly AFTER the message went out. A
 * warning is never a reason to resend: the message is on its way.
 */
function sentBody(
  rec: RecordResult,
  observed: string[],
  extra: string[] = [],
): { recorded: boolean; warnings: string[] } {
  const warnings: string[] = [];
  if (!rec.recorded) warnings.push("message_not_recorded");
  else if (!rec.conversationUpdated) warnings.push("conversation_not_updated");
  warnings.push(...extra, ...observed);
  return { recorded: rec.recorded, warnings };
}

// ── A staff reply supersedes the AI drafts it answers (#1063) ──
// Only a signed-in member of staff counts. The agent's own sends use the
// internal secret (userId undefined), so the AI can neither supersede drafts
// nor mark its own messages as staff.
//
// The database cannot tell a staff reply from an AI or system message (every
// outbound row is role 'assistant'), so the sender marks it: a top-level
// `sent_by: "staff"` beside Meta's own keys in `raw`, which leaves
// `raw.messages[0].id` where its readers expect it. No migration.
//
// `sent_kind: "text"` marks a free-text send. Meta's own response does not say
// what was sent, so without this a failed message cannot be told apart from a
// template or an interactive one, and the inbox must not offer to re-send it
// as plain text unless it is certain (only rows carrying this mark qualify).
function outboundRaw(
  metaRes: MetaSendSuccess,
  staffUserId: string | undefined,
  kind?: "text",
): unknown {
  return {
    ...metaRes,
    ...(kind ? { sent_kind: kind } : {}),
    ...(staffUserId ? { sent_by: "staff" } : {}),
  };
}

// After a staff member's text has gone, the conversation's older pending
// drafts no longer need an answer: supersede them, exactly as the
// newer-inbound trigger does (20260520240000), so nobody approves a second,
// overlapping reply later. Left alone: STOP acknowledgement drafts, drafts with
// a pending booking action attached (owner decision, 21 October 2026), and any
// draft created after the reply. Best effort: the message has already been
// sent, so a failure here is logged and never fails the send.
async function supersedeDraftsAfterStaffReply(
  supabase: SupabaseClient,
  conversationId: string,
  sentAt: string,
  keepDraftId?: string,
): Promise<boolean> {
  try {
    const { data: pending, error: pendingErr } = await supabase
      .from("whatsapp_drafts")
      .select("id, tool_calls")
      .eq("conversation_id", conversationId)
      .eq("state", "pending")
      .lt("created_at", sentAt);
    if (pendingErr) throw new Error(pendingErr.message);

    const candidates = ((pending ?? []) as { id: string; tool_calls: Record<string, unknown> | null }[])
      .filter((d) => d.id !== keepDraftId)
      .filter((d) => String(d.tool_calls?.opt_out_acknowledgement) !== "true")
      .map((d) => d.id);
    if (candidates.length === 0) return true;

    const { data: actions, error: actionsErr } = await supabase
      .from("whatsapp_booking_actions")
      .select("draft_id")
      .eq("state", "pending")
      .in("draft_id", candidates);
    if (actionsErr) throw new Error(actionsErr.message);
    const held = new Set(((actions ?? []) as { draft_id: string | null }[]).map((a) => a.draft_id));
    const ids = candidates.filter((id) => !held.has(id));
    if (ids.length === 0) return true;

    const { data: superseded, error: updateErr } = await supabase
      .from("whatsapp_drafts")
      .update({ state: "superseded", rejected_reason: "staff_replied", decided_at: new Date().toISOString() })
      .in("id", ids)
      .eq("state", "pending")
      .select("id");
    if (updateErr) throw new Error(updateErr.message);
    console.log(
      `whatsapp-send: staff reply on conversation ${conversationId} superseded ${superseded?.length ?? 0} older pending draft(s)`,
    );
    return true;
  } catch (err) {
    console.error(
      `whatsapp-send: superseding drafts after a staff reply on ${conversationId} failed (the reply was sent):`,
      err instanceof Error ? err.message : String(err),
    );
    return false;
  }
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

/**
 * What the opt-out gate needs to know about a send.
 *
 * `recipient` folds every customer record the message could reach into one
 * answer: opted out if ANY of them is. `humans.phone` is unique only as typed
 * (humans_phone_unique), so one number can sit on several records stored
 * differently ("07700 900123", "+447700900123"); WhatsApp opt-out belongs to
 * the number, so one record that stopped must not slip through on another.
 * Records are found through the explicit `human_id`, the conversation (a
 * draft's or `conversation_id`'s linked customer and its phone), and the
 * destination phone `to`, matched however it was stored. The number itself
 * counts too: a conversation carrying `whatsapp_opted_out_at` (a STOP from a
 * number with no customer record, migration 20261014120000) is opted out
 * whether or not a customer record exists or is later linked. `null` means
 * nothing matched and nothing on the number asked us to stop.
 *
 * `optOutAcknowledgement` is true for one draft only: the acknowledgement the
 * agent writes when a customer sends STOP (it carries
 * `tool_calls.opt_out_acknowledgement`). A member of staff approving that
 * draft unedited is the explicit decision the override exists for.
 *
 * `acknowledgementAlreadySent` is true when another acknowledgement on the
 * draft's conversation was sent since the number's current STOP: one STOP
 * gets one acknowledgement (#1016 review).
 *
 * Any lookup error makes the whole result `ok: false`, and the send is
 * refused (AGENTS.md: an ambiguous outcome fails closed). The caller sees a
 * retryable 503; nothing reaches Meta.
 */
type OptOutContext =
  | { ok: true; recipient: OptOutRecipient | null; optOutAcknowledgement: boolean; acknowledgementAlreadySent: boolean }
  | { ok: false };

interface HumanOptOutRow {
  whatsapp_opted_out: boolean | null;
  whatsapp_opted_out_reason?: string | null;
}

// A record opted out by a STOP (the agent's, or the number's carried to it).
function asRecipient(row: HumanOptOutRow): OptOutRecipient {
  return {
    whatsapp_opted_out: row.whatsapp_opted_out,
    stopped: row.whatsapp_opted_out === true && row.whatsapp_opted_out_reason === "asked_on_whatsapp",
  };
}

async function resolveOptOutContext(
  supabase: SupabaseClient,
  body: SendBody,
): Promise<OptOutContext> {
  const found: OptOutRecipient[] = [];
  let failed = false;
  let optOutAcknowledgement = false;
  let draftConversationId: string | null = null;
  // When the draft's conversation said STOP (kept at the first STOP on repeats,
  // cleared by a re-enable).
  let stoppedAt: string | null = null;

  const byId = async (humanId: string) => {
    const { data, error } = await supabase
      .from("humans")
      .select("id, whatsapp_opted_out, whatsapp_opted_out_reason")
      .eq("id", humanId)
      .maybeSingle();
    if (error) {
      console.error("whatsapp-send: opt-out lookup by id failed:", error.message);
      failed = true;
      return;
    }
    if (data) found.push(asRecipient(data as HumanOptOutRow));
  };
  const byPhone = async (phone: string) => {
    // Match however the number was stored ("07700 900123", "+33 6 12 34 56
    // 78"), then confirm each row's digits in code.
    const pattern = phoneMatchPattern(phone);
    if (!pattern) return;
    const { data, error } = await supabase
      .from("humans")
      .select("id, phone, whatsapp_opted_out, whatsapp_opted_out_reason")
      .filter("phone", "match", pattern);
    if (error) {
      console.error("whatsapp-send: opt-out lookup by phone failed:", error.message);
      failed = true;
      return;
    }
    const target = phoneMatchKey(phone);
    const rows = ((data as (HumanOptOutRow & { phone: string | null })[] | null) ?? [])
      .filter((row) => phoneMatchKey(row.phone) === target);
    found.push(...rows.map(asRecipient));
    // The number's own suppression, for a STOP with no customer record.
    const { data: convs, error: convErr } = await supabase
      .from("whatsapp_conversations")
      .select("id, phone_e164, whatsapp_opted_out_at")
      .eq("channel", "whatsapp")
      .filter("phone_e164", "match", pattern);
    if (convErr) {
      console.error("whatsapp-send: opt-out number lookup failed:", convErr.message);
      failed = true;
      return;
    }
    for (const conv of (convs ?? []) as { phone_e164: string | null; whatsapp_opted_out_at: string | null }[]) {
      if (conv.whatsapp_opted_out_at && phoneMatchKey(conv.phone_e164) === target) {
        found.push({ whatsapp_opted_out: true, stopped: true });
      }
    }
  };
  // Returns the conversation's STOP time, if it has one.
  const byConversation = async (conversationId: string): Promise<string | null> => {
    const { data, error } = await supabase
      .from("whatsapp_conversations")
      .select("human_id, phone_e164, whatsapp_opted_out_at")
      .eq("id", conversationId)
      .maybeSingle();
    if (error) {
      console.error("whatsapp-send: opt-out conversation lookup failed:", error.message);
      failed = true;
      return null;
    }
    const conv = data as { human_id: string | null; phone_e164: string | null; whatsapp_opted_out_at: string | null } | null;
    if (!conv) return null;
    if (conv.whatsapp_opted_out_at) found.push({ whatsapp_opted_out: true, stopped: true });
    if (conv.human_id) await byId(conv.human_id);
    if (conv.phone_e164) await byPhone(conv.phone_e164);
    return conv.whatsapp_opted_out_at;
  };

  if ("human_id" in body && typeof body.human_id === "string" && body.human_id) {
    await byId(body.human_id);
  }
  if (body.mode === "draft") {
    const { data, error } = await supabase
      .from("whatsapp_drafts")
      .select("conversation_id, tool_calls, proposed_text")
      .eq("id", body.draft_id)
      .maybeSingle();
    if (error) {
      console.error("whatsapp-send: opt-out draft lookup failed:", error.message);
      failed = true;
    } else if (data) {
      const draft = data as { conversation_id: string | null; tool_calls: Record<string, unknown> | null; proposed_text: string | null };
      // The marker AND the agent's own words: staff can update a draft row,
      // so a row carrying the marker but other text is not the
      // acknowledgement (#1016 final review).
      optOutAcknowledgement = draft.tool_calls?.opt_out_acknowledgement === true
        && draft.proposed_text === fallbackReplyForIntent("opt_out");
      if (draft.conversation_id) {
        draftConversationId = draft.conversation_id;
        stoppedAt = await byConversation(draft.conversation_id);
      }
    }
  } else if ("conversation_id" in body && typeof body.conversation_id === "string" && body.conversation_id) {
    await byConversation(body.conversation_id);
  }
  if ("to" in body && typeof body.to === "string" && body.to) {
    await byPhone(body.to);
  }

  if (failed) return { ok: false };
  const recipient = found.length > 0
    ? {
      whatsapp_opted_out: found.some((row) => row.whatsapp_opted_out === true),
      stopped: found.some((row) => row.stopped === true),
    }
    : null;

  // One acknowledgement per STOP. The unique index stops a second PENDING
  // acknowledgement only: a repeated STOP after staff sent the first, or one
  // racing staff's Send, can still queue another (#1016 review). Refuse it
  // once an acknowledgement on this conversation has been sent since the
  // current STOP. With no STOP time on the conversation there is no lower
  // bound, so any acknowledgement sent before counts.
  let acknowledgementAlreadySent = false;
  if (optOutAcknowledgement && recipient?.stopped && draftConversationId && body.mode === "draft") {
    let sent = supabase
      .from("whatsapp_drafts")
      .select("id")
      .eq("conversation_id", draftConversationId)
      .neq("id", body.draft_id)
      .eq("tool_calls->>opt_out_acknowledgement", "true")
      .in("state", ["approved", "sent_after_edit", "auto_sent"]);
    if (stoppedAt) sent = sent.gte("decided_at", stoppedAt);
    const { data, error } = await sent.limit(1);
    if (error) {
      console.error("whatsapp-send: opt-out acknowledgement lookup failed:", error.message);
      return { ok: false };
    }
    if ((data ?? []).length > 0) {
      optOutAcknowledgement = false;
      acknowledgementAlreadySent = true;
    }
  }

  return { ok: true, recipient, optOutAcknowledgement, acknowledgementAlreadySent };
}

async function handleDraftMode(
  req: Request,
  supabase: SupabaseClient,
  body: DraftMode,
  userId: string | undefined,
  observed: string[],
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
    // Only a definite "not sent" hands the draft back for another approval.
    // After an unknown outcome the message may be out: the draft stays claimed
    // (approved / sent_after_edit) so nobody can approve it a second time and
    // send the customer a duplicate.
    if (canUndoAfter(err)) {
      await supabase
        .from("whatsapp_drafts")
        .update({
          state: "pending",
          edited_text: null,
          decided_by: null,
          decided_at: null,
        })
        .eq("id", draft.id);
    } else {
      console.error(`whatsapp-send draft mode: draft ${draft.id} left claimed: the send outcome is unknown`);
    }
    return providerFailure(req, err, "draft mode");
  }

  const metaMessageId = metaRes.messages?.[0]?.id ?? null;

  const rec = await recordOutbound(supabase, conv.id, metaMessageId, textToSend, outboundRaw(metaRes, userId, "text"));
  const extra: string[] = [];
  if (userId && rec.sentAt && !(await supersedeDraftsAfterStaffReply(supabase, conv.id, rec.sentAt, draft.id))) {
    extra.push("draft_supersede_failed");
  }

  return json(req, {
    ok: true,
    meta_message_id: metaMessageId,
    sent_text: textToSend,
    draft_id: draft.id,
    ...sentBody(rec, observed, extra),
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
  userId: string | undefined,
  observed: string[],
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
    return providerFailure(req, err, "manual mode");
  }

  const metaMessageId = metaRes.messages?.[0]?.id ?? null;

  const rec = await recordOutbound(supabase, conv.id, metaMessageId, text, outboundRaw(metaRes, userId, "text"));
  const extra: string[] = [];
  if (userId && rec.sentAt && !(await supersedeDraftsAfterStaffReply(supabase, conv.id, rec.sentAt))) {
    extra.push("draft_supersede_failed");
  }

  return json(req, {
    ok: true,
    meta_message_id: metaMessageId,
    sent_text: text,
    conversation_id: conv.id,
    ...sentBody(rec, observed, extra),
  });
}

async function handleTemplateMode(
  req: Request,
  supabase: SupabaseClient,
  body: TemplateMode,
  observed: string[],
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
    return providerFailure(req, err, "template mode");
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
  const rec = await recordOutbound(supabase, conversationId, metaMessageId, content, metaRes);
  const extra: string[] = [];
  // No conversation to record on: the send went out, but it will not appear in
  // the inbox. (Not the same as a failed write, so it gets its own code.)
  if (!conversationId) extra.push("conversation_unavailable");

  // A booking confirmation leaves nothing for staff to do in the thread, so
  // mark it complete, unless a request for a person is still unanswered.
  if (metaMessageId && conversationId && CONVERSATION_COMPLETING_TEMPLATES.has(body.template_name)) {
    const completion = await completeConversationAfterConfirmation(supabase, conversationId);
    if (completion === "failed") extra.push("conversation_not_completed");
  }

  return json(req, {
    ok: true,
    meta_message_id: metaMessageId,
    template: body.template_name,
    language: lang,
    ...sentBody(rec, observed, extra),
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

  // Hoisted into an explicitly annotated const on purpose: inferring the
  // argument inline made TypeScript instantiate SupabaseClient's generics
  // through the whole ConfirmButtonsDeps shape (TS2589, "type instantiation
  // is excessively deep").
  //
  // The `as unknown as` is a deliberate dependency boundary, not a shrug.
  // confirmButtons.ts uses exactly five operations —
  // .from().select().eq().single() and .from().update().eq().select() — and
  // SupabaseLike describes precisely those, so the real client genuinely
  // satisfies it. The *real* structural mismatch (SupabaseSelectQuery.single()
  // declaring Promise when the client returns a thenable) is fixed properly at
  // its source in confirmButtons.ts. What remains is only that TypeScript
  // exhausts its instantiation depth before it can finish comparing the two
  // types: both a plain `as SupabaseLike` and no cast at all still raise
  // TS2589, so it never reaches a compatibility verdict to be suppressed.
  // Going via `unknown` short-circuits that comparison.
  const deps: ConfirmButtonsDeps = {
    supabase: supabase as unknown as SupabaseLike,
    callMeta,
    recordOutbound: async (conversationId, metaMessageId, content, raw) => {
      await recordOutbound(supabase, conversationId, metaMessageId, content, raw);
    },
    now: () => new Date(),
  };

  const result: ConfirmButtonsResult = await runConfirmButtons(deps, inputBody);

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
  observed: string[],
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
    // After an unknown outcome the Flow message may have arrived, so its
    // session stays active: failing it would break a Flow the customer can open.
    if (canUndoAfter(err)) {
      await supabase.from("whatsapp_flow_sessions").update({ status: "failed" }).eq("flow_token", flowToken);
    }
    return providerFailure(req, err, "flow mode");
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
  const rec = await recordOutbound(supabase, conversationId, metaMessageId, `[flow:${body.flow_id}] ${body.body_text}`, metaBody);
  const extra = conversationId ? [] : ["conversation_unavailable"];

  return json(req, { ok: true, flow_token: flowToken, meta_message_id: metaMessageId, ...sentBody(rec, observed, extra) });
}

// ── Booking-entry handler ─────────────────────────────────────
// Message 1 of the WhatsApp booking entry: a tap-to-confirm identity
// check sent automatically when a recognised customer asks to book. The
// customer is greeted by name; the dogs are confirmed later inside the
// Flow (server-validated multi-select). On "Book my dogs" the agent opens
// the "Choose dogs & book" Flow (see whatsapp-agent's
// bookentry:start routing). Tagged [book_entry] so the agent can debounce.
async function handleBookEntryMode(
  req: Request,
  supabase: SupabaseClient,
  body: BookEntryMode,
  observed: string[],
): Promise<Response> {
  if (!body.to || !body.conversation_id) {
    return json(req, { error: "book_entry requires to + conversation_id" }, 400);
  }

  let name = "";
  if (body.human_id) {
    const { data } = await supabase.from("humans").select("name").eq("id", body.human_id).maybeSingle();
    name = (data as { name?: string } | null)?.name ?? "";
  }

  const interactive = bookingEntryInteractive(name);
  const bodyText = interactive.body.text;
  const metaBody = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: toMetaTo(body.to),
    type: "interactive",
    interactive,
  };

  let metaRes: MetaSendSuccess;
  try {
    metaRes = await callMeta(metaBody);
  } catch (err) {
    return providerFailure(req, err, "book_entry mode");
  }

  const metaMessageId = metaRes.messages?.[0]?.id ?? null;
  const rec = await recordOutbound(supabase, body.conversation_id, metaMessageId, `[book_entry] ${bodyText}`, metaBody);

  return json(req, { ok: true, meta_message_id: metaMessageId, ...sentBody(rec, observed) });
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
  observed: string[],
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
    return providerFailure(req, err, "list mode");
  }

  const metaMessageId = metaRes.messages?.[0]?.id ?? null;
  const rec = await recordOutbound(supabase, body.conversation_id, metaMessageId, `[manage_list] ${body.body_text}`, metaBody);
  return json(req, { ok: true, meta_message_id: metaMessageId, ...sentBody(rec, observed) });
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

export async function handleSendRequest(req: Request): Promise<Response> {
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

    // Opt-out is enforced here, once, for every mode: the callers' own
    // channel choice (recipients.ts) is a courtesy, this is the boundary.
    const optOutContext = await resolveOptOutContext(supabase, parsed);
    if (!optOutContext.ok) {
      return json(
        req,
        {
          ok: false,
          outcome: "not_sent",
          error: "Could not check whether this customer has opted out of WhatsApp, so nothing was sent. Try again.",
          reason: "opt_out_check_failed",
        },
        503,
      );
    }
    if (optOutContext.acknowledgementAlreadySent) {
      return json(
        req,
        {
          error: "The STOP acknowledgement has already been sent to this number",
          reason: "stop_acknowledgement_already_sent",
        },
        409,
      );
    }
    // Approving the agent's STOP acknowledgement draft unedited is the one
    // message a number that said STOP may still get; editing it is not, and
    // `override_opt_out` never reaches a STOP (#1016 final review).
    const approvesAcknowledgement = parsed.mode === "draft"
      && optOutContext.optOutAcknowledgement
      && !parsed.edited_text?.trim();
    // The acknowledgement's own words are going out, edited or not: refused
    // once the STOP no longer stands, since it would tell an opted-in
    // number that its messages have stopped (#1016 review).
    const ackText = fallbackReplyForIntent("opt_out");
    const sendsAcknowledgement = parsed.mode === "draft"
      && optOutContext.optOutAcknowledgement
      && (parsed.edited_text?.trim() || ackText) === ackText;
    const optOut = decideOptOutSend({
      recipient: optOutContext.recipient,
      overrideOptOut: parsed.override_opt_out === true,
      approvesAcknowledgement,
      sendsAcknowledgement,
      callerIsStaff: !!auth.userId,
      aiInitiated: parsed.ai_initiated === true,
    });
    if (!optOut.allowed && optOut.reason === "stop_acknowledgement_stale") {
      return json(
        req,
        {
          error: "This STOP acknowledgement is out of date because the number's STOP has been lifted, so it was not sent. Reject it, or write a new reply",
          reason: optOut.reason,
        },
        409,
      );
    }
    if (!optOut.allowed) {
      return json(
        req,
        {
          error: "This customer has opted out of WhatsApp messages",
          reason: optOut.reason,
        },
        409,
      );
    }
    if (optOut.reason === "staff_override" || optOut.reason === "stop_acknowledgement") {
      console.log(
        `whatsapp-send: staff override of an opt-out (${parsed.mode}${approvesAcknowledgement ? ", STOP acknowledgement" : ""}) by ${auth.userId}`,
      );
    }

    // Observe-only (Stage 1, PR A): do the destination, customer, conversation
    // and channel agree? Disagreements come back as `warnings` and are logged;
    // nothing is refused. confirm_buttons derives its destination from the
    // conversation and checks its action belongs to it, so it is skipped.
    const observed = parsed.mode === "confirm_buttons"
      ? []
      : await observeSendIdentity(supabase as unknown as IdentityDb, {
        endpoint: "whatsapp-send",
        endpointChannel: "whatsapp",
        mode: parsed.mode,
        to: "to" in parsed ? parsed.to : null,
        humanId: "human_id" in parsed ? parsed.human_id : null,
        conversationId: "conversation_id" in parsed ? parsed.conversation_id : null,
        draftId: parsed.mode === "draft" ? parsed.draft_id : null,
      });

    if (parsed.mode === "draft") {
      return await handleDraftMode(req, supabase, parsed, auth.userId, observed);
    } else if (parsed.mode === "manual") {
      return await handleManualMode(req, supabase, parsed, auth.userId, observed);
    } else if (parsed.mode === "template") {
      return await handleTemplateMode(req, supabase, parsed, observed);
    } else if (parsed.mode === "confirm_buttons") {
      return await handleConfirmButtons(req, supabase, parsed);
    } else if (parsed.mode === "flow") {
      return await handleFlowMode(req, supabase, parsed, observed);
    } else if (parsed.mode === "book_entry") {
      return await handleBookEntryMode(req, supabase, parsed, observed);
    } else if (parsed.mode === "list") {
      return await handleListMode(req, supabase, parsed, observed);
    } else {
      return json(req, { error: `unknown mode: ${(parsed as any).mode}` }, 400);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("whatsapp-send unhandled error:", message);
    return json(req, { error: "internal error" }, 500);
  }
}

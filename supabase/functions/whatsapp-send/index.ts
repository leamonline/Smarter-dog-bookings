// ============================================================
// supabase/functions/whatsapp-send/index.ts
//
// Sends WhatsApp messages via Meta Cloud API. This is the "mouth"
// of the pipeline — everything that goes out to customers goes
// through here. whatsapp-webhook is the "ears", whatsapp-agent is
// the "brain", this is the "mouth".
//
// Two modes:
//
//   mode: "draft"
//     Sends a free-form text message based on an approved draft.
//     Caller (admin inbox UI) passes { mode, draft_id, edited_text? }.
//     Claude-drafted text or staff-edited text is sent as a plain
//     WhatsApp text message. Only works inside Meta's 24h customer
//     service window — the function rejects the call if the last
//     inbound from that customer was >24h ago.
//
//   mode: "template"
//     Sends a pre-approved Meta template message.
//     Caller (notify-booking-reminder, or admin UI when the 24h
//     window has expired) passes { mode, to, template_name,
//     language?, params }. params is a positional array filling
//     the {{1}}, {{2}}, ... placeholders in the template body.
//
// What this function does NOT do:
//   - Look up customer phones from humans. That's the caller's job.
//   - Decide which template to use. That's the caller's job.
//   - Retry on failure. One attempt, surface the error.
//   - Handle media or interactive messages. v1 is text + template only.
//
// Auth:
//   Deployed WITH jwt verification. The caller must be a logged-in
//   Supabase auth user. This function then verifies they're staff
//   via the is_staff() helper. The staff check uses a user-scoped
//   supabase client; the actual DB writes use the service role.
//   This means internal callers (like notify-booking-reminder) need
//   to use the service role key directly, which they already do.
//
//   For service-role callers (no JWT), we accept the shared
//   SEND_INTERNAL_SECRET header as a backup. This is how
//   notify-booking-reminder authenticates without a user JWT.
//
// Env vars required:
//   SUPABASE_URL                (auto)
//   SUPABASE_SERVICE_ROLE_KEY   (auto)
//   SUPABASE_ANON_KEY           (auto)
//   META_ACCESS_TOKEN           (user-added — permanent system user)
//   META_PHONE_NUMBER_ID        (user-added — e.g. 1060731703795077)
//   SEND_INTERNAL_SECRET        (user-added — for service-role callers)
//
// Deploy with:
//   supabase functions deploy whatsapp-send
//   (JWT verification is ON — the default. Don't pass --no-verify-jwt.)
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── Environment ─────────────────────────────────────────────
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const META_ACCESS_TOKEN = Deno.env.get("META_ACCESS_TOKEN")!;
const META_PHONE_NUMBER_ID = Deno.env.get("META_PHONE_NUMBER_ID")!;
const SEND_INTERNAL_SECRET = Deno.env.get("SEND_INTERNAL_SECRET") ?? "";

const META_GRAPH_VERSION = "v22.0";

// ── Types ───────────────────────────────────────────────────
interface DraftMode {
  mode: "draft";
  draft_id: string;
  edited_text?: string; // if staff edited before sending
}

interface TemplateMode {
  mode: "template";
  to: string;                // E.164 with or without leading +
  template_name: string;     // must match an approved Meta template
  language?: string;         // default en_GB
  params?: string[];         // positional body placeholders {{1}}, {{2}}, ...
  conversation_id?: string;  // optional — for attaching the outbound record
}

type SendBody = DraftMode | TemplateMode;

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

// ── Helpers ──────────────────────────────────────────────────

/**
 * Normalise a phone number for the Meta API.
 * Meta accepts either "+447873329440" or "447873329440" but returns
 * wa_id as digits-only. We standardise on digits-only going out, and
 * store +E.164 in our own DB elsewhere.
 */
function toMetaTo(phone: string): string {
  return phone.replace(/\D/g, "");
}

function toE164(digits: string): string {
  const d = digits.replace(/\D/g, "");
  return d ? `+${d}` : "";
}

/**
 * Call Meta's messages endpoint. Throws on non-2xx with Meta's error
 * body in the message so logs contain the full story.
 */
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

/**
 * Write an outbound message row. Records the wamid so subsequent
 * delivery/read status events from Meta (handled in whatsapp-agent)
 * can be stitched back to this row.
 */
async function recordOutbound(
  supabase: SupabaseClient,
  conversationId: string | null,
  metaMessageId: string | null,
  content: string | null,
  raw: unknown,
) {
  if (!conversationId) return; // template sends without a conversation row — skip
  const { error } = await supabase.from("whatsapp_messages").insert({
    conversation_id: conversationId,
    direction: "outbound",
    role: "assistant",
    meta_message_id: metaMessageId,
    content,
    raw,
    status: "sent",
    sent_at: new Date().toISOString(),
  });
  if (error) console.error("recordOutbound failed:", error);
}

/**
 * 24-hour customer service window check.
 * Meta only allows free-form (non-template) replies within 24h of the
 * customer's last inbound. Outside that window Meta returns error 131047.
 * Check proactively to give a clearer error to staff.
 *
 * Returns true if the window is open.
 */
function isWindowOpen(lastInboundAt: string | null | undefined): boolean {
  if (!lastInboundAt) return false;
  const ms = Date.now() - new Date(lastInboundAt).getTime();
  return ms < 24 * 60 * 60 * 1000;
}

// ── Auth ─────────────────────────────────────────────────────
/**
 * Returns {ok:true, userId} if the caller is a logged-in staff member,
 * {ok:true, internal:true} if they provided the internal shared
 * secret, or {ok:false, reason} otherwise.
 *
 * The JWT path uses a user-scoped supabase client so is_staff()
 * evaluates in that user's context. DB writes later in the request
 * use the service role.
 */
async function authorise(req: Request): Promise<
  | { ok: true; userId?: string; internal?: boolean }
  | { ok: false; reason: string; status: number }
> {
  // Internal callers (edge functions → edge functions) — e.g. the
  // reminder cron job. Constant-time-ish compare isn't necessary here
  // because we control both sides.
  const internalHeader = req.headers.get("x-internal-secret");
  if (SEND_INTERNAL_SECRET && internalHeader === SEND_INTERNAL_SECRET) {
    return { ok: true, internal: true };
  }

  // JWT path — forward the Authorization header to a user-scoped client.
  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    return { ok: false, reason: "missing authorization", status: 401 };
  }

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userRes, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userRes?.user) {
    return { ok: false, reason: "invalid token", status: 401 };
  }

  // is_staff() is a helper defined in migration 004_rls_policies.sql.
  // When called via .rpc it runs in the user's JWT context.
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

// ── Draft-mode handler ──────────────────────────────────────
async function handleDraftMode(
  supabase: SupabaseClient,
  body: DraftMode,
  userId: string | undefined,
): Promise<Response> {
  // Load draft + conversation in one go
  const { data: draft, error: draftErr } = await supabase
    .from("whatsapp_drafts")
    .select(
      "id, conversation_id, proposed_text, state, whatsapp_conversations!inner(id, phone_e164, last_inbound_at)",
    )
    .eq("id", body.draft_id)
    .single();

  if (draftErr || !draft) {
    return json({ error: "draft not found", detail: draftErr?.message }, 404);
  }

  if (draft.state !== "pending") {
    return json(
      { error: `draft is ${draft.state}, not pending`, draft_id: draft.id },
      409,
    );
  }

  const conv = (draft as any).whatsapp_conversations as {
    id: string;
    phone_e164: string;
    last_inbound_at: string | null;
  };

  // 24h customer service window check
  if (!isWindowOpen(conv.last_inbound_at)) {
    return json(
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
    return json({ error: "empty message body" }, 400);
  }

  // Atomic state transition: only proceed if still pending.
  // Guards against double-clicks / concurrent approvals.
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
      { error: "draft already claimed by another request", detail: claimErr?.message },
      409,
    );
  }

  // Send to Meta
  let metaRes: MetaSendSuccess;
  try {
    metaRes = await callMeta({
      messaging_product: "whatsapp",
      to: toMetaTo(conv.phone_e164),
      type: "text",
      text: { body: textToSend },
    });
  } catch (err) {
    // Revert the state so staff can retry
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
      {
        error: "Meta send failed",
        detail: err instanceof Error ? err.message : String(err),
      },
      502,
    );
  }

  const metaMessageId = metaRes.messages?.[0]?.id ?? null;

  await recordOutbound(supabase, conv.id, metaMessageId, textToSend, metaRes);

  return json({
    ok: true,
    meta_message_id: metaMessageId,
    sent_text: textToSend,
    draft_id: draft.id,
  });
}

// ── Template-mode handler ───────────────────────────────────
async function handleTemplateMode(
  supabase: SupabaseClient,
  body: TemplateMode,
): Promise<Response> {
  if (!body.to || !body.template_name) {
    return json({ error: "to and template_name are required" }, 400);
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
      {
        error: "Meta send failed",
        detail: err instanceof Error ? err.message : String(err),
      },
      502,
    );
  }

  const metaMessageId = metaRes.messages?.[0]?.id ?? null;

  // Best-effort: attach to conversation if caller provided conversation_id
  // or if we can find one by phone.
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

  return json({
    ok: true,
    meta_message_id: metaMessageId,
    template: body.template_name,
    language: lang,
  });
}

// ── HTTP helpers ─────────────────────────────────────────────
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ── Main handler ─────────────────────────────────────────────
serve(async (req) => {
  if (req.method !== "POST") {
    return json({ error: "method not allowed" }, 405);
  }

  const auth = await authorise(req);
  if (!auth.ok) {
    return json({ error: auth.reason }, auth.status);
  }

  let parsed: SendBody;
  try {
    parsed = await req.json();
  } catch {
    return json({ error: "bad json" }, 400);
  }

  if (!parsed || !("mode" in parsed)) {
    return json({ error: "mode is required ('draft' | 'template')" }, 400);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  try {
    if (parsed.mode === "draft") {
      return await handleDraftMode(supabase, parsed, auth.userId);
    } else if (parsed.mode === "template") {
      return await handleTemplateMode(supabase, parsed);
    } else {
      return json({ error: `unknown mode: ${(parsed as any).mode}` }, 400);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("whatsapp-send unhandled error:", message);
    return json({ error: "internal error", detail: message }, 500);
  }
});

// ============================================================
// Local test harness
//
// 1) As a staff user, approve a pending draft (JWT path):
//    curl -X POST https://<project>.supabase.co/functions/v1/whatsapp-send \
//      -H "Authorization: Bearer <user-session-jwt>" \
//      -H "Content-Type: application/json" \
//      -d '{"mode":"draft","draft_id":"<uuid>"}'
//
// 2) Send a reminder template (service-role path):
//    curl -X POST https://<project>.supabase.co/functions/v1/whatsapp-send \
//      -H "x-internal-secret: $SEND_INTERNAL_SECRET" \
//      -H "Content-Type: application/json" \
//      -d '{"mode":"template","to":"+447873329440",
//           "template_name":"appointment_reminder_v1",
//           "params":["Paul","Roxy","10:30am on Tuesday 22 April"]}'
//
// Expected Meta errors that indicate setup problems, not code bugs:
//   - 131026 (message undeliverable) — phone number not registered on WA
//   - 131047 (24h window closed) — our isWindowOpen check should catch
//     this before calling Meta, but templates can still hit it if Meta
//     rejects the template itself
//   - 132000 (template name does not exist) — template isn't approved
//     or spelled wrong
//   - 190 (invalid access token) — META_ACCESS_TOKEN expired or wrong
// ============================================================

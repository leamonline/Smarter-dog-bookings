// ============================================================
// supabase/functions/sms-send/index.ts
//
// Outbound SMS via Twilio. Reuses the salon's existing Twilio
// integration in _shared/twilio.ts (same account that sends the
// customer-login codes and the notify-booking-* reminders) so
// there's only one set of env vars to manage.
//
// Two modes (much simpler than whatsapp-send's four — SMS has no
// template gate, no 24h window, no interactive buttons):
//
//   mode: "manual"
//     Free-form text typed by staff. Caller passes
//     { mode, conversation_id?, to, text, human_id? }. If
//     conversation_id is omitted we upsert one by
//     (phone_e164, channel='sms') so the outbound shows up in the
//     inbox immediately.
//
//   mode: "template"
//     Pre-rendered text from a template (the caller substituted
//     params upstream). Twilio doesn't gate template names the way
//     Meta does, so this is mostly a convenience for callers that
//     already have a template + params pair. Records the template
//     name in the message content for audit.
//
// Auth, CORS, and recordOutbound conventions match whatsapp-send.
//
// Env vars required (all already set on the project for the
// notify-booking-* path):
//   SUPABASE_URL                       (auto)
//   SUPABASE_SERVICE_ROLE_KEY          (auto)
//   SUPABASE_ANON_KEY                  (auto)
//   TWILIO_ACCOUNT_SID                 Twilio Account SID — starts with AC
//   TWILIO_API_KEY + TWILIO_API_SECRET (preferred over AUTH_TOKEN)
//   TWILIO_AUTH_TOKEN                  (legacy fallback)
//   TWILIO_MESSAGING_SERVICE_SID       Messaging Service SID — starts with MG
//                                       OR
//   TWILIO_SMS_FROM                    E.164 sender number — fallback
//   SEND_INTERNAL_SECRET               Shared with whatsapp-send for service callers
//   SMS_SEND_ALLOWED_ORIGINS           Optional CORS allowlist
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { timingSafeEqualHeader } from "../_shared/webhook-auth.ts";
import { sendSms, normaliseUkPhone } from "../_shared/twilio.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SEND_INTERNAL_SECRET = Deno.env.get("SEND_INTERNAL_SECRET") ?? "";

// Conservative cap — Twilio bills per segment (160 GSM-7 chars or 70
// UCS-2 chars). 2000 covers ~12 segments which is more than any sane
// reply but still protects against paste-the-whole-document accidents.
const MAX_SMS_TEXT_LEN = 2000;

const DEFAULT_ALLOWED_ORIGINS = [
  "https://smarterdog.vercel.app",
  "http://localhost:5173",
  "http://localhost:5174",
];
const ALLOWED_ORIGINS = new Set(
  (Deno.env.get("SMS_SEND_ALLOWED_ORIGINS") ?? DEFAULT_ALLOWED_ORIGINS.join(","))
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

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

interface ManualMode {
  mode: "manual";
  to: string;
  text: string;
  conversation_id?: string;
  human_id?: string | null;
}

interface TemplateMode {
  mode: "template";
  to: string;
  text: string; // already rendered upstream — Twilio doesn't care about template names
  conversation_id?: string;
  human_id?: string | null;
  template_name?: string;
}

type SendBody = ManualMode | TemplateMode;

async function authorise(req: Request): Promise<
  | { ok: true; userId?: string; internal?: boolean }
  | { ok: false; reason: string; status: number }
> {
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
    console.error("sms-send: getUser failed:", userErr);
    return { ok: false, reason: "invalid token", status: 401 };
  }

  const { data: staffCheck, error: staffErr } = await userClient.rpc("is_staff");
  if (staffErr) {
    console.error("sms-send: is_staff rpc failed:", staffErr);
    return { ok: false, reason: "staff check failed", status: 500 };
  }
  if (!staffCheck) {
    return { ok: false, reason: "not staff", status: 403 };
  }

  return { ok: true, userId: userRes.user.id };
}

async function resolveOrCreateConversation(
  supabase: SupabaseClient,
  phoneE164: string,
  humanId: string | null,
): Promise<string | null> {
  const { data: existing } = await supabase
    .from("whatsapp_conversations")
    .select("id, human_id")
    .eq("phone_e164", phoneE164)
    .eq("channel", "sms")
    .maybeSingle();
  if (existing?.id) {
    if (humanId && !existing.human_id) {
      await supabase
        .from("whatsapp_conversations")
        .update({ human_id: humanId })
        .eq("id", existing.id);
    }
    return existing.id;
  }
  const { data: created, error: createErr } = await supabase
    .from("whatsapp_conversations")
    .insert({
      phone_e164: phoneE164,
      channel: "sms",
      human_id: humanId,
      state: "ai_handling",
    })
    .select("id")
    .single();
  if (createErr) {
    console.error("sms-send: conversation create failed:", createErr);
    return null;
  }
  return created?.id ?? null;
}

async function recordOutbound(
  supabase: SupabaseClient,
  conversationId: string | null,
  twilioSid: string | null,
  content: string,
  raw: unknown,
): Promise<void> {
  if (!conversationId) return;
  const sentAt = new Date().toISOString();
  const { error } = await supabase.from("whatsapp_messages").insert({
    conversation_id: conversationId,
    direction: "outbound",
    role: "assistant",
    meta_message_id: twilioSid,
    content,
    raw,
    status: "sent",
    sent_at: sentAt,
    channel: "sms",
  });
  if (error) console.error("sms-send: recordOutbound failed:", error);

  const { error: convError } = await supabase
    .from("whatsapp_conversations")
    .update({ last_outbound_at: sentAt })
    .eq("id", conversationId);
  if (convError) console.error("sms-send: conversation update failed:", convError);
}

async function handleSend(
  req: Request,
  supabase: SupabaseClient,
  body: SendBody,
): Promise<Response> {
  if (!body.to) return json(req, { error: "to is required" }, 400);
  if (!body.text || !body.text.trim()) {
    return json(req, { error: "empty message body" }, 400);
  }
  if (body.text.length > MAX_SMS_TEXT_LEN) {
    return json(
      req,
      {
        error: "message too long",
        detail: `SMS messages are capped at ${MAX_SMS_TEXT_LEN} characters (~12 segments).`,
        length: body.text.length,
      },
      400,
    );
  }

  const phoneE164 = normaliseUkPhone(body.to);
  if (!phoneE164 || !phoneE164.startsWith("+")) {
    return json(req, { error: "to is not a valid phone number" }, 400);
  }

  let twilioResult;
  try {
    twilioResult = await sendSms(phoneE164, body.text.trim());
  } catch (err) {
    return json(
      req,
      {
        error: "Twilio not configured",
        detail: err instanceof Error ? err.message : String(err),
      },
      500,
    );
  }

  if (!twilioResult.ok) {
    return json(
      req,
      {
        error: "Twilio send failed",
        detail: `${twilioResult.errorCode ?? twilioResult.status}: ${twilioResult.errorMessage ?? "(no message)"}`,
        twilio_status: twilioResult.status,
        twilio_code: twilioResult.errorCode,
      },
      502,
    );
  }

  let conversationId = body.conversation_id ?? null;
  if (!conversationId) {
    conversationId = await resolveOrCreateConversation(
      supabase,
      phoneE164,
      body.human_id ?? null,
    );
  }

  const contentForRecord =
    body.mode === "template" && body.template_name
      ? `[template:${body.template_name}] ${body.text.trim()}`
      : body.text.trim();

  await recordOutbound(
    supabase,
    conversationId,
    twilioResult.sid ?? null,
    contentForRecord,
    twilioResult,
  );

  return json(req, {
    ok: true,
    twilio_sid: twilioResult.sid,
    sent_text: body.text.trim(),
    conversation_id: conversationId,
  });
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
    return json(req, { error: "mode is required ('manual' | 'template')" }, 400);
  }
  if (parsed.mode !== "manual" && parsed.mode !== "template") {
    return json(req, { error: `unknown mode: ${(parsed as any).mode}` }, 400);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  try {
    return await handleSend(req, supabase, parsed);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("sms-send unhandled error:", message);
    return json(req, { error: "internal error", detail: message }, 500);
  }
});

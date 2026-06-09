// ============================================================
// supabase/functions/notify-customer-welcome/index.ts
//
// Sends a "Welcome to the Pack" message to a newly-approved Join the Pack
// self-signup customer. Fired after staff approve a signup (staff UI or a
// follow-up automation can POST { human_id } here).
//
// Channel logic (defensive, best-effort — never hard-fail on one channel):
//   1. PRIMARY: WhatsApp via the existing whatsapp-send function in
//      "template" mode (template welcome_to_the_pack_v1, en_GB, 1 param =
//      customer first name). Requires the template be APPROVED in Meta
//      Business Manager — until then Meta rejects with a 132xxx error and we
//      fall through to SMS / email.
//   2. FALLBACK: SMS via _shared/twilio.ts sendSms (if the customer is set up
//      for SMS and hasn't opted out), then email via _shared/email.ts
//      sendEmail (if an email is on file and they haven't opted out).
//
// Idempotency: a customer should only be welcomed once. We pre-check
// notification_log for a prior welcome row for this human and skip if found,
// and we record the outcome the same way the notify-* functions do.
//
// Auth:
//   Bearer WEBHOOK_SECRET (pg_net / cron path) OR x-internal-secret
//   (service-role caller) — mirrors notify-* + whatsapp-send.
//
// Env vars required (all already provisioned for the existing senders):
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY               (auto)
//   WEBHOOK_SECRET          Bearer secret for the pg_net path
//   SEND_INTERNAL_SECRET    shared secret to call whatsapp-send + the
//                           x-internal-secret accepted on this function
//   (Twilio / Meta / SendGrid secrets are read inside the reused modules.)
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendSms } from "../_shared/twilio.ts";
import { sendEmail } from "../_shared/email.ts";
import { isAuthorizedWebhook, timingSafeEqualHeader } from "../_shared/webhook-auth.ts";
import { buildAllowedOrigins, buildCorsHeaders } from "../_shared/cors.ts";
import { sanitise } from "../_shared/format.ts";

// ── Environment variables ──────────────────────────────────────────────────
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET");
const SEND_INTERNAL_SECRET = Deno.env.get("SEND_INTERNAL_SECRET") ?? "";

// CORS — only matters for any browser caller; service-to-service callers send
// no Origin header and are unaffected. Same allowlist pattern as whatsapp-send.
const ALLOWED_ORIGINS = buildAllowedOrigins("NOTIFY_WELCOME_ALLOWED_ORIGINS");
const corsFor = (req: Request) =>
  buildCorsHeaders(req, ALLOWED_ORIGINS, { allowInternalSecret: true });

// WhatsApp template — must be APPROVED in Meta before it delivers (see
// src/constants/whatsappTemplates.js for the registry note). 1 param: the
// customer's first name.
const WELCOME_TEMPLATE_NAME = "welcome_to_the_pack_v1";
const WELCOME_TEMPLATE_LANG = "en_GB";

interface HumanRow {
  id: string;
  name: string | null;
  phone: string | null;
  whatsapp: boolean | null;
  sms: boolean | null;
  email: string | null;
  whatsapp_opted_out: boolean | null;
  sms_opted_out: boolean | null;
  email_opted_out: boolean | null;
}

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsFor(req), "Content-Type": "application/json" },
  });
}

/** Bearer WEBHOOK_SECRET (pg_net) or x-internal-secret (service-role caller). */
function isAuthorised(req: Request): boolean {
  if (WEBHOOK_SECRET && isAuthorizedWebhook(req.headers.get("Authorization"), WEBHOOK_SECRET)) {
    return true;
  }
  return timingSafeEqualHeader(req.headers.get("x-internal-secret"), SEND_INTERNAL_SECRET);
}

/**
 * Staff-user path: the approve action in the dashboard invokes this function
 * with the staff member's JWT (supabase.functions.invoke forwards the session
 * bearer). Verify it's a real staff user via is_staff() under their own token —
 * mirrors the JWT-or-internal-secret model used by sms-send / whatsapp-send.
 */
async function isStaffCaller(req: Request): Promise<boolean> {
  if (!SUPABASE_ANON_KEY) return false;
  const authz = req.headers.get("Authorization") ?? "";
  const token = authz.startsWith("Bearer ") ? authz.slice(7) : "";
  // A webhook/service bearer isn't a user JWT — don't waste a getUser call.
  if (!token || token === SUPABASE_SERVICE_ROLE_KEY || token === WEBHOOK_SECRET) return false;
  try {
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return false;
    const { data: staff } = await userClient.rpc("is_staff");
    return staff === true;
  } catch {
    return false;
  }
}

/** Call whatsapp-send service-to-service via the shared internal secret. */
async function invokeWhatsAppTemplate(
  to: string,
  firstName: string,
  humanId: string,
): Promise<{ ok: boolean; detail?: string }> {
  if (!SEND_INTERNAL_SECRET) {
    return { ok: false, detail: "SEND_INTERNAL_SECRET not configured" };
  }
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/whatsapp-send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": SEND_INTERNAL_SECRET,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        mode: "template",
        to,
        template_name: WELCOME_TEMPLATE_NAME,
        language: WELCOME_TEMPLATE_LANG,
        params: [firstName],
        human_id: humanId,
      }),
    });
    let body: Record<string, unknown> = {};
    try {
      body = await res.json();
    } catch {
      /* non-JSON */
    }
    const ok = res.ok && body.ok === true;
    return ok
      ? { ok: true }
      : { ok: false, detail: String(body.detail ?? body.error ?? `whatsapp-send ${res.status}`) };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

// ── Main handler ───────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsFor(req) });
  }
  if (req.method !== "POST") {
    return json(req, { error: "method not allowed" }, 405);
  }

  if (!WEBHOOK_SECRET && !SEND_INTERNAL_SECRET) {
    console.error("notify-customer-welcome: neither WEBHOOK_SECRET nor SEND_INTERNAL_SECRET set");
    return json(req, { error: "server misconfiguration" }, 500);
  }
  if (!isAuthorised(req) && !(await isStaffCaller(req))) {
    return json(req, { error: "unauthorized" }, 401);
  }

  // Accept either a flat { human_id } body or a DB-webhook { record } payload.
  let payload: { human_id?: string; record?: { id?: string; human_id?: string } } = {};
  try {
    payload = await req.json();
  } catch {
    return json(req, { error: "bad json" }, 400);
  }
  const humanId = payload.human_id ?? payload.record?.human_id ?? payload.record?.id ?? null;
  if (!humanId) {
    return json(req, { error: "human_id is required" }, 400);
  }

  const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // 1. Look up the customer.
    const { data: human, error: humanErr } = await supabase
      .from("humans")
      .select(
        "id, name, phone, whatsapp, sms, email, whatsapp_opted_out, sms_opted_out, email_opted_out",
      )
      .eq("id", humanId)
      .maybeSingle();

    if (humanErr) {
      console.error("notify-customer-welcome: human lookup failed:", humanErr.message);
      return json(req, { error: "human lookup failed" }, 500);
    }
    if (!human) {
      return json(req, { error: "human not found" }, 404);
    }
    const h = human as HumanRow;

    const firstName = sanitise((h.name ?? "").split(" ")[0]) || "there";

    // 2. Idempotency: skip if this customer already has a welcome logged. The
    //    notification_log trigger_type CHECK doesn't include 'welcome' yet (the
    //    Join the Pack migration didn't extend it), so we both pre-check and
    //    log defensively below — see step 5.
    const { data: priorWelcome } = await supabase
      .from("notification_log")
      .select("id")
      .eq("human_id", h.id)
      .eq("trigger_type", "welcome")
      .limit(1)
      .maybeSingle();
    if (priorWelcome?.id) {
      return json(req, { ok: true, skipped: "already welcomed" });
    }

    // 3. PRIMARY: WhatsApp template. Try it whenever the customer is set up for
    //    WhatsApp with a number on file and hasn't opted out.
    let channel: "whatsapp" | "sms" | "email" | "none" = "none";
    let sent = false;
    let failDetail: string | null = null;

    const canWhatsApp = !!h.whatsapp && !!h.phone && !h.whatsapp_opted_out;
    if (canWhatsApp) {
      const wa = await invokeWhatsAppTemplate(h.phone as string, firstName, h.id);
      channel = "whatsapp";
      sent = wa.ok;
      if (!sent) {
        failDetail = wa.detail ?? "WhatsApp send failed";
        console.warn(`notify-customer-welcome: WhatsApp failed for ${h.id} — ${failDetail}; falling back`);
      }
    }

    // House-style plain-text body for SMS / email fallbacks. Friendly, short.
    const fallbackText =
      `Hi ${firstName}, welcome to the Pack! 🐾 You're all set up with Smarter Dog ` +
      `Grooming Salon and can now book appointments. See you soon!`;

    // 4. FALLBACK: SMS (if WhatsApp didn't go out and SMS is available).
    if (!sent && !!h.phone && !!h.sms && !h.sms_opted_out) {
      try {
        const r = await sendSms(h.phone, fallbackText);
        channel = "sms";
        sent = r.ok;
        if (!sent) failDetail = `${r.errorCode ?? "?"} ${r.errorMessage ?? "SMS send failed"}`.trim();
      } catch (err) {
        failDetail = err instanceof Error ? err.message : String(err);
        console.error("notify-customer-welcome: SMS threw:", failDetail);
      }
    }

    // 5. FALLBACK: email (if still unsent and an address is on file).
    if (!sent && !!h.email && !h.email_opted_out) {
      try {
        const ok = await sendEmail(
          h.email,
          "Welcome to the Pack — Smarter Dog Grooming",
          fallbackText,
        );
        channel = "email";
        sent = ok;
        if (!sent) failDetail = "Email delivery failed — check provider logs";
      } catch (err) {
        failDetail = err instanceof Error ? err.message : String(err);
        console.error("notify-customer-welcome: email threw:", failDetail);
      }
    }

    if (channel === "none") {
      console.warn(`notify-customer-welcome: no contact method (or all opted out) for ${h.id}`);
      return json(req, { ok: false, reason: "no contact method available" }, 200);
    }

    // 6. Log the outcome to notification_log, mirroring the notify-* functions.
    //    NOTE: trigger_type 'welcome' is not yet in the CHECK constraint (the
    //    Join the Pack migration didn't extend it). The insert is wrapped so a
    //    CHECK violation (23514) doesn't fail the whole send — the message has
    //    already gone out. A follow-up migration should add 'welcome' to the
    //    notification_log_trigger_type_check constraint so this row persists.
    const { error: logErr } = await supabase.from("notification_log").insert({
      booking_id: null,
      group_id: null,
      human_id: h.id,
      channel,
      trigger_type: "welcome",
      status: sent ? "sent" : "failed",
      error_message: sent ? null : failDetail ?? "Welcome delivery failed — check provider logs",
      sent_at: sent ? new Date().toISOString() : null,
    });
    if (logErr) {
      console.warn(
        `notify-customer-welcome: notification_log insert failed for ${h.id} (${logErr.code ?? "?"}: ${logErr.message}) — ` +
          `send outcome was ${sent ? "sent" : "failed"} on ${channel}. ` +
          `If this is a CHECK violation, add 'welcome' to notification_log_trigger_type_check.`,
      );
    }

    return json(req, { ok: sent, channel, human_id: h.id, detail: sent ? undefined : failDetail });
  } catch (err) {
    console.error("notify-customer-welcome error:", err);
    return json(req, { error: "internal error" }, 500);
  }
});

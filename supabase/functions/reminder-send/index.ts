// ============================================================
// supabase/functions/reminder-send/index.ts
//
// Staff-driven, per-channel booking-reminder send. This is the single
// endpoint the dashboard's "Send Reminder" modal calls. It is the
// reminder "brain" for the MANUAL path — the nightly cron path stays in
// notify-booking-reminder, untouched.
//
// Responsibilities (mirrors the proven notify-booking-reminder flow):
//   1. Authorise staff (own JWT verify + is_staff), or a service-role
//      caller via SEND_INTERNAL_SECRET.
//   2. Resolve the anchor booking -> customer, then gather ALL of that
//      customer's active bookings on the same day (a multi-dog customer
//      is one reminder, like the dashboard row).
//   3. Validate the staff-chosen channel against the customer's contact
//      details + opt-out flags (server-side, authoritative).
//   4. Claim idempotently: insert one 'pending' notification_log row per
//      booking. The partial unique index (booking_id, trigger_type)
//      WHERE status IN ('pending','sent') makes a re-send 23505 -> skip.
//   5. Dispatch by reusing the existing senders so there is ONE provider
//      integration + inbox logging path each:
//        whatsapp -> whatsapp-send (mode:"template", Meta Cloud API)
//        sms      -> sms-send      (mode:"template", Twilio)
//        email    -> _shared/email.ts sendEmail (SendGrid) + inbox row
//   6. Finalise the notification_log rows (sent / failed). The dashboard
//      derives Sent/Unsent from notification_log and updates live via its
//      realtime subscription.
//
// Env vars required (all already provisioned for the existing senders):
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY  (auto)
//   SEND_INTERNAL_SECRET   shared secret to call whatsapp-send / sms-send
//   REMINDER_SEND_ALLOWED_ORIGINS  optional CORS allowlist
//   (Twilio / Meta / SendGrid secrets are read inside the reused modules.)
//
// Deploy with --no-verify-jwt (we verify the staff JWT ourselves; the
// Supabase gateway rejects ES256 user session JWTs), same as
// whatsapp-send / sms-send.
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { timingSafeEqualHeader } from "../_shared/webhook-auth.ts";
import { normaliseUkPhone } from "../_shared/twilio.ts";
import { sendEmail } from "../_shared/email.ts";
import { buildAllowedOrigins, buildCorsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SEND_INTERNAL_SECRET = Deno.env.get("SEND_INTERNAL_SECRET") ?? "";

const ALLOWED_ORIGINS = buildAllowedOrigins("REMINDER_SEND_ALLOWED_ORIGINS");
const corsFor = (req: Request) =>
  buildCorsHeaders(req, ALLOWED_ORIGINS, { allowInternalSecret: true });

type Channel = "whatsapp" | "sms" | "email";

interface ReminderSendBody {
  booking_id: string;
  channel: Channel;
  whatsapp?: { template_name: string; language?: string; params?: string[] };
  sms?: { text: string };
  email?: { subject: string; body: string };
}

interface HumanRow {
  id: string;
  name: string;
  phone: string | null;
  whatsapp: boolean;
  sms: boolean;
  email: string | null;
  whatsapp_opted_out: boolean;
  sms_opted_out: boolean;
  email_opted_out: boolean;
}

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsFor(req), "Content-Type": "application/json" },
  });
}

async function authorise(req: Request): Promise<
  | { ok: true; userId?: string; internal?: boolean }
  | { ok: false; reason: string; status: number }
> {
  if (timingSafeEqualHeader(req.headers.get("x-internal-secret"), SEND_INTERNAL_SECRET)) {
    return { ok: true, internal: true };
  }
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return { ok: false, reason: "missing authorization", status: 401 };

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userRes, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userRes?.user) {
    console.error("reminder-send: getUser failed:", userErr);
    return { ok: false, reason: "invalid token", status: 401 };
  }
  const { data: staffCheck, error: staffErr } = await userClient.rpc("is_staff");
  if (staffErr) {
    console.error("reminder-send: is_staff rpc failed:", staffErr);
    return { ok: false, reason: "staff check failed", status: 500 };
  }
  if (!staffCheck) return { ok: false, reason: "not staff", status: 403 };
  return { ok: true, userId: userRes.user.id };
}

/** Validate E.164 (UK-normalised). Returns the +E.164 string or null. */
function toValidE164(phone: string | null): string | null {
  if (!phone) return null;
  const e164 = normaliseUkPhone(phone);
  return e164.startsWith("+") ? e164 : null;
}

function channelAvailability(human: HumanRow): Record<Channel, { ok: boolean; reason: string }> {
  const phoneE164 = toValidE164(human.phone);
  return {
    whatsapp: !phoneE164
      ? { ok: false, reason: "No valid WhatsApp number on file" }
      : !human.whatsapp
        ? { ok: false, reason: "Customer isn't set up for WhatsApp" }
        : human.whatsapp_opted_out
          ? { ok: false, reason: "Customer opted out of WhatsApp" }
          : { ok: true, reason: "" },
    sms: !phoneE164
      ? { ok: false, reason: "No valid mobile number on file" }
      : !human.sms
        ? { ok: false, reason: "Customer isn't set up for SMS" }
        : human.sms_opted_out
          ? { ok: false, reason: "Customer opted out of SMS" }
          : { ok: true, reason: "" },
    email: !human.email
      ? { ok: false, reason: "No email on file" }
      : human.email_opted_out
        ? { ok: false, reason: "Customer opted out of email" }
        : { ok: true, reason: "" },
  };
}

/** Call another edge function service-to-service via the shared internal secret. */
async function invokeInternal(
  fn: string,
  payload: unknown,
): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": SEND_INTERNAL_SECRET,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify(payload),
  });
  let body: Record<string, unknown> = {};
  try {
    body = await res.json();
  } catch {
    /* non-JSON */
  }
  return { ok: res.ok, status: res.status, body };
}

/**
 * Log a sent email into the customer's inbox thread. Attaches to the
 * customer's existing conversation (any channel) so the email shows in
 * their unified thread; otherwise opens an email conversation keyed by
 * the customer's phone. Email-only customers with no phone and no prior
 * conversation are skipped (still recorded in notification_log).
 */
async function recordEmailInbox(
  supabase: SupabaseClient,
  humanId: string,
  phoneE164: string | null,
  subject: string,
  emailBody: string,
): Promise<void> {
  const sentAt = new Date().toISOString();
  const content = `[email] ${subject}\n\n${emailBody}`;

  const { data: existing } = await supabase
    .from("whatsapp_conversations")
    .select("id")
    .eq("human_id", humanId)
    .order("last_outbound_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  let conversationId = existing?.id ?? null;

  if (!conversationId) {
    if (!phoneE164) {
      console.warn(`reminder-send: no conversation/phone for human ${humanId}; email not threaded`);
      return;
    }
    const { data: created, error: createErr } = await supabase
      .from("whatsapp_conversations")
      .insert({ phone_e164: phoneE164, channel: "email", human_id: humanId, state: "ai_handling" })
      .select("id")
      .single();
    if (createErr) {
      console.error("reminder-send: email conversation create failed:", createErr);
      return;
    }
    conversationId = created?.id ?? null;
  }
  if (!conversationId) return;

  const { error: msgErr } = await supabase.from("whatsapp_messages").insert({
    conversation_id: conversationId,
    direction: "outbound",
    role: "assistant",
    content,
    status: "sent",
    sent_at: sentAt,
    channel: "email",
  });
  if (msgErr) console.error("reminder-send: email inbox insert failed:", msgErr);

  await supabase
    .from("whatsapp_conversations")
    .update({ last_outbound_at: sentAt })
    .eq("id", conversationId);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsFor(req) });
  }
  if (req.method !== "POST") {
    return json(req, { error: "method not allowed" }, 405);
  }

  const auth = await authorise(req);
  if (!auth.ok) return json(req, { error: auth.reason }, auth.status);

  let body: ReminderSendBody;
  try {
    body = await req.json();
  } catch {
    return json(req, { error: "bad json" }, 400);
  }

  const { booking_id, channel } = body ?? {};
  if (!booking_id) return json(req, { error: "booking_id is required" }, 400);
  if (channel !== "whatsapp" && channel !== "sms" && channel !== "email") {
    return json(req, { error: "channel must be 'whatsapp' | 'sms' | 'email'" }, 400);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  try {
    // 1. Resolve the anchor booking -> customer.
    const { data: anchor, error: anchorErr } = await supabase
      .from("bookings")
      .select("id, booking_date, status, dog_id, dogs(human_id, name)")
      .eq("id", booking_id)
      .maybeSingle();
    if (anchorErr || !anchor) return json(req, { error: "booking not found" }, 404);
    if (anchor.status === "Cancelled") {
      return json(req, { error: "booking is cancelled — won't remind" }, 422);
    }
    const anchorDog = Array.isArray(anchor.dogs) ? anchor.dogs[0] : anchor.dogs;
    const humanId = anchorDog?.human_id ?? null;
    if (!humanId) return json(req, { error: "booking has no linked customer — can't remind" }, 422);

    // 2. Gather the customer's active bookings that day (one reminder per customer/day).
    const { data: dayRows, error: gatherErr } = await supabase
      .from("bookings")
      .select("id, group_id, dogs!inner(human_id)")
      .eq("booking_date", anchor.booking_date)
      .eq("dogs.human_id", humanId)
      .neq("status", "Cancelled");
    if (gatherErr) {
      console.error("reminder-send: day gather failed:", gatherErr.message);
      return json(req, { error: "bookings query failed" }, 500);
    }
    const groupBookings =
      dayRows && dayRows.length > 0
        ? dayRows.map((r) => ({ id: r.id as string, group_id: (r.group_id as string | null) ?? null }))
        : [{ id: anchor.id as string, group_id: null }];

    // 3. Fetch the customer + validate the chosen channel (authoritative, server-side).
    const { data: human, error: humanErr } = await supabase
      .from("humans")
      .select(
        "id, name, phone, whatsapp, sms, email, whatsapp_opted_out, sms_opted_out, email_opted_out",
      )
      .eq("id", humanId)
      .single();
    if (humanErr || !human) return json(req, { error: "customer not found" }, 404);

    const avail = channelAvailability(human as HumanRow);
    if (!avail[channel].ok) {
      return json(req, { error: avail[channel].reason }, 422);
    }
    const phoneE164 = toValidE164((human as HumanRow).phone);

    // 4. Idempotent claim: one pending log row per booking in the group.
    const pendingEntries = groupBookings.map((b) => ({
      booking_id: b.id,
      group_id: b.group_id,
      human_id: humanId,
      channel,
      trigger_type: "reminder",
      status: "pending",
    }));
    const { data: pendingRows, error: pendingErr } = await supabase
      .from("notification_log")
      .insert(pendingEntries)
      .select("id");
    if (pendingErr) {
      if (pendingErr.code === "23505") {
        return json(req, { ok: true, skipped: "reminder already sent for this customer today" });
      }
      console.error("reminder-send: pending log insert failed:", pendingErr.message);
      return json(req, { error: "could not record reminder" }, 500);
    }
    const pendingIds = (pendingRows ?? []).map((r: { id: string }) => r.id);

    // 5. Dispatch.
    let sent = false;
    let providerMessageId: string | null = null;
    let failDetail = "Delivery failed — check provider logs";

    if (channel === "whatsapp") {
      const wa = body.whatsapp;
      if (!wa?.template_name) {
        await markFailed(supabase, pendingIds, "missing whatsapp template");
        return json(req, { error: "whatsapp.template_name is required" }, 400);
      }
      const result = await invokeInternal("whatsapp-send", {
        mode: "template",
        to: phoneE164,
        template_name: wa.template_name,
        language: wa.language ?? "en_GB",
        params: wa.params ?? [],
        human_id: humanId,
      });
      sent = result.ok && result.body.ok === true;
      providerMessageId = (result.body.meta_message_id as string | null) ?? null;
      if (!sent) failDetail = String(result.body.detail ?? result.body.error ?? `whatsapp-send ${result.status}`);
    } else if (channel === "sms") {
      const text = body.sms?.text?.trim();
      if (!text) {
        await markFailed(supabase, pendingIds, "empty sms body");
        return json(req, { error: "sms.text is required" }, 400);
      }
      const result = await invokeInternal("sms-send", {
        mode: "template",
        to: phoneE164,
        text,
        template_name: "appointment_reminder",
        human_id: humanId,
      });
      sent = result.ok && result.body.ok === true;
      providerMessageId = (result.body.twilio_sid as string | null) ?? null;
      if (!sent) failDetail = String(result.body.detail ?? result.body.error ?? `sms-send ${result.status}`);
    } else {
      const subject = body.email?.subject?.trim();
      const emailBody = body.email?.body?.trim();
      if (!subject || !emailBody) {
        await markFailed(supabase, pendingIds, "empty email subject/body");
        return json(req, { error: "email.subject and email.body are required" }, 400);
      }
      try {
        sent = await sendEmail((human as HumanRow).email!, subject, emailBody);
      } catch (err) {
        sent = false;
        failDetail = err instanceof Error ? err.message : String(err);
      }
      if (sent) await recordEmailInbox(supabase, humanId, phoneE164, subject, emailBody);
    }

    // 6. Finalise the log.
    await supabase
      .from("notification_log")
      .update({
        status: sent ? "sent" : "failed",
        sent_at: sent ? new Date().toISOString() : null,
        error_message: sent ? null : failDetail,
      })
      .in("id", pendingIds);

    if (!sent) {
      return json(req, { error: "send failed", detail: failDetail, channel }, 502);
    }
    return json(req, { ok: true, channel, provider_message_id: providerMessageId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("reminder-send unhandled error:", message);
    return json(req, { error: "internal error", detail: message }, 500);
  }
});

async function markFailed(supabase: SupabaseClient, ids: string[], reason: string): Promise<void> {
  if (ids.length === 0) return;
  await supabase
    .from("notification_log")
    .update({ status: "failed", error_message: reason })
    .in("id", ids);
}

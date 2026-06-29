import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildAllowedOrigins, buildCorsHeaders } from "../_shared/cors.ts";
import { sanitise } from "../_shared/format.ts";
import { fetchHumansByIds } from "../_shared/recipients.ts";
import {
  pickChannelWaSms,
  renderMessage,
  buildRepByHuman,
  type BroadcastBookingRow,
} from "../_shared/broadcast.ts";

// ── broadcast-message ───────────────────────────────────────────────────────
// Staff pick a date; every Booked customer that day gets their OWN 1:1
// templated message (no group chat) carrying a staff-typed reason (e.g. a
// closure). WhatsApp OR SMS only. Sends are de-duped to one per recipient per
// day, logged to notification_log (trigger_type 'day_closure') with the
// existing (booking_id, trigger_type, human_id) idempotency index, and gated
// behind an independent kill-switch + the template being Meta-approved.
//
// Auth: staff JWT only (this is staff-initiated — NOT the AI auto-send path,
// and NOT the cron webhook).

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SEND_INTERNAL_SECRET = Deno.env.get("SEND_INTERNAL_SECRET") ?? "";

// Independent kill-switch — do NOT reuse the AI gates. Default OFF: must be
// explicitly 'true' to send anything.
const BROADCAST_ENABLED =
  (Deno.env.get("BROADCAST_MESSAGE_ENABLED") ?? "false").toLowerCase() === "true";

const TEMPLATE_NAME = "day_closure_v1";
const TEMPLATE_LANG = "en_GB";

const ALLOWED_ORIGINS = buildAllowedOrigins("BROADCAST_MESSAGE_ALLOWED_ORIGINS");
const corsFor = (req: Request) => buildCorsHeaders(req, ALLOWED_ORIGINS);

async function invokeInternal(
  fn: string,
  payload: unknown,
): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": SEND_INTERNAL_SECRET,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsFor(req) });
  }
  const json = (status: number, payload: unknown) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { ...corsFor(req), "Content-Type": "application/json" },
    });

  try {
    // 1. Auth — staff JWT only.
    const authHeader = req.headers.get("authorization");
    if (!authHeader) return new Response("Unauthorized", { status: 401, headers: corsFor(req) });
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes?.user) {
      return new Response("Unauthorized", { status: 401, headers: corsFor(req) });
    }
    const { data: staffCheck } = await userClient.rpc("is_staff");
    if (!staffCheck) return new Response("Forbidden", { status: 403, headers: corsFor(req) });

    // 2. Input.
    let body: { booking_date?: string; reason?: string; dry_run?: boolean } = {};
    if (req.body) {
      try { body = await req.json(); } catch { body = {}; }
    }
    const bookingDate = typeof body.booking_date === "string" ? body.booking_date : "";
    const reasonRaw = typeof body.reason === "string" ? body.reason.trim() : "";
    const dryRun = body.dry_run === true;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(bookingDate)) {
      return json(400, { error: "booking_date required (YYYY-MM-DD)" });
    }
    if (!reasonRaw) return json(400, { error: "reason required" });
    const reason = sanitise(reasonRaw);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 3. Gate: kill-switch + the template being Meta-approved. dry_run still
    //    reports the gate so staff see why nothing would send.
    const { data: tmpl } = await supabase
      .from("whatsapp_templates")
      .select("status")
      .eq("name", TEMPLATE_NAME)
      .eq("language", TEMPLATE_LANG)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    const templateApproved = tmpl?.status === "approved";
    const canSend = BROADCAST_ENABLED && templateApproved;

    // 4. Enumerate the day's Booked bookings, enriched with dog → owner.
    const { data: rows, error: rowsErr } = await supabase
      .from("bookings")
      .select("id, slot, notify_human_ids, dog_id, dogs!inner(human_id, name)")
      .eq("booking_date", bookingDate)
      .eq("status", "Booked");
    if (rowsErr) {
      console.error("broadcast bookings query failed:", rowsErr.message);
      return json(500, { error: "bookings query failed" });
    }

    // 5. One message per recipient per day, each with a deterministic
    //    representative booking id for a stable idempotency claim.
    const repByHuman = buildRepByHuman((rows ?? []) as BroadcastBookingRow[]);

    const humansById = await fetchHumansByIds(supabase, [...repByHuman.keys()]);

    const sent: Array<Record<string, unknown>> = [];
    const skipped: Array<Record<string, unknown>> = [];
    const already: Array<Record<string, unknown>> = [];

    for (const [humanId, bookingId] of repByHuman) {
      const human = humansById.get(humanId);
      if (!human) {
        skipped.push({ human_id: humanId, reason: "lookup_failed" });
        continue;
      }
      const channel = pickChannelWaSms(human);
      if (!channel) {
        // Opted out of both WhatsApp and SMS (or no number) — surface so staff
        // can reach them another way; never silently dropped.
        skipped.push({ human_id: humanId, name: human.name, reason: "opted_out_or_no_channel" });
        continue;
      }

      const firstName = sanitise((human.name || "").split(" ")[0]) || "there";
      const messageText = renderMessage(firstName, reason);

      if (dryRun) {
        sent.push({ human_id: humanId, name: human.name, channel, preview: messageText });
        continue;
      }
      if (!canSend) {
        skipped.push({
          human_id: humanId,
          name: human.name,
          reason: !BROADCAST_ENABLED ? "broadcast_disabled" : "template_not_approved",
        });
        continue;
      }

      // 6. Idempotent claim (one per booking/trigger/human). 23505 → already sent.
      const { data: pendingRows, error: pErr } = await supabase
        .from("notification_log")
        .insert({
          booking_id: bookingId,
          human_id: humanId,
          channel,
          trigger_type: "day_closure",
          status: "pending",
          message_text: messageText,
        })
        .select("id");
      if (pErr) {
        if (pErr.code === "23505") {
          already.push({ human_id: humanId, name: human.name });
          continue;
        }
        console.error(`broadcast log insert failed for ${humanId}:`, pErr.message);
        skipped.push({ human_id: humanId, name: human.name, reason: "log_insert_failed" });
        continue;
      }

      // 7. Send via the template (not free text) so the 24h window never blocks it.
      let ok = false;
      let providerId: string | null = null;
      if (channel === "whatsapp") {
        const res = await invokeInternal("whatsapp-send", {
          mode: "template",
          to: human.phone,
          template_name: TEMPLATE_NAME,
          language: TEMPLATE_LANG,
          params: [firstName, reason],
          human_id: humanId,
        });
        providerId = (res.body.meta_message_id as string | null) ?? null;
        ok = res.ok && res.body.ok === true && providerId != null;
        if (!ok) console.error(`broadcast whatsapp-send failed for ${humanId}:`, res.status, JSON.stringify(res.body));
      } else {
        const res = await invokeInternal("sms-send", {
          mode: "template",
          to: human.phone,
          text: messageText,
          template_name: TEMPLATE_NAME,
          human_id: humanId,
        });
        ok = res.ok && res.body.ok === true;
        providerId = (res.body.twilio_sid as string | null) ?? null;
        if (!ok) console.error(`broadcast sms-send failed for ${humanId}:`, res.status, JSON.stringify(res.body));
      }

      const pendingIds = (pendingRows ?? []).map((r: { id: string }) => r.id);
      await supabase
        .from("notification_log")
        .update({
          status: ok ? "sent" : "failed",
          sent_at: ok ? new Date().toISOString() : null,
          provider_message_id: ok ? providerId : null,
          error_message: ok ? null : "Delivery failed — check provider logs",
        })
        .in("id", pendingIds);

      if (ok) sent.push({ human_id: humanId, name: human.name, channel });
      else skipped.push({ human_id: humanId, name: human.name, reason: "send_failed" });
    }

    return json(200, {
      booking_date: bookingDate,
      dry_run: dryRun,
      broadcast_enabled: BROADCAST_ENABLED,
      template_approved: templateApproved,
      can_send: canSend,
      counts: { sent: sent.length, skipped: skipped.length, already: already.length },
      sent,
      skipped,
      already,
    });
  } catch (err) {
    console.error("broadcast-message error:", err);
    return json(500, { error: "internal error" });
  }
});

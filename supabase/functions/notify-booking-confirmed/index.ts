import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isAuthorizedWebhook } from "../_shared/webhook-auth.ts";
import { sendEmail } from "../_shared/email.ts";
import { sanitise, formatDateShort as formatDate, formatTime, joinNames } from "../_shared/format.ts";
import {
  recipientIdsForBooking,
  fetchHumansByIds,
  bookingConfirmationSkipReason,
  resolveConfirmationChannel,
} from "../_shared/recipients.ts";

// ── Environment variables ──────────────────────────────────────────────────
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET");
// Shared secret for the internal calls to whatsapp-send / sms-send. The
// WhatsApp confirmation now goes out as the approved Meta template
// booking_confirmed_v1 (and SMS via sms-send) so it lands in the staff
// inbox with a delivery status — instead of free-text via Twilio, which
// never recorded to /inbox and wouldn't deliver outside the 24h window.
const SEND_INTERNAL_SECRET = Deno.env.get("SEND_INTERNAL_SECRET") ?? "";
// SENDGRID_API_KEY / SENDGRID_FROM_EMAIL are read inside ../_shared/email.ts.

// ── Internal-call helper (mirrors notify-booking-reminder) ──────────────────
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

// ── Main handler ───────────────────────────────────────────────────────────

serve(async (req) => {
  try {
    // 0. Verify webhook secret — MANDATORY
    if (!WEBHOOK_SECRET) {
      console.error("WEBHOOK_SECRET is not configured");
      return new Response("Server misconfiguration: WEBHOOK_SECRET not set", { status: 500 });
    }
    if (!isAuthorizedWebhook(req.headers.get("Authorization"), WEBHOOK_SECRET)) {
      return new Response("Unauthorized", { status: 401 });
    }

    const payload = await req.json();
    const booking = payload.record;

    if (!booking) {
      return new Response("No record in payload", { status: 400 });
    }

    // 1. Only process active booked appointments. Keep this boundary explicit
    // in the webhook handler as well as the shared confirmation policy.
    if (booking.status !== "Booked") {
      return new Response("Skipped: status is not 'Booked'", { status: 200 });
    }

    // 1b. Only send the ordinary confirmation when it is truthful. Alongside
    // an explicit staff suppression, this keeps a deposit-held appointment
    // from receiving "booked in / see you then" before staff match payment.
    const skipReason = bookingConfirmationSkipReason(booking);
    if (skipReason) {
      return new Response(`Skipped: ${skipReason}`, { status: 200 });
    }

    // 1c. A specific channel forces that method per recipient; everything
    //     else defaults to 'auto' (see resolveConfirmationChannel below).
    const confirmationChoice: string = booking.confirmation_channel ?? "auto";

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 2. Look up dog and customer
    const { data: dog, error: dogError } = await supabase
      .from("dogs")
      .select("id, name, human_id")
      .eq("id", booking.dog_id)
      .single();

    if (dogError || !dog) {
      console.error("Dog lookup failed:", dogError?.message);
      return new Response("Dog lookup failed", { status: 500 });
    }

    // 3. Resolve dog names + booking IDs (all dogs in the group, or just this one)
    let dogNames: string;
    let bookingIds: string[] = [booking.id];

    if (booking.group_id) {
      const { data: groupBookings } = await supabase
        .from("bookings")
        .select("id, dog_id")
        .eq("group_id", booking.group_id);

      if (groupBookings && groupBookings.length > 0) {
        bookingIds = groupBookings.map((b: { id: string }) => b.id);
        const dogIds = groupBookings.map((b: { dog_id: string }) => b.dog_id);

        const { data: groupDogs } = await supabase
          .from("dogs")
          .select("name")
          .in("id", dogIds);

        dogNames = joinNames((groupDogs ?? []).map((d: { name: string }) => sanitise(d.name)));
      } else {
        dogNames = sanitise(dog.name);
      }
    } else {
      dogNames = sanitise(dog.name);
    }

    // 4. Resolve recipients — the booking's explicit notify_human_ids (owner +
    //    chosen trusted humans) or the dog owner as the default. Each recipient
    //    gets their own channel, personalised message and notification_log row.
    const recipientIds = recipientIdsForBooking(booking.notify_human_ids, dog.human_id);
    const humansById = await fetchHumansByIds(supabase, recipientIds);

    const dateFormatted = formatDate(booking.booking_date);
    const timeFormatted = formatTime(booking.slot);
    const serviceName = booking.service;
    // Feeds the {{appointment_when}} slot of booking_confirmed_v1.
    const appointmentWhen = `${dateFormatted} at ${timeFormatted}`;
    const isPlural = dogNames.includes(" and ");

    const results: Array<{ human_id: string; channel?: string; sent?: boolean; skipped?: string }> = [];

    for (const humanId of recipientIds) {
      const human = humansById.get(humanId);
      if (!human) {
        results.push({ human_id: humanId, skipped: "human not found" });
        continue;
      }

      // Channel: 'auto' picks the best available (WhatsApp → SMS → email); a
      // forced channel is used only if the recipient is reachable on it and
      // hasn't opted out (no silent fallback — explicit choice and opt-out both
      // win). Skip this recipient when there's no usable channel.
      const resolved = resolveConfirmationChannel(confirmationChoice, human);
      if (!resolved.channel) {
        results.push({ human_id: humanId, skipped: resolved.skip });
        continue;
      }
      const channel = resolved.channel;

      // Kept tight — fits a single GSM-7 SMS segment. No emoji/em-dash.
      const firstName = sanitise(human.name.split(" ")[0]);
      const message =
        `Hi ${firstName}, ${dogNames} ${isPlural ? "are" : "is"} booked in for a ${serviceName} on ${dateFormatted} at ${timeFormatted}. ` +
        `See you then!`;

      // IDEMPOTENCY: one pending row per booking for THIS recipient. The unique
      // index (booking_id, trigger_type, human_id) WHERE status IN
      // ('pending','sent') means a re-fire where this recipient already has a
      // pending/sent row fails with 23505 — we skip them; other recipients keep
      // their own rows and are unaffected.
      const pendingEntries = bookingIds.map((bid) => ({
        booking_id: bid,
        group_id: booking.group_id ?? null,
        human_id: human.id,
        channel,
        trigger_type: "confirmed",
        status: "pending",
        // Stored so reminder-sms-fallback can resend this exact wording over SMS
        // if the WhatsApp confirmation isn't delivered.
        message_text: message,
      }));

      const { data: pendingRows, error: pendingError } = await supabase
        .from("notification_log")
        .insert(pendingEntries)
        .select("id");

      if (pendingError) {
        if (pendingError.code === "23505") {
          results.push({ human_id: humanId, skipped: "already sent" });
          continue;
        }
        console.error("Pending log insert failed:", pendingError.message);
        results.push({ human_id: humanId, skipped: "log insert failed" });
        continue;
      }

      // Send. WhatsApp via the approved Meta template booking_confirmed_v1 and
      // SMS via sms-send — both record to the staff inbox with a delivery
      // status. Email stays direct via SendGrid.
      let sent = false;
      let providerMessageId: string | null = null;
      if (channel === "whatsapp") {
        const result = await invokeInternal("whatsapp-send", {
          mode: "template",
          to: human.phone,
          template_name: "booking_confirmed_v1",
          language: "en_GB",
          params: [firstName, dogNames, appointmentWhen, serviceName],
          human_id: human.id,
        });
        providerMessageId = (result.body.meta_message_id as string | null) ?? null;
        // A null meta_message_id means whatsapp-send returned ok but Meta
        // produced no message — treat as a failure, not a silent 'sent'.
        sent = result.ok && result.body.ok === true && providerMessageId != null;
        if (!sent) console.error("confirmed whatsapp-send failed:", result.status, JSON.stringify(result.body));
      } else if (channel === "sms") {
        const result = await invokeInternal("sms-send", {
          mode: "template",
          to: human.phone,
          text: message,
          template_name: "booking_confirmed",
          human_id: human.id,
        });
        sent = result.ok && result.body.ok === true;
        providerMessageId = (result.body.twilio_sid as string | null) ?? null;
        if (!sent) console.error("confirmed sms-send failed:", result.status, JSON.stringify(result.body));
      } else {
        const subject = `Booking confirmed — ${dogNames} at Smarter Dog Grooming`;
        sent = await sendEmail(human.email!, subject, message);
      }

      // Update this recipient's pending rows with the outcome.
      const pendingIds = (pendingRows ?? []).map((r: { id: string }) => r.id);
      await supabase
        .from("notification_log")
        .update({
          status: sent ? "sent" : "failed",
          sent_at: sent ? new Date().toISOString() : null,
          provider_message_id: sent ? providerMessageId : null,
          error_message: sent ? null : "Delivery failed — check provider logs",
        })
        .in("id", pendingIds);

      results.push({ human_id: humanId, channel, sent });
    }

    return new Response(
      JSON.stringify({ dogNames, recipients: results }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("notify-booking-confirmed error:", err);
    return new Response(
      JSON.stringify({ error: "internal error" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});

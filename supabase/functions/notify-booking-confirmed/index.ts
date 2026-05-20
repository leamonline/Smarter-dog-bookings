import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendSmsBoolean, sendWhatsAppBoolean } from "../_shared/twilio.ts";
import { isAuthorizedWebhook } from "../_shared/webhook-auth.ts";
import { sendEmail } from "../_shared/email.ts";
import { sanitise, formatDateShort as formatDate, formatTime, joinNames } from "../_shared/format.ts";

// ── Environment variables ──────────────────────────────────────────────────
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET");
// Twilio creds are read inside ../_shared/twilio.ts (TWILIO_ACCOUNT_SID,
// TWILIO_API_KEY/SECRET or TWILIO_AUTH_TOKEN, TWILIO_MESSAGING_SERVICE_SID
// or TWILIO_SMS_FROM, TWILIO_WHATSAPP_FROM).
// SENDGRID_API_KEY / SENDGRID_FROM_EMAIL are read inside ../_shared/email.ts.

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

    // 1. Only process active booked appointments.
    if (booking.status !== "Booked") {
      return new Response("Skipped: status is not 'Booked'", { status: 200 });
    }

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

    const { data: human, error: humanError } = await supabase
      .from("humans")
      .select("id, name, phone, whatsapp, sms, email, whatsapp_opted_out, sms_opted_out, email_opted_out")
      .eq("id", dog.human_id)
      .single();

    if (humanError || !human) {
      console.error("Human lookup failed:", humanError?.message);
      return new Response("Human lookup failed", { status: 500 });
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

    // 4. Pick channel BEFORE we send (we need to record it in the pending row).
    //    Preference: WhatsApp → SMS → email. Skip any channel the customer has
    //    opted out of (PECR compliance, mig 041).
    let channel: "whatsapp" | "sms" | "email";
    if (human.whatsapp && human.phone && !human.whatsapp_opted_out) {
      channel = "whatsapp";
    } else if (human.sms && human.phone && !human.sms_opted_out) {
      channel = "sms";
    } else if (human.email && !human.email_opted_out) {
      channel = "email";
    } else {
      return new Response("No contact method available (or all opted out) for this customer", { status: 200 });
    }

    // 5. Format the message
    //    Kept tight — fits a single GSM-7 SMS segment for customers without
    //    WhatsApp/email. Emojis and em-dashes force UCS-2 encoding (70 chars
    //    per segment vs 160) and cost 4x more per send. Sender ID
    //    "Smarter Dog" already brands the message, so no signature needed.
    const firstName = sanitise(human.name.split(" ")[0]);
    const isPlural = dogNames.includes(" and ");
    const dateFormatted = formatDate(booking.booking_date);
    const timeFormatted = formatTime(booking.slot);
    const serviceName = booking.service;

    const message =
      `Hi ${firstName}, ${dogNames} ${isPlural ? "are" : "is"} booked in for a ${serviceName} on ${dateFormatted} at ${timeFormatted}. ` +
      `See you then!`;

    // 6. IDEMPOTENCY: insert pending log rows for ALL bookings in the group
    //    atomically. The partial unique index `(booking_id, trigger_type)
    //    WHERE status IN ('pending','sent')` (mig 042) physically prevents
    //    a second invocation — if any booking already has a pending or sent
    //    row, the whole INSERT fails with code 23505 and we return early.
    //    This replaces the old 2-second-wait + dedup-by-group-id pattern;
    //    that pattern was racy and required Twilio to be idempotent itself.
    const pendingEntries = bookingIds.map((bid) => ({
      booking_id: bid,
      group_id: booking.group_id ?? null,
      human_id: human.id,
      channel,
      trigger_type: "confirmed",
      status: "pending",
    }));

    const { data: pendingRows, error: pendingError } = await supabase
      .from("notification_log")
      .insert(pendingEntries)
      .select("id");

    if (pendingError) {
      if (pendingError.code === "23505") {
        return new Response("Skipped: duplicate (already pending or sent)", { status: 200 });
      }
      console.error("Pending log insert failed:", pendingError.message);
      return new Response("Pending log insert failed", { status: 500 });
    }

    // 7. Send via Twilio (SMS/WhatsApp) or SendGrid (email).
    let sent = false;
    if (channel === "whatsapp") {
      sent = await sendWhatsAppBoolean(human.phone, message);
    } else if (channel === "sms") {
      sent = await sendSmsBoolean(human.phone, message);
    } else {
      const subject = `Booking confirmed — ${dogNames} at Smarter Dog Grooming`;
      sent = await sendEmail(human.email, subject, message);
    }

    // 8. Update the pending rows with the outcome.
    const pendingIds = (pendingRows ?? []).map((r: { id: string }) => r.id);
    await supabase
      .from("notification_log")
      .update({
        status: sent ? "sent" : "failed",
        sent_at: sent ? new Date().toISOString() : null,
        error_message: sent ? null : "Delivery failed — check provider logs",
      })
      .in("id", pendingIds);

    return new Response(
      JSON.stringify({ success: sent, channel, dogNames }),
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

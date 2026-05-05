import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendSmsBoolean, sendWhatsAppBoolean } from "../_shared/twilio.ts";

// ── Environment variables ──────────────────────────────────────────────────
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SENDGRID_KEY = Deno.env.get("SENDGRID_API_KEY")!;
const SENDGRID_FROM = Deno.env.get("SENDGRID_FROM_EMAIL")!;
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET");
// Twilio creds are read inside ../_shared/twilio.ts.

// ── Helpers ────────────────────────────────────────────────────────────────

/** Strip HTML tags and control characters from user-supplied text (names, etc.) */
function sanitise(str: string): string {
  return str
    .replace(/<[^>]*>/g, "")
    .replace(/[\x00-\x09\x0B-\x1F\x7F]/g, "")
    .replace(/\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function sendEmail(to: string, subject: string, text: string): Promise<boolean> {
  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${SENDGRID_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: SENDGRID_FROM, name: "Smarter Dog Grooming" },
      subject,
      content: [{ type: "text/plain", value: text }],
    }),
  });
  return res.status >= 200 && res.status < 300;
}

/** Format a date string (YYYY-MM-DD) as "Monday 29 March 2026" */
function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// ── Main handler ───────────────────────────────────────────────────────────

serve(async (req) => {
  try {
    // 0. Verify webhook secret — MANDATORY
    if (!WEBHOOK_SECRET) {
      console.error("WEBHOOK_SECRET is not configured");
      return new Response("Server misconfiguration: WEBHOOK_SECRET not set", { status: 500 });
    }
    const authHeader = req.headers.get("Authorization");
    if (authHeader !== `Bearer ${WEBHOOK_SECRET}`) {
      return new Response("Unauthorized", { status: 401 });
    }

    const payload = await req.json();
    const booking = payload.old_record;

    if (!booking) {
      return new Response("No old_record in payload", { status: 400 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Look up the dog
    const { data: dog, error: dogError } = await supabase
      .from("dogs")
      .select("id, name, human_id")
      .eq("id", booking.dog_id)
      .single();

    if (dogError || !dog) {
      return new Response(`Dog lookup failed: ${dogError?.message}`, { status: 500 });
    }

    // 2. Look up the customer
    const { data: human, error: humanError } = await supabase
      .from("humans")
      .select("id, name, phone, whatsapp, sms, email, whatsapp_opted_out, sms_opted_out, email_opted_out")
      .eq("id", dog.human_id)
      .single();

    if (humanError || !human) {
      return new Response(`Human lookup failed: ${humanError?.message}`, { status: 500 });
    }

    // 3. Build the cancellation message
    //    We can't tell from the webhook payload whether this was customer- or
    //    staff-initiated, so we use the default customer-initiated tone.
    const firstName = sanitise(human.name.split(" ")[0]);
    const dogName = sanitise(dog.name);
    const dateFormatted = formatDate(booking.booking_date);

    const message = [
      `Hi ${firstName},`,
      "",
      `We've cancelled your appointment for ${dogName} on ${dateFormatted}. You can rebook anytime through your account.`,
      "",
      "If you have any questions, don't hesitate to get in touch — we're always happy to help. 🐾",
      "",
      "Smarter Dog Grooming",
    ].join("\n");

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

    // 5. IDEMPOTENCY: insert pending log row up front. The partial unique
    //    index `(booking_id, trigger_type) WHERE status IN ('pending','sent')`
    //    (mig 042) prevents double-sends if the trigger fires twice.
    //    Cancellation is an UPDATE (status='Cancelled') not a DELETE in this
    //    app — the booking row still exists, so booking_id is valid.
    const { data: pendingRow, error: pendingError } = await supabase
      .from("notification_log")
      .insert({
        booking_id: booking.id,
        group_id: booking.group_id ?? null,
        human_id: human.id,
        channel,
        trigger_type: "cancelled",
        status: "pending",
      })
      .select("id")
      .single();

    if (pendingError) {
      if (pendingError.code === "23505") {
        return new Response("Skipped: cancellation already notified", { status: 200 });
      }
      return new Response(`Pending log insert failed: ${pendingError.message}`, { status: 500 });
    }

    // 6. Send via Twilio (SMS/WhatsApp) or SendGrid (email).
    let sent = false;
    if (channel === "whatsapp") {
      sent = await sendWhatsAppBoolean(human.phone, message);
    } else if (channel === "sms") {
      sent = await sendSmsBoolean(human.phone, message);
    } else {
      const subject = `Your ${dogName} appointment has been cancelled`;
      sent = await sendEmail(human.email, subject, message);
    }

    // 7. Update the pending row with the outcome.
    await supabase
      .from("notification_log")
      .update({
        status: sent ? "sent" : "failed",
        sent_at: sent ? new Date().toISOString() : null,
        error_message: sent ? null : "Delivery failed — check provider logs",
      })
      .eq("id", pendingRow.id);

    return new Response(
      JSON.stringify({ success: sent, channel, dogName }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("notify-booking-cancelled error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});

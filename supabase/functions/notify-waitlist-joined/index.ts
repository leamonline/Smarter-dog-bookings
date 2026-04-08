import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── Environment variables ──────────────────────────────────────────────────
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TWILIO_SID = Deno.env.get("TWILIO_ACCOUNT_SID")!;
const TWILIO_AUTH = Deno.env.get("TWILIO_AUTH_TOKEN")!;
const TWILIO_WHATSAPP_FROM = Deno.env.get("TWILIO_WHATSAPP_FROM")!;
const TWILIO_SMS_FROM = Deno.env.get("TWILIO_SMS_FROM")!;
const SENDGRID_KEY = Deno.env.get("SENDGRID_API_KEY")!;
const SENDGRID_FROM = Deno.env.get("SENDGRID_FROM_EMAIL")!;
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET");

// The salon's own alert destination — set to owner's email or WhatsApp
const SALON_ALERT_EMAIL = Deno.env.get("SALON_ALERT_EMAIL");
const SALON_ALERT_WHATSAPP = Deno.env.get("SALON_ALERT_WHATSAPP");

// ── Helpers ────────────────────────────────────────────────────────────────

async function sendTwilio(to: string, from: string, body: string): Promise<boolean> {
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`,
    {
      method: "POST",
      headers: {
        "Authorization": "Basic " + btoa(`${TWILIO_SID}:${TWILIO_AUTH}`),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: from, Body: body }),
    },
  );
  return res.ok;
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
    // 0. Verify webhook secret
    const authHeader = req.headers.get("Authorization");
    if (WEBHOOK_SECRET && authHeader !== `Bearer ${WEBHOOK_SECRET}`) {
      return new Response("Unauthorized", { status: 401 });
    }

    const payload = await req.json();
    const entry = payload.record;

    if (!entry) {
      return new Response("No record in payload", { status: 400 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Look up the human who joined the waitlist
    const { data: human, error: humanError } = await supabase
      .from("humans")
      .select("id, name, surname, phone")
      .eq("id", entry.human_id)
      .single();

    if (humanError || !human) {
      return new Response(`Human lookup failed: ${humanError?.message}`, { status: 500 });
    }

    // 2. Look up their dogs
    const { data: dogs } = await supabase
      .from("dogs")
      .select("name")
      .eq("human_id", human.id)
      .order("name");

    const dogNames = dogs && dogs.length > 0
      ? dogs.map((d: { name: string }) => d.name).join(", ")
      : "no dogs on file";

    const humanName = `${human.name} ${human.surname || ""}`.trim();
    const dateFormatted = formatDate(entry.target_date);

    // 3. Build staff alert message
    const alertMessage = [
      `📋 Waitlist Alert — Smarter Dog`,
      ``,
      `${humanName} (${human.phone || "no phone"}) has joined the waitlist for ${dateFormatted}.`,
      ``,
      `Dogs: ${dogNames}`,
      ``,
      `Log in to the dashboard to manage the waitlist.`,
    ].join("\n");

    // 4. Send staff alert via WhatsApp or email
    let channel: "whatsapp" | "email" | "none" = "none";
    let sent = false;

    if (SALON_ALERT_WHATSAPP) {
      const to = `whatsapp:${SALON_ALERT_WHATSAPP}`;
      const from = `whatsapp:${TWILIO_WHATSAPP_FROM}`;
      sent = await sendTwilio(to, from, alertMessage);
      channel = "whatsapp";
    } else if (SALON_ALERT_EMAIL) {
      const subject = `Waitlist joined — ${humanName} for ${dateFormatted}`;
      sent = await sendEmail(SALON_ALERT_EMAIL, subject, alertMessage);
      channel = "email";
    } else {
      // No alert destination configured — log a warning but don't fail
      console.warn("notify-waitlist-joined: No SALON_ALERT_EMAIL or SALON_ALERT_WHATSAPP configured. Skipping alert.");
      return new Response(
        JSON.stringify({ skipped: true, reason: "No salon alert destination configured" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    // 5. Log the result in notification_log
    await supabase.from("notification_log").insert({
      booking_id: null,
      group_id: null,
      human_id: human.id,
      channel,
      trigger_type: "waitlist_joined",
      status: sent ? "sent" : "failed",
      error_message: sent ? null : "Staff alert delivery failed — check provider logs",
      sent_at: sent ? new Date().toISOString() : null,
    });

    return new Response(
      JSON.stringify({ success: sent, channel, humanName, targetDate: entry.target_date }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("notify-waitlist-joined error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});

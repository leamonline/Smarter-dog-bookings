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

/** Join a list of names naturally: "Bella", "Bella and Max", "Bella, Max and Daisy" */
function joinNames(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  return names.slice(0, -1).join(", ") + " and " + names[names.length - 1];
}

// ── Main handler ───────────────────────────────────────────────────────────
//
// Fired by an AFTER UPDATE trigger on bookings when status transitions to
// 'Ready for pick-up'. Sends a customer notification via WhatsApp / SMS /
// email (in that order of preference based on consent flags).
//
// Payload shape (from pg_net trigger):
//   { type: "UPDATE", table: "bookings", record: <new row>, old_record: <old row> }

serve(async (req) => {
  try {
    if (!WEBHOOK_SECRET) {
      console.error("WEBHOOK_SECRET is not configured");
      return new Response("Server misconfiguration: WEBHOOK_SECRET not set", { status: 500 });
    }
    const authHeader = req.headers.get("Authorization");
    if (authHeader !== `Bearer ${WEBHOOK_SECRET}`) {
      return new Response("Unauthorized", { status: 401 });
    }

    const payload = await req.json();
    const booking = payload.record;

    if (!booking) {
      return new Response("No record in payload", { status: 400 });
    }

    if (booking.status !== "Ready for pick-up") {
      return new Response("Skipped: status is not 'Ready for pick-up'", { status: 200 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Group dedup: when several dogs from the same household finish together,
    // we only want to send one "ready" message. Wait briefly, then check if a
    // sibling already triggered this notification.
    if (booking.group_id) {
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const { data: existingLog } = await supabase
        .from("notification_log")
        .select("id")
        .eq("group_id", booking.group_id)
        .eq("trigger_type", "ready")
        .in("status", ["sent", "pending"])
        .maybeSingle();

      if (existingLog) {
        return new Response("Skipped: group notification already dispatched", { status: 200 });
      }
    }

    const { data: dog, error: dogError } = await supabase
      .from("dogs")
      .select("id, name, human_id")
      .eq("id", booking.dog_id)
      .single();

    if (dogError || !dog) {
      return new Response(`Dog lookup failed: ${dogError?.message}`, { status: 500 });
    }

    const { data: human, error: humanError } = await supabase
      .from("humans")
      .select("id, name, phone, whatsapp, sms, email")
      .eq("id", dog.human_id)
      .single();

    if (humanError || !human) {
      return new Response(`Human lookup failed: ${humanError?.message}`, { status: 500 });
    }

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

    const firstName = sanitise(human.name.split(" ")[0]);
    const isPlural = dogNames.includes(" and ");
    const them = isPlural ? "them" : dogNames;

    const message = [
      `Hey ${firstName}! 🐾`,
      "",
      `${dogNames} ${isPlural ? "are" : "is"} all done and ready for collection whenever you're ready.`,
      "",
      `We can't wait for you to see ${them}!`,
      "",
      "Smarter Dog Grooming",
    ].join("\n");

    let channel: "whatsapp" | "sms" | "email";
    let sent = false;

    if (human.whatsapp && human.phone) {
      channel = "whatsapp";
      const to = `whatsapp:${human.phone}`;
      const from = `whatsapp:${TWILIO_WHATSAPP_FROM}`;
      sent = await sendTwilio(to, from, message);
    } else if (human.sms && human.phone) {
      channel = "sms";
      sent = await sendTwilio(human.phone, TWILIO_SMS_FROM, message);
    } else if (human.email) {
      channel = "email";
      const subject = `${dogNames} is ready for collection — Smarter Dog Grooming`;
      sent = await sendEmail(human.email, subject, message);
    } else {
      return new Response("No contact method available for this customer", { status: 200 });
    }

    const logEntries = bookingIds.map((bid) => ({
      booking_id: bid,
      group_id: booking.group_id ?? null,
      human_id: human.id,
      channel,
      trigger_type: "ready",
      status: sent ? "sent" : "failed",
      error_message: sent ? null : "Delivery failed — check provider logs",
      sent_at: sent ? new Date().toISOString() : null,
    }));

    await supabase.from("notification_log").insert(logEntries);

    return new Response(
      JSON.stringify({ success: sent, channel, dogNames }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("notify-booking-ready error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});

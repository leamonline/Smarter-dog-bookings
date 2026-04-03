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

/** Format a slot string like "09:00" as "9:00am" */
function formatTime(slot: string): string {
  const [h, m] = slot.split(":").map(Number);
  const period = h < 12 ? "am" : "pm";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")}${period}`;
}

/** Join a list of names naturally: "Bella", "Bella and Max", "Bella, Max and Daisy" */
function joinNames(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  return names.slice(0, -1).join(", ") + " and " + names[names.length - 1];
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
    const booking = payload.record;

    if (!booking) {
      return new Response("No record in payload", { status: 400 });
    }

    // 1. Only process bookings in "Not Arrived" status
    if (booking.status !== "Not Arrived") {
      return new Response("Skipped: status is not 'Not Arrived'", { status: 200 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 2. Deduplicate group bookings — wait 2 s then check if another dog in
    //    the same group already triggered a notification
    if (booking.group_id) {
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const { data: existingLog } = await supabase
        .from("notification_log")
        .select("id")
        .eq("group_id", booking.group_id)
        .eq("trigger_type", "confirmed")
        .in("status", ["sent", "pending"])
        .maybeSingle();

      if (existingLog) {
        return new Response("Skipped: group notification already dispatched", { status: 200 });
      }
    }

    // 3. Look up dog and customer
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

    // 4. Resolve dog names — all dogs in the group, or just this one
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

        dogNames = joinNames((groupDogs ?? []).map((d: { name: string }) => d.name));
      } else {
        dogNames = dog.name;
      }
    } else {
      dogNames = dog.name;
    }

    // 5. Format the message
    const firstName = human.name.split(" ")[0];
    const isPlural = dogNames.includes(" and ");
    const pronoun = isPlural ? "they're" : `${dogNames} is`;
    const them = isPlural ? "them" : dogNames;
    const dateFormatted = formatDate(booking.booking_date);
    const timeFormatted = formatTime(booking.slot);
    const serviceName = booking.service;

    const message = [
      `Hey ${firstName}! 🐾`,
      "",
      `Great news — ${dogNames} ${isPlural ? "are" : "is"} booked in for a ${serviceName} on ${dateFormatted} at ${timeFormatted}.`,
      "",
      `We can't wait to see ${them}! If anything changes, you can manage your booking through your account.`,
      "",
      "See you soon! 💛",
      "Smarter Dog Grooming",
    ].join("\n");

    // 6. Send via preferred channel
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
      const subject = `Booking confirmed — ${dogNames} at Smarter Dog Grooming`;
      sent = await sendEmail(human.email, subject, message);
    } else {
      return new Response("No contact method available for this customer", { status: 200 });
    }

    // 7. Log the result
    const logEntries = bookingIds.map((bid) => ({
      booking_id: bid,
      group_id: booking.group_id ?? null,
      human_id: human.id,
      channel,
      trigger_type: "confirmed",
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
    console.error("notify-booking-confirmed error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});

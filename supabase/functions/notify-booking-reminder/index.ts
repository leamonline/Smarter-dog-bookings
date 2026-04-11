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

/** Tomorrow's date as a YYYY-MM-DD string */
function tomorrowDateString(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}

// ── Types ──────────────────────────────────────────────────────────────────

interface Booking {
  id: string;
  booking_date: string;
  slot: string;
  dog_id: string;
  service: string;
  group_id: string | null;
}

interface Dog {
  id: string;
  name: string;
  human_id: string;
}

interface Human {
  id: string;
  name: string;
  phone: string | null;
  whatsapp: boolean;
  sms: boolean;
  email: string | null;
}

// ── Group bookings by group_id (null = individual) ─────────────────────────

function groupBookings(bookings: Booking[]): Map<string | null, Booking[]> {
  const groups = new Map<string | null, Booking[]>();
  for (const b of bookings) {
    const key = b.group_id ?? null;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(b);
  }
  return groups;
}

// ── Main handler ───────────────────────────────────────────────────────────

serve(async (_req) => {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const tomorrow = tomorrowDateString();

    // 1. Fetch all tomorrow's bookings that are "Not Arrived"
    const { data: bookings, error: bookingsError } = await supabase
      .from("bookings")
      .select("id, booking_date, slot, dog_id, service, group_id")
      .eq("booking_date", tomorrow)
      .eq("status", "Not Arrived");

    if (bookingsError) {
      return new Response(`Bookings query failed: ${bookingsError.message}`, { status: 500 });
    }

    if (!bookings || bookings.length === 0) {
      return new Response("No bookings to remind for tomorrow", { status: 200 });
    }

    // 2. Group by group_id (null = individual)
    const groups = groupBookings(bookings as Booking[]);

    const results: Array<{ groupKey: string | null; success: boolean; channel?: string }> = [];

    for (const [groupKey, groupBookings] of groups) {
      // Use the first booking as the reference for date/slot/service
      const ref = groupBookings[0];

      // 3. Collect all dog IDs in the group
      const dogIds = [...new Set(groupBookings.map((b) => b.dog_id))];

      const { data: dogs, error: dogsError } = await supabase
        .from("dogs")
        .select("id, name, human_id")
        .in("id", dogIds);

      if (dogsError || !dogs || dogs.length === 0) {
        console.error(`Dogs lookup failed for group ${groupKey}:`, dogsError?.message);
        results.push({ groupKey, success: false });
        continue;
      }

      // 4. All dogs in a group belong to the same customer — use the first
      const ownerDog = dogs[0] as Dog;
      const { data: human, error: humanError } = await supabase
        .from("humans")
        .select("id, name, phone, whatsapp, sms, email")
        .eq("id", ownerDog.human_id)
        .single();

      if (humanError || !human) {
        console.error(`Human lookup failed for dog ${ownerDog.id}:`, humanError?.message);
        results.push({ groupKey, success: false });
        continue;
      }

      // 5. Build message
      const dogNames = joinNames((dogs as Dog[]).map((d) => sanitise(d.name)));
      const isPlural = dogNames.includes(" and ");
      const dateFormatted = formatDate(ref.booking_date);
      const timeFormatted = formatTime(ref.slot);
      const serviceName = ref.service;

      const message = [
        `Just a friendly reminder — ${dogNames} ${isPlural ? "are" : "is"} booked in for a ${serviceName} tomorrow (${dateFormatted}) at ${timeFormatted}.`,
        "",
        "See you then! 🐾",
        "Smarter Dog Grooming",
      ].join("\n");

      // 6. Send via preferred channel
      let channel: "whatsapp" | "sms" | "email";
      let sent = false;
      const h = human as Human;

      if (h.whatsapp && h.phone) {
        channel = "whatsapp";
        sent = await sendTwilio(`whatsapp:${h.phone}`, `whatsapp:${TWILIO_WHATSAPP_FROM}`, message);
      } else if (h.sms && h.phone) {
        channel = "sms";
        sent = await sendTwilio(h.phone, TWILIO_SMS_FROM, message);
      } else if (h.email) {
        channel = "email";
        const subject = `Reminder — ${dogNames} is booked in tomorrow at Smarter Dog Grooming`;
        sent = await sendEmail(h.email, subject, message);
      } else {
        console.warn(`No contact method for human ${h.id} — skipping reminder`);
        results.push({ groupKey, success: false });
        continue;
      }

      // 7. Log for each booking in the group
      const logEntries = groupBookings.map((b) => ({
        booking_id: b.id,
        group_id: groupKey ?? null,
        human_id: h.id,
        channel,
        trigger_type: "reminder",
        status: sent ? "sent" : "failed",
        error_message: sent ? null : "Delivery failed — check provider logs",
        sent_at: sent ? new Date().toISOString() : null,
      }));

      await supabase.from("notification_log").insert(logEntries);

      results.push({ groupKey, success: sent, channel });
    }

    return new Response(
      JSON.stringify({ tomorrow, groups: results.length, results }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("notify-booking-reminder error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});

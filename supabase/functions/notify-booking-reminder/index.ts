import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendSmsBoolean, sendWhatsAppBoolean } from "../_shared/twilio.ts";
import { isAuthorizedWebhook } from "../_shared/webhook-auth.ts";

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
/** Short form "Mon 29 Mar" — keeps SMS in a single GSM-7 segment. */
function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
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

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const tomorrow = tomorrowDateString();

    // 1. Fetch all tomorrow's active booked appointments.
    const { data: bookings, error: bookingsError } = await supabase
      .from("bookings")
      .select("id, booking_date, slot, dog_id, service, group_id")
      .eq("booking_date", tomorrow)
      .eq("status", "Booked");

    if (bookingsError) {
      console.error("Bookings query failed:", bookingsError.message);
      return new Response("Bookings query failed", { status: 500 });
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
        .select("id, name, phone, whatsapp, sms, email, whatsapp_opted_out, sms_opted_out, email_opted_out, reminder_hours, reminder_channels")
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

      // Tight — single GSM-7 segment, no emoji, no em-dash. £0.04 per send.
      // The reminder is for someone who knows they have a booking; we only
      // need to confirm the time and which dog(s).
      const firstName = sanitise(human.name.split(" ")[0]);
      const message =
        `Hi ${firstName}, just a reminder ${dogNames} ${isPlural ? "are" : "is"} booked in for a ${serviceName} ` +
        `tomorrow (${dateFormatted}) at ${timeFormatted}. See you then!`;

      // 6. Pick channel BEFORE we send. WhatsApp → SMS → email. Skip any
      //    channel the customer has opted out of (PECR, mig 041).
      let channel: "whatsapp" | "sms" | "email";
      const h = human as Human & {
        whatsapp_opted_out?: boolean;
        sms_opted_out?: boolean;
        email_opted_out?: boolean;
      };

      if (h.whatsapp && h.phone && !h.whatsapp_opted_out) {
        channel = "whatsapp";
      } else if (h.sms && h.phone && !h.sms_opted_out) {
        channel = "sms";
      } else if (h.email && !h.email_opted_out) {
        channel = "email";
      } else {
        console.warn(`No contact method (or all opted out) for human ${h.id} — skipping reminder`);
        results.push({ groupKey, success: false });
        continue;
      }

      // 7. IDEMPOTENCY: insert pending log rows for ALL bookings in the
      //    group atomically. Partial unique index (mig 042) prevents the
      //    cron from sending the same reminder twice (e.g., if the cron
      //    job overlaps a manual replay).
      const pendingEntries = groupBookings.map((b) => ({
        booking_id: b.id,
        group_id: groupKey ?? null,
        human_id: h.id,
        channel,
        trigger_type: "reminder",
        status: "pending",
      }));

      const { data: pendingRows, error: pendingError } = await supabase
        .from("notification_log")
        .insert(pendingEntries)
        .select("id");

      if (pendingError) {
        if (pendingError.code === "23505") {
          // Already reminded this booking — skip silently
          results.push({ groupKey, success: true, channel: "skipped (duplicate)" });
          continue;
        }
        console.error(`Pending log insert failed for group ${groupKey}:`, pendingError.message);
        results.push({ groupKey, success: false });
        continue;
      }

      // 8. Send via Twilio (SMS/WhatsApp) or SendGrid (email).
      let sent = false;
      if (channel === "whatsapp") {
        sent = await sendWhatsAppBoolean(h.phone, message);
      } else if (channel === "sms") {
        sent = await sendSmsBoolean(h.phone, message);
      } else {
        const subject = `Reminder — ${dogNames} is booked in tomorrow at Smarter Dog Grooming`;
        sent = await sendEmail(h.email, subject, message);
      }

      // 9. Update the pending rows with the outcome.
      const pendingIds = (pendingRows ?? []).map((r: { id: string }) => r.id);
      await supabase
        .from("notification_log")
        .update({
          status: sent ? "sent" : "failed",
          sent_at: sent ? new Date().toISOString() : null,
          error_message: sent ? null : "Delivery failed — check provider logs",
        })
        .in("id", pendingIds);

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
      JSON.stringify({ error: "internal error" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});

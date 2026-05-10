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

    // Group dedup is now handled by the partial unique index on
    // notification_log (mig 042) — see step 6 below. The previous
    // 2-second-wait + select-by-group_id pattern was racy; the index is
    // atomic.

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

    // Tight — single GSM-7 segment, no emoji, no em-dash. £0.04 per send.
    const firstName = sanitise(human.name.split(" ")[0]);
    const isPlural = dogNames.includes(" and ");

    const message =
      `Hi ${firstName}, ${dogNames} ${isPlural ? "are" : "is"} all done and ready for collection whenever you are!`;

    // 5. Pick channel BEFORE we send. Preference: WhatsApp → SMS → email.
    //    Skip any channel the customer has opted out of (PECR, mig 041).
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

    // 6. IDEMPOTENCY: insert pending log rows for ALL bookings in the group
    //    atomically. Partial unique index (mig 042) prevents a second
    //    invocation — if any booking already has a pending or sent row, the
    //    whole INSERT fails with code 23505 and we return early.
    const pendingEntries = bookingIds.map((bid) => ({
      booking_id: bid,
      group_id: booking.group_id ?? null,
      human_id: human.id,
      channel,
      trigger_type: "ready",
      status: "pending",
    }));

    const { data: pendingRows, error: pendingError } = await supabase
      .from("notification_log")
      .insert(pendingEntries)
      .select("id");

    if (pendingError) {
      if (pendingError.code === "23505") {
        return new Response("Skipped: ready notification already dispatched", { status: 200 });
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
      const subject = `${dogNames} is ready for collection — Smarter Dog Grooming`;
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
    console.error("notify-booking-ready error:", err);
    return new Response(
      JSON.stringify({ error: "internal error" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});

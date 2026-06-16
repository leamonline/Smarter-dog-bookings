import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendSmsBoolean, sendWhatsAppBoolean } from "../_shared/twilio.ts";
import { isAuthorizedWebhook } from "../_shared/webhook-auth.ts";
import { sendEmail } from "../_shared/email.ts";
import { sanitise, joinNames } from "../_shared/format.ts";
import { recipientIdsForBooking, fetchHumansByIds, pickChannel } from "../_shared/recipients.ts";

// ── Environment variables ──────────────────────────────────────────────────
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET");
// Twilio creds are read inside ../_shared/twilio.ts.
// SENDGRID_API_KEY / SENDGRID_FROM_EMAIL are read inside ../_shared/email.ts.

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
    if (!isAuthorizedWebhook(req.headers.get("Authorization"), WEBHOOK_SECRET)) {
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

    // Resolve recipients — explicit notify_human_ids (owner + chosen trusted
    // humans) or the dog owner. Each gets their own channel + log row.
    const recipientIds = recipientIdsForBooking(booking.notify_human_ids, dog.human_id);
    const humansById = await fetchHumansByIds(supabase, recipientIds);
    const isPlural = dogNames.includes(" and ");

    const results: Array<{ human_id: string; channel?: string; sent?: boolean; skipped?: string }> = [];

    for (const humanId of recipientIds) {
      const human = humansById.get(humanId);
      if (!human) {
        results.push({ human_id: humanId, skipped: "human not found" });
        continue;
      }

      // Channel preference WhatsApp → SMS → email, skipping opted-out channels.
      const channel = pickChannel(human);
      if (!channel) {
        results.push({ human_id: humanId, skipped: "no contact method" });
        continue;
      }

      // Tight — single GSM-7 segment, no emoji, no em-dash. £0.04 per send.
      const firstName = sanitise(human.name.split(" ")[0]);
      const message =
        `Hi ${firstName}, ${dogNames} ${isPlural ? "are" : "is"} all done and ready for collection whenever you are!`;

      // IDEMPOTENCY: one pending row per booking for THIS recipient. Unique
      // index (booking_id, trigger_type, human_id) skips a recipient already
      // notified without blocking the others.
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
          results.push({ human_id: humanId, skipped: "already sent" });
          continue;
        }
        console.error("Pending log insert failed:", pendingError.message);
        results.push({ human_id: humanId, skipped: "log insert failed" });
        continue;
      }

      // Send via Twilio (SMS/WhatsApp) or SendGrid (email).
      let sent = false;
      if (channel === "whatsapp") {
        sent = await sendWhatsAppBoolean(human.phone!, message);
      } else if (channel === "sms") {
        sent = await sendSmsBoolean(human.phone!, message);
      } else {
        const subject = `${dogNames} is ready for collection — Smarter Dog Grooming`;
        sent = await sendEmail(human.email!, subject, message);
      }

      const pendingIds = (pendingRows ?? []).map((r: { id: string }) => r.id);
      await supabase
        .from("notification_log")
        .update({
          status: sent ? "sent" : "failed",
          sent_at: sent ? new Date().toISOString() : null,
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
    console.error("notify-booking-ready error:", err);
    return new Response(
      JSON.stringify({ error: "internal error" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});

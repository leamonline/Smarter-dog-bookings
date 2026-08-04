import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendSmsBoolean, sendWhatsAppBoolean } from "../_shared/twilio.ts";
import { isAuthorizedWebhook } from "../_shared/webhook-auth.ts";
import { sendEmail } from "../_shared/email.ts";
import { sanitise, formatDateShort as formatDate } from "../_shared/format.ts";
import {
  recipientIdsForBooking,
  fetchHumansByIds,
  pickChannel,
  bookingCancellationSkipReason,
  reportStaffRescheduleReplacement,
  type StaffRescheduleLookupResult,
} from "../_shared/recipients.ts";
import { STAFF_RESCHEDULE_CANCEL_REASON } from "../_shared/cancelReasons.ts";

// ── Environment variables ──────────────────────────────────────────────────
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET");
// Twilio creds are read inside ../_shared/twilio.ts.
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
    const booking = payload.old_record;

    if (!booking) {
      return new Response("No old_record in payload", { status: 400 });
    }

    // 0b. The cancel_reason that triggered this send lives on NEW, not OLD —
    // it's set in the same UPDATE that flips status to 'Cancelled', so OLD's
    // cancel_reason is still whatever it was before (usually null). A
    // WhatsApp Flow reschedule or a staff visit reschedule both cancel the
    // old visit and immediately confirm the replacement, so the standalone
    // "has been cancelled" message here would be redundant and misleading —
    // skip it. Falls back to old_record's reason for robustness if a caller
    // ever posts without a `record`. Normalised once here so the skip
    // decision and the staff-only branch below can't disagree about padding.
    const rawReason = payload.record?.cancel_reason ?? booking.cancel_reason;
    const cancelReason = typeof rawReason === "string" ? rawReason.trim() : "";

    const skipReason = bookingCancellationSkipReason({ cancel_reason: cancelReason });
    if (skipReason) {
      // Staff reschedule only. The WhatsApp case is live in production and
      // shipped in #584 — it keeps its original zero-query, zero-client fast
      // path and is not perturbed here. Suppression is unconditional: the
      // helper below never throws and never reports failure, so nothing in
      // this block can stop the 200 below from being returned.
      if (cancelReason === STAFF_RESCHEDULE_CANCEL_REASON) {
        await reportStaffRescheduleReplacement({
          sourceVisitId: booking.visit_id,
          bookingId: booking.id,
          // No lifecycle_state filter: booking_visits has a unique partial
          // index on supersedes_visit_id, so there is at most one immediate
          // replacement. Filtering on lifecycle_state='active' would report
          // a false "replacement missing" when the replacement has itself
          // already been rescheduled before this post-commit webhook ran.
          // Client construction is inside the callback so that a failure to
          // build it is caught by the helper's own guard.
          lookup: async (sourceVisitId) => {
            const { data, error } = await createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
              .from("booking_visits")
              .select("id, bookings(id), booking_visit_deposits(state)")
              .eq("supersedes_visit_id", sourceVisitId)
              .maybeSingle();
            return { data, error } as StaffRescheduleLookupResult;
          },
          warn: (message, detail) => console.warn(message, detail),
        });
      }
      return new Response(`Skipped: ${skipReason}`, { status: 200 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Look up the dog
    const { data: dog, error: dogError } = await supabase
      .from("dogs")
      .select("id, name, human_id")
      .eq("id", booking.dog_id)
      .single();

    if (dogError || !dog) {
      console.error("Dog lookup failed:", dogError?.message);
      return new Response("Dog lookup failed", { status: 500 });
    }

    // 2. Resolve recipients — explicit notify_human_ids (owner + chosen trusted
    //    humans) or the dog owner. Each gets their own channel + log row.
    const recipientIds = recipientIdsForBooking(booking.notify_human_ids, dog.human_id);
    const humansById = await fetchHumansByIds(supabase, recipientIds);

    // 3. Message bits shared across recipients. The WhatsApp-reschedule case is
    //    now filtered out above; for everything that reaches here (customer
    //    cancel, staff cancel, deposit not received, no-show, ...) we still
    //    can't tell the specific cause from the webhook payload, so we use the
    //    one generic customer-facing tone for all of them.
    const dogName = sanitise(dog.name);
    const dateFormatted = formatDate(booking.booking_date);

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

      const firstName = sanitise(human.name.split(" ")[0]);
      // Tight — single GSM-7 segment to keep SMS cost at £0.04 per send.
      const message =
        `Hi ${firstName}, your appointment for ${dogName} on ${dateFormatted} has been cancelled. ` +
        `Rebook anytime.`;

      // IDEMPOTENCY: pending row up front, per recipient. Unique index
      // (booking_id, trigger_type, human_id) skips a recipient already notified
      // without blocking the others. Cancellation is an UPDATE
      // (status='Cancelled'), so the booking row — and booking_id — still exist.
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
        const subject = `Your ${dogName} appointment has been cancelled`;
        sent = await sendEmail(human.email!, subject, message);
      }

      await supabase
        .from("notification_log")
        .update({
          status: sent ? "sent" : "failed",
          sent_at: sent ? new Date().toISOString() : null,
          error_message: sent ? null : "Delivery failed — check provider logs",
        })
        .eq("id", pendingRow.id);

      results.push({ human_id: humanId, channel, sent });
    }

    return new Response(
      JSON.stringify({ dogName, recipients: results }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("notify-booking-cancelled error:", err);
    return new Response(
      JSON.stringify({ error: "internal error" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});

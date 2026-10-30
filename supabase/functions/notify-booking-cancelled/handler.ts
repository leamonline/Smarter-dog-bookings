import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendSms } from "../_shared/twilio.ts";
import { isAuthorizedWebhook } from "../_shared/webhook-auth.ts";
import { sendEmailDetailed } from "../_shared/email.ts";
import { sanitise, formatDateShort as formatDate } from "../_shared/format.ts";
import {
  recipientIdsForBooking,
  fetchHumansByIds,
  channelAvailableFor,
  bookingCancellationSkipReason,
  reportStaffRescheduleReplacement,
  type RecipientHuman,
  type StaffRescheduleLookupResult,
} from "../_shared/recipients.ts";
import { STAFF_RESCHEDULE_CANCEL_REASON } from "../_shared/cancelReasons.ts";

// Cancellation notices go out as SMS, then email when a text is not possible
// (no mobile, SMS not set up, opted out, or Twilio rejects the send). They do
// not use Twilio WhatsApp. Consent is the same rule as every other text:
// channelAvailableFor requires the channel to be set up, to have a contact
// detail, and not to be opted out. This function has no quiet-hours gate.
function cancellationChannel(human: RecipientHuman): "sms" | "email" | null {
  if (channelAvailableFor(human, "sms")) return "sms";
  if (channelAvailableFor(human, "email")) return "email";
  return null;
}

function smsRejection(result: {
  status: number;
  errorCode?: string;
  errorMessage?: string;
}): string {
  const what = (result.errorMessage ?? "").trim();
  const code = result.errorCode ? ` (Twilio ${result.errorCode})` : "";
  return what
    ? `Twilio rejected this SMS: ${what}${code}.`
    : `Twilio rejected this SMS (HTTP ${result.status})${code}.`;
}

// ── Environment variables ──────────────────────────────────────────────────
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET");
// Twilio creds are read inside ../_shared/twilio.ts.
// SENDGRID_API_KEY / SENDGRID_FROM_EMAIL are read inside ../_shared/email.ts.

// ── Main handler ───────────────────────────────────────────────────────────

export async function handleBookingCancelled(req: Request): Promise<Response> {
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
      // helper below always resolves, within its own deadline, and never
      // reports failure — so nothing in this block can stop the 200 below
      // from being returned, or delay it indefinitely.
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
          lookup: async (sourceVisitId, signal) => {
            const { data, error } = await createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
              .from("booking_visits")
              .select("id, bookings(id), booking_visit_deposits(state)")
              .eq("supersedes_visit_id", sourceVisitId)
              // Honours the helper's deadline so an abandoned diagnostic
              // doesn't leave a PostgREST request running behind the 200.
              .abortSignal(signal)
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

      // SMS, then email. WhatsApp is not a cancellation channel: the Twilio
      // sender is a sandbox number whose accepts are not delivery.
      const channel = cancellationChannel(human);
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
          // The wording of the notice, kept on the row for staff.
          message_text: message,
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

      // 'sent' only when the provider accepts the message. A Twilio or
      // SendGrid rejection is 'failed' with that provider's reason, and the
      // channel on the row is the one that was actually used.
      const subject = `Your ${dogName} appointment has been cancelled`;
      let used: "sms" | "email" = channel;
      let sent = false;
      let errorMessage: string | null = null;
      let providerMessageId: string | null = null;

      if (channel === "sms") {
        const sms = await sendSms(human.phone!, message);
        if (sms.ok) {
          sent = true;
          providerMessageId = sms.sid ?? null;
        } else {
          const rejected = smsRejection(sms);
          console.error(`Twilio SMS failed (${sms.status}): ${rejected}`);
          if (channelAvailableFor(human, "email")) {
            const email = await sendEmailDetailed(human.email!, subject, message);
            used = "email";
            if (email.ok) {
              sent = true;
            } else {
              const emailError = email.errorMessage ?? `SendGrid HTTP ${email.status}`;
              console.error(`Cancellation email fallback failed: ${emailError}`);
              errorMessage = `${rejected} Email fallback failed: ${emailError}`;
            }
          } else {
            errorMessage = rejected;
          }
        }
      } else {
        const email = await sendEmailDetailed(human.email!, subject, message);
        if (email.ok) {
          sent = true;
        } else {
          errorMessage = email.errorMessage ?? `SendGrid HTTP ${email.status}`;
          console.error(`Cancellation email failed: ${errorMessage}`);
        }
      }

      await supabase
        .from("notification_log")
        .update({
          channel: used,
          status: sent ? "sent" : "failed",
          sent_at: sent ? new Date().toISOString() : null,
          provider_message_id: sent ? providerMessageId : null,
          error_message: sent ? null : errorMessage,
        })
        .eq("id", pendingRow.id);

      results.push({ human_id: humanId, channel: used, sent });
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
}

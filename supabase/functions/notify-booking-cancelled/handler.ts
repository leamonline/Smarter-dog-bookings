import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendSms } from "../_shared/twilio.ts";
import { isRecipientUnsubscribed, recordSmsStop } from "../_shared/smsStop.ts";
import { isAuthorizedWebhook } from "../_shared/webhook-auth.ts";
import { sendEmailDetailed } from "../_shared/email.ts";
import { sanitise, formatDateShort as formatDate, formatTime } from "../_shared/format.ts";
import {
  recipientIdsForBooking,
  fetchHumansByIds,
  channelAvailableFor,
  bookingCancellationSkipReason,
  reportStaffRescheduleReplacement,
  type NotifyChannel,
  type RecipientHuman,
  type StaffRescheduleLookupResult,
} from "../_shared/recipients.ts";
import { STAFF_RESCHEDULE_CANCEL_REASON } from "../_shared/cancelReasons.ts";

// Cancellation notices. Reschedule skips are unchanged (see
// bookingCancellationSkipReason).
//
// CANCELLATION_WHATSAPP_ENABLED must be the string "true" or this function
// behaves as it does today: SMS, then email. The flag ships off so a deploy
// does not change that. booking_cancelled_v1 is already approved in Meta
// (en_GB, Utility) and its wording apologises, so it is only for a
// cancellation the salon made (bookings.cancellation_cause = 'salon').
// Do not resubmit the template. A customer, reschedule, system, or unknown
// cause stays on SMS then email. Once this function is deployed, the flag
// can be turned on. A Meta rejection still does not send twice: the same
// notice goes out by SMS, then email, on this same notification_log row.
//
// WhatsApp still requires the channel to be switched on, a phone, and no
// opt-out (channelAvailableFor). whatsapp-send enforces the opt-out again.
//
// WhatsApp is always the approved-template send, never free text. A template
// is allowed inside and outside Meta's 24-hour customer-care window, which is
// the usual case for a cancellation. 'sent' is recorded only when the provider
// accepts (for WhatsApp, that includes a meta_message_id). Otherwise the row
// is 'failed' with that provider's error, on the channel actually used.
// A customer gets one notice: a rejected WhatsApp is moved onto SMS or email
// before that send, so reminder-sms-fallback does not see a WhatsApp row and
// text them as well.

export const BOOKING_CANCELLED_TEMPLATE = "booking_cancelled_v1";
export const BOOKING_CANCELLED_TEMPLATE_LANGUAGE = "en_GB";

/**
 * The SMS and email sentence. The approved WhatsApp body is different and
 * lives on the template; this wording stays as it is.
 */
export function cancellationNotice(
  firstName: string,
  dogName: string,
  dateFormatted: string,
): string {
  return `Hi ${firstName}, your appointment for ${dogName} on ${dateFormatted} has been cancelled. Rebook anytime.`;
}

/**
 * {{3}} of booking_cancelled_v1. Long date, and the time when the booking has
 * a slot, in the approved sample's shape ("Monday 16 June at 10:00am"). The
 * time uses the same formatTime as booking_confirmed_v1. No slot means the
 * date alone. SMS keeps the short date and does not use this.
 */
export function cancellationAppointmentWhen(
  dateStr: string,
  slot: string | null | undefined,
): string {
  const date = new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const time = typeof slot === "string" && slot.trim() ? formatTime(slot) : "";
  return time ? `${date} at ${time}` : date;
}

export function cancellationWhatsAppEnabled(): boolean {
  return (Deno.env.get("CANCELLATION_WHATSAPP_ENABLED") ?? "").trim().toLowerCase() === "true";
}

/**
 * Who cancelled, from the row the trigger posts as `record` (NEW). A resend
 * posts the current row as `old_record` only, so that is the fallback. Anything
 * other than the exact value "salon" is not the salon, including a missing
 * cause: we do not guess.
 */
export function cancellationCause(payload: {
  record?: { cancellation_cause?: unknown } | null;
  old_record?: { cancellation_cause?: unknown } | null;
}): string | null {
  const raw = payload.record?.cancellation_cause ?? payload.old_record?.cancellation_cause;
  if (typeof raw !== "string") return null;
  const cause = raw.trim();
  return cause.length > 0 ? cause : null;
}

export function isSalonCancellation(cause: string | null): boolean {
  return cause === "salon";
}

// Salon + flag on: WhatsApp, then SMS, then email. Every other cancellation:
// SMS, then email. Never the apology template unless the cause is salon.
function cancellationChannel(human: RecipientHuman, salon: boolean): NotifyChannel | null {
  if (salon && cancellationWhatsAppEnabled() && channelAvailableFor(human, "whatsapp")) {
    return "whatsapp";
  }
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

function whatsappAccepted(result: {
  ok: boolean;
  body: Record<string, unknown>;
}): string | null {
  const id = result.body.meta_message_id;
  if (result.ok && result.body.ok === true && typeof id === "string" && id.length > 0) {
    return id;
  }
  return null;
}

function whatsappRejection(result: {
  ok: boolean;
  status: number;
  body: Record<string, unknown>;
}): string {
  if (result.ok && result.body.ok === true) {
    return "WhatsApp was not accepted: Meta returned no message id.";
  }
  const error = typeof result.body.error === "string" ? result.body.error.trim() : "";
  const reason = typeof result.body.reason === "string" ? result.body.reason.trim() : "";
  const detail = [error, reason].filter(Boolean).join(" — ");
  return detail
    ? `WhatsApp was not accepted: ${detail} (HTTP ${result.status}).`
    : `WhatsApp was not accepted (HTTP ${result.status}).`;
}

// ── Environment variables ──────────────────────────────────────────────────
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET");
// Twilio creds are read inside ../_shared/twilio.ts.
// SENDGRID_API_KEY / SENDGRID_FROM_EMAIL are read inside ../_shared/email.ts.
// SEND_INTERNAL_SECRET is read per request so a test can set it, and so the
// WhatsApp call uses the same internal credential as notify-booking-confirmed.

async function invokeInternal(
  fn: string,
  payload: unknown,
): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": Deno.env.get("SEND_INTERNAL_SECRET") ?? "",
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify(payload),
  });
  let body: Record<string, unknown> = {};
  try {
    body = await res.json();
  } catch {
    /* non-JSON */
  }
  return { ok: res.ok, status: res.status, body };
}

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

    // NEW carries cancellation_cause from the same UPDATE. Only 'salon' may
    // use the apology template. Customer, reschedule, system, and a blank
    // cause (older writers that never set the column) stay on SMS then email.
    const salonCancellation = isSalonCancellation(cancellationCause(payload));

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

    // 3. Message bits shared across recipients. Reschedules are filtered out
    //    above. SMS and email keep one short sentence for every cause. The
    //    apology template is added only when cancellation_cause is salon.
    const dogName = sanitise(dog.name);
    const dateFormatted = formatDate(booking.booking_date);

    const results: Array<{ human_id: string; channel?: string; sent?: boolean; skipped?: string }> = [];

    for (const humanId of recipientIds) {
      const human = humansById.get(humanId);
      if (!human) {
        results.push({ human_id: humanId, skipped: "human not found" });
        continue;
      }

      const channel = cancellationChannel(human, salonCancellation);
      if (!channel) {
        results.push({ human_id: humanId, skipped: "no contact method" });
        continue;
      }

      const firstName = sanitise(human.name.split(" ")[0]);
      // SMS and email keep this short sentence, including when WhatsApp is
      // rejected and we fall back. The template has its own approved body;
      // only {{3}} carries the longer date and time.
      const message = cancellationNotice(firstName, dogName, dateFormatted);
      const appointmentWhen = cancellationAppointmentWhen(booking.booking_date, booking.slot);

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
          // The wording of the notice, kept on the row for staff and for the
          // hourly chase of a WhatsApp row that never reached a fallback.
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

      // 'sent' only when the provider accepts the message. A rejection is
      // 'failed' with that provider's reason. The channel on the row is the
      // one that was actually used. Moving the row off WhatsApp before an SMS
      // or email means the hourly chase cannot text the same cancellation.
      const subject = `Your ${dogName} appointment has been cancelled`;
      let used: NotifyChannel = channel;
      let sent = false;
      let providerMessageId: string | null = null;
      const failures: string[] = [];

      const retarget = async (next: "sms" | "email"): Promise<boolean> => {
        if (used === next) return true;
        const { error } = await supabase
          .from("notification_log")
          .update({ channel: next, status: "pending" })
          .eq("id", pendingRow.id);
        if (error) {
          console.error("Cancellation log retarget failed:", error.message);
          failures.push(
            "The notice could not be moved onto the next channel, so nothing further was sent.",
          );
          return false;
        }
        used = next;
        return true;
      };

      const trySms = async (): Promise<boolean> => {
        if (!channelAvailableFor(human, "sms") || !human.phone) return false;
        if (!(await retarget("sms"))) return false;
        const sms = await sendSms(human.phone, message);
        if (sms.ok) {
          sent = true;
          providerMessageId = sms.sid ?? null;
          return true;
        }
        // A text STOP (21610) is recorded and flagged for staff the same way as in
        // sms-send; this path calls Twilio directly so it must do it itself.
        if (isRecipientUnsubscribed(sms.errorCode)) await recordSmsStop(supabase, human.phone);
        const rejected = smsRejection(sms);
        console.error(`Twilio SMS failed (${sms.status}): ${rejected}`);
        failures.push(rejected);
        return false;
      };

      const tryEmail = async (): Promise<boolean> => {
        if (!channelAvailableFor(human, "email") || !human.email) return false;
        if (!(await retarget("email"))) return false;
        const email = await sendEmailDetailed(human.email, subject, message);
        if (email.ok) {
          sent = true;
          providerMessageId = null;
          return true;
        }
        const emailError = email.errorMessage ?? `SendGrid HTTP ${email.status}`;
        console.error(`Cancellation email failed: ${emailError}`);
        failures.push(
          failures.length > 0 ? `Email fallback failed: ${emailError}` : emailError,
        );
        return false;
      };

      if (channel === "whatsapp") {
        const result = await invokeInternal("whatsapp-send", {
          mode: "template",
          to: human.phone,
          template_name: BOOKING_CANCELLED_TEMPLATE,
          language: BOOKING_CANCELLED_TEMPLATE_LANGUAGE,
          // {{1}} first name, {{2}} dog name, {{3}} long date and time.
          params: [firstName, dogName, appointmentWhen],
          human_id: human.id,
        });
        const metaId = whatsappAccepted(result);
        if (metaId) {
          sent = true;
          providerMessageId = metaId;
        } else {
          const why = whatsappRejection(result);
          console.error(`cancelled whatsapp-send failed: ${why}`);
          failures.push(why);
          if (!(await trySms())) await tryEmail();
        }
      } else if (channel === "sms") {
        if (!(await trySms())) await tryEmail();
      } else {
        await tryEmail();
      }

      const errorMessage = sent ? null : (failures.join(" ") || "Delivery failed");

      await supabase
        .from("notification_log")
        .update({
          channel: used,
          status: sent ? "sent" : "failed",
          sent_at: sent ? new Date().toISOString() : null,
          provider_message_id: sent ? providerMessageId : null,
          error_message: errorMessage,
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

// ============================================================
// reminder-sms-fallback
//
// Hourly safety net for customer WhatsApp notices: the day-before reminder,
// the booking confirmation and (since #989) the cancellation notice.
//
// notify-booking-reminder and notify-booking-confirmed send Meta WhatsApp
// templates and log them to notification_log (trigger_type='reminder' /
// 'confirmed', channel='whatsapp') with the meta_message_id in
// provider_message_id. Meta status webhooks then move the matching
// whatsapp_messages row to delivered / read (or failed).
//
// notify-booking-cancelled still sends Twilio free text, which has no
// delivery receipt here, so it leaves its row 'pending' and the
// notification-pending-reaper fails it after ten minutes: a cancellation
// therefore always reaches this job as a 'failed' row (trigger_type=
// 'cancelled') and is chased after the one-hour window.
//
// This job runs hourly and, for any such WhatsApp notice that — an hour on —
// either FAILED to send or hasn't been confirmed delivered, sends the same
// wording over SMS instead. One SMS per customer per trigger, idempotent: a
// <trigger>_sms_fallback row (partial-unique on booking_id+trigger_type)
// is claimed before sending so re-runs never double-text.
//
// Cron-only: authenticates with Bearer WEBHOOK_SECRET, exactly like
// notify-booking-reminder's cron path.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isAuthorizedWebhook } from "../_shared/webhook-auth.ts";
import { channelAvailableFor, HUMAN_CONTACT_COLUMNS, type RecipientHuman } from "../_shared/recipients.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET");
const SEND_INTERNAL_SECRET = Deno.env.get("SEND_INTERNAL_SECRET") ?? "";

// A Meta status of delivered/read means the customer got the WhatsApp —
// no SMS needed. Anything else (still 'sent', 'failed', or unknown) is a
// candidate to chase.
const DELIVERED = new Set(["delivered", "read"]);

// The WhatsApp notices this job chases, and the sms-send template name each
// one's SMS is logged under. Adding a trigger here also needs its
// '<trigger>_sms_fallback' value in the notification_log trigger_type CHECK
// (latest list: migration 20261014100000).
export const CHASED_TRIGGERS: Readonly<Record<string, string>> = {
  reminder: "appointment_reminder",
  confirmed: "booking_confirmed",
  cancelled: "booking_cancelled",
};

/**
 * How rows share one SMS. Reminders and confirmations for a multi-dog visit
 * carry one combined message, so one SMS per (customer, trigger) covers the
 * group. A cancellation notice is written per booking and names that one dog,
 * so each booking keeps its own SMS: grouping two cancelled dogs would claim
 * both and text only the first dog's name.
 */
export function smsGroupKey(row: { human_id: string | null; trigger_type: string; booking_id: string | null }): string {
  return row.trigger_type === "cancelled"
    ? `${row.human_id}|${row.trigger_type}|${row.booking_id}`
    : `${row.human_id}|${row.trigger_type}`;
}

/**
 * Whether a notice is still worth chasing given its booking's current state.
 * A reminder or confirmation is moot once the appointment is cancelled, over
 * or missed. A cancellation notice is the opposite: it is only worth sending
 * while the booking IS cancelled — if staff restored it, the customer must not
 * be texted that it was cancelled.
 */
export function noticeStillRelevant(triggerType: string, bookingStatus: string | undefined): boolean {
  if (!bookingStatus) return false;
  if (triggerType === "cancelled") return bookingStatus === "Cancelled";
  return bookingStatus !== "Cancelled" && bookingStatus !== "Completed" && bookingStatus !== "No-show";
}

interface ReminderRow {
  id: string;
  booking_id: string | null;
  human_id: string | null;
  message_text: string | null;
  provider_message_id: string | null;
  status: string;
  trigger_type: string;
  created_at: string;
}

// POST to another edge function with the trusted server-to-server creds
// that sms-send accepts (service-role JWT + x-internal-secret).
async function invokeInternal(
  fn: string,
  payload: unknown,
): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": SEND_INTERNAL_SECRET,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
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

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function handleSmsFallback(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }
  if (
    !WEBHOOK_SECRET ||
    !isAuthorizedWebhook(req.headers.get("Authorization"), WEBHOOK_SECRET)
  ) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  try {
    // 1. Candidate WhatsApp notices: logged more than an hour ago (Meta
    //    has had time to deliver) but within the last 26h (don't chase
    //    yesterday's forever).
    const olderThan1h = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
    const newerThan26h = new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString();

    const { data: rows, error } = await supabase
      .from("notification_log")
      .select("id, booking_id, human_id, message_text, provider_message_id, status, trigger_type, created_at")
      .in("trigger_type", Object.keys(CHASED_TRIGGERS))
      .eq("channel", "whatsapp")
      .in("status", ["sent", "failed"])
      .lt("created_at", olderThan1h)
      .gt("created_at", newerThan26h);

    if (error) {
      console.error("reminder-sms-fallback: candidate query failed:", error.message);
      return new Response("query failed", { status: 500 });
    }

    const candidates = (rows ?? []) as ReminderRow[];
    if (candidates.length === 0) {
      return json({ checked: 0, sms_sent: 0 });
    }

    // 2. Resolve Meta delivery status for the 'sent' rows by meta_message_id.
    const metaIds = candidates
      .filter((r) => r.status === "sent" && r.provider_message_id)
      .map((r) => r.provider_message_id!);
    const deliveryByMetaId = new Map<string, string>();
    if (metaIds.length) {
      const { data: msgs } = await supabase
        .from("whatsapp_messages")
        .select("meta_message_id, status")
        .in("meta_message_id", metaIds)
        .eq("direction", "outbound");
      for (const m of (msgs ?? []) as { meta_message_id: string; status: string }[]) {
        deliveryByMetaId.set(m.meta_message_id, m.status);
      }
    }

    // 3. Drop notices their booking's current state has made moot (see
    //    noticeStillRelevant: a reminder for a cancelled visit, or a
    //    cancellation notice for a visit staff have since restored).
    const bookingIds = [
      ...new Set(candidates.map((r) => r.booking_id).filter(Boolean)),
    ] as string[];
    const bookingStatus = new Map<string, string>();
    if (bookingIds.length) {
      const { data: bks } = await supabase
        .from("bookings")
        .select("id, status")
        .in("id", bookingIds);
      for (const b of (bks ?? []) as { id: string; status: string }[]) {
        bookingStatus.set(b.id, b.status);
      }
    }

    // 4. Which sends still need an SMS chase? Soften the "not delivered"
    //    signal so we don't double-message someone who already got the
    //    WhatsApp when Meta's delivered/read webhook merely lagged:
    //      • a send-time or Meta-reported FAILURE → chase after the 1h window;
    //      • delivered / read                     → never chase;
    //      • no positive receipt yet ('sent', or a missing/lost webhook) →
    //        wait a longer 6h grace before texting.
    const olderThan6h = Date.now() - 6 * 60 * 60 * 1000;
    const needsSms = candidates.filter((r) => {
      if (!r.message_text) return false; // nothing to resend
      if (!r.booking_id || !noticeStillRelevant(r.trigger_type, bookingStatus.get(r.booking_id))) return false;
      if (r.status === "failed") return true; // whatsapp-send returned failure
      // status === 'sent': decide by the Meta delivery receipt.
      if (!r.provider_message_id) return false; // can't verify — assume it landed
      const d = deliveryByMetaId.get(r.provider_message_id);
      if (d && DELIVERED.has(d)) return false; // delivered / read → done
      if (d === "failed") return true; // Meta reported the send failed → chase
      // No positive receipt yet → only chase once well past the grace window.
      return new Date(r.created_at).getTime() < olderThan6h;
    });

    if (needsSms.length === 0) {
      return json({ checked: candidates.length, sms_sent: 0 });
    }

    // 5. Group by (customer, original trigger) — one SMS per group. A customer
    //    with both an undelivered reminder AND confirmation gets one of each,
    //    logged under the matching <trigger>_sms_fallback type. Cancellations
    //    stay one SMS per booking (see smsGroupKey).
    const byGroup = new Map<string, ReminderRow[]>();
    for (const r of needsSms) {
      if (!r.human_id) continue;
      const key = smsGroupKey(r);
      if (!byGroup.has(key)) byGroup.set(key, []);
      byGroup.get(key)!.push(r);
    }

    // Who may be texted: the same rule as every other SMS the salon sends
    // (recipients.ts channelAvailableFor): the customer has SMS switched on
    // ("SMS reminders"), has a phone, and has not opted out of SMS (PECR).
    // Not opting out is not the same as choosing SMS.
    const humanIds = [...new Set([...byGroup.values()].flat().map((r) => r.human_id!))];
    const { data: humans } = await supabase
      .from("humans")
      .select(HUMAN_CONTACT_COLUMNS)
      .in("id", humanIds);
    const humanById = new Map(
      ((humans ?? []) as RecipientHuman[]).map((h) => [h.id, h]),
    );

    let smsSent = 0;
    let skipped = 0;

    for (const gRows of byGroup.values()) {
      const humanId = gRows[0].human_id!;
      const originalTrigger = gRows[0].trigger_type; // a key of CHASED_TRIGGERS
      const h = humanById.get(humanId);
      if (!h || !channelAvailableFor(h, "sms")) {
        skipped++;
        continue;
      }

      // Claim idempotency BEFORE sending: one <trigger>_sms_fallback row per
      // booking. The partial unique index (booking_id, trigger_type) WHERE
      // status IN ('pending','sent') makes a re-run's insert fail with
      // 23505 — so we never double-text.
      const fallbackTrigger = `${originalTrigger}_sms_fallback`;
      // One claim per booking: a booking cancelled, restored and cancelled
      // again has two failed notices, and two identical claims would make the
      // unique index refuse the whole batch (read as "already chased"). The
      // newest notice wins, so the SMS carries the latest wording.
      const newestByBooking = new Map<string, ReminderRow>();
      for (const r of gRows) {
        if (!r.booking_id) continue;
        const seen = newestByBooking.get(r.booking_id);
        if (!seen || new Date(r.created_at).getTime() > new Date(seen.created_at).getTime()) {
          newestByBooking.set(r.booking_id, r);
        }
      }
      const bookingRows = [...newestByBooking.values()];
      const pendingEntries = bookingRows.map((r) => ({
        booking_id: r.booking_id,
        human_id: humanId,
        channel: "sms",
        trigger_type: fallbackTrigger,
        status: "pending",
        message_text: r.message_text,
      }));

      const { data: pendingRows, error: insErr } = await supabase
        .from("notification_log")
        .insert(pendingEntries)
        .select("id");

      if (insErr) {
        if (insErr.code === "23505") {
          skipped++; // already chased this customer for this trigger
          continue;
        }
        console.error("reminder-sms-fallback: pending insert failed:", insErr.message);
        continue;
      }

      const claimIds = ((pendingRows ?? []) as { id: string }[]).map((p) => p.id);

      // A cancellation is only texted while the booking is still cancelled.
      // The status read above is minutes old by now, so read it again after
      // the claim: a restore since then releases the claim and sends nothing.
      if (originalTrigger === "cancelled") {
        const { data: nowRows, error: nowErr } = await supabase
          .from("bookings")
          .select("id, status")
          .in("id", bookingRows.map((r) => r.booking_id!));
        const stillCancelled = !nowErr && bookingRows.every((r) =>
          noticeStillRelevant(
            originalTrigger,
            ((nowRows ?? []) as { id: string; status: string }[]).find((b) => b.id === r.booking_id)?.status,
          )
        );
        if (!stillCancelled) {
          // Delete the claim rather than mark it failed: a failed claim row
          // would surface on the dashboard as a cancellation that failed.
          // Nothing was sent, so the claim leaves no record behind.
          if (claimIds.length) {
            await supabase.from("notification_log").delete().in("id", claimIds);
          }
          skipped++;
          continue;
        }
      }

      // A cancellation group is one booking: send its newest notice. Reminder
      // and confirmation groups keep sending the first row's wording.
      const text = originalTrigger === "cancelled" && bookingRows.length
        ? bookingRows[0].message_text!
        : gRows[0].message_text!;
      const result = await invokeInternal("sms-send", {
        mode: "template",
        to: h.phone,
        text,
        template_name: CHASED_TRIGGERS[originalTrigger] ?? originalTrigger,
        human_id: humanId,
      });
      const ok = result.ok && result.body.ok === true;
      const sid = (result.body.twilio_sid as string | null) ?? null;
      if (ok) {
        smsSent++;
      } else {
        console.error(
          `reminder-sms-fallback: sms-send failed for ${humanId}:`,
          result.status,
          JSON.stringify(result.body),
        );
      }

      const ids = (pendingRows ?? []).map((r: { id: string }) => r.id);
      await supabase
        .from("notification_log")
        .update({
          status: ok ? "sent" : "failed",
          sent_at: ok ? new Date().toISOString() : null,
          provider_message_id: ok ? sid : null,
          error_message: ok ? null : "SMS fallback failed — check provider logs",
        })
        .in("id", ids);
    }

    return json({
      checked: candidates.length,
      needs_sms: needsSms.length,
      sms_sent: smsSent,
      skipped,
    });
  } catch (err) {
    console.error("reminder-sms-fallback error:", err);
    return new Response("internal error", { status: 500 });
  }
}

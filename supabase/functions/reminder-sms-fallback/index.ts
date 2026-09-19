// ============================================================
// reminder-sms-fallback
//
// Hourly safety net for the day-before WhatsApp reminder.
//
// notify-booking-reminder sends the reminder as a Meta WhatsApp template
// and logs it to notification_log (trigger_type='reminder',
// channel='whatsapp') with the meta_message_id in provider_message_id.
// Meta status webhooks then move the matching whatsapp_messages row to
// delivered / read (or failed).
//
// This job runs hourly and, for any WhatsApp reminder that — an hour on —
// either FAILED to send or hasn't been confirmed delivered, sends the same
// reminder over SMS instead. One SMS per customer, idempotent: a
// reminder_sms_fallback row (partial-unique on booking_id+trigger_type)
// is claimed before sending so re-runs never double-text.
//
// Cron-only: authenticates with Bearer WEBHOOK_SECRET, exactly like
// notify-booking-reminder's cron path.
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isAuthorizedWebhook } from "../_shared/webhook-auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET");
const SEND_INTERNAL_SECRET = Deno.env.get("SEND_INTERNAL_SECRET") ?? "";

// A Meta status of delivered/read means the customer got the WhatsApp —
// no SMS needed. Anything else (still 'sent', 'failed', or unknown) is a
// candidate to chase.
const DELIVERED = new Set(["delivered", "read"]);

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

serve(async (req) => {
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
    // 1. Candidate WhatsApp reminders: logged more than an hour ago (Meta
    //    has had time to deliver) but within the last 26h (don't chase
    //    yesterday's forever).
    const olderThan1h = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
    const newerThan26h = new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString();

    const { data: rows, error } = await supabase
      .from("notification_log")
      .select("id, booking_id, human_id, message_text, provider_message_id, status, trigger_type, created_at")
      .in("trigger_type", ["reminder", "confirmed"])
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

    // 3. Drop reminders whose booking is no longer active.
    const bookingIds = [
      ...new Set(candidates.map((r) => r.booking_id).filter(Boolean)),
    ] as string[];
    const activeBooking = new Set<string>();
    if (bookingIds.length) {
      const { data: bks } = await supabase
        .from("bookings")
        .select("id, status")
        .in("id", bookingIds);
      for (const b of (bks ?? []) as { id: string; status: string }[]) {
        // No-show joins Cancelled and Completed: none of them should draw an
        // SMS chase for an appointment that is already over.
        if (b.status !== "Cancelled" && b.status !== "Completed" && b.status !== "No-show") {
          activeBooking.add(b.id);
        }
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
      if (!r.booking_id || !activeBooking.has(r.booking_id)) return false;
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
    //    logged under the matching <trigger>_sms_fallback type.
    const byGroup = new Map<string, ReminderRow[]>();
    for (const r of needsSms) {
      if (!r.human_id) continue;
      const key = `${r.human_id}|${r.trigger_type}`;
      if (!byGroup.has(key)) byGroup.set(key, []);
      byGroup.get(key)!.push(r);
    }

    // Contact details + SMS opt-out (PECR — never text an opted-out number).
    const humanIds = [...new Set([...byGroup.values()].flat().map((r) => r.human_id!))];
    const { data: humans } = await supabase
      .from("humans")
      .select("id, phone, sms_opted_out")
      .in("id", humanIds);
    const humanById = new Map(
      ((humans ?? []) as { id: string; phone: string | null; sms_opted_out: boolean | null }[])
        .map((h) => [h.id, h]),
    );

    let smsSent = 0;
    let skipped = 0;

    for (const gRows of byGroup.values()) {
      const humanId = gRows[0].human_id!;
      const originalTrigger = gRows[0].trigger_type; // 'reminder' | 'confirmed'
      const h = humanById.get(humanId);
      if (!h?.phone || h.sms_opted_out) {
        skipped++;
        continue;
      }

      // Claim idempotency BEFORE sending: one <trigger>_sms_fallback row per
      // booking. The partial unique index (booking_id, trigger_type) WHERE
      // status IN ('pending','sent') makes a re-run's insert fail with
      // 23505 — so we never double-text.
      const fallbackTrigger = `${originalTrigger}_sms_fallback`;
      const bookingRows = gRows.filter((r) => r.booking_id);
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

      const text = gRows[0].message_text!;
      const result = await invokeInternal("sms-send", {
        mode: "template",
        to: h.phone,
        text,
        template_name: originalTrigger === "confirmed" ? "booking_confirmed" : "appointment_reminder",
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
});

// ============================================================
// supabase/functions/notify-staff/index.ts
//
// Fan-out for STAFF Web Push. Called by DB triggers (via pg_net, Bearer
// get_webhook_secret()) and optionally by internal callers (x-internal-secret)
// when a staff-relevant event happens: new message, new/cancelled/rescheduled
// booking, new client signup, waitlist join.
//
// ADDITIVE + dark-launched:
//   - The whole function is a no-op unless STAFF_PUSH_ENABLED=true.
//   - It is a SEPARATE function from the customer notify-* fns; a failure here
//     cannot affect any customer notification. Triggers call it fire-and-forget
//     via pg_net, so it can never roll back a booking.
//
// Request body (sent by the triggers, top-level fields):
//   {
//     event_type: "message"|"new_booking"|"cancellation"|"reschedule"
//                 |"new_client"|"waitlist",
//     context?: { customerName?, dogName?, service?, bookingDate?, slot?,
//                 previousBookingDate?, previousSlot?, senderName?, bookingId? },
//     dedupe_key?: string,   // coalescing / idempotency key
//     actor_id?: string,     // suppress THIS user's own devices only
//     title?, body?, url?    // optional overrides of the derived copy
//   }
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isAuthorizedWebhook, timingSafeEqualHeader } from "../_shared/webhook-auth.ts";
import {
  buildStaffPushMessage,
  isStaffEventType,
  selectRecipients,
  type StaffAlertPrefsRow,
  type StaffSubscriptionRow,
} from "../_shared/staffPush.ts";
import { sendWebPush, type VapidDetails } from "../_shared/webpush.ts";

const STAFF_PUSH_ENABLED =
  (Deno.env.get("STAFF_PUSH_ENABLED") ?? "false").toLowerCase() === "true";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET");
const SEND_INTERNAL_SECRET = Deno.env.get("SEND_INTERNAL_SECRET");

const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY");
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY");
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:leam@leamonline.uk";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  try {
    // 0. Dark-launch gate — silently do nothing until explicitly enabled.
    if (!STAFF_PUSH_ENABLED) {
      return json({ skipped: true, reason: "STAFF_PUSH_ENABLED is off" }, 200);
    }

    // 1. Auth — accept EITHER the webhook Bearer (triggers) OR x-internal-secret.
    const bearerOk =
      !!WEBHOOK_SECRET &&
      isAuthorizedWebhook(req.headers.get("Authorization"), WEBHOOK_SECRET);
    const internalOk = timingSafeEqualHeader(
      req.headers.get("x-internal-secret"),
      SEND_INTERNAL_SECRET,
    );
    if (!bearerOk && !internalOk) {
      return json({ error: "unauthorized" }, 401);
    }

    // 2. VAPID must be configured if we're enabled.
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      console.error("notify-staff: VAPID keys are not configured");
      return json({ error: "server misconfiguration: VAPID keys not set" }, 500);
    }
    const vapid: VapidDetails = {
      publicKey: VAPID_PUBLIC_KEY,
      privateKey: VAPID_PRIVATE_KEY,
      subject: VAPID_SUBJECT,
    };

    // 3. Parse + validate.
    const payload = await req.json().catch(() => null);
    if (!payload || !isStaffEventType(payload.event_type)) {
      return json({ error: "invalid or missing event_type" }, 400);
    }
    const eventType = payload.event_type;
    const dedupeKey: string | null =
      typeof payload.dedupe_key === "string" && payload.dedupe_key
        ? payload.dedupe_key
        : null;
    const actorId: string | null =
      typeof payload.actor_id === "string" && payload.actor_id
        ? payload.actor_id
        : null;
    const context = (payload.context ?? {}) as Record<string, unknown>;
    const bookingId =
      typeof context.bookingId === "string" && context.bookingId
        ? context.bookingId
        : null;

    const derived = buildStaffPushMessage(eventType, context);
    const title = typeof payload.title === "string" && payload.title ? payload.title : derived.title;
    const body = typeof payload.body === "string" && payload.body ? payload.body : derived.body;
    const url = typeof payload.url === "string" && payload.url ? payload.url : derived.url;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 4. Coalesce / idempotency. Claim the dedupe_key by inserting a log row;
    //    a unique-violation means another trigger already handled this window
    //    (e.g. a burst of messages in the same conversation/minute) — skip.
    let logId: string | null = null;
    const logRow: Record<string, unknown> = {
      booking_id: bookingId,
      human_id: null,
      channel: "webpush",
      trigger_type: derived.triggerType,
      status: "pending",
      dedupe_key: dedupeKey,
    };
    const { data: inserted, error: insertErr } = await supabase
      .from("notification_log")
      .insert(logRow)
      .select("id")
      .single();
    if (insertErr) {
      if (insertErr.code === "23505") {
        return json({ coalesced: true, reason: "duplicate dedupe_key" }, 200);
      }
      console.error("notify-staff: log insert failed:", insertErr.message);
      // Continue without a log row rather than dropping the notification.
    } else {
      logId = inserted?.id ?? null;
    }

    // 5. Load subscriptions + per-staff prefs (service role bypasses RLS).
    const { data: subs } = await supabase
      .from("staff_push_subscriptions")
      .select("id, user_id, endpoint, p256dh, auth");
    const { data: prefs } = await supabase
      .from("staff_alert_prefs")
      .select("user_id, messages, new_booking, cancellation, reschedule, new_client, waitlist");

    const prefsByUser = new Map<string, StaffAlertPrefsRow>();
    for (const p of (prefs ?? []) as StaffAlertPrefsRow[]) {
      prefsByUser.set(p.user_id, p);
    }
    const recipients = selectRecipients(
      (subs ?? []) as StaffSubscriptionRow[],
      prefsByUser,
      eventType,
      actorId,
    );

    if (recipients.length === 0) {
      if (logId) {
        await supabase
          .from("notification_log")
          .update({ status: "sent", sent_at: new Date().toISOString() })
          .eq("id", logId);
      }
      return json({ sent: 0, reason: "no eligible recipients" }, 200);
    }

    // 6. Send. tag = dedupe_key so iOS collapses same-conversation pushes.
    const pushBody = JSON.stringify({ title, body, url, tag: dedupeKey ?? undefined });
    const results = await Promise.all(
      recipients.map(async (sub) => {
        try {
          const res = await sendWebPush(
            { endpoint: sub.endpoint, p256dh: sub.p256dh!, auth: sub.auth! },
            pushBody,
            vapid,
          );
          return { sub, res };
        } catch (err) {
          console.error("notify-staff: send threw:", (err as Error).message);
          return { sub, res: null };
        }
      }),
    );

    // 7. Prune dead subscriptions; bump last_used_at on success; tally.
    const deadIds: string[] = [];
    const usedIds: string[] = [];
    let sent = 0;
    let failed = 0;
    for (const { sub, res } of results) {
      if (res?.success) {
        sent++;
        usedIds.push(sub.id);
      } else if (res?.gone) {
        deadIds.push(sub.id);
        failed++;
      } else {
        failed++;
      }
    }

    if (deadIds.length > 0) {
      await supabase.from("staff_push_subscriptions").delete().in("id", deadIds);
    }
    if (usedIds.length > 0) {
      await supabase
        .from("staff_push_subscriptions")
        .update({ last_used_at: new Date().toISOString(), failure_count: 0 })
        .in("id", usedIds);
    }

    if (logId) {
      await supabase
        .from("notification_log")
        .update({
          status: sent > 0 ? "sent" : "failed",
          sent_at: sent > 0 ? new Date().toISOString() : null,
          error_message: sent > 0 ? null : "All staff push deliveries failed",
        })
        .eq("id", logId);
    }

    return json({ sent, failed, pruned: deadIds.length }, 200);
  } catch (err) {
    console.error("notify-staff error:", err);
    return json({ error: "internal error" }, 500);
  }
});

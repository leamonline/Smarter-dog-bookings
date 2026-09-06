import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isAuthorizedWebhook } from "../_shared/webhook-auth.ts";
import { buildAllowedOrigins, buildCorsHeaders } from "../_shared/cors.ts";
import { sendEmail } from "../_shared/email.ts";
import { sanitise, formatDateShort as formatDate, formatTime, joinNames } from "../_shared/format.ts";
import { recipientIdsForBooking, fetchHumansByIds, pickChannel } from "../_shared/recipients.ts";

// ── Environment variables ──────────────────────────────────────────────────
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET");
// Shared secret for the internal calls to whatsapp-send / sms-send (the
// same project-wide secret those functions already check). WhatsApp +
// SMS reminders go OUT through those functions now (not Twilio direct)
// so they land in the staff inbox with a delivery status.
const SEND_INTERNAL_SECRET = Deno.env.get("SEND_INTERNAL_SECRET") ?? "";
// SENDGRID_API_KEY / SENDGRID_FROM_EMAIL are read inside ../_shared/email.ts.

// ── Internal-call helper ────────────────────────────────────────────────────
// Mirrors reminder-send: POST to another edge function, authenticating with
// the service-role JWT + the x-internal-secret header that whatsapp-send /
// sms-send accept for trusted server-to-server callers.
async function invokeInternal(
  fn: string,
  payload: unknown,
): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": SEND_INTERNAL_SECRET,
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

// Current hour (0–23) in Europe/London, used to land the cron's 3pm-UK
// send despite pg_cron being UTC-only (see the at_hour_uk gate below).
function londonHourNow(): number {
  const formatted = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour: "numeric",
    hour12: false,
  }).format(new Date());
  return parseInt(formatted, 10);
}

// CORS — only for the staff-JWT path (the cron call sends no Origin
// header). Same allowlist pattern as whatsapp-send.
const ALLOWED_ORIGINS = buildAllowedOrigins("NOTIFY_REMINDER_ALLOWED_ORIGINS");

const corsFor = (req: Request) => buildCorsHeaders(req, ALLOWED_ORIGINS);

// ── Helpers ────────────────────────────────────────────────────────────────

/** Tomorrow's date as a YYYY-MM-DD string */
function tomorrowDateString(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}

// ── Types ──────────────────────────────────────────────────────────────────

// A booking enriched with its dog's name + owner (human_id), resolved via
// the bookings → dogs FK so we can group per customer without a second
// round trip per dog.
interface EnrichedBooking {
  id: string;
  booking_date: string;
  slot: string;
  service: string;
  dog_id: string;
  dog_name: string;
  human_id: string;
  group_id: string | null;
  notify_human_ids: string[] | null;
}

// Raw shape of a bookings row with an embedded dog select. PostgREST
// returns a to-one embed as an object, but we tolerate the array form too.
interface RawBookingRow {
  id: string;
  booking_date: string;
  slot: string;
  service: string;
  dog_id: string;
  group_id: string | null;
  notify_human_ids: string[] | null;
  dogs: { human_id: string; name: string } | { human_id: string; name: string }[] | null;
}

function toEnriched(rows: RawBookingRow[]): EnrichedBooking[] {
  const out: EnrichedBooking[] = [];
  for (const r of rows) {
    const dog = Array.isArray(r.dogs) ? r.dogs[0] : r.dogs;
    if (!dog?.human_id) continue; // orphaned booking (dog deleted) — can't remind
    out.push({
      id: r.id,
      booking_date: r.booking_date,
      slot: r.slot,
      service: r.service,
      dog_id: r.dog_id,
      dog_name: dog.name,
      human_id: dog.human_id,
      group_id: r.group_id ?? null,
      notify_human_ids: r.notify_human_ids ?? null,
    });
  }
  return out;
}

// ── Group by (human_id, booking_date) — one reminder per customer per day ──

function groupByCustomerDay(rows: EnrichedBooking[]): Map<string, EnrichedBooking[]> {
  const groups = new Map<string, EnrichedBooking[]>();
  for (const r of rows) {
    const key = `${r.human_id}|${r.booking_date}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }
  return groups;
}

// Build the reminder wording for a set of a customer's bookings on one day.
// Split out so each recipient (owner + chosen trusted humans) is reminded about
// exactly the bookings that list them. Tight — single GSM-7 segment where
// possible, no emoji/em-dash. appointmentWhen feeds the {{appointment_when}}
// slot of the Meta template appointment_reminder_v1 (must read after "for").
function buildReminder(
  rows: EnrichedBooking[],
  firstName: string,
  bookingDate: string,
): { message: string; appointmentWhen: string; dogNames: string; isPlural: boolean } {
  const dogMap = new Map<string, { name: string; slot: string }>();
  for (const r of rows) {
    const existing = dogMap.get(r.dog_id);
    if (!existing || r.slot < existing.slot) {
      dogMap.set(r.dog_id, { name: r.dog_name, slot: r.slot });
    }
  }
  const uniqueDogs = [...dogMap.values()].sort((a, b) => a.slot.localeCompare(b.slot));
  const dogNames = joinNames(uniqueDogs.map((d) => sanitise(d.name)));
  const isPlural = uniqueDogs.length > 1;
  const dateFormatted = formatDate(bookingDate);
  const slots = [...new Set(rows.map((r) => r.slot))].sort();
  const services = [...new Set(rows.map((r) => r.service))];

  let message: string;
  let appointmentWhen: string;
  if (slots.length === 1 && services.length === 1) {
    // Common case (incl. multi-dog at the same slot).
    const timeFormatted = formatTime(slots[0]);
    message =
      `Hi ${firstName}, just a reminder ${dogNames} ${isPlural ? "are" : "is"} booked in for a ${services[0]} ` +
      `tomorrow (${dateFormatted}) at ${timeFormatted}. See you then!`;
    appointmentWhen = `${dateFormatted} at ${timeFormatted}`;
  } else if (slots.length === 1) {
    // Same time, different services — stay generic so we never name the wrong
    // service for a dog.
    const timeFormatted = formatTime(slots[0]);
    message =
      `Hi ${firstName}, just a reminder ${dogNames} ${isPlural ? "are" : "is"} booked in ` +
      `tomorrow (${dateFormatted}) at ${timeFormatted}. See you then!`;
    appointmentWhen = `${dateFormatted} at ${timeFormatted}`;
  } else {
    // Dogs at different times — list each dog with its own time.
    const perDog = joinNames(
      uniqueDogs.map((d) => `${sanitise(d.name)} at ${formatTime(d.slot)}`),
    );
    message =
      `Hi ${firstName}, just a reminder about your bookings ` +
      `tomorrow (${dateFormatted}): ${perDog}. See you then!`;
    appointmentWhen = `${dateFormatted} (${perDog})`;
  }
  return { message, appointmentWhen, dogNames, isPlural };
}

// ── Main handler ───────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsFor(req) });
  }

  try {
    // 0. Auth — two paths:
    //    (a) cron / pg_net trigger: Authorization: Bearer <WEBHOOK_SECRET>
    //    (b) staff dashboard: Authorization: Bearer <JWT> + is_staff()
    //
    // Path (b) was added so the dashboard's "Tomorrow's reminders"
    // panel can fire a one-shot reminder for a single booking
    // without needing to share the WEBHOOK_SECRET with the browser.
    let authedAsStaff = false;
    const cronAuthed =
      !!WEBHOOK_SECRET && isAuthorizedWebhook(req.headers.get("Authorization"), WEBHOOK_SECRET);

    if (!cronAuthed) {
      const authHeader = req.headers.get("authorization");
      if (!authHeader) {
        return new Response("Unauthorized", { status: 401, headers: corsFor(req) });
      }
      const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userRes, error: userErr } = await userClient.auth.getUser();
      if (userErr || !userRes?.user) {
        return new Response("Unauthorized", { status: 401, headers: corsFor(req) });
      }
      const { data: staffCheck } = await userClient.rpc("is_staff");
      if (!staffCheck) {
        return new Response("Forbidden", { status: 403, headers: corsFor(req) });
      }
      authedAsStaff = true;
    }

    // Optional body — staff path can pass { booking_id } to send a
    // reminder for that booking's customer. The function expands it to
    // every dog the customer has booked that day and sends ONE combined
    // reminder. The cron path sends no body.
    let body: { booking_id?: string; at_hour_uk?: number } = {};
    if (req.body) {
      try { body = await req.json(); } catch { body = {}; }
    }
    const singleBookingId = typeof body.booking_id === "string" ? body.booking_id : null;

    // UK-hour gate (cron only). pg_cron is UTC-only, so each pass is
    // scheduled at two UTC hours with the intended Europe/London hour in
    // at_hour_uk; only the invocation that lands on that London hour sends,
    // the other returns here. Two passes run: 15:00 (at_hour_uk=15, fired
    // 14:00 + 15:00 UTC) and a late 19:00 pass (at_hour_uk=19, fired
    // 18:00 + 19:00 UTC) that catches bookings created or rescheduled onto
    // tomorrow after the first run — the dedupe in step 6 skips anyone
    // already reminded. Staff/manual calls never pass at_hour_uk, so
    // they're unaffected (and a single-booking send is never gated).
    if (typeof body.at_hour_uk === "number" && !singleBookingId) {
      const hour = londonHourNow();
      if (hour !== body.at_hour_uk) {
        return new Response(
          `Skipped: London hour ${hour} != scheduled ${body.at_hour_uk}`,
          { status: 200, headers: corsFor(req) },
        );
      }
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Build the list of bookings to remind, each enriched with its dog
    //    name + owner (human_id) via the bookings → dogs FK. We group on
    //    (human_id, booking_date) so a customer with several dogs that day
    //    gets ONE combined reminder. group_id is unreliable for this —
    //    dogs booked in separate sessions share no group_id.
    let enriched: EnrichedBooking[] = [];

    if (singleBookingId) {
      // Staff path: resolve the anchor booking, then gather every active
      // booking this customer has on the same day.
      const { data: anchor, error: anchorErr } = await supabase
        .from("bookings")
        .select("id, booking_date, slot, service, group_id, status, dog_id, dogs(human_id, name)")
        .eq("id", singleBookingId)
        .maybeSingle();
      if (anchorErr || !anchor) {
        return new Response(
          JSON.stringify({ error: "booking not found" }),
          { status: 404, headers: { ...corsFor(req), "Content-Type": "application/json" } },
        );
      }
      if (anchor.status === "Cancelled") {
        return new Response(
          JSON.stringify({ error: "booking is cancelled — won't remind" }),
          { status: 422, headers: { ...corsFor(req), "Content-Type": "application/json" } },
        );
      }
      const anchorDog = Array.isArray(anchor.dogs) ? anchor.dogs[0] : anchor.dogs;
      const anchorHumanId = anchorDog?.human_id ?? null;
      if (!anchorHumanId) {
        return new Response(
          JSON.stringify({ error: "booking has no linked customer — can't remind" }),
          { status: 422, headers: { ...corsFor(req), "Content-Type": "application/json" } },
        );
      }
      // Filter on the embedded relationship (dogs!inner) to fetch only this
      // customer's bookings for the day, each row already carrying its dog name.
      const { data: rows, error: gatherErr } = await supabase
        .from("bookings")
        .select("id, booking_date, slot, service, group_id, notify_human_ids, dog_id, dogs!inner(human_id, name)")
        .eq("booking_date", anchor.booking_date)
        .eq("dogs.human_id", anchorHumanId)
        .neq("status", "Cancelled");
      if (gatherErr) {
        console.error("Customer-day gather failed:", gatherErr.message);
        return new Response("Bookings query failed", { status: 500, headers: corsFor(req) });
      }
      enriched = toEnriched((rows ?? []) as RawBookingRow[]);
    } else {
      // Cron path: every active booking for tomorrow, grouped per customer.
      const tomorrow = tomorrowDateString();
      const { data: rows, error: cronErr } = await supabase
        .from("bookings")
        .select("id, booking_date, slot, service, group_id, notify_human_ids, dog_id, dogs!inner(human_id, name)")
        .eq("booking_date", tomorrow)
        .eq("status", "Booked");
      if (cronErr) {
        console.error("Bookings query failed:", cronErr.message);
        return new Response("Bookings query failed", { status: 500, headers: corsFor(req) });
      }
      enriched = toEnriched((rows ?? []) as RawBookingRow[]);
    }

    if (enriched.length === 0) {
      const message = singleBookingId
        ? "Booking not eligible for reminder"
        : "No bookings to remind for tomorrow";
      return new Response(message, { status: 200, headers: corsFor(req) });
    }

    // 2. Group by (human_id, booking_date) — one message per customer per day.
    const groups = groupByCustomerDay(enriched);

    const results: Array<{ groupKey: string; human_id?: string; success: boolean; channel?: string }> = [];

    for (const [groupKey, groupRows] of groups) {
      const ownerId = groupRows[0].human_id;
      const bookingDate = groupRows[0].booking_date;

      // 3. Recipients = union of each booking's notify list (the dog owner is
      //    the default when a booking has no explicit notify_human_ids). Each
      //    recipient is reminded about exactly the bookings that list them.
      const recipientIds = Array.from(
        new Set(groupRows.flatMap((r) => recipientIdsForBooking(r.notify_human_ids, ownerId))),
      );
      const humansById = await fetchHumansByIds(supabase, recipientIds);

      for (const humanId of recipientIds) {
        const human = humansById.get(humanId);
        if (!human) {
          console.error(`Human lookup failed for ${humanId}`);
          results.push({ groupKey, human_id: humanId, success: false });
          continue;
        }

        const rows = groupRows.filter((r) =>
          recipientIdsForBooking(r.notify_human_ids, ownerId).includes(humanId),
        );
        if (rows.length === 0) continue;

        // 4. Channel preference WhatsApp → SMS → email, skipping opted-out
        //    channels (PECR).
        const channel = pickChannel(human);
        if (!channel) {
          console.warn(`No contact method (or all opted out) for human ${humanId} — skipping reminder`);
          results.push({ groupKey, human_id: humanId, success: false });
          continue;
        }

        // 5. Build this recipient's message from their bookings only.
        const firstName = sanitise(human.name.split(" ")[0]);
        const { message, appointmentWhen, dogNames, isPlural } = buildReminder(
          rows,
          firstName,
          bookingDate,
        );

        // 6. IDEMPOTENCY: one pending row per booking for THIS recipient. The
        //    unique index (booking_id, trigger_type, human_id) WHERE status IN
        //    ('pending','sent') means a re-run where this recipient already has
        //    a pending/sent reminder for these bookings fails with 23505 — we
        //    skip them; other recipients keep their own rows.
        const pendingEntries = rows.map((r) => ({
          booking_id: r.id,
          group_id: r.group_id ?? null,
          human_id: human.id,
          channel,
          trigger_type: "reminder",
          status: "pending",
          // Stored up front so the SMS-fallback job can resend the exact wording
          // even if this WhatsApp send later fails to deliver.
          message_text: message,
        }));

        const { data: pendingRows, error: pendingError } = await supabase
          .from("notification_log")
          .insert(pendingEntries)
          .select("id");

        if (pendingError) {
          if (pendingError.code === "23505") {
            // Already reminded this recipient for these bookings — skip silently.
            results.push({ groupKey, human_id: humanId, success: true, channel: "skipped (duplicate)" });
            continue;
          }
          console.error(`Pending log insert failed for ${groupKey}/${humanId}:`, pendingError.message);
          results.push({ groupKey, human_id: humanId, success: false });
          continue;
        }

        // 7. Send. WhatsApp via the Meta template (records to the inbox with a
        //    meta_message_id so staff see delivery status, and an undelivered
        //    send can be chased by SMS). SMS via sms-send (also inbox-recorded).
        //    Email stays direct via SendGrid.
        let sent = false;
        let providerMessageId: string | null = null;
        if (channel === "whatsapp") {
          const result = await invokeInternal("whatsapp-send", {
            mode: "template",
            to: human.phone,
            template_name: "appointment_reminder_v1",
            language: "en_GB",
            params: [firstName, dogNames, appointmentWhen],
            human_id: human.id,
          });
          providerMessageId = (result.body.meta_message_id as string | null) ?? null;
          // A null meta_message_id means whatsapp-send returned ok but Meta
          // produced no message — treat as a failure, not a silent 'sent'.
          sent = result.ok && result.body.ok === true && providerMessageId != null;
          if (!sent) {
            console.error(`reminder whatsapp-send failed for ${groupKey}/${humanId}:`, result.status, JSON.stringify(result.body));
          }
        } else if (channel === "sms") {
          const result = await invokeInternal("sms-send", {
            mode: "template",
            to: human.phone,
            text: message,
            template_name: "appointment_reminder",
            human_id: human.id,
          });
          sent = result.ok && result.body.ok === true;
          providerMessageId = (result.body.twilio_sid as string | null) ?? null;
          if (!sent) {
            console.error(`reminder sms-send failed for ${groupKey}/${humanId}:`, result.status, JSON.stringify(result.body));
          }
        } else {
          const subject = `Reminder — ${dogNames} ${isPlural ? "are" : "is"} booked in tomorrow at Smarter Dog Grooming`;
          // channel==='email' is only chosen when the recipient has an email.
          sent = await sendEmail(human.email!, subject, message);
        }

        // 8. Update the pending rows with the outcome. provider_message_id links
        //    the WhatsApp send to its whatsapp_messages delivery status for the
        //    SMS-fallback job.
        const pendingIds = (pendingRows ?? []).map((r: { id: string }) => r.id);
        await supabase
          .from("notification_log")
          .update({
            status: sent ? "sent" : "failed",
            sent_at: sent ? new Date().toISOString() : null,
            provider_message_id: sent ? providerMessageId : null,
            error_message: sent ? null : "Delivery failed — check provider logs",
          })
          .in("id", pendingIds);

        results.push({ groupKey, human_id: humanId, success: sent, channel });
      }
    }

    return new Response(
      JSON.stringify({
        mode: singleBookingId ? "single" : "cron",
        booking_id: singleBookingId,
        groups: results.length,
        results,
        authed_as_staff: authedAsStaff,
      }),
      {
        status: 200,
        headers: { ...corsFor(req), "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("notify-booking-reminder error:", err);
    return new Response(
      JSON.stringify({ error: "internal error" }),
      { status: 500, headers: { ...corsFor(req), "Content-Type": "application/json" } },
    );
  }
});

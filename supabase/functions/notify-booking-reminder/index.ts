import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isAuthorizedWebhook } from "../_shared/webhook-auth.ts";
import { buildAllowedOrigins, buildCorsHeaders } from "../_shared/cors.ts";
import { sendEmail } from "../_shared/email.ts";
import { sanitise, formatDateShort as formatDate, formatTime, joinNames } from "../_shared/format.ts";

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
  dogs: { human_id: string; name: string } | { human_id: string; name: string }[] | null;
}

interface Human {
  id: string;
  name: string;
  phone: string | null;
  whatsapp: boolean;
  sms: boolean;
  email: string | null;
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

    // 3pm-UK gate (cron only). pg_cron is UTC-only, so the schedule fires
    // this function at both 14:00 and 15:00 UTC with at_hour_uk=15; only
    // the invocation that lands on 15:00 Europe/London actually sends, the
    // other returns here. Staff/manual calls never pass at_hour_uk, so
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
        .select("id, booking_date, slot, service, group_id, dog_id, dogs!inner(human_id, name)")
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
        .select("id, booking_date, slot, service, group_id, dog_id, dogs!inner(human_id, name)")
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

    const results: Array<{ groupKey: string; success: boolean; channel?: string }> = [];

    for (const [groupKey, groupRows] of groups) {
      const humanId = groupRows[0].human_id;
      const bookingDate = groupRows[0].booking_date;

      // 3. Fetch the customer once (dog names already came from the embed).
      const { data: human, error: humanError } = await supabase
        .from("humans")
        .select("id, name, phone, whatsapp, sms, email, whatsapp_opted_out, sms_opted_out, email_opted_out, reminder_hours, reminder_channels")
        .eq("id", humanId)
        .single();

      if (humanError || !human) {
        console.error(`Human lookup failed for ${humanId}:`, humanError?.message);
        results.push({ groupKey, success: false });
        continue;
      }

      const h = human as Human & {
        whatsapp_opted_out?: boolean;
        sms_opted_out?: boolean;
        email_opted_out?: boolean;
      };

      // 4. De-dupe dogs by id (earliest slot wins) for the name list.
      const dogMap = new Map<string, { name: string; slot: string }>();
      for (const r of groupRows) {
        const existing = dogMap.get(r.dog_id);
        if (!existing || r.slot < existing.slot) {
          dogMap.set(r.dog_id, { name: r.dog_name, slot: r.slot });
        }
      }
      const uniqueDogs = [...dogMap.values()].sort((a, b) => a.slot.localeCompare(b.slot));
      const dogNames = joinNames(uniqueDogs.map((d) => sanitise(d.name)));
      const isPlural = uniqueDogs.length > 1;

      // 5. Build the message. Tight — single GSM-7 segment where possible,
      //    no emoji/em-dash. The reminder only confirms time + dog(s).
      const firstName = sanitise(human.name.split(" ")[0]);
      const dateFormatted = formatDate(bookingDate);
      const slots = [...new Set(groupRows.map((r) => r.slot))].sort();
      const services = [...new Set(groupRows.map((r) => r.service))];

      let message: string;
      // appointmentWhen feeds the {{appointment_when}} slot of the Meta
      // template appointment_reminder_v1 ("…booked in with us … for
      // {{appointment_when}}"). It must read naturally after "for".
      let appointmentWhen: string;
      if (slots.length === 1 && services.length === 1) {
        // Common case (incl. multi-dog at the same slot) — wording unchanged.
        const timeFormatted = formatTime(slots[0]);
        message =
          `Hi ${firstName}, just a reminder ${dogNames} ${isPlural ? "are" : "is"} booked in for a ${services[0]} ` +
          `tomorrow (${dateFormatted}) at ${timeFormatted}. See you then!`;
        appointmentWhen = `${dateFormatted} at ${timeFormatted}`;
      } else if (slots.length === 1) {
        // Same time, different services — stay generic so we never name the
        // wrong service for a dog.
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
        // The template has one when-slot, so fold the per-dog times in.
        appointmentWhen = `${dateFormatted} (${perDog})`;
      }

      // 6. Pick channel BEFORE we send. WhatsApp → SMS → email. Skip any
      //    channel the customer has opted out of (PECR, mig 041).
      let channel: "whatsapp" | "sms" | "email";
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

      // 7. IDEMPOTENCY: insert one pending log row per booking, atomically.
      //    The partial unique index (booking_id, trigger_type) WHERE status
      //    IN ('pending','sent') (mig 042) means a re-click where ANY of the
      //    customer's dogs already has a pending/sent reminder makes the whole
      //    insert fail with 23505 — so we skip the group rather than double-send.
      const pendingEntries = groupRows.map((r) => ({
        booking_id: r.id,
        group_id: r.group_id ?? null,
        human_id: h.id,
        channel,
        trigger_type: "reminder",
        status: "pending",
        // Stored up front so the SMS-fallback job can resend the exact
        // wording even if this WhatsApp send later fails to deliver.
        message_text: message,
      }));

      const { data: pendingRows, error: pendingError } = await supabase
        .from("notification_log")
        .insert(pendingEntries)
        .select("id");

      if (pendingError) {
        if (pendingError.code === "23505") {
          // Already reminded this customer for this day — skip silently.
          results.push({ groupKey, success: true, channel: "skipped (duplicate)" });
          continue;
        }
        console.error(`Pending log insert failed for ${groupKey}:`, pendingError.message);
        results.push({ groupKey, success: false });
        continue;
      }

      // 8. Send. WhatsApp goes via the Meta template (records to the inbox
      //    with a meta_message_id so staff see delivery status, and an
      //    undelivered send can be chased by SMS). SMS goes via sms-send
      //    (also inbox-recorded). Email stays direct via SendGrid.
      let sent = false;
      let providerMessageId: string | null = null;
      if (channel === "whatsapp") {
        const result = await invokeInternal("whatsapp-send", {
          mode: "template",
          to: h.phone,
          template_name: "appointment_reminder_v1",
          language: "en_GB",
          params: [firstName, dogNames, appointmentWhen],
          human_id: h.id,
        });
        providerMessageId = (result.body.meta_message_id as string | null) ?? null;
        // A null meta_message_id means whatsapp-send returned ok but Meta
        // produced no message — treat as a failure, not a silent 'sent'.
        sent = result.ok && result.body.ok === true && providerMessageId != null;
        if (!sent) {
          console.error(`reminder whatsapp-send failed for ${groupKey}:`, result.status, JSON.stringify(result.body));
        }
      } else if (channel === "sms") {
        const result = await invokeInternal("sms-send", {
          mode: "template",
          to: h.phone,
          text: message,
          template_name: "appointment_reminder",
          human_id: h.id,
        });
        sent = result.ok && result.body.ok === true;
        providerMessageId = (result.body.twilio_sid as string | null) ?? null;
        if (!sent) {
          console.error(`reminder sms-send failed for ${groupKey}:`, result.status, JSON.stringify(result.body));
        }
      } else {
        const subject = `Reminder — ${dogNames} ${isPlural ? "are" : "is"} booked in tomorrow at Smarter Dog Grooming`;
        // channel==='email' is only chosen when h.email is set (step 6).
        sent = await sendEmail(h.email!, subject, message);
      }

      // 9. Update the pending rows with the outcome. provider_message_id
      //    links the WhatsApp send to its whatsapp_messages delivery status
      //    for the SMS-fallback job.
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

      results.push({ groupKey, success: sent, channel });
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

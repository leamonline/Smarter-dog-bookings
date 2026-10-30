import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isAuthorizedWebhook } from "../_shared/webhook-auth.ts";
import { sendEmailDetailed } from "../_shared/email.ts";
import { sanitise, formatDateLong as formatDate } from "../_shared/format.ts";

// ── Environment variables ──────────────────────────────────────────────────
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET");
// SENDGRID_API_KEY / SENDGRID_FROM_EMAIL are read inside ../_shared/email.ts.

// The salon's own alert destination. Read per request so a missing address
// is a skip, not a Twilio WhatsApp send to SALON_ALERT_WHATSAPP.
function salonAlertEmail(): string | null {
  const value = Deno.env.get("SALON_ALERT_EMAIL")?.trim();
  return value ? value : null;
}

// ── Main handler ───────────────────────────────────────────────────────────

export async function handleWaitlistJoined(req: Request): Promise<Response> {
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
    const entry = payload.record;

    if (!entry) {
      return new Response("No record in payload", { status: 400 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Look up the human who joined the waitlist
    const { data: human, error: humanError } = await supabase
      .from("humans")
      .select("id, name, surname, phone")
      .eq("id", entry.human_id)
      .single();

    if (humanError || !human) {
      console.error("Human lookup failed:", humanError?.message);
      return new Response("Human lookup failed", { status: 500 });
    }

    // 2. Look up their dogs
    const { data: dogs } = await supabase
      .from("dogs")
      .select("name")
      .eq("human_id", human.id)
      .order("name");

    const dogNames = dogs && dogs.length > 0
      ? dogs.map((d: { name: string }) => sanitise(d.name)).join(", ")
      : "no dogs on file";

    const humanName = sanitise(`${human.name} ${human.surname || ""}`.trim());
    const dateFormatted = formatDate(entry.target_date);

    // 3. Build staff alert message
    const alertMessage = [
      `📋 Waitlist Alert — Smarter Dog`,
      ``,
      `${humanName} (${human.phone || "no phone"}) has joined the waitlist for ${dateFormatted}.`,
      ``,
      `Dogs: ${dogNames}`,
      ``,
      `Log in to the dashboard to manage the waitlist.`,
    ].join("\n");

    // 4. Email the salon. Twilio WhatsApp is not used.
    const alertEmail = salonAlertEmail();
    if (!alertEmail) {
      console.warn("notify-waitlist-joined: SALON_ALERT_EMAIL is not set. Skipping alert.");
      return new Response(
        JSON.stringify({ skipped: true, reason: "No salon alert email configured" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    const subject = `Waitlist joined — ${humanName} for ${dateFormatted}`;
    const email = await sendEmailDetailed(alertEmail, subject, alertMessage);
    const channel = "email";
    if (!email.ok) {
      console.error(`notify-waitlist-joined email failed: ${email.errorMessage ?? email.status}`);
    }

    // 5. Log the result in notification_log. 'sent' only if SendGrid accepted it.
    await supabase.from("notification_log").insert({
      booking_id: null,
      group_id: null,
      human_id: human.id,
      channel,
      trigger_type: "waitlist_joined",
      status: email.ok ? "sent" : "failed",
      error_message: email.ok ? null : email.errorMessage,
      sent_at: email.ok ? new Date().toISOString() : null,
    });

    return new Response(
      JSON.stringify({ success: email.ok, channel, humanName, targetDate: entry.target_date }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("notify-waitlist-joined error:", err);
    return new Response(
      JSON.stringify({ error: "internal error" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}

// _shared/twilio.ts — Centralised Twilio SMS + WhatsApp sender.
//
// This file replaces the per-function `sendTwilio()` helper that was
// duplicated across notify-booking-confirmed, notify-booking-cancelled,
// notify-booking-ready, notify-booking-reminder, and notify-waitlist-joined.
//
// Two key changes from the inlined version:
//
// 1. Auth — prefers a Standard API Key (TWILIO_API_KEY + TWILIO_API_SECRET)
//    over the legacy Auth Token. API keys can be revoked independently if
//    leaked; the Auth Token nukes the entire account. We fall back to the
//    Auth Token only if the API key isn't set, so this can be deployed
//    before secrets are rotated.
//
// 2. SMS sender — prefers a Messaging Service SID (TWILIO_MESSAGING_SERVICE_SID)
//    over a hardcoded `From` value. Messaging Service routes through Twilio's
//    sender pool, gives us their built-in STOP-list (any recipient who replies
//    STOP gets blocked silently), and lets us add a long-code fallback later
//    without touching code. Falls back to TWILIO_SMS_FROM (legacy) if the
//    Messaging Service SID isn't set.
//
// WhatsApp doesn't go through Messaging Service in our setup — it always
// uses `From: whatsapp:<TWILIO_WHATSAPP_FROM>`.

const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID")!;

// Auth — prefer API key, fall back to Auth Token
const TWILIO_API_KEY = Deno.env.get("TWILIO_API_KEY");
const TWILIO_API_SECRET = Deno.env.get("TWILIO_API_SECRET");
const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");

// SMS sender — prefer Messaging Service SID, fall back to From
const TWILIO_MESSAGING_SERVICE_SID = Deno.env.get("TWILIO_MESSAGING_SERVICE_SID");
const TWILIO_SMS_FROM = Deno.env.get("TWILIO_SMS_FROM");

// WhatsApp sender — always From=whatsapp:NUMBER
const TWILIO_WHATSAPP_FROM = Deno.env.get("TWILIO_WHATSAPP_FROM");

/**
 * Normalise a UK phone number to E.164 (+44...).
 *
 * Twilio rejects anything that isn't E.164 with error 21211 ("Invalid 'To'
 * phone number"). Customers enter their phones in all sorts of formats —
 * "07540 550564", "+447540550564", "447540550564", "(0)7540 550564". This
 * function turns all of them into "+447540550564".
 *
 * UK-only by design: the salon serves UK customers. If we ever expand
 * internationally we'll need to widen this (or store country code on the
 * humans row and key off that).
 *
 * Returns the input unchanged if it doesn't look like a UK number — e.g.
 * an already-E.164 non-UK number ("+33...") or something we can't parse.
 * The Twilio API will then either accept it (if it's valid E.164) or reject
 * it with 21211 again, surfacing the bad data in notification_log.
 */
export function normaliseUkPhone(raw: string): string {
  if (!raw) return raw;
  // Strip whitespace, dashes, parens, dots, and invisible Unicode format
  // characters (\p{Cf}) — Twilio doesn't want them, and iOS Contacts / WhatsApp
  // wrap copied numbers in bidi marks (e.g. U+202A…U+202C) that aren't
  // whitespace. Without stripping those, the digits don't sit at the start of
  // the string, every UK pattern below misses, and the number is returned
  // unchanged → toValidE164() rejects it (or the marks reach Twilio → 21211).
  const stripped = raw.replace(/[\s\-().]|\p{Cf}/gu, "");
  // Already E.164 (any country) — pass through
  if (stripped.startsWith("+")) return stripped;
  // 00-prefixed international (UK convention) — convert to +
  if (stripped.startsWith("00")) return "+" + stripped.slice(2);
  // UK 11-digit national format starting with 07 — strip leading 0, prepend +44
  if (/^07\d{9}$/.test(stripped)) return "+44" + stripped.slice(1);
  // 12-digit format starting with 447 (no plus) — just prepend +
  if (/^447\d{9}$/.test(stripped)) return "+" + stripped;
  // Unrecognised — return as-is and let Twilio reject loudly
  return stripped;
}

function authHeader(): string {
  // API key path: user=KeySid, password=KeySecret. The URL still uses the
  // Account SID; the API key just changes the Authorization header.
  if (TWILIO_API_KEY && TWILIO_API_SECRET) {
    return "Basic " + btoa(`${TWILIO_API_KEY}:${TWILIO_API_SECRET}`);
  }
  // Legacy Auth Token path: user=AccountSid, password=AuthToken.
  if (TWILIO_AUTH_TOKEN) {
    return "Basic " + btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);
  }
  throw new Error(
    "Twilio auth not configured: set TWILIO_API_KEY+TWILIO_API_SECRET (preferred) or TWILIO_AUTH_TOKEN",
  );
}

interface TwilioPostResult {
  ok: boolean;
  status: number;
  sid?: string;
  errorCode?: string;
  errorMessage?: string;
}

async function postMessage(
  params: Record<string, string>,
): Promise<TwilioPostResult> {
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: authHeader(),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(params),
    },
  );
  // Twilio returns JSON on both success and error. Pull the SID on success
  // (we'll want it later when we wire up the status webhook in Phase 2),
  // and the error code/message on failure for the notification_log row.
  let body: Record<string, unknown> = {};
  try {
    body = await res.json();
  } catch {
    // Non-JSON response (rare) — leave body empty
  }
  return {
    ok: res.ok,
    status: res.status,
    sid: typeof body.sid === "string" ? body.sid : undefined,
    errorCode: body.code != null ? String(body.code) : undefined,
    errorMessage: typeof body.message === "string" ? body.message : undefined,
  };
}

/**
 * Send an SMS via Twilio.
 *
 * Uses the Messaging Service SID if configured (preferred), otherwise falls
 * back to a hardcoded `From` value. Returns the full result so callers can
 * record the Twilio message SID and any error details in notification_log.
 */
export async function sendSms(
  to: string,
  body: string,
): Promise<TwilioPostResult> {
  const params: Record<string, string> = { To: normaliseUkPhone(to), Body: body };
  if (TWILIO_MESSAGING_SERVICE_SID) {
    params.MessagingServiceSid = TWILIO_MESSAGING_SERVICE_SID;
  } else if (TWILIO_SMS_FROM) {
    params.From = TWILIO_SMS_FROM;
  } else {
    throw new Error(
      "SMS sender not configured: set TWILIO_MESSAGING_SERVICE_SID (preferred) or TWILIO_SMS_FROM",
    );
  }
  return postMessage(params);
}

/**
 * Send a WhatsApp message via Twilio.
 *
 * WhatsApp doesn't use Messaging Service in our setup — it always uses
 * `From: whatsapp:<number>`. The `to` parameter should be the bare phone
 * number (e.g. "+447..."); this function adds the "whatsapp:" prefix.
 */
export async function sendWhatsApp(
  to: string,
  body: string,
): Promise<TwilioPostResult> {
  if (!TWILIO_WHATSAPP_FROM) {
    throw new Error("WhatsApp sender not configured: set TWILIO_WHATSAPP_FROM");
  }
  // The TWILIO_WHATSAPP_FROM env var SHOULD be a bare E.164 number, but
  // historical data shows it's sometimes been set as "whatsapp:+1..." too —
  // strip any leading "whatsapp:" so we don't double-prefix.
  const fromNumber = TWILIO_WHATSAPP_FROM.replace(/^whatsapp:/, "");
  return postMessage({
    To: `whatsapp:${normaliseUkPhone(to)}`,
    From: `whatsapp:${fromNumber}`,
    Body: body,
  });
}

/**
 * Backwards-compatible boolean wrapper for SMS — preserves the old
 * `sendTwilio() => boolean` contract for any callers we haven't refactored yet.
 * Prefer `sendSms()` directly in new code so you get the SID + error details.
 */
export async function sendSmsBoolean(to: string, body: string): Promise<boolean> {
  const r = await sendSms(to, body);
  if (!r.ok) {
    console.error(
      `Twilio SMS failed (${r.status}): ${r.errorCode ?? "?"} ${r.errorMessage ?? ""}`,
    );
  }
  return r.ok;
}

export async function sendWhatsAppBoolean(
  to: string,
  body: string,
): Promise<boolean> {
  const r = await sendWhatsApp(to, body);
  if (!r.ok) {
    console.error(
      `Twilio WhatsApp failed (${r.status}): ${r.errorCode ?? "?"} ${r.errorMessage ?? ""}`,
    );
  }
  return r.ok;
}

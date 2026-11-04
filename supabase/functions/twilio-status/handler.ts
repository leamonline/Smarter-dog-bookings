// ============================================================
// supabase/functions/twilio-status/handler.ts
//
// Twilio's delivery-status callback for texts (SMS).
//
// Twilio accepts a text long before it is delivered, so "sent" has only ever
// meant "Twilio took it". This is where the real outcome lands: delivered,
// undelivered or failed. It marks the message and its log row, and for an
// ESSENTIAL text that did not arrive it raises a staff to-do. See
// _shared/smsDelivery.ts for the rules.
//
// SECURITY. This is a public endpoint (no JWT: Twilio has none). The whole
// boundary is the X-Twilio-Signature check: base64 HMAC-SHA1 over the callback
// URL and every form parameter, keyed with the Twilio Auth Token. It FAILS
// CLOSED:
//   - TWILIO_AUTH_TOKEN or TWILIO_STATUS_CALLBACK_URL unset -> 500, nothing read
//   - missing or wrong signature -> 403, nothing written
// The URL is the configured TWILIO_STATUS_CALLBACK_URL, the exact string sendSms
// gave Twilio, not whatever host the gateway reports, so a proxy can't make a
// valid signature look wrong (or a wrong one look valid).
//
// DARK LAUNCH. sendSms only asks Twilio for callbacks when
// TWILIO_STATUS_CALLBACK_URL is set, so merging this changes nothing until that
// secret (and the Auth Token) are configured. Deploying it unconfigured is
// inert: it answers 500 to everything.
//
// Replays are harmless: a status never moves backwards (enforced by conditional
// updates in the database) and a repeated one changes nothing already done. A
// database error answers 500 so Twilio re-delivers, and the retry finishes any
// step the first attempt did not reach. No customer details are logged, only the message SID.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isValidTwilioSignature } from "../_shared/twilioSignature.ts";
import { applySmsStatus } from "../_shared/smsDelivery.ts";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export interface TwilioStatusDeps {
  /** A supabase-js client (or a test double). Built from the service role when omitted. */
  client?: unknown;
}

export async function handleTwilioStatus(req: Request, deps: TwilioStatusDeps = {}): Promise<Response> {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
  const callbackUrl = Deno.env.get("TWILIO_STATUS_CALLBACK_URL");
  if (!authToken || !callbackUrl) {
    console.error("twilio-status: TWILIO_AUTH_TOKEN or TWILIO_STATUS_CALLBACK_URL is not set; refusing");
    return json({ error: "not configured" }, 500);
  }

  const raw = await req.text();
  const params: Record<string, string> = Object.fromEntries(new URLSearchParams(raw));

  // The configured URL may carry Twilio connection overrides after a "#", e.g.
  // ".../twilio-status#rc=3&rp=5xx,ct" (retry up to three times on a 5xx answer as
  // well as on connection failures; Twilio's default policy is connection failures
  // only, so without this a 500 from us is never retried). Twilio leaves the
  // fragment out of the signed URL, so it must be left out here too.
  const signedUrl = callbackUrl.split("#")[0];
  const valid = await isValidTwilioSignature(
    authToken,
    signedUrl,
    params,
    req.headers.get("x-twilio-signature"),
  );
  if (!valid) {
    console.warn("twilio-status: invalid or missing signature; ignored");
    return json({ error: "invalid signature" }, 403);
  }

  const sid = params.MessageSid ?? params.SmsSid ?? "";
  const status = params.MessageStatus ?? params.SmsStatus ?? "";
  if (!sid || !status) return json({ error: "MessageSid and MessageStatus are required" }, 400);

  try {
    const client = deps.client ?? createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const result = await applySmsStatus(client, {
      sid,
      status,
      errorCode: params.ErrorCode || null,
      to: params.To || null,
    });
    console.log(`twilio-status: ${sid} ${status} -> ${result.outcome} (matched=${result.matched})`);
    return json({ ok: true, ...result });
  } catch (err) {
    console.error(`twilio-status: ${sid} could not be recorded:`, err instanceof Error ? err.message : String(err));
    return json({ error: "internal error" }, 500);
  }
}

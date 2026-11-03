// ============================================================
// supabase/functions/_shared/twilioSignature.ts
//
// Verifying that a request really came from Twilio.
//
// Twilio signs every webhook it sends: X-Twilio-Signature is the base64 HMAC-SHA1,
// keyed with the account's Auth Token, of the full URL it posted to followed by
// every POST parameter as key+value, sorted by key. An API key secret does NOT
// work here, only the Auth Token.
//
// Pure Web Crypto, so it runs in Deno and is unit-testable. It FAILS CLOSED: an
// unset token, a missing header or any mismatch is "not valid", never "valid
// because there was nothing to compare".
// ============================================================

import { timingSafeEqualHeader } from "./webhook-auth.ts";

const encoder = new TextEncoder();

function toBase64(bytes: ArrayBuffer): string {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** The signature Twilio would send for this URL and form body. */
export async function computeTwilioSignature(
  authToken: string,
  url: string,
  params: Record<string, string>,
): Promise<string> {
  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(authToken),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  return toBase64(await crypto.subtle.sign("HMAC", key, encoder.encode(data)));
}

/**
 * Is this request signed by Twilio for exactly this URL and body? False for an
 * empty token, URL or header, and for any mismatch. Compared in constant time.
 */
export async function isValidTwilioSignature(
  authToken: string | null | undefined,
  url: string | null | undefined,
  params: Record<string, string>,
  header: string | null | undefined,
): Promise<boolean> {
  if (!authToken || !url || !header) return false;
  const expected = await computeTwilioSignature(authToken, url, params);
  return timingSafeEqualHeader(header, expected);
}

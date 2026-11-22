// Square webhook signatures.
//
// Square signs the raw body with HMAC-SHA256, keyed with the webhook
// signature key, over the exact notification URL followed by the body, and
// sends the base64 digest in x-square-hmacsha256-signature.
// https://developer.squareup.com/docs/webhooks/step3validate
//
// Fails closed: a missing key, URL, header or any mismatch is "not valid".

import { timingSafeEqualHeader } from "./webhook-auth.ts";

const encoder = new TextEncoder();

function toBase64(bytes: ArrayBuffer): string {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** The signature Square would send for this notification URL and raw body. */
export async function computeSquareSignature(
  signatureKey: string,
  notificationUrl: string,
  rawBody: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(signatureKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(notificationUrl + rawBody),
  );
  return toBase64(signed);
}

/**
 * Is this request signed by Square for exactly this URL and body? False for an
 * empty key, URL or header, and for any mismatch. Compared in constant time.
 */
export async function isValidSquareSignature(
  signatureKey: string | null | undefined,
  notificationUrl: string | null | undefined,
  rawBody: string,
  header: string | null | undefined,
): Promise<boolean> {
  if (!signatureKey || !notificationUrl || !header) return false;
  const expected = await computeSquareSignature(signatureKey, notificationUrl, rawBody);
  return timingSafeEqualHeader(header, expected);
}

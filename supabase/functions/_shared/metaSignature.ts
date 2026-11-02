// HMAC-SHA256 check for Meta's X-Hub-Signature-256 header.
//
// The signed bytes are the raw request body. JSON.parse then
// JSON.stringify will not verify. An empty app secret never matches:
// Meta's header is "sha256=<hex>", and an empty key produces a
// different digest, so a missing META_APP_SECRET fails closed.

export async function verifyMetaHubSignature(
  rawBody: ArrayBuffer,
  headerValue: string | null,
  appSecret: string,
): Promise<boolean> {
  if (!headerValue || !appSecret) return false;
  const [algo, hex] = headerValue.split("=");
  if (algo !== "sha256" || !hex || hex.length % 2 !== 0) return false;
  if (!/^[0-9a-fA-F]+$/.test(hex)) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = new Uint8Array(await crypto.subtle.sign("HMAC", key, rawBody));
  const got = hexToBytes(hex);
  if (got.length !== signed.length) return false;
  let diff = 0;
  for (let i = 0; i < signed.length; i++) diff |= signed[i] ^ got[i];
  return diff === 0;
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return out;
}

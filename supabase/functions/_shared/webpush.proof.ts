// Deno proof for _shared/webpush.ts — NOT shipped, NOT a unit test.
// Run: deno run supabase/functions/_shared/webpush.proof.ts
//
// Proves, in the Deno runtime, that:
//   1. encryptPayload() produces an aes128gcm body that decrypts back to the
//      original plaintext using the client's private key (RFC 8291 correct).
//   2. buildVapidJwt() produces an ES256 JWT whose signature verifies against
//      the VAPID public key and whose claims are well-formed (RFC 8292).
// If both pass here, the Supabase Edge (Deno) runtime — same Web Crypto — will
// behave identically.

import {
  base64UrlToUint8Array,
  buildVapidJwt,
  encryptPayload,
  uint8ArrayToBase64Url,
  type VapidDetails,
} from "./webpush.ts";

const utf8 = (s: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(s);
function concatBytes(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
async function hkdf(
  salt: Uint8Array<ArrayBuffer>,
  ikm: Uint8Array<ArrayBuffer>,
  info: Uint8Array<ArrayBuffer>,
  len: number,
) {
  const k = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(
    await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, k, len * 8),
  );
}

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error("PROOF FAILED: " + msg);
}

// ── 1. Encryption round-trip ────────────────────────────────
const uaKeys = await crypto.subtle.generateKey(
  { name: "ECDH", namedCurve: "P-256" },
  true,
  ["deriveBits"],
);
const uaPublicRaw = new Uint8Array(await crypto.subtle.exportKey("raw", uaKeys.publicKey));
const authSecret = crypto.getRandomValues(new Uint8Array(16));

const sub = {
  endpoint: "https://web.push.apple.com/example-device-token",
  p256dh: uint8ArrayToBase64Url(uaPublicRaw),
  auth: uint8ArrayToBase64Url(authSecret),
};

const plaintext = JSON.stringify({
  title: "New booking",
  body: "Catherine booked a Full Groom for Alfie, Mon 1 Jun 9:00am",
  url: "/",
});

const body = await encryptPayload(utf8(plaintext), sub);

// Decrypt using the client private key, mirroring the same RFC chain.
const salt = body.slice(0, 16);
const idlen = body[20];
const asPublicRaw = body.slice(21, 21 + idlen);
const ciphertext = body.slice(21 + idlen);

const asPublicKey = await crypto.subtle.importKey(
  "raw",
  asPublicRaw,
  { name: "ECDH", namedCurve: "P-256" },
  false,
  [],
);
const sharedSecret = new Uint8Array(
  await crypto.subtle.deriveBits({ name: "ECDH", public: asPublicKey }, uaKeys.privateKey, 256),
);
const keyInfo = concatBytes(utf8("WebPush: info\0"), uaPublicRaw, asPublicRaw);
const ikm = await hkdf(authSecret, sharedSecret, keyInfo, 32);
const cek = await hkdf(salt, ikm, utf8("Content-Encoding: aes128gcm\0"), 16);
const nonce = await hkdf(salt, ikm, utf8("Content-Encoding: nonce\0"), 12);

const cekKey = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["decrypt"]);
const decrypted = new Uint8Array(
  await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce, tagLength: 128 }, cekKey, ciphertext),
);
// Strip the 0x02 last-record delimiter.
const recovered = new TextDecoder().decode(decrypted.slice(0, decrypted.length - 1));
assert(recovered === plaintext, `decrypted text mismatch: ${recovered}`);
console.log("✅ aes128gcm encrypt → decrypt round-trip OK");

// ── 2. VAPID JWT signature ──────────────────────────────────
const vapidPair = await crypto.subtle.generateKey(
  { name: "ECDSA", namedCurve: "P-256" },
  true,
  ["sign", "verify"],
);
const vapidPubRaw = new Uint8Array(await crypto.subtle.exportKey("raw", vapidPair.publicKey));
const vapidJwk = await crypto.subtle.exportKey("jwk", vapidPair.privateKey);

const vapid: VapidDetails = {
  publicKey: uint8ArrayToBase64Url(vapidPubRaw),
  privateKey: vapidJwk.d as string,
  subject: "mailto:leam@leamonline.uk",
};

const audience = new URL(sub.endpoint).origin;
const jwt = await buildVapidJwt(audience, vapid, 1_700_000_000);
const [h, p, s] = jwt.split(".");
const verifyKey = await crypto.subtle.importKey(
  "raw",
  vapidPubRaw,
  { name: "ECDSA", namedCurve: "P-256" },
  false,
  ["verify"],
);
const sigValid = await crypto.subtle.verify(
  { name: "ECDSA", hash: "SHA-256" },
  verifyKey,
  base64UrlToUint8Array(s),
  utf8(`${h}.${p}`),
);
assert(sigValid, "VAPID JWT signature did not verify");

const claims = JSON.parse(new TextDecoder().decode(base64UrlToUint8Array(p)));
assert(claims.aud === audience, "JWT aud mismatch");
assert(claims.sub === vapid.subject, "JWT sub mismatch");
assert(claims.exp === 1_700_000_000 + 12 * 60 * 60, "JWT exp mismatch");
console.log("✅ VAPID ES256 JWT sign → verify OK");

console.log("\nALL PROOFS PASSED — webpush.ts is correct under Deno.");

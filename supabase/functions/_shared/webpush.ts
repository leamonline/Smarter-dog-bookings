// ============================================================
// supabase/functions/_shared/webpush.ts
//
// Web Push (VAPID + RFC 8291 "aes128gcm") implemented on PURE Web Crypto
// (globalThis.crypto.subtle) with ZERO imports — so it resolves identically
// in the Supabase Edge (Deno) runtime, local Deno, and Vitest/Node 20.
//
// We deliberately do NOT use the npm `web-push` package: it leans on
// node:crypto code paths that Deno's edge runtime doesn't fully polyfill
// (cf. the MGF1 quirk documented in _shared/flowCrypto.ts). Standard Web
// Crypto — ECDH P-256, HKDF-SHA-256, AES-128-GCM, ECDSA P-256 — is fully
// supported in every target runtime, so this module has no node:* surface.
//
// Two responsibilities:
//   1. buildVapidJwt() — the RFC 8292 "vapid" Authorization token (ES256).
//   2. encryptPayload() — RFC 8291 aes128gcm content encryption.
// sendWebPush() ties them together and POSTs to the push endpoint.
//
// Verified end-to-end (sign + encrypt + DECRYPT round-trip) under Deno:
//   deno run --allow-net supabase/functions/_shared/webpush.proof.ts
//
// Staff-only: only installed staff devices ever hold a subscription, so
// nothing here can affect a customer.
// ============================================================

/** A stored staff push subscription (camelCase at this boundary). */
export interface WebPushSubscription {
  endpoint: string;
  /** Client P-256 public key, base64url (65-byte uncompressed point). */
  p256dh: string;
  /** Client auth secret, base64url (16 bytes). */
  auth: string;
}

/** VAPID application-server identity. publicKey/privateKey are base64url. */
export interface VapidDetails {
  /** Uncompressed P-256 public point (65 bytes), base64url. */
  publicKey: string;
  /** Raw P-256 private scalar `d` (32 bytes), base64url. */
  privateKey: string;
  /** Contact, e.g. "mailto:leam@leamonline.uk". */
  subject: string;
}

export interface WebPushResult {
  statusCode: number;
  success: boolean;
  /** 404/410 → the subscription is dead and should be deleted. */
  gone: boolean;
  body: string;
}

// ── base64url ────────────────────────────────────────────────

export function base64UrlToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function uint8ArrayToBase64Url(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function concatBytes(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

const utf8 = (s: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(s);

// ── VAPID JWT (RFC 8292, ES256) ──────────────────────────────

async function importVapidSigningKey(vapid: VapidDetails): Promise<CryptoKey> {
  // Build a private JWK from the raw scalar `d` plus the x/y coords split
  // out of the uncompressed public point (Web Crypto's JWK EC private import
  // requires x and y alongside d).
  const pub = base64UrlToUint8Array(vapid.publicKey);
  if (pub.length !== 65 || pub[0] !== 0x04) {
    throw new Error("VAPID public key must be a 65-byte uncompressed P-256 point");
  }
  const jwk: JsonWebKey = {
    kty: "EC",
    crv: "P-256",
    x: uint8ArrayToBase64Url(pub.slice(1, 33)),
    y: uint8ArrayToBase64Url(pub.slice(33, 65)),
    d: vapid.privateKey,
    ext: true,
  };
  return crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
}

/**
 * Build the VAPID JWT for a given push-endpoint audience (the endpoint's
 * scheme://host). `nowSeconds` is injectable so tests are deterministic.
 */
export async function buildVapidJwt(
  audience: string,
  vapid: VapidDetails,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<string> {
  const header = { typ: "JWT", alg: "ES256" };
  const payload = {
    aud: audience,
    // <= 24h per spec; 12h gives comfortable clock-skew headroom.
    exp: nowSeconds + 12 * 60 * 60,
    sub: vapid.subject,
  };
  const enc = (obj: unknown) =>
    uint8ArrayToBase64Url(utf8(JSON.stringify(obj)));
  const signingInput = `${enc(header)}.${enc(payload)}`;

  const key = await importVapidSigningKey(vapid);
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    utf8(signingInput),
  );
  // Web Crypto ECDSA returns raw r||s (64 bytes) — exactly what JWS needs.
  return `${signingInput}.${uint8ArrayToBase64Url(new Uint8Array(sig))}`;
}

// ── Payload encryption (RFC 8291 + RFC 8188 aes128gcm) ───────

async function hkdf(
  salt: Uint8Array<ArrayBuffer>,
  ikm: Uint8Array<ArrayBuffer>,
  info: Uint8Array<ArrayBuffer>,
  lengthBytes: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info },
    key,
    lengthBytes * 8,
  );
  return new Uint8Array(bits);
}

/** Default aes128gcm record size. Our payloads are tiny; this is the upper bound. */
const RECORD_SIZE = 4096;

/**
 * Encrypt `payload` for `sub` using aes128gcm. Returns the full message body
 * (header || ciphertext) ready to POST with `Content-Encoding: aes128gcm`.
 *
 * `salt` and `serverKeys` are injectable purely so the proof/round-trip test
 * can be deterministic; production passes neither.
 */
export async function encryptPayload(
  payload: Uint8Array<ArrayBuffer>,
  sub: WebPushSubscription,
  salt: Uint8Array<ArrayBuffer> = crypto.getRandomValues(new Uint8Array(16)),
  serverKeys?: CryptoKeyPair,
): Promise<Uint8Array<ArrayBuffer>> {
  const uaPublic = base64UrlToUint8Array(sub.p256dh);
  const authSecret = base64UrlToUint8Array(sub.auth);

  const keys =
    serverKeys ??
    (await crypto.subtle.generateKey(
      { name: "ECDH", namedCurve: "P-256" },
      true,
      ["deriveBits"],
    ));
  const asPublicRaw = new Uint8Array(
    await crypto.subtle.exportKey("raw", keys.publicKey),
  );

  // ECDH shared secret with the client's public key.
  const uaPublicKey = await crypto.subtle.importKey(
    "raw",
    uaPublic,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "ECDH", public: uaPublicKey },
      keys.privateKey,
      256,
    ),
  );

  // RFC 8291 §3.4 — combine auth_secret + ECDH secret into the IKM.
  const keyInfo = concatBytes(utf8("WebPush: info\0"), uaPublic, asPublicRaw);
  const ikm = await hkdf(authSecret, sharedSecret, keyInfo, 32);

  // RFC 8188 §2.2 — derive CEK and nonce from the message salt + IKM.
  const cek = await hkdf(salt, ikm, utf8("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, utf8("Content-Encoding: nonce\0"), 12);

  // Single record: plaintext || 0x02 (last-record delimiter), AES-128-GCM.
  const recordPlain = concatBytes(payload, new Uint8Array([0x02]));
  const cekKey = await crypto.subtle.importKey(
    "raw",
    cek,
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce, tagLength: 128 },
      cekKey,
      recordPlain,
    ),
  );

  // Header: salt(16) | rs(4, big-endian) | idlen(1) | keyid(as_public, 65).
  const header = new Uint8Array(16 + 4 + 1 + asPublicRaw.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, RECORD_SIZE, false);
  header[20] = asPublicRaw.length;
  header.set(asPublicRaw, 21);

  return concatBytes(header, ciphertext);
}

// ── Send ─────────────────────────────────────────────────────

export interface SendOptions {
  /** Seconds the push service should retain the message. */
  ttl?: number;
  urgency?: "very-low" | "low" | "normal" | "high";
  /** Test seam: replacement fetch. */
  fetchImpl?: typeof fetch;
}

/**
 * Send one Web Push message. Returns the HTTP status plus a `gone` flag when
 * the push service reports the subscription is dead (404/410), which the
 * caller uses to prune the row.
 */
export async function sendWebPush(
  sub: WebPushSubscription,
  payload: string,
  vapid: VapidDetails,
  opts: SendOptions = {},
): Promise<WebPushResult> {
  const audience = new URL(sub.endpoint).origin;
  const jwt = await buildVapidJwt(audience, vapid);
  const body = await encryptPayload(utf8(payload), sub);

  const doFetch = opts.fetchImpl ?? fetch;
  const res = await doFetch(sub.endpoint, {
    method: "POST",
    headers: {
      TTL: String(opts.ttl ?? 86400),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      Urgency: opts.urgency ?? "normal",
      Authorization: `vapid t=${jwt}, k=${vapid.publicKey}`,
    },
    body,
  });

  let text = "";
  try {
    text = await res.text();
  } catch {
    // ignore body read failures
  }

  return {
    statusCode: res.status,
    success: res.status >= 200 && res.status < 300,
    gone: res.status === 404 || res.status === 410,
    body: text,
  };
}

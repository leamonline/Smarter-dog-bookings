// ============================================================
// supabase/functions/_shared/flowCrypto.ts
//
// Encryption layer for the WhatsApp Flows Data Endpoint.
//
// Meta encrypts every Flow data-exchange request and expects the
// response encrypted with the SAME symmetric key. The scheme (per
// Meta's "Implementing Your Flow Endpoint" reference) is:
//
//   Request  →  { encrypted_flow_data, encrypted_aes_key, initial_vector }
//               all base64.
//     1. RSA-OAEP(SHA-256) decrypt `encrypted_aes_key` with OUR private
//        key  →  the one-time AES key (16 bytes = AES-128, 32 = AES-256).
//     2. AES-GCM decrypt `encrypted_flow_data` using that key and
//        `initial_vector` as the IV. The GCM auth tag is the LAST 16
//        bytes of `encrypted_flow_data` (Meta appends it to the
//        ciphertext); everything before it is the ciphertext.
//
//   Response →  base64( ciphertext || authTag ), returned as text/plain.
//     Encrypt with the SAME AES key, but the IV is the request's
//     `initial_vector` with every bit FLIPPED (~b). This bit-flip is
//     load-bearing: reusing the exact same key+IV pair for both
//     directions would be catastrophic for GCM, so Meta mandates the
//     inverted IV for the response. Getting this wrong shows up as the
//     Flow being stuck on "loading" with no decipherable error.
//
// We use node:crypto (not Web Crypto) on purpose:
//   - It can load a passphrase-encrypted private key (FLOW_PASSPHRASE);
//     Web Crypto's importKey only accepts an UNENCRYPTED pkcs8 key.
//   - node:crypto resolves in BOTH the Supabase Edge (Deno) runtime and
//     under Vitest/Node, so this module is unit-testable in isolation
//     — same dual-runtime constraint as _shared/confirmButtons.ts.
//
// Imported by:
//   - supabase/functions/whatsapp-flow-endpoint/index.ts  (Deno runtime)
//   - src/lib/whatsapp/flowCrypto.test.ts                 (Vitest / Node)
// ============================================================

import { Buffer } from "node:buffer";
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  createPrivateKey,
  timingSafeEqual,
  webcrypto,
} from "node:crypto";

/** GCM authentication tag length in bytes (128-bit tag). */
const GCM_TAG_LENGTH = 16;

/** The encrypted envelope Meta POSTs to the Flow data endpoint. */
export interface EncryptedFlowRequest {
  encrypted_flow_data: string;
  encrypted_aes_key: string;
  initial_vector: string;
}

/** Allowed top-level actions in a decrypted Flow request. */
export type FlowAction = "INIT" | "BACK" | "data_exchange" | "ping";

/** Shape of the decrypted request body Meta sends. `data` is screen-specific. */
export interface DecryptedFlowRequest {
  version: string;
  action: FlowAction;
  screen?: string;
  data?: Record<string, unknown>;
  flow_token?: string;
  user_locale?: string;
}

/** Decryption output: the body plus the key material needed to encrypt the reply. */
export interface DecryptResult {
  decrypted: DecryptedFlowRequest;
  aesKey: Buffer;
  initialVector: Buffer;
}

/**
 * Thrown when the request cannot be decrypted (bad/rotated key, malformed
 * envelope, failed GCM auth). The endpoint maps this to HTTP 421 so Meta
 * re-fetches our public key and retries, per Meta's spec.
 */
export class FlowDecryptError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "FlowDecryptError";
  }
}

function aesAlgoForKey(aesKey: Buffer): "aes-128-gcm" | "aes-256-gcm" {
  if (aesKey.length === 16) return "aes-128-gcm";
  if (aesKey.length === 32) return "aes-256-gcm";
  throw new FlowDecryptError(
    `Unexpected AES key length ${aesKey.length} (expected 16 or 32 bytes)`,
  );
}

function pemToDer(pem: string): Uint8Array<ArrayBuffer> {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  const binary = atob(body);
  const buf = new ArrayBuffer(binary.length);
  const der = new Uint8Array(buf);
  for (let i = 0; i < binary.length; i++) der[i] = binary.charCodeAt(i);
  return der;
}

/**
 * Decrypt an incoming Flow request envelope.
 * Returns the parsed body plus the AES key + IV so the caller can encrypt
 * the matching response without re-deriving them.
 */
export async function decryptFlowRequest(
  body: EncryptedFlowRequest,
  privatePem: string,
  passphrase?: string,
): Promise<DecryptResult> {
  if (!body?.encrypted_aes_key || !body?.encrypted_flow_data || !body?.initial_vector) {
    throw new FlowDecryptError("Encrypted request is missing required fields");
  }

  const encryptedAesKey = Buffer.from(body.encrypted_aes_key, "base64");
  const initialVector = Buffer.from(body.initial_vector, "base64");
  const flowDataWithTag = Buffer.from(body.encrypted_flow_data, "base64");

  if (initialVector.length !== 16) {
    throw new FlowDecryptError("invalid initial vector length");
  }

  if (flowDataWithTag.length <= GCM_TAG_LENGTH) {
    throw new FlowDecryptError("encrypted_flow_data shorter than the GCM tag");
  }

  // 1. RSA-OAEP(SHA-256, MGF1-SHA-256) → recover the one-time AES key.
  //
  // We use Web Crypto (subtle.decrypt) rather than node:crypto.privateDecrypt
  // because Deno's node:crypto polyfill defaulted MGF1 to SHA-1 regardless of
  // oaepHash, so the latter's OAEP output couldn't decrypt envelopes that
  // Meta encrypted with the standard MGF1-SHA-256. Web Crypto pins MGF1 to
  // the same hash as the key's import-time hash, eliminating the mismatch.
  //
  // Web Crypto imports only UNENCRYPTED PKCS#8, so an encrypted PEM is first
  // unwrapped via node:crypto.createPrivateKey + export-to-pkcs8.
  let plainPem = privatePem;
  if (privatePem.includes("BEGIN ENCRYPTED")) {
    try {
      const key = createPrivateKey(
        passphrase ? { key: privatePem, passphrase } : { key: privatePem },
      );
      plainPem = key.export({ type: "pkcs8", format: "pem" }) as string;
    } catch (err) {
      throw new FlowDecryptError("Failed to unwrap encrypted FLOW_PRIVATE_KEY", { cause: err });
    }
  }

  let aesKey: Buffer;
  try {
    const cryptoKey = await webcrypto.subtle.importKey(
      "pkcs8",
      pemToDer(plainPem),
      { name: "RSA-OAEP", hash: "SHA-256" },
      false,
      ["decrypt"],
    );
    // Copy Buffer into an ArrayBuffer-backed Uint8Array so the strict
    // BufferSource type matches (Node's Buffer is ArrayBufferLike-backed).
    const encryptedAesKeyView = new Uint8Array(new ArrayBuffer(encryptedAesKey.length));
    encryptedAesKeyView.set(encryptedAesKey);
    const decryptedBuf = await webcrypto.subtle.decrypt(
      { name: "RSA-OAEP" },
      cryptoKey,
      encryptedAesKeyView,
    );
    aesKey = Buffer.from(decryptedBuf);
  } catch (err) {
    throw new FlowDecryptError("RSA decryption of the AES key failed", { cause: err });
  }

  // 2. AES-GCM → recover the plaintext JSON. Tag is the trailing 16 bytes.
  const tag = flowDataWithTag.subarray(flowDataWithTag.length - GCM_TAG_LENGTH);
  const ciphertext = flowDataWithTag.subarray(0, flowDataWithTag.length - GCM_TAG_LENGTH);

  let plaintext: string;
  try {
    const decipher = createDecipheriv(aesAlgoForKey(aesKey), aesKey, initialVector);
    decipher.setAuthTag(tag);
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch (err) {
    throw new FlowDecryptError("AES-GCM decryption failed (auth tag mismatch?)", { cause: err });
  }

  let decrypted: DecryptedFlowRequest;
  try {
    decrypted = JSON.parse(plaintext) as DecryptedFlowRequest;
  } catch (err) {
    throw new FlowDecryptError("Decrypted payload is not valid JSON", { cause: err });
  }

  return { decrypted, aesKey, initialVector };
}

/**
 * Encrypt the response with the request's AES key and the BIT-FLIPPED IV.
 * Output is base64( ciphertext || authTag ); the endpoint returns it as a
 * raw text/plain body with HTTP 200.
 */
export function encryptFlowResponse(
  response: unknown,
  aesKey: Buffer,
  initialVector: Buffer,
): string {
  // Flip every bit of the IV — Meta requires the inverted IV for the reply.
  const flippedIv = Buffer.alloc(initialVector.length);
  for (let i = 0; i < initialVector.length; i++) {
    flippedIv[i] = ~initialVector[i] & 0xff;
  }

  const cipher = createCipheriv(aesAlgoForKey(aesKey), aesKey, flippedIv);
  const plaintext = Buffer.from(JSON.stringify(response), "utf8");
  const encrypted = Buffer.concat([
    cipher.update(plaintext),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  return encrypted.toString("base64");
}

/**
 * Verify Meta's X-Hub-Signature-256 header (HMAC-SHA256 of the raw body
 * with the Meta app secret). Mirrors whatsapp-webhook's check; the Flow
 * endpoint gets the same defence-in-depth on top of the encryption.
 *
 * `rawBody` MUST be the byte-exact request body — verify before any
 * JSON round-trip, or whitespace drift will break the HMAC.
 */
export function verifyFlowSignature(
  rawBody: Uint8Array,
  header: string | null | undefined,
  appSecret: string,
): boolean {
  if (!header || !appSecret) return false;

  const [algo, hex] = header.split("=");
  if (algo !== "sha256" || !hex) return false;

  const expected = createHmac("sha256", appSecret).update(rawBody).digest();
  let got: Buffer;
  try {
    got = Buffer.from(hex, "hex");
  } catch {
    return false;
  }
  if (got.length !== expected.length) return false;
  return timingSafeEqual(expected, got);
}

// Tests for the WhatsApp Flow encryption layer.
//
// Meta doesn't publish numeric RSA/AES vectors (they depend on the
// random per-request key + IV), so the AES-GCM/RSA-OAEP cases assert the
// round-trip property by independently reproducing Meta's CLIENT-side
// encryption with node:crypto and feeding it through our decrypt path —
// if our algorithm or IV handling drifts from the spec, the round-trip
// breaks. The HMAC check uses a real golden vector (RFC 4231, Case 1).

import { describe, expect, it } from "vitest";
import { Buffer } from "node:buffer";
import {
  constants,
  createCipheriv,
  createDecipheriv,
  generateKeyPairSync,
  publicEncrypt,
  randomBytes,
} from "node:crypto";

import {
  decryptFlowRequest,
  encryptFlowResponse,
  type EncryptedFlowRequest,
  FlowDecryptError,
  verifyFlowSignature,
} from "../../../supabase/functions/_shared/flowCrypto.ts";

const PASSPHRASE = "test-flow-passphrase";

function makeKeyPair() {
  return generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: {
      type: "pkcs8",
      format: "pem",
      cipher: "aes-256-cbc",
      passphrase: PASSPHRASE,
    },
  });
}

/** Reproduce exactly what Meta's client does before POSTing to us. */
function simulateMetaEncryption(
  publicKeyPem: string,
  payload: unknown,
  aesKey: Buffer,
  iv: Buffer,
): EncryptedFlowRequest {
  const encryptedAesKey = publicEncrypt(
    { key: publicKeyPem, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
    aesKey,
  );
  const algo = aesKey.length === 32 ? "aes-256-gcm" : "aes-128-gcm";
  const cipher = createCipheriv(algo, aesKey, iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return {
    encrypted_aes_key: encryptedAesKey.toString("base64"),
    encrypted_flow_data: Buffer.concat([ciphertext, tag]).toString("base64"),
    initial_vector: iv.toString("base64"),
  };
}

describe("decryptFlowRequest / encryptFlowResponse round-trip", () => {
  it("decrypts a Meta-encrypted AES-128 request", async () => {
    const { publicKey, privateKey } = makeKeyPair();
    const payload = {
      version: "3.0",
      action: "data_exchange",
      screen: "SELECT_SERVICE",
      data: { dog_id: "abc-123", note: "café ☕ — unicode" },
      flow_token: "tok_xyz",
    };
    const aesKey = randomBytes(16);
    const iv = randomBytes(16);

    const envelope = simulateMetaEncryption(publicKey, payload, aesKey, iv);
    const result = await decryptFlowRequest(envelope, privateKey, PASSPHRASE);

    expect(result.decrypted).toEqual(payload);
    expect(result.aesKey.equals(aesKey)).toBe(true);
    expect(result.initialVector.equals(iv)).toBe(true);
  });

  it("supports an AES-256 session key", async () => {
    const { publicKey, privateKey } = makeKeyPair();
    const payload = { version: "3.0", action: "ping" };
    const aesKey = randomBytes(32);
    const iv = randomBytes(16);

    const envelope = simulateMetaEncryption(publicKey, payload, aesKey, iv);
    const result = await decryptFlowRequest(envelope, privateKey, PASSPHRASE);
    expect(result.decrypted).toEqual(payload);
  });

  it("re-encrypts the response with a bit-flipped IV that Meta can decrypt", async () => {
    const { publicKey, privateKey } = makeKeyPair();
    const aesKey = randomBytes(16);
    const iv = randomBytes(16);
    const envelope = simulateMetaEncryption(
      publicKey,
      { version: "3.0", action: "INIT" },
      aesKey,
      iv,
    );
    const { aesKey: recoveredKey, initialVector } = await decryptFlowRequest(
      envelope,
      privateKey,
      PASSPHRASE,
    );

    const response = { screen: "SUCCESS", data: { booking_ref: "SD-001" } };
    const b64 = encryptFlowResponse(response, recoveredKey, initialVector);

    // Decrypt the way Meta's client would: SAME key, IV with every bit flipped.
    const encrypted = Buffer.from(b64, "base64");
    const tag = encrypted.subarray(encrypted.length - 16);
    const ciphertext = encrypted.subarray(0, encrypted.length - 16);
    const flippedIv = Buffer.alloc(initialVector.length);
    for (let i = 0; i < initialVector.length; i++) flippedIv[i] = ~initialVector[i] & 0xff;

    const decipher = createDecipheriv("aes-128-gcm", recoveredKey, flippedIv);
    decipher.setAuthTag(tag);
    const out = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
    expect(JSON.parse(out)).toEqual(response);
  });
});

describe("decryptFlowRequest error handling", () => {
  it("throws FlowDecryptError when the GCM tag is tampered", async () => {
    const { publicKey, privateKey } = makeKeyPair();
    const aesKey = randomBytes(16);
    const iv = randomBytes(16);
    const envelope = simulateMetaEncryption(
      publicKey,
      { version: "3.0", action: "data_exchange" },
      aesKey,
      iv,
    );

    const corrupted = Buffer.from(envelope.encrypted_flow_data, "base64");
    corrupted[corrupted.length - 1] ^= 0xff; // flip a byte in the auth tag
    const bad = { ...envelope, encrypted_flow_data: corrupted.toString("base64") };

    await expect(decryptFlowRequest(bad, privateKey, PASSPHRASE)).rejects.toThrow(FlowDecryptError);
  });

  it("throws FlowDecryptError on the wrong passphrase", async () => {
    const { publicKey, privateKey } = makeKeyPair();
    const envelope = simulateMetaEncryption(
      publicKey,
      { version: "3.0", action: "ping" },
      randomBytes(16),
      randomBytes(16),
    );
    await expect(decryptFlowRequest(envelope, privateKey, "wrong-pass")).rejects.toThrow(
      FlowDecryptError,
    );
  });

  it("throws FlowDecryptError on a missing field", async () => {
    const { privateKey } = makeKeyPair();
    const bad = { encrypted_aes_key: "x", initial_vector: "y" } as unknown as EncryptedFlowRequest;
    await expect(decryptFlowRequest(bad, privateKey, PASSPHRASE)).rejects.toThrow(FlowDecryptError);
  });
});

describe("verifyFlowSignature", () => {
  // RFC 4231, Test Case 1 — a published HMAC-SHA-256 golden vector.
  // Key = 0x0b × 20 (each byte < 0x80, so the utf8 string round-trips to
  // the exact key bytes); Data = "Hi There".
  const RFC_KEY = "\x0b".repeat(20);
  const RFC_DATA = Buffer.from("Hi There", "utf8");
  const RFC_HMAC = "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7";

  it("accepts a correct signature (RFC 4231 vector)", () => {
    expect(verifyFlowSignature(RFC_DATA, `sha256=${RFC_HMAC}`, RFC_KEY)).toBe(true);
  });

  it("rejects a tampered signature", () => {
    const tampered = RFC_HMAC.replace(/^b0/, "00");
    expect(verifyFlowSignature(RFC_DATA, `sha256=${tampered}`, RFC_KEY)).toBe(false);
  });

  it("rejects a body that doesn't match the signature", () => {
    expect(
      verifyFlowSignature(Buffer.from("tampered body", "utf8"), `sha256=${RFC_HMAC}`, RFC_KEY),
    ).toBe(false);
  });

  it("rejects malformed or missing headers", () => {
    expect(verifyFlowSignature(RFC_DATA, null, RFC_KEY)).toBe(false);
    expect(verifyFlowSignature(RFC_DATA, "sha1=deadbeef", RFC_KEY)).toBe(false);
    expect(verifyFlowSignature(RFC_DATA, RFC_HMAC, RFC_KEY)).toBe(false);
    expect(verifyFlowSignature(RFC_DATA, `sha256=${RFC_HMAC}`, "")).toBe(false);
  });
});

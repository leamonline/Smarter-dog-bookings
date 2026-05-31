#!/usr/bin/env node
// Encrypt a Meta-shaped ping envelope locally with flow-keys/public.pem and
// POST it to the deployed flow endpoint. If the endpoint returns 200, our
// crypto path works end-to-end and any Meta-side failure is a key-sync
// issue on their side, not ours.
//
// Usage:
//   FLOW_ENDPOINT_URI=https://<ref>.supabase.co/functions/v1/whatsapp-flow-endpoint \
//   node scripts/test-flow-endpoint.mjs

import { readFileSync } from "node:fs";
import {
  constants,
  createCipheriv,
  createDecipheriv,
  publicEncrypt,
  randomBytes,
} from "node:crypto";

const url = process.env.FLOW_ENDPOINT_URI;
if (!url) {
  console.error("Set FLOW_ENDPOINT_URI");
  process.exit(1);
}

const publicPem = readFileSync("flow-keys/public.pem", "utf8");

const aesKey = randomBytes(32);            // AES-256
const initialVector = randomBytes(16);     // 128-bit IV

const plaintext = Buffer.from(
  JSON.stringify({ version: "3.0", action: "ping", flow_token: "local-test" }),
  "utf8",
);

const cipher = createCipheriv("aes-256-gcm", aesKey, initialVector);
const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
const tag = cipher.getAuthTag();
const flowDataWithTag = Buffer.concat([ciphertext, tag]);

const encryptedAesKey = publicEncrypt(
  { key: publicPem, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
  aesKey,
);

const envelope = {
  encrypted_aes_key: encryptedAesKey.toString("base64"),
  encrypted_flow_data: flowDataWithTag.toString("base64"),
  initial_vector: initialVector.toString("base64"),
};

console.log("Posting envelope...");
console.log({
  encrypted_aes_key_bytes: encryptedAesKey.length,
  encrypted_flow_data_bytes: flowDataWithTag.length,
  initial_vector_bytes: initialVector.length,
});

const res = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(envelope),
});

const text = await res.text();
console.log(`\nHTTP ${res.status} ${res.statusText}`);
console.log("body:", text);

if (res.status !== 200) {
  process.exit(1);
}

// If 200, decrypt the response with the bit-flipped IV.
const flippedIv = Buffer.alloc(initialVector.length);
for (let i = 0; i < initialVector.length; i++) flippedIv[i] = ~initialVector[i] & 0xff;

const respBuf = Buffer.from(text, "base64");
const respTag = respBuf.subarray(respBuf.length - 16);
const respCipher = respBuf.subarray(0, respBuf.length - 16);
const decipher = createDecipheriv("aes-256-gcm", aesKey, flippedIv);
decipher.setAuthTag(respTag);
const respPlain = Buffer.concat([decipher.update(respCipher), decipher.final()]).toString("utf8");
console.log("\nDecrypted response:", respPlain);

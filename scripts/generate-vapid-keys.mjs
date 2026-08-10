#!/usr/bin/env node
// Generate a VAPID key pair for Staff Web Push.
//
//   node scripts/generate-vapid-keys.mjs
//
// Prints the public key (safe for the browser) and the private key (edge
// secret only — NEVER commit it, NEVER put it behind a VITE_ prefix).
//
// The output format matches what _shared/webpush.ts expects:
//   - public  key: base64url of the 65-byte uncompressed P-256 point
//   - private key: base64url of the 32-byte private scalar `d`
//
// Uses Node's Web Crypto so it produces exactly the same representation the
// edge function consumes (no external dependency).

import { webcrypto } from "node:crypto";
import { Buffer } from "node:buffer";

const { subtle } = webcrypto;

const pair = await subtle.generateKey(
  { name: "ECDSA", namedCurve: "P-256" },
  true,
  ["sign", "verify"],
);

const publicRaw = new Uint8Array(await subtle.exportKey("raw", pair.publicKey));
const jwk = await subtle.exportKey("jwk", pair.privateKey);

const publicKey = Buffer.from(publicRaw).toString("base64url");
const privateKey = jwk.d; // JWK `d` is already base64url

console.log("\nVAPID key pair generated.\n");
console.log("─".repeat(64));
console.log("PUBLIC KEY  (browser + edge — safe to expose):");
console.log(publicKey);
console.log("\nPRIVATE KEY (edge secret only — DO NOT commit / DO NOT use VITE_):");
console.log(privateKey);
console.log("─".repeat(64));
console.log("\nNext steps:\n");
console.log("1. Add to your local .env.local (client) and Vercel env:");
console.log(`     VITE_VAPID_PUBLIC_KEY=${publicKey}\n`);
console.log("2. Set the edge secrets (do NOT commit these):");
console.log(`     supabase secrets set --project-ref "<project-ref>" VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`     supabase secrets set --project-ref "<project-ref>" VAPID_PRIVATE_KEY=${privateKey}`);
console.log(`     supabase secrets set --project-ref "<project-ref>" VAPID_SUBJECT=mailto:leam@leamonline.uk`);
console.log(`     supabase secrets set --project-ref "<project-ref>" STAFF_PUSH_ENABLED=true   # when ready to go live\n`);

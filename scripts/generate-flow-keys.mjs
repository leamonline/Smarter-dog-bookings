#!/usr/bin/env node
// Generate the RSA key pair for the WhatsApp Flows Data Endpoint.
//
//   node scripts/generate-flow-keys.mjs [passphrase]
//
// - Private key: 2048-bit RSA, PKCS#8, encrypted with AES-256-CBC and a
//   passphrase. PKCS#8 + AES-256 avoids the legacy-cipher "DECODER
//   routines::unsupported" error you hit with OpenSSL 3 and `openssl
//   genrsa -des3`. node:crypto reads it back with { key, passphrase }.
// - Public key: SPKI PEM — this is what you upload to Meta.
//
// Writes ./flow-keys/{private,public}.pem (git-ignored) and prints the
// exact commands to (a) set the Edge Function secrets and (b) upload the
// public key to Meta. DELETE the local copies once secrets are set.

import { generateKeyPairSync, randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";

const passphrase = process.argv[2] || process.env.FLOW_PASSPHRASE || randomBytes(24).toString("base64url");
const generatedPassphrase = !process.argv[2] && !process.env.FLOW_PASSPHRASE;

const { publicKey, privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem", cipher: "aes-256-cbc", passphrase },
});

const outDir = "flow-keys";
mkdirSync(outDir, { recursive: true });
writeFileSync(`${outDir}/private.pem`, privateKey, { mode: 0o600 });
writeFileSync(`${outDir}/public.pem`, publicKey, { mode: 0o644 });

console.log(`\n✅ Wrote ${outDir}/private.pem and ${outDir}/public.pem (git-ignored).\n`);
if (generatedPassphrase) {
  console.log("🔑 Generated passphrase (store it — you need it as FLOW_PASSPHRASE):\n");
  console.log(`   ${passphrase}\n`);
}
console.log("Next steps:\n");
console.log("1) Set the Edge Function secrets (private key + passphrase):");
console.log('   supabase secrets set --project-ref "<project-ref>" FLOW_PRIVATE_KEY="$(cat flow-keys/private.pem)"');
console.log(`   supabase secrets set --project-ref "<project-ref>" FLOW_PASSPHRASE="${generatedPassphrase ? passphrase : "<your-passphrase>"}"\n`);
console.log("2) Upload the PUBLIC key to Meta (replace PHONE_NUMBER_ID + TOKEN):");
console.log(
  "   curl -X POST 'https://graph.facebook.com/v22.0/PHONE_NUMBER_ID/whatsapp_business_encryption' \\",
);
console.log('     -H "Authorization: Bearer $META_ACCESS_TOKEN" \\');
console.log('     --data-urlencode "business_public_key=$(cat flow-keys/public.pem)"\n');
console.log("   (or: npm run flow:publish -- set-public-key)\n");
console.log("3) Once secrets are set and the key is uploaded, DELETE the local copies:");
console.log("   rm -rf flow-keys\n");

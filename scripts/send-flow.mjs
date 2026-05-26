#!/usr/bin/env node
// Send a WhatsApp Flow to a phone number for testing, via the deployed
// whatsapp-send Edge Function (mode: "flow").
//
//   node scripts/send-flow.mjs --to +447700900123 --flow-id 1234567890 \
//        [--human-id <uuid>] [--cta "Book appointment"] [--draft]
//
// Env:
//   SUPABASE_URL or VITE_SUPABASE_URL   (to build the function URL)
//   SEND_INTERNAL_SECRET                (x-internal-secret header)
//   WHATSAPP_SEND_URL                   (optional full override)
//
// The recipient must have messaged your number within the last 24h
// (interactive messages can't open a fresh conversation window).

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = process.argv[i + 1];
  return v && !v.startsWith("--") ? v : true;
}

const to = arg("to");
const flowId = arg("flow-id");
const humanId = arg("human-id", null);
const cta = arg("cta", "Book appointment");
const draft = arg("draft", false) === true;

if (!to || !flowId) {
  console.error("Usage: node scripts/send-flow.mjs --to <phone> --flow-id <id> [--human-id <uuid>] [--draft]");
  process.exit(1);
}

const base = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const url = process.env.WHATSAPP_SEND_URL || (base ? `${base}/functions/v1/whatsapp-send` : null);
const secret = process.env.SEND_INTERNAL_SECRET;

if (!url) {
  console.error("Set SUPABASE_URL (or WHATSAPP_SEND_URL).");
  process.exit(1);
}
if (!secret) {
  console.error("Set SEND_INTERNAL_SECRET.");
  process.exit(1);
}

const body = {
  mode: "flow",
  to,
  flow_id: flowId,
  human_id: humanId,
  flow_type: "appointment_booking",
  initial_screen: "WELCOME",
  body_text: "Tap below to book your dog's groom.",
  cta,
  ...(draft ? { flow_display_mode: "draft" } : {}),
};

const res = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-internal-secret": secret },
  body: JSON.stringify(body),
});

const text = await res.text();
console.log(`HTTP ${res.status}`);
console.log(text);
process.exit(res.ok ? 0 : 1);

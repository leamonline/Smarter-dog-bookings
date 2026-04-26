// whatsapp-register — one-shot Edge Function that registers a phone number
// with the WhatsApp Cloud API so it starts appearing as "on WhatsApp" to
// consumers. Separate from whatsapp-send because registration is a management
// action, not a messaging action — belongs with setup tooling, not the
// per-message send path.
//
// Usage (server-to-server only — no JWT, internal secret required):
//
//   POST /functions/v1/whatsapp-register
//   Headers:
//     x-internal-secret: <SEND_INTERNAL_SECRET>
//     Content-Type:      application/json
//   Body:
//     { "pin": "123456" }
//
// On success, returns Meta's response verbatim (usually `{ success: true }`).
// On failure, returns Meta's error verbatim — the error codes tell you exactly
// what went wrong (number not verified, PIN too weak, etc.).
//
// After a successful register, the number is bound to the Cloud API — it
// can no longer be used in the WhatsApp/WhatsApp Business consumer apps.
// Deregister is a separate call if needed.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const META_ACCESS_TOKEN = Deno.env.get("META_ACCESS_TOKEN")!;
const META_PHONE_NUMBER_ID = Deno.env.get("META_PHONE_NUMBER_ID")!;
const SEND_INTERNAL_SECRET = Deno.env.get("SEND_INTERNAL_SECRET")!;

const GRAPH_API_VERSION = "v22.0";

serve(async (req) => {
  try {
    // Internal auth — same pattern as whatsapp-send's x-internal-secret path.
    if (req.headers.get("x-internal-secret") !== SEND_INTERNAL_SECRET) {
      return new Response("Unauthorized", { status: 401 });
    }

    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const body = await req.json().catch(() => null);
    const pin = body?.pin;

    if (!pin || typeof pin !== "string" || !/^\d{6}$/.test(pin)) {
      return new Response(
        JSON.stringify({ error: "pin must be a 6-digit string" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Call Meta's /register endpoint. Meta validates the PIN rules (not
    // sequential, not repeated) server-side and returns a clear error if
    // the PIN is too weak — no point replicating that logic here.
    const metaRes = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${META_PHONE_NUMBER_ID}/register`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${META_ACCESS_TOKEN}`,
          "Content-Type":  "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          pin: pin,
        }),
      },
    );

    const metaBody = await metaRes.text();
    // Pass through Meta's response verbatim — status + body. Caller can see
    // exactly what Meta said without us re-interpreting.
    return new Response(metaBody, {
      status: metaRes.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("whatsapp-register error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});

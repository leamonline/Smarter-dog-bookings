// ============================================================
// supabase/functions/whatsapp-generate-reply/index.ts
//
// Phase G — AI on demand. Thin staff-facing bridge that fires the
// whatsapp-agent against a specific conversation's most recent
// inbound event with force_draft=true. Used by the "Generate reply"
// button in the inbox.
//
// Why it exists separately from whatsapp-agent:
//   - whatsapp-agent authenticates via a service-only x-agent-secret
//     header (the SQL trigger that fires it knows the secret; staff
//     JWTs don't). Exposing that secret to the browser would let any
//     visitor poke the agent.
//   - This function authenticates via the staff member's Bearer JWT
//     (is_staff() gate), looks up the latest event for the target
//     conversation, then forwards to whatsapp-agent with the secret.
//
// Body:
//   { conversation_id: uuid }
//
// Returns:
//   { ok: true } | { ok: false, reason: string }
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildAllowedOrigins, buildCorsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const AGENT_CALLBACK_SECRET = Deno.env.get("AGENT_CALLBACK_SECRET") ?? "";

const ALLOWED_ORIGINS = buildAllowedOrigins("WHATSAPP_SEND_ALLOWED_ORIGINS");

const corsFor = (req: Request) => buildCorsHeaders(req, ALLOWED_ORIGINS);

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsFor(req), "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsFor(req) });
  }
  if (req.method !== "POST") {
    return json(req, { ok: false, reason: "method not allowed" }, 405);
  }

  // Staff auth — mirrors whatsapp-send/sms-send.
  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    return json(req, { ok: false, reason: "missing authorization" }, 401);
  }
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userRes, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userRes?.user) {
    return json(req, { ok: false, reason: "invalid token" }, 401);
  }
  const { data: staffCheck, error: staffErr } = await userClient.rpc("is_staff");
  if (staffErr) {
    console.error("is_staff rpc failed:", staffErr);
    return json(req, { ok: false, reason: "staff check failed" }, 500);
  }
  if (!staffCheck) {
    return json(req, { ok: false, reason: "not staff" }, 403);
  }

  let body: { conversation_id?: string };
  try {
    body = await req.json();
  } catch {
    return json(req, { ok: false, reason: "bad json" }, 400);
  }
  if (!body?.conversation_id) {
    return json(req, { ok: false, reason: "conversation_id is required" }, 400);
  }

  if (!AGENT_CALLBACK_SECRET) {
    return json(
      req,
      {
        ok: false,
        reason:
          "AGENT_CALLBACK_SECRET not configured on this function — the bridge can't talk to whatsapp-agent.",
      },
      500,
    );
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Look up the conversation's phone + channel, then find the most
  // recent inbound event for that phone. Events are stored in
  // whatsapp_events with phone_e164 set by the webhook.
  const { data: conv, error: convErr } = await supabase
    .from("whatsapp_conversations")
    .select("id, phone_e164, channel")
    .eq("id", body.conversation_id)
    .maybeSingle();
  if (convErr || !conv) {
    return json(req, { ok: false, reason: "conversation not found" }, 404);
  }
  if (conv.channel && conv.channel !== "whatsapp") {
    return json(
      req,
      {
        ok: false,
        reason: `Generate reply is only supported for WhatsApp conversations right now (this one is on ${conv.channel}).`,
      },
      422,
    );
  }

  const { data: event } = await supabase
    .from("whatsapp_events")
    .select("id")
    .eq("phone_e164", conv.phone_e164)
    .eq("signature_valid", true)
    .order("received_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!event?.id) {
    return json(
      req,
      {
        ok: false,
        reason:
          "No inbound event found for this conversation. The agent needs at least one customer message to reply to.",
      },
      422,
    );
  }

  // Forward to whatsapp-agent with force_draft. Note: the agent
  // function is set to processing_status='pending' or 'processed' on
  // the event; force_draft bypasses the "already processed" check
  // because we want it to draft regardless.
  const agentUrl = `${SUPABASE_URL}/functions/v1/whatsapp-agent`;
  const res = await fetch(agentUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-agent-secret": AGENT_CALLBACK_SECRET,
    },
    body: JSON.stringify({ event_id: event.id, force_draft: true }),
  });

  if (!res.ok) {
    const detail = await res.text();
    console.error("whatsapp-generate-reply agent call failed:", res.status, detail);
    return json(
      req,
      {
        ok: false,
        reason: "Could not generate a reply right now. Please try again.",
      },
      502,
    );
  }

  return json(req, { ok: true });
});

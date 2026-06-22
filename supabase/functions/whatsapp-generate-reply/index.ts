// ============================================================
// supabase/functions/whatsapp-generate-reply/index.ts
//
// Phase G — AI on demand. Thin staff-facing bridge that fires the
// whatsapp-agent against a specific conversation's most recent
// inbound event in suggest_only mode and hands the drafted text back
// to the inbox. Used by the "Generate reply" button, which types the
// suggestion into the compose box for staff to edit and send. Nothing
// is persisted as a draft and nothing is sent automatically.
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
//   { ok: true, reply_text: string } | { ok: false, reason: string }
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

  // Anchor on the customer's most recent inbound MESSAGE, not just the
  // latest event for the phone. whatsapp_events also stores delivery/read
  // status callbacks (no message to draft from), and those are often the
  // newest event — picking one made the agent fall through with no reply.
  // Reactions ("Reacted ❤️") aren't repliable either, so skip them and
  // use the latest real inbound message's originating event.
  const { data: inboundMsgs } = await supabase
    .from("whatsapp_messages")
    .select("event_id, content, reaction_emoji, sent_at")
    .eq("conversation_id", conv.id)
    .eq("direction", "inbound")
    .not("event_id", "is", null)
    .order("sent_at", { ascending: false })
    .limit(10);

  const replyTarget = (inboundMsgs ?? []).find(
    (m) =>
      m.event_id &&
      !m.reaction_emoji &&
      typeof m.content === "string" &&
      m.content.trim() !== "" &&
      !/^reacted\b/i.test(m.content.trim()),
  );

  if (!replyTarget?.event_id) {
    return json(
      req,
      {
        ok: false,
        reason:
          "No recent customer message to reply to. The AI needs a message from the customer to draft from.",
      },
      422,
    );
  }

  // Forward to whatsapp-agent in suggest_only mode. suggest_only implies
  // force_draft inside the agent, so it bypasses the "already processed"
  // check and runs the full Claude path — but returns the drafted text
  // instead of persisting a draft or sending anything.
  const agentUrl = `${SUPABASE_URL}/functions/v1/whatsapp-agent`;
  const res = await fetch(agentUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-agent-secret": AGENT_CALLBACK_SECRET,
    },
    body: JSON.stringify({ event_id: replyTarget.event_id, suggest_only: true }),
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

  // The agent replies with JSON in suggest_only mode:
  //   { ok: true, reply_text } | { ok: false, reason }
  let agentJson: { ok?: boolean; reply_text?: string; reason?: string };
  try {
    agentJson = await res.json();
  } catch {
    console.error("whatsapp-generate-reply: agent returned non-JSON");
    return json(
      req,
      { ok: false, reason: "The AI returned an unexpected response. Please try again." },
      502,
    );
  }
  if (agentJson.ok === false) {
    return json(req, { ok: false, reason: agentJson.reason ?? "Could not generate a reply." });
  }

  return json(req, { ok: true, reply_text: agentJson.reply_text ?? "" });
});

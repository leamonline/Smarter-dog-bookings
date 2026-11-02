// Messenger webhook. Same Meta app secret and verify token as WhatsApp,
// different URL, so a Page payload is never summarised as a phone number.
//
// MESSENGER_INBOX_ENABLED defaults off. While it is off the function still
// answers Meta (the handshake, and 200 on POST) and writes nothing.
// A valid POST is acknowledged only after the message row is stored, or
// with 500 so Meta retries. Invalid signatures are not processed.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { timingSafeEqualHeader } from "../_shared/webhook-auth.ts";
import { verifyMetaHubSignature } from "../_shared/metaSignature.ts";
import {
  applyMessengerIngress,
  filterToConfiguredPage,
  messengerFlagEnabled,
  parseMessengerWebhook,
  type MessengerIngress,
} from "../_shared/messenger.ts";
import { createMessengerStore } from "../_shared/messengerStore.ts";

export interface MessengerWebhookOverrides {
  enabled?: boolean;
  appSecret?: string;
  verifyToken?: string;
  pageId?: string | null;
  apply?: (events: MessengerIngress[]) => Promise<void>;
  recordEvent?: (row: Record<string, unknown>) => Promise<void>;
}

function serviceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Supabase is not configured");
  return createClient(url, key);
}

export async function handleMessengerWebhookRequest(
  req: Request,
  overrides: MessengerWebhookOverrides = {},
): Promise<Response> {
  const verifyToken = overrides.verifyToken ?? Deno.env.get("META_WEBHOOK_VERIFY_TOKEN") ?? "";
  const appSecret = overrides.appSecret ?? Deno.env.get("META_APP_SECRET") ?? "";

  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && timingSafeEqualHeader(token, verifyToken) && challenge) {
      return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
    }
    return new Response("forbidden", { status: 403 });
  }

  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }

  const rawBody = await req.arrayBuffer();
  const signatureHeader = req.headers.get("x-hub-signature-256");
  const signatureValid = await verifyMetaHubSignature(rawBody, signatureHeader, appSecret);
  if (!signatureValid) {
    console.warn("messenger-webhook invalid signature");
    return new Response("ok", { status: 200 });
  }

  const enabled = overrides.enabled ?? messengerFlagEnabled(Deno.env.get("MESSENGER_INBOX_ENABLED"));
  if (!enabled) {
    return new Response("ok", { status: 200 });
  }

  let parsed: unknown = {};
  try {
    parsed = JSON.parse(new TextDecoder().decode(rawBody));
  } catch {
    return new Response("ok", { status: 200 });
  }

  const configuredPage = overrides.pageId === undefined
    ? Deno.env.get("META_PAGE_ID") ?? ""
    : overrides.pageId ?? "";
  const events = filterToConfiguredPage(parseMessengerWebhook(parsed, Date.now()), configuredPage);

  try {
    if (overrides.apply) {
      await overrides.apply(events);
    } else {
      const supabase = serviceClient();
      await applyMessengerIngress(createMessengerStore(supabase), events);
    }
    if (overrides.recordEvent) {
      await overrides.recordEvent({ signature_valid: true, payload: parsed });
    } else {
      const supabase = serviceClient();
      const first = events[0];
      const { error } = await supabase.from("messaging_webhook_events").insert({
        channel: "messenger",
        signature_valid: true,
        page_id: first && "pageId" in first ? first.pageId : null,
        psid: first && "psid" in first ? first.psid : null,
        meta_message_id: first && "mid" in first ? first.mid : null,
        event_kind: first?.kind ?? "empty",
        payload: parsed,
        processing_status: "processed",
      });
      if (error) console.error("messenger-webhook event log failed:", error.message);
    }
  } catch (err) {
    console.error(
      "messenger-webhook apply failed:",
      err instanceof Error ? err.message : "unknown error",
    );
    return new Response("server error", { status: 500 });
  }

  return new Response("ok", { status: 200 });
}

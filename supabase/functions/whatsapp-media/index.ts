// ============================================================
// supabase/functions/whatsapp-media/index.ts
//
// Backfill/retry fetch of an inbound WhatsApp attachment, by
// whatsapp_messages id. The primary media path is inline at ingest
// (whatsapp-agent → _shared/whatsappMedia.ts); this function exists
// for messages that predate that pipeline (the media id in .raw stays
// downloadable from Meta for ~30 days) and for retrying an ingest-time
// download that failed.
//
// Internal-only — called via pg_net/SQL or scripts, never the browser:
//   Authorization: Bearer <WEBHOOK_SECRET>   (get_webhook_secret() in SQL)
//   or x-internal-secret: <SEND_INTERNAL_SECRET>
//
// POST { message_id: "<uuid>", force?: boolean }
//   → { ok: true, media_path, media_mime, signed_url }   (10-min URL,
//     handy for verifying the object without touching the staff UI)
//   → { ok: true, skipped: "already stored", ... } when media_path is
//     already set and force isn't.
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isAuthorizedWebhook, timingSafeEqualHeader } from "../_shared/webhook-auth.ts";
import {
  fetchAndStoreInboundMedia,
  WHATSAPP_MEDIA_BUCKET,
} from "../_shared/whatsappMedia.ts";
import type { MetaInboundMessage } from "../_shared/inboundMessage.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const META_ACCESS_TOKEN = Deno.env.get("META_ACCESS_TOKEN");
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET");
const SEND_INTERNAL_SECRET = Deno.env.get("SEND_INTERNAL_SECRET");

const SIGNED_URL_TTL_SECONDS = 600;

function json(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  try {
    const bearerOk =
      !!WEBHOOK_SECRET &&
      isAuthorizedWebhook(req.headers.get("Authorization"), WEBHOOK_SECRET);
    const internalOk = timingSafeEqualHeader(
      req.headers.get("x-internal-secret"),
      SEND_INTERNAL_SECRET,
    );
    if (!bearerOk && !internalOk) {
      return json({ error: "unauthorized" }, 401);
    }

    if (!META_ACCESS_TOKEN) {
      return json({ error: "server misconfiguration: META_ACCESS_TOKEN not set" }, 500);
    }

    const payload = await req.json().catch(() => null) as
      | { message_id?: string; force?: boolean }
      | null;
    if (!payload?.message_id) {
      return json({ error: "message_id is required" }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: message, error: loadError } = await supabase
      .from("whatsapp_messages")
      .select("id, conversation_id, direction, raw, media_path, media_mime")
      .eq("id", payload.message_id)
      .maybeSingle();
    if (loadError) {
      return json({ error: `message lookup failed: ${loadError.message}` }, 500);
    }
    if (!message) {
      return json({ error: "message not found" }, 404);
    }
    if (message.direction !== "inbound") {
      return json({ error: "only inbound messages carry fetchable media" }, 400);
    }

    const signedUrlFor = async (path: string) => {
      const { data } = await supabase.storage
        .from(WHATSAPP_MEDIA_BUCKET)
        .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
      return data?.signedUrl ?? null;
    };

    if (message.media_path && !payload.force) {
      return json({
        ok: true,
        skipped: "already stored",
        media_path: message.media_path,
        media_mime: message.media_mime,
        signed_url: await signedUrlFor(message.media_path),
      }, 200);
    }

    const stored = await fetchAndStoreInboundMedia(
      supabase,
      META_ACCESS_TOKEN,
      message.conversation_id,
      message.id,
      (message.raw ?? {}) as MetaInboundMessage,
    );
    if (!stored) {
      return json({ error: "message carries no fetchable media (image/sticker)" }, 400);
    }

    return json({
      ok: true,
      media_path: stored.mediaPath,
      media_mime: stored.mimeType,
      signed_url: await signedUrlFor(stored.mediaPath),
    }, 200);
  } catch (err) {
    console.error("whatsapp-media failed:", err);
    return json({ error: err instanceof Error ? err.message : "unexpected error" }, 502);
  }
});

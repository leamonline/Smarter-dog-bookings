// ============================================================
// supabase/functions/_shared/whatsappMedia.ts
//
// Download an inbound WhatsApp attachment from Meta and store it in
// the private 'whatsapp-media' Storage bucket, then stamp the message
// row (media_path / media_mime) so the staff inbox can render it.
//
// Meta's webhook only delivers a media id; the bytes live on the Graph
// API for ~30 days. Fetching is two hops, both requiring the system-
// user token:
//   1. GET /{media_id}            → { url, mime_type }   (URL lives ~5 min)
//   2. GET <url>                  → the binary
//
// Callers:
//   - whatsapp-agent handler.ts   — inline at ingest, best-effort
//     (a download failure must never fail message ingestion).
//   - whatsapp-media/index.ts     — manual backfill/retry by message id.
//
// The pure "what media does this message carry?" logic lives in
// inboundMessage.ts (extractInboundMedia / mediaFileExtension) so it's
// unit-tested under Vitest; this module is the Deno/IO half.
// ============================================================

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  extractInboundMedia,
  mediaFileExtension,
  type MetaInboundMessage,
} from "./inboundMessage.ts";

const META_GRAPH_VERSION = "v22.0";
export const WHATSAPP_MEDIA_BUCKET = "whatsapp-media";

export interface StoredMedia {
  mediaPath: string;
  mimeType: string | null;
}

/**
 * Fetch the attachment carried by `raw` (if any) and persist it.
 * Returns null when the message carries no fetchable media; throws on
 * download/storage failures so each caller can choose its own severity.
 * Idempotent: re-running overwrites the same storage path and re-stamps
 * the row.
 */
export async function fetchAndStoreInboundMedia(
  supabase: SupabaseClient,
  accessToken: string,
  conversationId: string,
  messageId: string,
  raw: MetaInboundMessage,
): Promise<StoredMedia | null> {
  const info = extractInboundMedia(raw);
  if (!info) return null;

  // Hop 1: media id → short-lived download URL.
  const metaRes = await fetch(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/${info.mediaId}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!metaRes.ok) {
    throw new Error(
      `Graph media lookup failed (${metaRes.status}) for media ${info.mediaId}`,
    );
  }
  const meta = (await metaRes.json()) as { url?: string; mime_type?: string };
  if (!meta.url) {
    throw new Error(`Graph media lookup returned no URL for media ${info.mediaId}`);
  }

  // Hop 2: the binary. Meta requires the same bearer token here too.
  const binRes = await fetch(meta.url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!binRes.ok) {
    throw new Error(
      `Media download failed (${binRes.status}) for media ${info.mediaId}`,
    );
  }
  const bytes = new Uint8Array(await binRes.arrayBuffer());

  const mimeType = meta.mime_type ?? info.mimeType;
  const mediaPath = `${conversationId}/${messageId}.${mediaFileExtension(mimeType)}`;

  const { error: uploadError } = await supabase.storage
    .from(WHATSAPP_MEDIA_BUCKET)
    .upload(mediaPath, bytes, {
      contentType: mimeType ?? "application/octet-stream",
      upsert: true,
    });
  if (uploadError) {
    throw new Error(`Storage upload failed for ${mediaPath}: ${uploadError.message}`);
  }

  const { error: updateError } = await supabase
    .from("whatsapp_messages")
    .update({ media_path: mediaPath, media_mime: mimeType })
    .eq("id", messageId);
  if (updateError) {
    throw new Error(
      `media_path update failed for message ${messageId}: ${updateError.message}`,
    );
  }

  return { mediaPath, mimeType };
}

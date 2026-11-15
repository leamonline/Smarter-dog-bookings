// ============================================================
// src/supabase/hooks/useSignedMediaUrl.ts
//
// Signed-URL resolution for inbound WhatsApp media stored in the
// private 'whatsapp-media' bucket (staff-only read policy; mirrors the
// groom-photos signed-URL approach in hooks/useGroomPhotos.ts);
// lives in supabase/hooks (not the component tree) per the Debt-#12 lint guard.
//
// Module-level cache so scrolling a long thread doesn't re-sign the
// same object on every mount. Each entry carries its expiry: the staff
// app stays open all day on the salon devices, so an hour-long URL
// cached "for the session" would be handed out after it had expired.
// ============================================================

import { useEffect, useState } from "react";
import { supabase } from "../client";
import { logger } from "../../lib/logger";

const WHATSAPP_MEDIA_BUCKET = "whatsapp-media";
const SIGNED_URL_TTL_SECONDS = 3600;
// A cached URL is re-signed once it has less than this left, which also
// absorbs a few minutes of clock skew between the device and Supabase.
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

const urlCache = new Map<string, { url: string; expiresAt: number }>();

function cachedUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const entry = urlCache.get(path);
  if (!entry) return null;
  if (entry.expiresAt - Date.now() > REFRESH_MARGIN_MS) return entry.url;
  urlCache.delete(path);
  return null;
}

/**
 * Resolve a storage path to a signed display URL. Returns null while
 * loading, on failure, or offline (no Supabase client) — callers fall
 * back to the "📷 Photo" chip in those cases.
 */
export function useSignedMediaUrl(path: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(() => cachedUrl(path));

  useEffect(() => {
    if (!path || !supabase) return undefined;
    const cached = cachedUrl(path);
    if (cached) {
      setUrl(cached);
      return undefined;
    }

    let cancelled = false;
    // Counted from before the request, so the cache never thinks a URL
    // lives longer than it does.
    const expiresAt = Date.now() + SIGNED_URL_TTL_SECONDS * 1000;
    supabase.storage
      .from(WHATSAPP_MEDIA_BUCKET)
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS)
      .then(({ data, error }) => {
        if (error) {
          logger.warn("WhatsApp media signed URL failed", {
            extra: { path, error },
          });
          return;
        }
        if (data?.signedUrl) {
          urlCache.set(path, { url: data.signedUrl, expiresAt });
          if (!cancelled) setUrl(data.signedUrl);
        }
      })
      .catch((error: unknown) => {
        logger.warn("WhatsApp media signed URL failed", {
          extra: { path, error },
        });
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  return url;
}

// ============================================================
// src/supabase/hooks/useSignedMediaUrl.js
//
// Signed-URL resolution for inbound WhatsApp media stored in the
// private 'whatsapp-media' bucket (staff-only read policy; mirrors the
// groom-photos signed-URL approach in hooks/useGroomPhotos.js);
// lives in supabase/hooks (not the component tree) per the Debt-#12 lint guard.
//
// Module-level cache so scrolling a long thread doesn't re-sign the
// same object on every mount; 1-hour URLs comfortably outlive both the
// cache entry's usefulness and any single inbox session.
// ============================================================

import { useEffect, useState } from "react";
import { supabase } from "../client.js";
import { logger } from "../../lib/logger";

const WHATSAPP_MEDIA_BUCKET = "whatsapp-media";
const SIGNED_URL_TTL_SECONDS = 3600;

const urlCache = new Map();

/**
 * Resolve a storage path to a signed display URL. Returns null while
 * loading, on failure, or offline (no Supabase client) — callers fall
 * back to the "📷 Photo" chip in those cases.
 */
export function useSignedMediaUrl(path) {
  const [url, setUrl] = useState(() => (path ? urlCache.get(path) ?? null : null));

  useEffect(() => {
    if (!path || !supabase) return undefined;
    const cached = urlCache.get(path);
    if (cached) {
      setUrl(cached);
      return undefined;
    }

    let cancelled = false;
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
          urlCache.set(path, data.signedUrl);
          if (!cancelled) setUrl(data.signedUrl);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  return url;
}

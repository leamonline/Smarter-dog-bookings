// Signed URLs for objects in a private Storage bucket, kept usable for as long
// as they are on screen. Shared by the customer portal and the staff app, which
// sign with different clients (and so keep separate caches) but have the same
// problem: both stay open for hours, and a signed URL lasts one.
import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "../../lib/logger";

/** The private bucket customer dog photos live in (20261115120000). */
export const DOG_PHOTOS_BUCKET = "dog-photos";

const SIGNED_URL_TTL_SECONDS = 3600;
// A cached URL is re-signed once it has less than this left. It also absorbs a
// few minutes of clock skew between the device and Supabase.
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

export interface SignedUrlState {
  /** Null while signing, offline, on a signing failure, or after a failed retry. */
  url: string | null;
  /** Pass to the <img>'s onError. */
  onLoadError: () => void;
}

/**
 * Build a hook that resolves a path in `bucket` to a signed display URL, with
 * its own module-level cache so a list does not re-sign the same object on
 * every mount.
 *
 * While a URL is shown it is re-signed shortly before it lapses (the old one
 * keeps showing meanwhile). If the image still fails to load — an expired link
 * after the device slept, a blip — one fresh URL is fetched for that path
 * before giving up, so a missing file cannot loop. Callers show a fallback
 * whenever `url` is null.
 */
export function createSignedUrlHook({
  getClient,
  bucket,
  label,
}: {
  /** Read on every use, so an offline (null) client is handled. */
  getClient: () => SupabaseClient | null | undefined;
  bucket: string;
  /** Names the object in log messages, e.g. "Dog photo". */
  label: string;
}) {
  const urlCache = new Map<string, { url: string; expiresAt: number }>();

  function cachedUrl(path: string | null | undefined): string | null {
    if (!path) return null;
    const entry = urlCache.get(path);
    if (!entry) return null;
    if (entry.expiresAt - Date.now() > REFRESH_MARGIN_MS) return entry.url;
    urlCache.delete(path);
    return null;
  }

  /** Drop a path's cached URL, e.g. once its object has been deleted. */
  function forget(path: string) {
    urlCache.delete(path);
  }

  function useSignedUrl(path: string | null | undefined): SignedUrlState {
    const [entry, setEntry] = useState<{ path: string; url: string } | null>(() => {
      const cached = path ? cachedUrl(path) : null;
      return path && cached ? { path, url: cached } : null;
    });
    // Bumped to re-sign: by the expiry timer, or once after a failed load.
    const [refresh, setRefresh] = useState(0);
    const [failedUrl, setFailedUrl] = useState<string | null>(null);
    const retriesLeft = useRef(1);

    useEffect(() => {
      // A new object gets a fresh error budget.
      retriesLeft.current = 1;
      setFailedUrl(null);
    }, [path]);

    useEffect(() => {
      const client = getClient();
      if (!path || !client) {
        setEntry(null);
        return undefined;
      }
      let cancelled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      // Re-sign once this URL is inside the refresh margin. The extra second
      // means the cache already counts it as stale when the timer fires.
      const scheduleRefresh = (expiresAt: number) => {
        const delay = Math.max(0, expiresAt - REFRESH_MARGIN_MS - Date.now() + 1000);
        timer = setTimeout(() => setRefresh((n) => n + 1), delay);
      };

      const cached = urlCache.get(path);
      if (cached && cachedUrl(path)) {
        setEntry({ path, url: cached.url });
        scheduleRefresh(cached.expiresAt);
        return () => {
          cancelled = true;
          clearTimeout(timer);
        };
      }

      // Counted from before the request, so the cache never thinks a URL lives
      // longer than it does.
      const expiresAt = Date.now() + SIGNED_URL_TTL_SECONDS * 1000;
      void client.storage
        .from(bucket)
        .createSignedUrl(path, SIGNED_URL_TTL_SECONDS)
        .then(({ data, error }) => {
          if (error || !data?.signedUrl) {
            logger.warn(`${label} signed URL failed`, { extra: { error } });
            return;
          }
          urlCache.set(path, { url: data.signedUrl, expiresAt });
          if (cancelled) return;
          setEntry({ path, url: data.signedUrl });
          // A freshly signed link gets its load attempt even when it matches
          // the one that failed: tokens are stamped to the second, so a quick
          // re-sign can return the same URL.
          setFailedUrl(null);
          scheduleRefresh(expiresAt);
        })
        .catch((error: unknown) => {
          logger.warn(`${label} signed URL failed`, { extra: { error } });
        });
      return () => {
        cancelled = true;
        clearTimeout(timer);
      };
    }, [path, refresh]);

    const current = entry && entry.path === path ? entry.url : null;

    const onLoadError = useCallback(() => {
      if (!path || !current) return;
      // Hide the broken image straight away; the fallback shows meanwhile.
      setFailedUrl(current);
      if (retriesLeft.current > 0) {
        retriesLeft.current -= 1;
        urlCache.delete(path);
        setRefresh((n) => n + 1);
      }
    }, [path, current]);

    return { url: current && current !== failedUrl ? current : null, onLoadError };
  }

  return { useSignedUrl, forget };
}

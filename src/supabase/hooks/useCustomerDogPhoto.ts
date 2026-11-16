// Customer dog photos (20261115120000): upload, replace, remove and display.
// Lives in supabase/hooks so components never touch the client (Debt #12).
//
// Order of a change, and what happens when a step fails:
//   1. prepare the photo in the browser (resize, re-encode, strip metadata);
//   2. upload it under a new random name in the dog's folder — never upsert;
//   3. point the dog at it with set_customer_dog_photo, which checks the
//      object exists in that dog's folder on the caller's own account;
//   4. delete the previous object through the Storage API.
// If the database refuses step 3, the new upload is deleted again. If step 3's
// outcome is unknown (a dropped connection can lose the reply to a committed
// save), the dog's current photo is read back first: the upload is deleted
// only when nothing points at it, and kept when that cannot be confirmed. If
// step 4 fails the photo has still changed, so the leftover file is logged,
// not shown as an error.
import { useCallback, useEffect, useRef, useState } from "react";
import { customerSupabase } from "../customerClient";
import { setCustomerDogPhoto, type SetCustomerDogPhotoRow } from "../rpc";
import { getDogPhotoPath } from "../repositories/dogsRepo";
import { prepareDogPhoto } from "../../lib/dogPhoto";
import { logger } from "../../lib/logger";

export const DOG_PHOTOS_BUCKET = "dog-photos";
const SIGNED_URL_TTL_SECONDS = 3600;
// A cached URL is re-signed once it has less than this left. The portal lives
// for hours as a home-screen app, so a URL cached for "the session" would
// outlive its hour; the margin also absorbs a few minutes of clock skew.
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

export type DogPhotoResult = { photoPath: string | null; error: unknown };

/**
 * True when PostgREST relayed an answer from the database (an SQLSTATE or
 * PGRST code), so the write is known not to have happened. A transport
 * failure — a thrown fetch error, or supabase-js's code-less wrapper of one —
 * leaves the outcome unknown.
 */
function isDatabaseRefusal(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" && code.length > 0;
}

function previousPathFrom(data: unknown): string | null {
  const row = (Array.isArray(data) ? data[0] : data) as SetCustomerDogPhotoRow | null | undefined;
  return row?.previous_photo_path ?? null;
}

// A version-4 UUID. set_customer_dog_photo accepts only a canonical 8-4-4-4-12
// lowercase hex name, so every branch must produce exactly that.
// crypto.randomUUID is missing on iOS before 15.4; getRandomValues is not.
function randomUuid(): string {
  const webCrypto = typeof crypto !== "undefined" ? crypto : undefined;
  if (typeof webCrypto?.randomUUID === "function") return webCrypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof webCrypto?.getRandomValues === "function") {
    webCrypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function newObjectName(dogId: string): string {
  return `${dogId}/${randomUuid()}.jpg`;
}

async function deleteObject(path: string, context: string) {
  if (!customerSupabase || !path) return;
  try {
    const { error } = await customerSupabase.storage.from(DOG_PHOTOS_BUCKET).remove([path]);
    if (error) logger.warn("Dog photo object could not be deleted", { extra: { context, error } });
  } catch (error) {
    logger.warn("Dog photo object could not be deleted", { extra: { context, error } });
  }
  urlCache.delete(path);
}

export function useCustomerDogPhoto() {
  const uploadDogPhoto = useCallback(async (dogId: string, file: File): Promise<DogPhotoResult> => {
    if (!customerSupabase) return { photoPath: null, error: new Error("Not connected") };
    let blob: Blob;
    try {
      blob = await prepareDogPhoto(file);
    } catch (error) {
      return { photoPath: null, error };
    }

    const client = customerSupabase;
    const path = newObjectName(dogId);
    try {
      const upload = await client.storage
        .from(DOG_PHOTOS_BUCKET)
        .upload(path, blob, { contentType: "image/jpeg", upsert: false, cacheControl: "3600" });
      if (upload.error) throw upload.error;
    } catch (error) {
      logger.error("Dog photo upload failed", error, {
        tags: { component: "useCustomerDogPhoto", op: "upload" },
      });
      return { photoPath: null, error };
    }

    let setError: unknown;
    try {
      const { data, error } = await setCustomerDogPhoto(client, { dogId, photoPath: path });
      if (!error) {
        const previous = previousPathFrom(data);
        if (previous && previous !== path) await deleteObject(previous, "replaced photo");
        return { photoPath: path, error: null };
      }
      setError = error;
    } catch (error) {
      setError = error;
    }
    logger.error("Setting the dog photo failed", setError, {
      tags: { component: "useCustomerDogPhoto", op: "set_customer_dog_photo" },
    });

    // A refusal the database actually sent means nothing points at the
    // upload, so it can go. Anything else (a dropped connection, a lost
    // reply) may have committed: read back what the dog points at before
    // deleting, and keep the file when even that cannot be answered — a
    // spare object is harmless, deleting the dog's saved photo is not.
    if (isDatabaseRefusal(setError)) {
      await deleteObject(path, "refused upload");
      return { photoPath: null, error: setError };
    }
    const current = await getDogPhotoPath(client, dogId).catch((error: unknown) => ({
      photoPath: null,
      error: error instanceof Error ? error : new Error(String(error)),
    }));
    if (!current.error && current.photoPath === path) {
      // It saved. The photo it replaced is now unreferenced, but its path
      // was in the lost reply; it stays behind as a harmless leftover.
      return { photoPath: path, error: null };
    }
    if (!current.error) await deleteObject(path, "unreferenced upload");
    else logger.warn("Kept a dog photo upload whose save could not be confirmed", { extra: { error: current.error } });
    return { photoPath: null, error: setError };
  }, []);

  const removeDogPhoto = useCallback(async (dogId: string): Promise<DogPhotoResult> => {
    if (!customerSupabase) return { photoPath: null, error: new Error("Not connected") };
    try {
      const { data, error } = await setCustomerDogPhoto(customerSupabase, { dogId, photoPath: null });
      if (error) throw error;
      const previous = previousPathFrom(data);
      if (previous) await deleteObject(previous, "removed photo");
      return { photoPath: null, error: null };
    } catch (error) {
      logger.error("Removing the dog photo failed", error, {
        tags: { component: "useCustomerDogPhoto", op: "set_customer_dog_photo" },
      });
      return { photoPath: null, error };
    }
  }, []);

  return { uploadDogPhoto, removeDogPhoto };
}

/**
 * A signed URL for a dog photo, kept usable for as long as it is on screen.
 *
 * Signed URLs last an hour, but the portal stays open for hours as a
 * home-screen app. So while a photo is shown its URL is re-signed shortly
 * before it lapses (the old one keeps showing meanwhile), and if the image
 * still fails to load — an expired link after the phone slept, a blip — one
 * fresh URL is fetched before giving up. `url` is null while signing, offline,
 * on a signing failure, or once the photo has failed again after that retry;
 * callers then show the dog's initial. Pass `onLoadError` to the <img>.
 */
export function useDogPhotoUrl(path: string | null | undefined): {
  url: string | null;
  onLoadError: () => void;
} {
  const [entry, setEntry] = useState<{ path: string; url: string } | null>(() => {
    const cached = path ? cachedUrl(path) : null;
    return path && cached ? { path, url: cached } : null;
  });
  // Bumped to re-sign: by the expiry timer, or once after a failed load.
  const [refresh, setRefresh] = useState(0);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const retriesLeft = useRef(1);

  useEffect(() => {
    // A new photo gets a fresh error budget.
    retriesLeft.current = 1;
    setFailedUrl(null);
  }, [path]);

  useEffect(() => {
    if (!path || !customerSupabase) {
      setEntry(null);
      return undefined;
    }
    const client = customerSupabase;
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
      .from(DOG_PHOTOS_BUCKET)
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS)
      .then(({ data, error }) => {
        if (error || !data?.signedUrl) {
          logger.warn("Dog photo signed URL failed", { extra: { error } });
          return;
        }
        urlCache.set(path, { url: data.signedUrl, expiresAt });
        if (cancelled) return;
        setEntry({ path, url: data.signedUrl });
        scheduleRefresh(expiresAt);
      })
      .catch((error: unknown) => {
        logger.warn("Dog photo signed URL failed", { extra: { error } });
      });
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [path, refresh]);

  const current = entry && entry.path === path ? entry.url : null;

  const onLoadError = useCallback(() => {
    if (!path || !current) return;
    // Hide the broken image straight away; the initial shows meanwhile.
    setFailedUrl(current);
    if (retriesLeft.current > 0) {
      retriesLeft.current -= 1;
      urlCache.delete(path);
      setRefresh((n) => n + 1);
    }
  }, [path, current]);

  return { url: current && current !== failedUrl ? current : null, onLoadError };
}

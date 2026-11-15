// Customer dog photos (20261115120000): upload, replace, remove and display.
// Lives in supabase/hooks so components never touch the client (Debt #12).
//
// Order of a change, and what happens when a step fails:
//   1. prepare the photo in the browser (resize, re-encode, strip metadata);
//   2. upload it under a new random name in the dog's folder — never upsert;
//   3. point the dog at it with set_customer_dog_photo, which checks the
//      object exists in that dog's folder on the caller's own account;
//   4. delete the previous object through the Storage API.
// If step 3 fails the new upload is deleted again; if step 4 fails the photo
// has still changed, so the leftover file is logged, not shown as an error.
import { useCallback, useEffect, useState } from "react";
import { customerSupabase } from "../customerClient";
import { setCustomerDogPhoto, type SetCustomerDogPhotoRow } from "../rpc";
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
    let uploaded = false;
    try {
      const upload = await client.storage
        .from(DOG_PHOTOS_BUCKET)
        .upload(path, blob, { contentType: "image/jpeg", upsert: false, cacheControl: "3600" });
      if (upload.error) throw upload.error;
      uploaded = true;

      const { data, error } = await setCustomerDogPhoto(client, { dogId, photoPath: path });
      if (error) throw error;
      const previous = previousPathFrom(data);
      if (previous && previous !== path) await deleteObject(previous, "replaced photo");
      return { photoPath: path, error: null };
    } catch (error) {
      logger.error(uploaded ? "Setting the dog photo failed" : "Dog photo upload failed", error, {
        tags: { component: "useCustomerDogPhoto", op: uploaded ? "set_customer_dog_photo" : "upload" },
      });
      if (uploaded) await deleteObject(path, "orphaned upload");
      return { photoPath: null, error };
    }
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
 * A short-lived signed URL for a dog photo, or null while signing, on
 * failure, or offline — callers show the initial instead.
 */
export function useDogPhotoUrl(path: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(() => cachedUrl(path));

  useEffect(() => {
    if (!path || !customerSupabase) {
      setUrl(null);
      return undefined;
    }
    const cached = cachedUrl(path);
    if (cached) {
      setUrl(cached);
      return undefined;
    }
    let cancelled = false;
    setUrl(null);
    // Counted from before the request, so the cache never thinks a URL lives
    // longer than it does.
    const expiresAt = Date.now() + SIGNED_URL_TTL_SECONDS * 1000;
    void customerSupabase.storage
      .from(DOG_PHOTOS_BUCKET)
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS)
      .then(({ data, error }) => {
        if (error || !data?.signedUrl) {
          logger.warn("Dog photo signed URL failed", { extra: { error } });
          return;
        }
        urlCache.set(path, { url: data.signedUrl, expiresAt });
        if (!cancelled) setUrl(data.signedUrl);
      })
      .catch((error: unknown) => {
        logger.warn("Dog photo signed URL failed", { extra: { error } });
      });
    return () => { cancelled = true; };
  }, [path]);

  return url;
}

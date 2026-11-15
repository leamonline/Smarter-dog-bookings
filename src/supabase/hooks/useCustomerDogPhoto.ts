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
const urlCache = new Map<string, string>();

export type DogPhotoResult = { photoPath: string | null; error: unknown };

function previousPathFrom(data: unknown): string | null {
  const row = (Array.isArray(data) ? data[0] : data) as SetCustomerDogPhotoRow | null | undefined;
  return row?.previous_photo_path ?? null;
}

function newObjectName(dogId: string): string {
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(16).padStart(8, "0")}-0000-4000-8000-${Math.random().toString(16).slice(2, 14).padEnd(12, "0")}`;
  return `${dogId}/${id}.jpg`;
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
  const [url, setUrl] = useState<string | null>(() => (path ? urlCache.get(path) ?? null : null));

  useEffect(() => {
    if (!path || !customerSupabase) {
      setUrl(null);
      return undefined;
    }
    const cached = urlCache.get(path);
    if (cached) {
      setUrl(cached);
      return undefined;
    }
    let cancelled = false;
    setUrl(null);
    void customerSupabase.storage
      .from(DOG_PHOTOS_BUCKET)
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS)
      .then(({ data, error }) => {
        if (error || !data?.signedUrl) {
          logger.warn("Dog photo signed URL failed", { extra: { error } });
          return;
        }
        urlCache.set(path, data.signedUrl);
        if (!cancelled) setUrl(data.signedUrl);
      })
      .catch((error: unknown) => {
        logger.warn("Dog photo signed URL failed", { extra: { error } });
      });
    return () => { cancelled = true; };
  }, [path]);

  return url;
}

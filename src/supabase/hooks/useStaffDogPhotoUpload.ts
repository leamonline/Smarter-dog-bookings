// Staff add, replace or remove a dog's profile photo on the owner's behalf
// (20261121120000). Same bucket and object-name shape as the customer flow, so
// a photo staff add looks exactly like one the owner added.
//
// Order of a change, and what happens when a step fails:
//   1. prepare the photo in the browser (resize, re-encode, strip metadata);
//   2. upload it under a new random name in the dog's folder — never upsert;
//   3. the caller points the dog at it (updateDog). If that fails, the caller
//      reads the dog's photo back (currentDogPhotoPath) before deleting the
//      upload: updateDog also fails when only the reply was lost, and then the
//      database may already point at the new object;
//   4. after a successful change the caller deletes the previous object.
// A leftover file is harmless and logged; deleting the saved photo is not, so
// nothing here deletes an object the dog may still point at.
import { useCallback } from "react";
import { supabase } from "../client";
import { getDogPhotoPath } from "../repositories/dogsRepo";
import { prepareDogPhoto } from "../../lib/dogPhoto";
import { newDogPhotoObjectName } from "../../lib/dogPhotoName";
import { logger } from "../../lib/logger";
import { DOG_PHOTOS_BUCKET } from "./signedStorageUrl";

export type StaffDogPhotoUpload = { photoPath: string | null; error: unknown };

export function useStaffDogPhotoUpload() {
  const uploadDogPhoto = useCallback(async (dogId: string, file: File): Promise<StaffDogPhotoUpload> => {
    if (!supabase) return { photoPath: null, error: new Error("Not connected") };
    let blob: Blob;
    try {
      blob = await prepareDogPhoto(file);
    } catch (error) {
      return { photoPath: null, error };
    }
    const path = newDogPhotoObjectName(dogId);
    try {
      const { error } = await supabase.storage
        .from(DOG_PHOTOS_BUCKET)
        .upload(path, blob, { contentType: "image/jpeg", upsert: false, cacheControl: "3600" });
      if (error) throw error;
      return { photoPath: path, error: null };
    } catch (error) {
      logger.error("Staff dog photo upload failed", error, {
        tags: { component: "useStaffDogPhotoUpload", op: "upload" },
      });
      return { photoPath: null, error };
    }
  }, []);

  /** Best-effort delete of an object nothing points at (a replaced or refused photo). */
  const discardDogPhoto = useCallback(async (path: string | null | undefined, context: string) => {
    if (!supabase || !path) return;
    try {
      const { error } = await supabase.storage.from(DOG_PHOTOS_BUCKET).remove([path]);
      if (error) logger.warn("Dog photo object could not be deleted", { extra: { context, error } });
    } catch (error) {
      logger.warn("Dog photo object could not be deleted", { extra: { context, error } });
    }
  }, []);

  /**
   * What the dog's row points at right now. Used when a save's outcome is
   * unknown (a dropped connection can lose the reply to a committed update):
   * `error` is set when it cannot be read, and the caller then keeps the upload.
   */
  const currentDogPhotoPath = useCallback(async (dogId: string) => {
    if (!supabase) return { photoPath: null, error: new Error("Not connected") };
    try {
      return await getDogPhotoPath(supabase, dogId);
    } catch (error) {
      return { photoPath: null, error: error instanceof Error ? error : new Error(String(error)) };
    }
  }, []);

  return { uploadDogPhoto, discardDogPhoto, currentDogPhotoPath };
}

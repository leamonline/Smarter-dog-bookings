import { useCallback } from "react";
import { supabase } from "../supabase/client";
import { resizeImage } from "../utils/imageResize.js";
import { logger } from "../lib/logger";
import type { Database } from "../supabase/database.types";

type GroomPhotoRow = Database["public"]["Tables"]["groom_photos"]["Row"];
type Client = NonNullable<typeof supabase>;

const BUCKET = "groom-photos";
const SIGNED_URL_TTL_SECONDS = 3600;

/** A groom photo as the gallery renders it: camelCase row plus a 1-hour signed URL. */
export interface GroomPhoto {
  id: string;
  dogId: string;
  bookingId: string | null;
  storagePath: string;
  notes: string;
  takenAt: string | null;
  createdAt: string | null;
  signedUrl: string | null;
}

export interface UploadPhotoArgs {
  dogId: string;
  bookingId?: string | null;
  file: File;
  notes?: string;
  /** YYYY-MM-DD; defaults to today. */
  takenAt?: string | null;
}

export interface UseGroomPhotosResult {
  fetchPhotosForDog: (dogId: string) => Promise<GroomPhoto[]>;
  uploadPhoto: (args: UploadPhotoArgs) => Promise<GroomPhoto | null>;
  deletePhoto: (photoId: string, storagePath: string) => Promise<boolean>;
  updatePhotoNotes: (photoId: string, notes: string) => Promise<boolean>;
}

async function signedUrlFor(client: Client, storagePath: string): Promise<string | null> {
  const { data, error } = await client.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
  if (error) {
    logger.warn("Signed URL failed", {
      extra: { storagePath, error },
    });
  }
  return data?.signedUrl || null;
}

function toGroomPhoto(row: GroomPhotoRow, signedUrl: string | null): GroomPhoto {
  return {
    id: row.id,
    dogId: row.dog_id,
    bookingId: row.booking_id,
    storagePath: row.storage_path,
    notes: row.notes || "",
    takenAt: row.taken_at,
    createdAt: row.created_at,
    signedUrl,
  };
}

/**
 * Staff-only hook for managing groom photos.
 * Returns stable callback functions — no internal state to manage.
 */
export function useGroomPhotos(): UseGroomPhotosResult {
  /**
   * Fetch all photos for a dog, newest first.
   * Each photo gets a 1-hour signed URL for display.
   */
  const fetchPhotosForDog = useCallback(async (dogId: string): Promise<GroomPhoto[]> => {
    if (!supabase) return [];
    const client = supabase;

    const { data, error } = await client
      .from("groom_photos")
      .select("*")
      .eq("dog_id", dogId)
      .order("taken_at", { ascending: false });

    if (error) {
      logger.error("Failed to fetch groom photos:", error);
      return [];
    }

    // Generate signed URLs for each photo
    return Promise.all(
      (data || []).map(async (row) => toGroomPhoto(row, await signedUrlFor(client, row.storage_path))),
    );
  }, []);

  /**
   * Upload a photo: resize → store in bucket → insert DB row.
   */
  const uploadPhoto = useCallback(
    async ({ dogId, bookingId = null, file, notes = "", takenAt = null }: UploadPhotoArgs): Promise<GroomPhoto | null> => {
      if (!supabase) return null;
      const client = supabase;

      // Resize before upload to keep storage lean
      let prepared: Blob;
      let contentType = "image/webp";
      try {
        prepared = await resizeImage(file);
      } catch {
        // Fall back to original file if resize fails
        prepared = file;
        contentType = file.type || "image/jpeg";
      }

      const fileId = crypto.randomUUID();
      const ext = contentType === "image/webp" ? "webp" : file.name.split(".").pop() || "jpg";
      const storagePath = `${dogId}/${fileId}.${ext}`;

      const { error: uploadError } = await client.storage
        .from(BUCKET)
        .upload(storagePath, prepared, { contentType });

      if (uploadError) {
        logger.error("Failed to upload groom photo:", uploadError);
        return null;
      }

      const { data: row, error: insertError } = await client
        .from("groom_photos")
        .insert({
          dog_id: dogId,
          booking_id: bookingId || null,
          storage_path: storagePath,
          notes,
          taken_at: takenAt || new Date().toISOString().slice(0, 10),
        })
        .select()
        .single();

      if (insertError) {
        logger.error("Failed to insert groom photo record:", insertError);
        // Clean up the uploaded file since the DB insert failed
        await client.storage.from(BUCKET).remove([storagePath]);
        return null;
      }

      // Get a signed URL for the newly uploaded photo (a failure here is
      // already logged; the row is still returned).
      return toGroomPhoto(row, await signedUrlFor(client, storagePath));
    },
    [],
  );

  /**
   * Delete a photo from storage and the database.
   */
  const deletePhoto = useCallback(async (photoId: string, storagePath: string): Promise<boolean> => {
    if (!supabase) return false;

    const { error: storageError } = await supabase.storage
      .from(BUCKET)
      .remove([storagePath]);

    if (storageError) {
      logger.error("Failed to delete photo from storage:", storageError);
    }

    const { error: dbError } = await supabase
      .from("groom_photos")
      .delete()
      .eq("id", photoId);

    if (dbError) {
      logger.error("Failed to delete groom photo record:", dbError);
      return false;
    }

    return true;
  }, []);

  /**
   * Update the notes on an existing photo.
   */
  const updatePhotoNotes = useCallback(async (photoId: string, notes: string): Promise<boolean> => {
    if (!supabase) return false;

    const { error } = await supabase
      .from("groom_photos")
      .update({ notes })
      .eq("id", photoId);

    if (error) {
      logger.error("Failed to update photo notes:", error);
      return false;
    }

    return true;
  }, []);

  return { fetchPhotosForDog, uploadPhoto, deletePhoto, updatePhotoNotes };
}

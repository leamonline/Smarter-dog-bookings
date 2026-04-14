import { useCallback } from "react";
import { supabase } from "../supabase/client.js";
import { resizeImage } from "../utils/imageResize.js";

/**
 * Staff-only hook for managing groom photos.
 * Returns stable callback functions — no internal state to manage.
 */
export function useGroomPhotos() {
  /**
   * Fetch all photos for a dog, newest first.
   * Each photo gets a 1-hour signed URL for display.
   */
  const fetchPhotosForDog = useCallback(async (dogId) => {
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("groom_photos")
      .select("*")
      .eq("dog_id", dogId)
      .order("taken_at", { ascending: false });

    if (error) {
      console.error("Failed to fetch groom photos:", error);
      return [];
    }

    // Generate signed URLs for each photo
    const photos = await Promise.all(
      (data || []).map(async (row) => {
        const { data: urlData, error: urlError } = await supabase.storage
          .from("groom-photos")
          .createSignedUrl(row.storage_path, 3600);

        if (urlError) {
          console.warn("Signed URL failed for", row.storage_path, urlError);
        }

        return {
          id: row.id,
          dogId: row.dog_id,
          bookingId: row.booking_id,
          storagePath: row.storage_path,
          notes: row.notes || "",
          takenAt: row.taken_at,
          createdAt: row.created_at,
          signedUrl: urlData?.signedUrl || null,
        };
      }),
    );

    return photos;
  }, []);

  /**
   * Upload a photo: resize → store in bucket → insert DB row.
   */
  const uploadPhoto = useCallback(
    async ({ dogId, bookingId = null, file, notes = "", takenAt = null }) => {
      if (!supabase) return null;

      // Resize before upload to keep storage lean
      let prepared;
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

      const { error: uploadError } = await supabase.storage
        .from("groom-photos")
        .upload(storagePath, prepared, { contentType });

      if (uploadError) {
        console.error("Failed to upload groom photo:", uploadError);
        return null;
      }

      const { data: row, error: insertError } = await supabase
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
        console.error("Failed to insert groom photo record:", insertError);
        // Clean up the uploaded file since the DB insert failed
        await supabase.storage.from("groom-photos").remove([storagePath]);
        return null;
      }

      // Get a signed URL for the newly uploaded photo
      const { data: urlData } = await supabase.storage
        .from("groom-photos")
        .createSignedUrl(storagePath, 3600);

      return {
        id: row.id,
        dogId: row.dog_id,
        bookingId: row.booking_id,
        storagePath: row.storage_path,
        notes: row.notes || "",
        takenAt: row.taken_at,
        createdAt: row.created_at,
        signedUrl: urlData?.signedUrl || null,
      };
    },
    [],
  );

  /**
   * Delete a photo from storage and the database.
   */
  const deletePhoto = useCallback(async (photoId, storagePath) => {
    if (!supabase) return false;

    const { error: storageError } = await supabase.storage
      .from("groom-photos")
      .remove([storagePath]);

    if (storageError) {
      console.error("Failed to delete photo from storage:", storageError);
    }

    const { error: dbError } = await supabase
      .from("groom_photos")
      .delete()
      .eq("id", photoId);

    if (dbError) {
      console.error("Failed to delete groom photo record:", dbError);
      return false;
    }

    return true;
  }, []);

  /**
   * Update the notes on an existing photo.
   */
  const updatePhotoNotes = useCallback(async (photoId, notes) => {
    if (!supabase) return false;

    const { error } = await supabase
      .from("groom_photos")
      .update({ notes })
      .eq("id", photoId);

    if (error) {
      console.error("Failed to update photo notes:", error);
      return false;
    }

    return true;
  }, []);

  return { fetchPhotosForDog, uploadPhoto, deletePhoto, updatePhotoNotes };
}

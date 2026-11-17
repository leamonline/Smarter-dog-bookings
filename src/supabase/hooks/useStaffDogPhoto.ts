// Customer dog photos (20261115120000), staff side: display only. Staff read the
// private dog-photos bucket through the staff_read_dog_photos policy. Lives in
// supabase/hooks so components never touch the client (Debt #12).
import { supabase } from "../client";
import { createSignedUrlHook, DOG_PHOTOS_BUCKET } from "./signedStorageUrl";

const photoUrls = createSignedUrlHook({
  getClient: () => supabase,
  bucket: DOG_PHOTOS_BUCKET,
  label: "Staff dog photo",
});

/**
 * A signed URL for a dog's photo, signed with the staff client and kept fresh
 * while on screen (the salon devices stay open all day). `url` is null while
 * signing, offline (sample data has no photos) or once the photo has failed to
 * load after one retry. Pass `onLoadError` to the <img>.
 */
export const useStaffDogPhotoUrl = photoUrls.useSignedUrl;

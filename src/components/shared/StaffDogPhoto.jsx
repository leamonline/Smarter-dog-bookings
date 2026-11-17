// A customer-added dog photo, shown to staff (20261115120000). Renders nothing
// for a dog without a photo, so cards without one keep their layout. A dog with
// one always gets its frame: the dog's initial shows while the link is signed
// and if the photo will not load, so nothing jumps and no empty box is left.
import { useStaffDogPhotoUrl } from "../../supabase/hooks/useStaffDogPhoto";

export function StaffDogPhoto({ path, dogName = "", size = 56, rounded = "rounded-full", className = "" }) {
  const { url, onLoadError } = useStaffDogPhotoUrl(path);
  if (!path) return null;
  const initial = (dogName || "").trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      data-staff-dog-photo
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden border border-black/10 bg-white/70 font-bold ${rounded} ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
    >
      {url ? (
        <img
          src={url}
          alt={dogName ? `Photo of ${dogName}` : "Dog photo"}
          onError={onLoadError}
          className="h-full w-full object-cover"
        />
      ) : (
        <span aria-hidden="true">{initial}</span>
      )}
    </span>
  );
}

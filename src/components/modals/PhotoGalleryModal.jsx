import { useState, useEffect, useRef } from "react";
import { AccessibleModal } from "../shared/AccessibleModal.tsx";
import { IconGallery } from "../icons/index.jsx";
import { PhotoLightbox } from "./PhotoLightbox.jsx";
import { titleCase, formatDateStr } from "../../utils/text.js";

/**
 * Chronological photo gallery for a dog.
 * Shows all groom photos as a thumbnail grid with dates and notes.
 */
export function PhotoGalleryModal({
  dogId,
  dogName,
  sizeTheme,
  onClose,
  fetchPhotosForDog,
  deletePhoto,
  updatePhotoNotes,
}) {
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [failedIds, setFailedIds] = useState(new Set());
  const mountedRef = useRef(true);

  const gradient = `linear-gradient(135deg, ${sizeTheme.gradient[0]}, ${sizeTheme.gradient[1]})`;

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!dogId || !fetchPhotosForDog) return;
    let cancelled = false;

    setLoading(true);
    setError(null);

    const timeout = setTimeout(() => {
      if (!cancelled && mountedRef.current) {
        setError("Request timed out");
        setLoading(false);
      }
    }, 8000);

    fetchPhotosForDog(dogId)
      .then((data) => {
        clearTimeout(timeout);
        if (!cancelled && mountedRef.current) {
          setPhotos(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        clearTimeout(timeout);
        if (!cancelled && mountedRef.current) {
          setError(err.message || "Unknown error");
          setLoading(false);
        }
      });

    return () => { cancelled = true; clearTimeout(timeout); };
  }, [dogId, fetchPhotosForDog]);

  const handleRetry = () => {
    if (!dogId || !fetchPhotosForDog) return;
    setLoading(true);
    setError(null);

    const timeout = setTimeout(() => {
      if (mountedRef.current) { setError("Request timed out"); setLoading(false); }
    }, 8000);

    fetchPhotosForDog(dogId)
      .then((data) => { clearTimeout(timeout); if (mountedRef.current) { setPhotos(data); setLoading(false); } })
      .catch((err) => { clearTimeout(timeout); if (mountedRef.current) { setError(err.message || "Unknown error"); setLoading(false); } });
  };

  const handleDelete = async (photoId, storagePath) => {
    const ok = await deletePhoto(photoId, storagePath);
    if (ok) {
      setPhotos((prev) => prev.filter((p) => p.id !== photoId));
      setSelectedPhoto(null);
    }
    return ok;
  };

  const handleUpdateNotes = async (photoId, notes) => {
    const ok = await updatePhotoNotes(photoId, notes);
    if (ok) {
      setPhotos((prev) =>
        prev.map((p) => (p.id === photoId ? { ...p, notes } : p)),
      );
      setSelectedPhoto((prev) =>
        prev?.id === photoId ? { ...prev, notes } : prev,
      );
    }
    return ok;
  };

  return (
    <>
      <AccessibleModal
        onClose={onClose}
        titleId="photo-gallery-title"
        className="bg-white rounded-2xl w-[min(420px,95vw)] max-h-[90vh] overflow-auto shadow-[0_8px_32px_rgba(0,0,0,0.18)]"
        zIndex={1100}
      >
        {/* Header */}
        <div
          className="px-5 py-4 rounded-t-2xl flex items-center justify-between"
          style={{ background: gradient }}
        >
          <h2
            id="photo-gallery-title"
            className="text-lg font-extrabold m-0"
            style={{ color: sizeTheme.headerText }}
          >
            {titleCase(dogName)}&apos;s Photos
          </h2>
          <button
            onClick={onClose}
            className="bg-white/20 border-none rounded-lg w-8 h-8 flex items-center justify-center cursor-pointer text-base font-bold shrink-0"
            style={{ color: sizeTheme.headerText }}
          >
            {"\u00D7"}
          </button>
        </div>

        <div className="px-4 py-4">
          {/* Loading */}
          {loading && (
            <div className="text-xs text-slate-400 py-4 text-center">
              Loading photos...
            </div>
          )}

          {/* Error */}
          {!loading && error && (
            <button
              type="button"
              onClick={handleRetry}
              className="text-xs text-brand-coral cursor-pointer py-4 text-center w-full bg-transparent border-none font-inherit"
            >
              Couldn&apos;t load photos. Tap to retry.
            </button>
          )}

          {/* Empty */}
          {!loading && !error && photos.length === 0 && (
            <div className="text-center py-8">
              <IconGallery size={36} colour="#CBD5E1" />
              <p className="text-sm text-slate-400 mt-2 mb-0">
                No photos yet
              </p>
              <p className="text-xs text-slate-400 mt-1 mb-0">
                Use the camera button on a booking to add one.
              </p>
            </div>
          )}

          {/* Photo grid */}
          {!loading && !error && photos.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              {photos.map((photo) => (
                <button
                  key={photo.id}
                  type="button"
                  onClick={() => setSelectedPhoto(photo)}
                  className="bg-transparent border-none p-0 cursor-pointer text-left rounded-xl overflow-hidden transition-transform hover:scale-[1.02] active:scale-[0.98]"
                >
                  <div className="relative aspect-square bg-slate-100 rounded-xl overflow-hidden">
                    {photo.signedUrl && !failedIds.has(photo.id) ? (
                      <img
                        src={photo.signedUrl}
                        alt="Groom photo"
                        className="w-full h-full object-cover"
                        loading="lazy"
                        onError={() => setFailedIds((prev) => new Set(prev).add(photo.id))}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <IconGallery size={24} colour="#CBD5E1" />
                      </div>
                    )}
                  </div>
                  <div className="px-1 pt-1.5">
                    <div className="text-[11px] font-bold text-slate-500">
                      {formatDateStr(photo.takenAt)}
                    </div>
                    {photo.notes && (
                      <div className="text-[11px] text-slate-400 truncate mt-0.5">
                        {photo.notes}
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </AccessibleModal>

      {/* Lightbox */}
      {selectedPhoto && (
        <PhotoLightbox
          photo={selectedPhoto}
          sizeTheme={sizeTheme}
          onClose={() => setSelectedPhoto(null)}
          onDelete={handleDelete}
          onUpdateNotes={handleUpdateNotes}
        />
      )}
    </>
  );
}


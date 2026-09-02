import { useGroomPhotos } from "../../../hooks/useGroomPhotos";
import { PhotoGalleryModal } from "../PhotoGalleryModal.jsx";

/**
 * Sibling modal wrapper for the groom-photo gallery. Owns the
 * useGroomPhotos wiring so the dog card itself never touches photo
 * storage — the hook only runs once staff open the gallery.
 */
export function DogPhotoGallery({ dog, sizeTheme, onClose }) {
  const { fetchPhotosForDog, deletePhoto, updatePhotoNotes } = useGroomPhotos();

  return (
    <PhotoGalleryModal
      dogId={dog.id}
      dogName={dog.name}
      sizeTheme={sizeTheme}
      onClose={onClose}
      fetchPhotosForDog={fetchPhotosForDog}
      deletePhoto={deletePhoto}
      updatePhotoNotes={updatePhotoNotes}
    />
  );
}

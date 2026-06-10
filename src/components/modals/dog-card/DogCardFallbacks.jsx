import { AccessibleModal } from "../../shared/AccessibleModal.tsx";
import { LoadingSpinner } from "../../ui/LoadingSpinner.jsx";

/** Shown while useResolvedDog is fetching a dog beyond the loaded page. */
export function DogCardLoading({ onClose }) {
  return (
    <AccessibleModal
      onClose={onClose}
      titleId="dog-card-title"
      className="bg-white rounded-2xl w-[min(420px,95vw)] shadow-modal"
    >
      <div
        id="dog-card-title"
        className="px-6 py-16 flex flex-col items-center justify-center gap-3"
      >
        <LoadingSpinner />
        <div className="text-sm text-slate-500">Loading dog profile…</div>
      </div>
    </AccessibleModal>
  );
}

/** Shown when the deep-linked dog no longer exists (deleted, bad link). */
export function DogCardNotFound({ onClose }) {
  return (
    <AccessibleModal
      onClose={onClose}
      titleId="dog-card-title"
      className="bg-white rounded-2xl w-[min(420px,95vw)] shadow-modal"
    >
      <div className="px-6 py-12 text-center">
        <div
          id="dog-card-title"
          className="text-base font-extrabold text-slate-800 mb-2"
        >
          Dog not found
        </div>
        <div className="text-sm text-slate-500 mb-5">
          This dog may have been deleted or the link is broken.
        </div>
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 rounded-lg bg-slate-800 text-white text-sm font-bold cursor-pointer font-inherit"
        >
          Close
        </button>
      </div>
    </AccessibleModal>
  );
}

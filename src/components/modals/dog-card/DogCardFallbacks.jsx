import { ModalShell } from "../shell/index.js";
import { LoadingSpinner } from "../../ui/LoadingSpinner.jsx";

/** Shown while useResolvedDog is fetching a dog beyond the loaded page. */
export function DogCardLoading({ onClose }) {
  return (
    <ModalShell
      onClose={onClose}
      titleId="dog-card-title"
      accent="var(--color-border-default, #E7E5E4)"
      widthClass="w-[min(520px,95vw)]"
    >
      <div
        id="dog-card-title"
        className="px-6 py-16 flex flex-col items-center justify-center gap-3"
      >
        <LoadingSpinner label="Loading dog profile…" />
      </div>
    </ModalShell>
  );
}

/** Shown when the deep-linked dog no longer exists (deleted, bad link). */
export function DogCardNotFound({ onClose }) {
  return (
    <ModalShell
      onClose={onClose}
      titleId="dog-card-title"
      accent="var(--color-border-default, #E7E5E4)"
      widthClass="w-[min(520px,95vw)]"
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
          className="px-4 py-2 rounded-full bg-brand-purple text-white text-sm font-bold cursor-pointer font-inherit border-none"
        >
          Close
        </button>
      </div>
    </ModalShell>
  );
}

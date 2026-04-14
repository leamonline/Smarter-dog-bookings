import { useState } from "react";
import { AccessibleModal } from "../shared/AccessibleModal.tsx";
import { ConfirmDialog } from "../shared/ConfirmDialog.jsx";
import { MODAL_INPUT_CLS } from "./booking-detail/shared.jsx";
import { formatDateStr } from "../../utils/text.js";

/**
 * Full-screen lightbox for viewing a single groom photo.
 * Supports inline notes editing and deletion with confirmation.
 */
export function PhotoLightbox({
  photo,
  sizeTheme,
  onClose,
  onDelete,
  onUpdateNotes,
}) {
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesValue, setNotesValue] = useState(photo.notes);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const gradient = `linear-gradient(135deg, ${sizeTheme.gradient[0]}, ${sizeTheme.gradient[1]})`;

  const formattedDate = formatDateStr(photo.takenAt);

  const handleSaveNotes = async () => {
    const trimmed = notesValue.trim();
    if (trimmed !== photo.notes) {
      await onUpdateNotes(photo.id, trimmed);
    }
    setEditingNotes(false);
  };

  const handleDelete = async () => {
    setDeleting(true);
    const ok = await onDelete(photo.id, photo.storagePath);
    setDeleting(false);
    if (ok) onClose();
  };

  return (
    <>
      <AccessibleModal
        onClose={onClose}
        titleId="photo-lightbox-title"
        className="bg-white rounded-2xl w-[min(440px,95vw)] max-h-[92vh] overflow-auto shadow-[0_8px_32px_rgba(0,0,0,0.22)]"
        zIndex={1200}
      >
        {/* Image */}
        <div className="relative bg-slate-900 rounded-t-2xl">
          <img
            src={photo.signedUrl}
            alt="Groom photo"
            className="w-full max-h-[55vh] object-contain rounded-t-2xl"
          />
          <button
            onClick={onClose}
            className="absolute top-3 right-3 bg-black/50 text-white border-none rounded-full w-8 h-8 flex items-center justify-center cursor-pointer text-base font-bold"
          >
            {"\u00D7"}
          </button>
        </div>

        {/* Details */}
        <div className="px-5 py-4">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1">
            {formattedDate}
          </div>

          {/* Notes — view or edit */}
          {editingNotes ? (
            <div className="mt-2">
              <textarea
                value={notesValue}
                onChange={(e) => setNotesValue(e.target.value)}
                rows={3}
                className={`${MODAL_INPUT_CLS} resize-none`}
                autoFocus
              />
              <div className="flex gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => { setNotesValue(photo.notes); setEditingNotes(false); }}
                  className="text-xs font-semibold text-slate-500 bg-transparent border-none cursor-pointer font-inherit px-0"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveNotes}
                  className="text-xs font-bold bg-transparent border-none cursor-pointer font-inherit px-0"
                  style={{ color: sizeTheme.gradient[0] }}
                >
                  Save Notes
                </button>
              </div>
            </div>
          ) : (
            <div
              onClick={() => setEditingNotes(true)}
              className="text-sm text-slate-700 leading-relaxed cursor-pointer hover:bg-slate-50 rounded-lg px-2 py-1.5 -mx-2 transition-colors"
              title="Tap to edit notes"
            >
              {photo.notes || (
                <span className="text-slate-400 italic">Tap to add notes...</span>
              )}
            </div>
          )}

          {/* Delete */}
          <div className="mt-4 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={deleting}
              className="text-xs font-bold text-brand-coral bg-transparent border-none cursor-pointer font-inherit px-0 transition-opacity disabled:opacity-50"
            >
              {deleting ? "Deleting..." : "Delete Photo"}
            </button>
          </div>
        </div>
      </AccessibleModal>

      {showDeleteConfirm && (
        <ConfirmDialog
          title="Delete this photo?"
          message="This will permanently remove the photo and any notes."
          confirmLabel="Delete"
          variant="danger"
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </>
  );
}


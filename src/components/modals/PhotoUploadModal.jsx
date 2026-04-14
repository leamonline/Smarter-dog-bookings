import { useState, useRef, useEffect } from "react";
import { AccessibleModal } from "../shared/AccessibleModal.tsx";
import { IconCamera } from "../icons/index.jsx";
import { MODAL_INPUT_CLS } from "./booking-detail/shared.jsx";

/**
 * Modal for capturing/uploading a groom photo with optional notes.
 * Opens on top of the booking detail modal (zIndex 1100).
 */
export function PhotoUploadModal({
  dogId,
  bookingId,
  bookingDate,
  sizeTheme,
  onClose,
  onSaved,
  uploadPhoto,
}) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  // Revoke object URL on unmount to prevent memory leaks
  useEffect(() => {
    return () => { if (preview) URL.revokeObjectURL(preview); };
  }, [preview]);

  const gradient = `linear-gradient(135deg, ${sizeTheme.gradient[0]}, ${sizeTheme.gradient[1]})`;

  const handleFileChange = (e) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    if (preview) URL.revokeObjectURL(preview);
    setFile(selected);
    setPreview(URL.createObjectURL(selected));
    setError("");
  };

  const handleSave = async () => {
    if (!file) {
      setError("Please select or take a photo first.");
      return;
    }
    setSaving(true);
    setError("");

    const result = await uploadPhoto({
      dogId,
      bookingId,
      file,
      notes: notes.trim(),
      takenAt: bookingDate || null,
    });

    setSaving(false);

    if (result) {
      onSaved?.();
      onClose();
    } else {
      setError("Failed to save photo. Please try again.");
    }
  };

  return (
    <AccessibleModal
      onClose={onClose}
      titleId="photo-upload-title"
      className="bg-white rounded-2xl w-[min(380px,92vw)] max-h-[90vh] overflow-auto shadow-[0_8px_32px_rgba(0,0,0,0.18)]"
      zIndex={1100}
    >
      {/* Header */}
      <div
        className="px-5 py-4 rounded-t-2xl flex items-center justify-between"
        style={{ background: gradient }}
      >
        <h2
          id="photo-upload-title"
          className="text-lg font-extrabold m-0"
          style={{ color: sizeTheme.headerText }}
        >
          Add Groom Photo
        </h2>
        <button
          onClick={onClose}
          className="bg-white/20 border-none rounded-lg w-8 h-8 flex items-center justify-center cursor-pointer text-base font-bold shrink-0"
          style={{ color: sizeTheme.headerText }}
        >
          {"\u00D7"}
        </button>
      </div>

      <div className="px-5 py-4 flex flex-col gap-4">
        {/* Capture / select zone */}
        {!preview ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="w-full aspect-square max-h-60 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors hover:border-slate-400 hover:bg-slate-100"
          >
            <IconCamera size={40} colour="#94A3B8" />
            <span className="text-sm font-semibold text-slate-400">
              Tap to take or choose a photo
            </span>
          </button>
        ) : (
          <div className="relative">
            <img
              src={preview}
              alt="Preview"
              className="w-full max-h-60 object-cover rounded-xl"
            />
            <button
              type="button"
              onClick={() => {
                if (preview) URL.revokeObjectURL(preview);
                setFile(null);
                setPreview(null);
                if (inputRef.current) inputRef.current.value = "";
              }}
              className="absolute top-2 right-2 bg-black/50 text-white border-none rounded-full w-7 h-7 flex items-center justify-center cursor-pointer text-sm font-bold"
            >
              {"\u00D7"}
            </button>
          </div>
        )}

        {/* Hidden file input — accept images, prefer rear camera on mobile */}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileChange}
          className="hidden"
        />

        {/* Notes */}
        <div>
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1 block">
            Notes (optional)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. matted ears, skin irritation on back leg..."
            rows={3}
            className={`${MODAL_INPUT_CLS} resize-none`}
          />
        </div>

        {/* Error */}
        {error && (
          <p className="text-xs text-brand-coral font-semibold m-0">{error}</p>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 text-sm font-bold cursor-pointer font-inherit transition-colors hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !file}
            className="flex-1 py-2.5 rounded-xl border-none text-white text-sm font-bold cursor-pointer font-inherit transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: gradient }}
          >
            {saving ? "Saving..." : "Save Photo"}
          </button>
        </div>
      </div>
    </AccessibleModal>
  );
}

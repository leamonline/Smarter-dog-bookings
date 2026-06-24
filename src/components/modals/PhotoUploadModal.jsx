import { useState, useRef, useEffect } from "react";
import { X } from "lucide-react";
import { ModalShell, HeaderIconButton } from "./shell/index.js";
import { IconCamera } from "../icons/index.jsx";
import { InlineError } from "../ui/InlineError.jsx";
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
    <ModalShell
      onClose={onClose}
      titleId="photo-upload-title"
      accent={sizeTheme.primary}
      widthClass="w-[min(420px,92vw)]"
      maxHeightClass="max-h-[90vh]"
      zIndex={1100}
      bodyClassName="px-5 py-4 flex flex-col gap-4"
      rootClassName="bm-fields"
      header={
        <header className="flex items-start justify-between gap-3 px-5 pt-5 pb-4 bg-[var(--color-brand-paper)]">
          <div className="flex-1 min-w-0">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Groom photo
            </span>
            <h2
              id="photo-upload-title"
              className="text-xl md:text-2xl font-bold font-display text-brand-purple leading-tight mt-1"
            >
              Add Groom Photo
            </h2>
          </div>
          <HeaderIconButton label="Close" onClick={onClose}>
            <X size={16} strokeWidth={2.2} aria-hidden="true" />
          </HeaderIconButton>
        </header>
      }
      footer={
        <div className="border-t border-slate-100 bg-white px-5 py-3 flex items-center gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 max-sm:min-h-[44px] rounded-control border-[1.5px] border-slate-200 bg-white text-slate-600 text-sm font-bold cursor-pointer font-inherit transition-colors hover:bg-slate-50 inline-flex items-center justify-center"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !file}
            className="ml-auto px-5 py-2 max-sm:min-h-[44px] rounded-full border-none bg-action text-on-action text-sm font-bold cursor-pointer font-inherit transition-colors hover:bg-brand-yellow-dark disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 inline-flex items-center justify-center"
          >
            {saving ? "Saving..." : "Save Photo"}
          </button>
        </div>
      }
    >
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
              aria-label="Remove selected photo"
              className="tap-target absolute top-2 right-2 bg-black/50 text-white border-none rounded-full w-7 h-7 flex items-center justify-center cursor-pointer text-sm font-bold"
            >
              <span aria-hidden="true">{"\u00D7"}</span>
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
        <InlineError message={error} />
    </ModalShell>
  );
}

import { useState } from "react";
import { IconTick, IconReopen } from "../../icons/index.jsx";
import { useToast } from "../../../contexts/ToastContext.jsx";
import { ConfirmDialog } from "../../shared/ConfirmDialog.jsx";
import { ConfirmDeleteModal } from "../ConfirmDeleteModal.jsx";

export function BookingActions({
  isEditing,
  editData,
  saving,
  booking,
  sizeTheme,
  onSave,
  onCancelEdit,
  onAdd,
  onRemove,
  onUpdate,
  currentDateStr,
  onClose,
  onReschedule,
  autosaveStatus,
}) {
  const toast = useToast();
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  if (isEditing) {
    return (
      <div className="px-6 py-4 pb-5 flex flex-col gap-2 bg-slate-50 border-t border-slate-200">
        {autosaveStatus && autosaveStatus !== "idle" && (
          <div className="text-[11px] font-semibold text-slate-400 text-right">
            {autosaveStatus === "saving" ? "Saving..." : "Saved"}
          </div>
        )}
        <div className="flex gap-2.5">
        <button
          onClick={onSave}
          disabled={!editData.slot || saving}
          className="flex-1 py-3 rounded-[10px] border-none text-[13px] font-bold cursor-pointer font-inherit flex items-center justify-center gap-1.5 transition-colors disabled:cursor-not-allowed"
          style={{
            background:
              !editData.slot || saving ? "#E5E7EB" : sizeTheme.gradient[0],
            color:
              !editData.slot || saving ? "#6B7280" : sizeTheme.headerText,
          }}
        >
          <IconTick size={16} colour={!editData.slot || saving ? "#6B7280" : sizeTheme.headerText} />{" "}
          {saving ? "Saving..." : "Save Changes"}
        </button>
        <button
          onClick={onCancelEdit}
          className="flex-1 py-3 rounded-[10px] border-[1.5px] border-slate-200 text-[13px] font-bold cursor-pointer font-inherit flex items-center justify-center gap-1.5 bg-white text-slate-500 transition-colors hover:bg-slate-50"
        >
          Cancel
        </button>
        </div>
      </div>
    );
  }

  const canSoftCancel = typeof onUpdate === "function" && booking?.status !== "Cancelled";

  return (
    <div className="px-4 pt-2 pb-5 flex gap-2 bg-slate-50/80">
      {onReschedule && (
        <button
          onClick={onReschedule}
          aria-label="Reschedule booking"
          className="flex-1 py-3 rounded-xl border-[1.5px] border-amber-300 text-[13px] font-bold text-amber-800 bg-white hover:bg-amber-50 active:bg-amber-100 cursor-pointer font-inherit flex items-center justify-center gap-1.5 transition-all duration-150 hover:-translate-y-0.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:shadow-[0_4px_10px_-2px_rgba(251,191,36,0.25)] focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1"
        >
          <IconReopen size={14} colour="#92400E" />
          <span>Reschedule</span>
        </button>
      )}
      <button
        onClick={() => setShowCancelConfirm(true)}
        disabled={!canSoftCancel}
        aria-label="Cancel booking"
        className="flex-1 py-3 rounded-xl border-[1.5px] border-rose-300 text-[13px] font-bold text-rose-700 bg-white hover:bg-rose-50 active:bg-rose-100 cursor-pointer font-inherit flex items-center justify-center gap-1.5 transition-all duration-150 hover:-translate-y-0.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:shadow-[0_4px_10px_-2px_rgba(244,63,94,0.25)] focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:bg-white"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#9F1239" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="8" cy="8" r="6" />
          <line x1="5" y1="5" x2="11" y2="11" />
          <line x1="11" y1="5" x2="5" y2="11" />
        </svg>
        <span>Cancel</span>
      </button>
      <button
        onClick={() => setShowDeleteConfirm(true)}
        aria-label="Delete booking"
        className="flex-1 py-3 rounded-xl border-[1.5px] border-rose-500 text-[13px] font-bold text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 cursor-pointer font-inherit flex items-center justify-center gap-1.5 transition-all duration-150 hover:-translate-y-0.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:shadow-[0_4px_10px_-2px_rgba(190,18,60,0.35)] focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-600 focus-visible:ring-offset-1"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
          <path d="M10 11v6M14 11v6" />
          <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
        </svg>
        <span>Delete</span>
      </button>

      {showCancelConfirm && (
        <ConfirmDialog
          title="Cancel this booking?"
          message={
            canSoftCancel
              ? "The booking will be marked as cancelled and removed from today's grid, but kept on file for your records."
              : "This booking will be removed from the schedule."
          }
          confirmLabel="Yes, cancel it"
          cancelLabel="Keep booking"
          variant="danger"
          onConfirm={async () => {
            setShowCancelConfirm(false);
            const previousStatus = booking.status || "Booked";
            if (canSoftCancel) {
              await onUpdate(
                { ...booking, status: "Cancelled" },
                currentDateStr,
                currentDateStr,
              );
              toast.show(
                "Booking cancelled",
                "success",
                () =>
                  onUpdate(
                    { ...booking, status: previousStatus },
                    currentDateStr,
                    currentDateStr,
                  ),
              );
              onClose();
            } else {
              const result = await onRemove(booking.id);
              if (result !== false) {
                toast.show(
                  "Booking cancelled",
                  "success",
                  onAdd ? () => onAdd(booking) : undefined,
                );
                onClose();
              }
            }
          }}
          onCancel={() => setShowCancelConfirm(false)}
        />
      )}

      {showDeleteConfirm && (
        <ConfirmDeleteModal
          title="Delete this booking?"
          message={
            <>
              This permanently removes the booking from your records. Use{" "}
              <strong>Cancel</strong> instead if you want to keep it on file.
            </>
          }
          cascadeWarning="This can't be undone."
          confirmLabel="Delete booking"
          onConfirm={async () => {
            const result = await onRemove(booking.id);
            setShowDeleteConfirm(false);
            if (result !== false) {
              toast.show("Booking deleted", "success");
              onClose();
            }
          }}
          onClose={() => setShowDeleteConfirm(false)}
        />
      )}
    </div>
  );
}

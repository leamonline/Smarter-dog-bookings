import { useState } from "react";
import { IconTick, IconReopen } from "../../icons/index.jsx";
import { useToast } from "../../../contexts/ToastContext.jsx";
import { ConfirmDialog } from "../../shared/ConfirmDialog.jsx";
import { ConfirmDeleteModal } from "../ConfirmDeleteModal.jsx";
import { BOOKING_STATUS } from "../../../constants/salon";

export function BookingActions({
  isEditing,
  editData,
  saving,
  booking,
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
      <div className="px-5 py-3 flex flex-col gap-2 bg-white border-t border-slate-100">
        {autosaveStatus && autosaveStatus !== "idle" && (
          <div className="text-[11px] font-semibold text-slate-400 text-right">
            {autosaveStatus === "saving" ? "Saving..." : "Saved"}
          </div>
        )}
        <div className="flex gap-2.5">
        <button
          onClick={onCancelEdit}
          className="px-4 py-2 rounded-control border-[1.5px] border-slate-200 text-sm font-bold cursor-pointer font-inherit bg-white text-slate-600 transition-colors hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          onClick={onSave}
          disabled={!editData.slot || saving}
          className="ml-auto flex-1 max-w-[220px] py-2 px-5 rounded-full border-none text-sm font-bold cursor-pointer font-inherit flex items-center justify-center gap-1.5 transition-colors bg-action text-on-action hover:bg-brand-yellow-dark disabled:bg-slate-200 disabled:text-slate-500 disabled:cursor-not-allowed"
        >
          <IconTick size={15} colour="currentColor" />{" "}
          {saving ? "Saving..." : "Save Changes"}
        </button>
        </div>
      </div>
    );
  }

  const canSoftCancel = typeof onUpdate === "function" && booking?.status !== BOOKING_STATUS.CANCELLED;

  return (
    <div className="px-5 max-[400px]:px-3 pt-3 pb-3 bg-white border-t border-slate-100">
      <div className="flex gap-2 max-[400px]:flex-col">
        {onReschedule && (
          <button
            onClick={onReschedule}
            aria-label="Reschedule booking"
            className="flex-1 py-2.5 rounded-full border-[1.5px] border-slate-200 text-[13px] font-bold text-brand-purple bg-white hover:bg-slate-50 active:bg-slate-100 cursor-pointer font-inherit flex items-center justify-center gap-1.5 transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-1"
          >
            <IconReopen size={14} colour="#475569" />
            <span>Reschedule</span>
          </button>
        )}
        <button
          onClick={() => setShowCancelConfirm(true)}
          disabled={!canSoftCancel}
          aria-label="Cancel booking"
          className="flex-1 py-2.5 rounded-full border-[1.5px] border-rose-200 text-[13px] font-bold text-rose-600 bg-white hover:bg-rose-50 active:bg-rose-100 cursor-pointer font-inherit flex items-center justify-center gap-1.5 transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 focus-visible:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="8" cy="8" r="6" />
            <line x1="5" y1="5" x2="11" y2="11" />
            <line x1="11" y1="5" x2="5" y2="11" />
          </svg>
          <span>Cancel</span>
        </button>
      </div>
      <div className="mt-2 flex justify-center">
        <button
          onClick={() => setShowDeleteConfirm(true)}
          aria-label="Delete booking"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold text-slate-400 hover:text-rose-600 bg-transparent border-none cursor-pointer font-inherit transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 focus-visible:ring-offset-1"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6M14 11v6" />
            <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
          </svg>
          <span>Delete</span>
        </button>
      </div>

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
            const previousStatus = booking.status || BOOKING_STATUS.BOOKED;
            if (canSoftCancel) {
              await onUpdate(
                { ...booking, status: BOOKING_STATUS.CANCELLED },
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

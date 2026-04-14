import { useState } from "react";
import { IconTick } from "../../icons/index.jsx";
import { useToast } from "../../../contexts/ToastContext.jsx";
import { ConfirmDialog } from "../../shared/ConfirmDialog.jsx";

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
  onClose,
  onReschedule,
  autosaveStatus,
}) {
  const toast = useToast();
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

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

  return (
    <div
      className="px-4 pt-1 pb-5 flex gap-2.5"
      style={{ background: sizeTheme.light }}
    >
      {onReschedule && (
        <button
          onClick={onReschedule}
          className="flex-1 py-3 rounded-xl border-2 text-[13px] font-bold cursor-pointer font-inherit flex items-center justify-center transition-all bg-white"
          style={{
            borderColor: sizeTheme.primary,
            color: sizeTheme.primary,
          }}
        >
          Reschedule
        </button>
      )}
      <button
        onClick={() => setShowCancelConfirm(true)}
        className="flex-1 py-3 rounded-xl border-2 text-[13px] font-bold cursor-pointer font-inherit flex items-center justify-center transition-all bg-white hover:bg-brand-coral-light"
        style={{
          borderColor: "#E8567F",
          color: "#E8567F",
        }}
      >
        Cancel Booking
      </button>

      {showCancelConfirm && (
        <ConfirmDialog
          title="Cancel this booking?"
          message="This booking will be removed from the schedule."
          confirmLabel="Cancel booking"
          variant="danger"
          onConfirm={async () => {
            setShowCancelConfirm(false);
            const result = await onRemove(booking.id);
            if (result !== false) {
              toast.show("Booking cancelled", "success", onAdd ? () => onAdd(booking) : undefined);
              onClose();
            }
          }}
          onCancel={() => setShowCancelConfirm(false)}
        />
      )}
    </div>
  );
}

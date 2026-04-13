import { useState } from "react";
import {
  IconTick,
  IconEdit,
  IconMessage,
  IconBlock,
} from "../../icons/index.jsx";
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
  onEnterEdit,
  onShowContact,
  onAdd,
  onRemove,
  onClose,
  onRebook,
  onAddToCalendar,
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
    <div className="px-6 py-4 pb-5 flex flex-col gap-2.5 bg-slate-50 border-t border-slate-200">
      <div className="flex gap-2.5">
        <button
          onClick={onEnterEdit}
          className="flex-1 py-3 rounded-[10px] border-none text-[13px] font-bold cursor-pointer font-inherit flex items-center justify-center gap-1.5 transition-colors"
          style={{
            background: sizeTheme.gradient[0],
            color: sizeTheme.headerText,
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.background = sizeTheme.primary)
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.background = sizeTheme.gradient[0])
          }
        >
          <IconEdit size={16} colour={sizeTheme.headerText} /> Edit
        </button>
        <button
          onClick={onShowContact}
          className="flex-1 py-3 rounded-[10px] border-none text-[13px] font-bold cursor-pointer font-inherit flex items-center justify-center gap-1.5 bg-brand-teal text-white transition-colors hover:bg-[#236b5d]"
        >
          <IconMessage size={16} colour="#FFFFFF" /> Message
        </button>
        <button
          onClick={() => setShowCancelConfirm(true)}
          className="flex-1 py-3 rounded-[10px] border-none text-[13px] font-bold cursor-pointer font-inherit flex items-center justify-center gap-1.5 bg-brand-coral-light text-brand-coral transition-colors hover:bg-[#fbd4df]"
        >
          <IconBlock size={16} colour="#E8567F" /> Cancel
        </button>
      </div>
      {onAddToCalendar && (
        <button
          onClick={() => onAddToCalendar(booking.id)}
          className="w-full py-2.5 rounded-[10px] border border-slate-200 text-[12px] font-semibold cursor-pointer font-inherit flex items-center justify-center gap-1.5 bg-white text-slate-500 transition-colors hover:bg-slate-50 hover:text-brand-teal"
        >
          {"\uD83D\uDCC5"} Add to calendar
        </button>
      )}
      {onReschedule && (
        <button
          onClick={onReschedule}
          className="w-full py-3 rounded-[10px] border-2 text-[13px] font-bold cursor-pointer font-inherit flex items-center justify-center gap-1.5 transition-all"
          style={{
            borderColor: sizeTheme.gradient[0],
            background: sizeTheme.light,
            color: sizeTheme.primary,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = sizeTheme.gradient[0];
            e.currentTarget.style.color = sizeTheme.headerText;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = sizeTheme.light;
            e.currentTarget.style.color = sizeTheme.primary;
          }}
        >
          {"\uD83D\uDCC5"} Reschedule
        </button>
      )}
      {booking.status === "Ready for pick-up" && onRebook && (
        <button
          onClick={() => {
            onRebook(booking);
            onClose();
          }}
          className="w-full py-3 rounded-[10px] border-2 text-[13px] font-bold cursor-pointer font-inherit flex items-center justify-center gap-1.5 transition-all"
          style={{
            borderColor: sizeTheme.gradient[0],
            background: sizeTheme.light,
            color: sizeTheme.primary,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = sizeTheme.gradient[0];
            e.currentTarget.style.color = sizeTheme.headerText;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = sizeTheme.light;
            e.currentTarget.style.color = sizeTheme.primary;
          }}
        >
          {"\uD83D\uDD01"} Rebook this dog
        </button>
      )}

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

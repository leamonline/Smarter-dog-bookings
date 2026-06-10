import { useNavigate } from "react-router-dom";
import {
  canBookSlot,
  getSeatStatesForSlot,
  isCapacityRejection,
} from "../../../engine/capacity";
import { formatFullDate } from "../../../engine/utils";
import { titleCase } from "../../../utils/text";
import { DetailRow, LogisticsLabel, SectionCard, Row } from "./shared.jsx";

/**
 * Card 1 of the booking detail surface: appointment summary. Edit mode
 * exposes the date row (delegating to the lazy date picker via
 * onOpenDatePicker), the capacity-aware slot grid and grooming notes;
 * read mode shows the static time/owner/notes rows plus the WhatsApp
 * source link when the booking originated from a conversation.
 */
export function AppointmentDetailsCard({
  booking,
  isEditing,
  editData,
  setEditData,
  setSaveError,
  currentDateObj,
  primaryHuman,
  onOpenHuman,
  onOpenDatePicker,
  editActiveSlots,
  otherBookings,
  editSettings,
  sizeTheme,
}) {
  const navigate = useNavigate();

  if (isEditing) {
    return (
      <SectionCard title="Appointment Details">
        <DetailRow
          label={<LogisticsLabel text="Date" />}
          value={formatFullDate(editData.date)}
          editNode={
            <button
              onClick={onOpenDatePicker}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-[13px] outline-none font-inherit text-slate-800 box-border bg-white cursor-pointer flex justify-between items-center"
            >
              <span className="font-semibold">{formatFullDate(editData.date)}</span>
              <span className="text-sm">{"📅"}</span>
            </button>
          }
          verticalEdit
          isEditing={isEditing}
        />
        <DetailRow
          label={<LogisticsLabel text="Drop-off time" />}
          value={editData.slot || <span className="text-brand-coral">None selected</span>}
          editNode={
            <div className="grid grid-cols-[repeat(auto-fill,minmax(70px,1fr))] gap-1.5 w-full">
              {editActiveSlots.length > 0 ? (
                editActiveSlots.map((slot) => {
                  const check = canBookSlot(otherBookings, slot, booking.size, editActiveSlots, { overrides: editSettings.overrides?.[slot] || {}, dogId: booking._dogId, staffOverride: true });
                  const allowed = check.allowed;
                  const isOverride = !allowed && isCapacityRejection(check.reason);
                  const isClickable = allowed || isOverride;
                  const seatStates = getSeatStatesForSlot(otherBookings, slot, editActiveSlots, editSettings.overrides?.[slot] || {});
                  const isStaffOpened = seatStates.some((seat) => seat.staffOpened);
                  const isSelected = editData.slot === slot;
                  return (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => { if (!isClickable) return; setEditData((prev) => ({ ...prev, slot })); setSaveError(""); }}
                      disabled={!isClickable}
                      title={isOverride ? "Over capacity. Save will prompt for override." : undefined}
                      aria-label={isOverride ? `${slot} — over capacity, click to override` : slot}
                      className="py-2 rounded-lg text-[13px] font-semibold text-center"
                      style={{
                        cursor: isClickable ? "pointer" : "not-allowed",
                        background: isSelected
                          ? sizeTheme.primary
                          : isOverride
                            ? "#FFFBEB"
                            : isStaffOpened
                              ? sizeTheme.light
                              : "#FFFFFF",
                        color: isSelected
                          ? sizeTheme.headerText
                          : allowed
                            ? "#1F2937"
                            : isOverride
                              ? "#92400E"
                              : "#6B7280",
                        border: `1.5px solid ${
                          isSelected
                            ? sizeTheme.primary
                            : isOverride
                              ? "#F59E0B"
                              : isStaffOpened
                                ? sizeTheme.primary
                                : "#E5E7EB"
                        }`,
                        opacity: isClickable ? 1 : 0.5,
                      }}
                    >
                      {slot}
                      {isOverride && !isSelected && (
                        <div className="text-[9px] font-bold mt-0.5 leading-none">over</div>
                      )}
                    </button>
                  );
                })
              ) : (
                <span className="text-[13px] text-brand-coral font-semibold col-span-full">No available slots on this date</span>
              )}
            </div>
          }
          verticalEdit
          isEditing={isEditing}
        />
        <DetailRow
          label={<LogisticsLabel text="Owner" />}
          value={titleCase(booking.owner)}
          isEditing={isEditing}
        />
        <DetailRow
          label={<LogisticsLabel text="Grooming Notes" />}
          value={<span style={{ whiteSpace: "pre-wrap" }}>{editData.groomNotes || "Standard groom (no specific notes)"}</span>}
          editNode={
            <textarea value={editData.groomNotes} onChange={(e) => setEditData((prev) => ({ ...prev, groomNotes: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-[13px] outline-none font-inherit text-slate-800 box-border resize-y min-h-[44px] text-right" />
          }
          isEditing={isEditing}
        />
      </SectionCard>
    );
  }

  return (
    <div className="bg-white rounded-2xl border-[1.5px] border-slate-200 mb-3 px-4">
      <Row
        label="Time & Date"
        value={`${booking.slot} · ${formatFullDate(currentDateObj)}`}
      />
      <Row
        label="Owner"
        value={titleCase(booking.owner)}
        onClick={() => onOpenHuman?.(primaryHuman?.id || booking._ownerId || booking.owner)}
      />
      <Row
        label="Grooming Notes"
        value={editData.groomNotes || "Standard groom (no specific notes)"}
        last={!booking.whatsappConversationId}
      />
      {booking.whatsappConversationId && (
        <Row
          label="Source"
          value={
            <a
              href={`/inbox?conversation=${booking.whatsappConversationId}`}
              onClick={(e) => {
                e.preventDefault();
                navigate(`/inbox?conversation=${booking.whatsappConversationId}`);
              }}
              className="text-emerald-700 underline font-semibold hover:text-emerald-900"
            >
              Created from WhatsApp · open thread
            </a>
          }
          last
        />
      )}
    </div>
  );
}

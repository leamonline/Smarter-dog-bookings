import { useState } from "react";
import { BRAND, SERVICES, BOOKING_STATUSES } from "../../constants/index.js";
import { SizeTag } from "../ui/SizeTag.jsx";
import { StaffIconBtn } from "../ui/StaffIconBtn.jsx";
import { IconEdit, IconMessage } from "../icons/index.jsx";
import { BookingDetailModal } from "../modals/BookingDetailModal.jsx";
import { ContactPopup } from "../modals/ContactPopup.jsx";

const ICON_COL_STYLE = {
  width: 28, minWidth: 28, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
};

export function BookingCard({ booking, onRemove, onOpenHuman, onOpenDog, onUpdate, currentDateStr, currentDateObj, bookingsByDate, dayOpenState, dogs, humans, onUpdateDog, onRebook }) {
  const [showDetail, setShowDetail] = useState(false);
  const [showContact, setShowContact] = useState(false);
  const service = SERVICES.find((s) => s.id === booking.service);

  const currentStatus = booking.status || "Not Arrived";
  const statusObj = BOOKING_STATUSES.find(s => s.id === currentStatus) || BOOKING_STATUSES[0];
  const currentIdx = BOOKING_STATUSES.findIndex(s => s.id === currentStatus);
  const nextStatus = currentIdx < BOOKING_STATUSES.length - 1 ? BOOKING_STATUSES[currentIdx + 1] : null;

  const handleAdvanceStatus = (e) => {
    e.stopPropagation();
    if (nextStatus) {
      onUpdate({ ...booking, status: nextStatus.id }, currentDateStr, currentDateStr);
    }
  };

  return (
    <>
      <div onClick={() => setShowDetail(true)} style={{
        display: "flex", alignItems: "center", gap: 8, background: BRAND.white,
        border: `1px solid ${BRAND.greyLight}`, borderRadius: 10, padding: "6px 10px",
        fontSize: 13, cursor: "pointer", minHeight: 42, boxSizing: "border-box",
        transition: "all 0.15s", borderLeft: `3px solid ${statusObj.color}`,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = BRAND.blue; e.currentTarget.style.borderLeftColor = statusObj.color; e.currentTarget.style.boxShadow = "0 1px 6px rgba(0,184,224,0.15)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = BRAND.greyLight; e.currentTarget.style.borderLeftColor = statusObj.color; e.currentTarget.style.boxShadow = "none"; }}>
        <div style={ICON_COL_STYLE}><SizeTag size={booking.size} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, color: BRAND.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {booking.confirmed && <span title="Confirmed" style={{ color: BRAND.openGreen, marginRight: 3, fontSize: 11 }}>{"\u2713"}</span>}
            <span style={{ cursor: "pointer", borderBottom: `1px dashed ${BRAND.blue}`, color: BRAND.blueDark }} onClick={(e) => { e.stopPropagation(); onOpenDog && onOpenDog(booking.dogName); }}>{booking.dogName}</span>
            <span style={{ fontWeight: 400, color: BRAND.textLight, marginLeft: 4, fontSize: 12 }}>({booking.breed})</span>
          </div>
          <div style={{ fontSize: 11, color: BRAND.textLight }}>
            {service?.icon} {service?.name} {"\u00B7"} <span style={{ cursor: "pointer", borderBottom: `1px dashed ${BRAND.blue}`, color: BRAND.blueDark }} onClick={(e) => { e.stopPropagation(); onOpenHuman && onOpenHuman(booking.owner); }}>{booking.owner}</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
          {nextStatus && (
            <button onClick={handleAdvanceStatus} title={`Advance to: ${nextStatus.label}`} style={{
              background: nextStatus.bg, color: nextStatus.color, border: `1px solid ${nextStatus.color}`,
              borderRadius: 6, padding: "3px 8px", fontSize: 10, fontWeight: 700, cursor: "pointer",
              fontFamily: "inherit", whiteSpace: "nowrap", transition: "all 0.15s",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = nextStatus.color; e.currentTarget.style.color = BRAND.white; }}
            onMouseLeave={e => { e.currentTarget.style.background = nextStatus.bg; e.currentTarget.style.color = nextStatus.color; }}>
              {"\u25B6"} {nextStatus.label}
            </button>
          )}
          {!nextStatus && (
            <span style={{ fontSize: 10, fontWeight: 700, color: statusObj.color, padding: "3px 8px", background: statusObj.bg, borderRadius: 6 }}>{"\u2713"} Done</span>
          )}
          <StaffIconBtn icon={<IconEdit />} title="Edit appointment" onClick={(e) => { e.stopPropagation(); setShowDetail(true); }} />
          <StaffIconBtn icon={<IconMessage />} title="Message owner" onClick={(e) => { e.stopPropagation(); setShowContact(true); }} />
        </div>
      </div>
      {showDetail && <BookingDetailModal booking={booking} onClose={() => setShowDetail(false)} onRemove={onRemove} onOpenHuman={onOpenHuman} onUpdate={onUpdate} currentDateStr={currentDateStr} currentDateObj={currentDateObj} bookingsByDate={bookingsByDate} dayOpenState={dayOpenState} dogs={dogs} humans={humans} onUpdateDog={onUpdateDog} onRebook={onRebook} />}
      {showContact && <ContactPopup human={humans[booking.owner]} onClose={() => setShowContact(false)} />}
    </>
  );
}

import { useState } from "react";
import { BRAND, SERVICES } from "../../constants/index.ts";
import { SizeTag } from "../ui/SizeTag.tsx";
import { StaffIconBtn } from "../ui/StaffIconBtn.tsx";
import { IconEdit, IconMessage } from "../icons/index.tsx";
import { BookingDetailModal } from "../modals/BookingDetailModal.tsx";
import { ContactPopup } from "../modals/ContactPopup.tsx";
import type { Booking, BookingsByDate, DogsMap, HumansMap, Dog } from "../../types.ts";

const ICON_COL_STYLE: React.CSSProperties = {
  width: 28, minWidth: 28, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
};

interface Props {
  booking: Booking;
  onRemove: (bookingId: string | number) => void;
  onOpenHuman: (id: string) => void;
  onOpenDog: (id: string) => void;
  onUpdate: (booking: Booking, fromDate: string, toDate: string) => void;
  currentDateStr: string;
  currentDateObj: Date;
  bookingsByDate: BookingsByDate;
  dayOpenState: Record<string, boolean>;
  dogs: DogsMap;
  humans: HumansMap;
  onUpdateDog: (name: string, updates: Partial<Dog>) => void;
}

export function BookingCard({ booking, onRemove, onOpenHuman, onOpenDog, onUpdate, currentDateStr, currentDateObj, bookingsByDate, dayOpenState, dogs, humans, onUpdateDog }: Props) {
  const [showDetail, setShowDetail] = useState(false);
  const [showContact, setShowContact] = useState(false);
  const service = SERVICES.find((s) => s.id === booking.service);
  return (
    <>
      <button type="button" onClick={() => setShowDetail(true)} aria-label={`View details for ${booking.dogName}`} style={{
        display: "flex", alignItems: "center", gap: 8, background: BRAND.white,
        border: `1px solid ${BRAND.greyLight}`, borderRadius: 10, padding: "6px 10px",
        fontSize: 13, cursor: "pointer", minHeight: 42, boxSizing: "border-box" as const,
        transition: "all 0.15s", width: "100%", textAlign: "left" as const, fontFamily: "inherit",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = BRAND.blue; e.currentTarget.style.boxShadow = "0 1px 6px rgba(0,184,224,0.15)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = BRAND.greyLight; e.currentTarget.style.boxShadow = "none"; }}>
        <div style={ICON_COL_STYLE}><SizeTag size={booking.size} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, color: BRAND.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            <span style={{ cursor: "pointer", borderBottom: `1px dashed ${BRAND.blue}`, color: BRAND.blueDark }} onClick={(e) => { e.stopPropagation(); onOpenDog && onOpenDog(booking.dogName); }}>{booking.dogName}</span>
            <span style={{ fontWeight: 400, color: BRAND.textLight, marginLeft: 4, fontSize: 12 }}>({booking.breed})</span>
          </div>
          <div style={{ fontSize: 11, color: BRAND.textLight }}>{service?.icon} {service?.name} {"\u00B7"} <span style={{ cursor: "pointer", borderBottom: `1px dashed ${BRAND.blue}`, color: BRAND.blueDark }} onClick={(e) => { e.stopPropagation(); onOpenHuman && onOpenHuman(booking.owner); }}>{booking.owner}</span></div>
        </div>
        <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
          <StaffIconBtn icon={<IconEdit />} title="Edit appointment" onClick={(e) => { e.stopPropagation(); setShowDetail(true); }} />
          <StaffIconBtn icon={<IconMessage />} title="Message owner" onClick={(e) => { e.stopPropagation(); setShowContact(true); }} />
        </div>
      </button>
      {showDetail && <BookingDetailModal booking={booking} onClose={() => setShowDetail(false)} onRemove={onRemove} onOpenHuman={onOpenHuman} onUpdate={onUpdate} currentDateStr={currentDateStr} currentDateObj={currentDateObj} bookingsByDate={bookingsByDate} dayOpenState={dayOpenState} dogs={dogs} humans={humans} onUpdateDog={onUpdateDog} />}
      {showContact && <ContactPopup human={humans[booking.owner]} onClose={() => setShowContact(false)} />}
    </>
  );
}

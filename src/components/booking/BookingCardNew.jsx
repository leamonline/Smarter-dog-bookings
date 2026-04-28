// src/components/booking/BookingCardNew.jsx
import { useState, lazy, Suspense } from "react";
import { SERVICES } from "../../constants/index.js";
import { useSalon } from "../../contexts/SalonContext.js";
import {
  getDogByIdOrName,
  getHumanByIdOrName,
  computeBookingPricing,
} from "../../engine/bookingRules.js";
import { titleCase } from "../../utils/text.js";

const BookingDetailModal = lazy(() =>
  import("../modals/BookingDetailModal.jsx").then((module) => ({
    default: module.BookingDetailModal,
  })),
);

const SIZE_DOT = {
  small:  { dot: "#F5C518", border: "#D4A500", gradient: "linear-gradient(90deg, #F5C518, #FACC15)", glow: "rgba(245,197,24," },
  medium: { dot: "#2D8B7A", border: "#1E6B5C", gradient: "linear-gradient(90deg, #2D8B7A, #3BA594)", glow: "rgba(45,139,122," },
  large:  { dot: "#E7546C", border: "#C93D63", gradient: "linear-gradient(90deg, #E7546C, #F472B6)", glow: "rgba(231,84,108," },
};

const SIZE_FALLBACK_THEME = { dot: "#00B8E0", border: "#0099BD", gradient: "linear-gradient(90deg, #00B8E0, #38BDF8)", glow: "rgba(14,165,233," };

// Status palette — pulls from the brand: mustard for "still to come", teal for
// "in the salon now", deep purple for "all done". Cancelled stays coral.
// The "No-show" key is also the default state for newly created bookings
// across the codebase, hence the "Booked" label (see constants/salon.ts).
const STATUS_DISPLAY = {
  "No-show":            { bg: "#FFF6CC", color: "#2D004B", border: "#FECC13", label: "Booked" },
  "Checked in":         { bg: "#E0F0EC", color: "#1E6B5C", border: "#2A6F6B", label: "Checked in" },
  "Ready for pick-up":  { bg: "#EDE3F5", color: "#2D004B", border: "#5B3D80", label: "Finished" },
  "Cancelled":          { bg: "#FFE5EC", color: "#C93D63", border: "#E7546C", label: "Cancelled" },
};

const SIZE_TOOLTIP = {
  small: "Small dog",
  medium: "Medium dog",
  large: "Large dog",
};

export function BookingCardNew({ booking, onClick, searchDimmed, draggable, onDragStart, onDragEnd, isBeingDragged }) {
  const {
    dogs,
    humans,
    currentDateStr,
    currentDateObj,
    bookingsByDate,
    dayOpenState,
    daySettings,
    onAdd,
    onRemove,
    onUpdate,
    onUpdateDog,
    onOpenHuman,
    onOpenDog,
    onRebook,
  } = useSalon();

  const [showDetail, setShowDetail] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);

  const sizeTheme = SIZE_DOT[booking.size] || SIZE_FALLBACK_THEME;

  const service = SERVICES.find((s) => s.id === booking.service);
  const statusObj = STATUS_DISPLAY[booking.status] || STATUS_DISPLAY["No-show"];

  const dogRecord = getDogByIdOrName(dogs, booking.dog_id || booking.dogName);
  const humanRecord = getHumanByIdOrName(humans, booking._ownerId || booking.owner || booking.ownerName);

  // Total owed at pick-up (service + add-ons, minus deposit or paid-in-full).
  // Shared with BookingDetailModal so card and modal can't drift.
  const pricing = computeBookingPricing({
    service: booking.service,
    size: booking.size,
    addons: booking.addons,
    payment: booking.payment,
    depositAmount: booking.depositAmount,
    customPrice: dogRecord?.customPrice,
  });

  const displayDogName = titleCase(
    dogRecord?.name || booking.dogName || "Unknown Dog"
  );
  const displayBreed = titleCase(
    dogRecord?.breed || booking.breed || ""
  );
  const displayOwner = titleCase(
    humanRecord?.fullName || booking.owner || booking.ownerName || ""
  );

  const handleCardClick = onClick || (() => setShowDetail(true));

  return (
    <>
      <div
        role="button"
        tabIndex={searchDimmed ? -1 : 0}
        aria-hidden={searchDimmed || undefined}
        draggable={draggable || undefined}
        onDragStart={onDragStart ? (e) => onDragStart(booking, e) : undefined}
        onDragEnd={onDragEnd}
        onClick={handleCardClick}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleCardClick(); } }}
        className={`bg-white border-[1.5px] border-slate-200 rounded-2xl overflow-hidden flex flex-col cursor-pointer transition-all hover:border-brand-purple hover:-translate-y-px box-border focus:outline-none focus:ring-2 focus:ring-brand-yellow focus:ring-offset-1 ${searchDimmed ? "opacity-30 pointer-events-none" : ""} ${isBeingDragged ? "opacity-50" : ""}`}
        style={{ boxShadow: `0 1px 4px rgba(0,0,0,0.04), 0 2px 8px ${sizeTheme.glow}0.08)` }}
        onMouseEnter={(e) => { e.currentTarget.style.boxShadow = `0 4px 16px ${sizeTheme.glow}0.15)`; }}
        onMouseLeave={(e) => { e.currentTarget.style.boxShadow = `0 1px 4px rgba(0,0,0,0.04), 0 2px 8px ${sizeTheme.glow}0.08)`; }}
      >
        {/* Gradient top accent bar */}
        <div className="h-[3px]" style={{ background: sizeTheme.gradient }} />

        <div className="p-2.5 md:p-3.5 flex flex-col gap-1">
        {/* Row 1: size dot + dog name (breed) + price */}
        <div className="flex items-baseline gap-2">
          <span
            className="w-3 h-3 rounded-full shrink-0 inline-block self-center"
            style={{ background: sizeTheme.dot, boxShadow: `0 0 0 2px ${sizeTheme.dot}33` }}
            role="img"
            aria-label={SIZE_TOOLTIP[booking.size] || "Unknown size"}
            title={SIZE_TOOLTIP[booking.size] || "Unknown size"}
          />
          <span className="text-sm md:text-[17px] font-bold font-display text-brand-purple whitespace-nowrap overflow-hidden text-ellipsis min-w-0">
            {displayDogName}
            {displayBreed && (
              <span className="font-normal text-slate-400 ml-1 font-sans">
                ({displayBreed})
              </span>
            )}
          </span>
          {/* Warning chip — sits inline with the name so a single
              glance shows whether the dog has anything flagged.
              Click toggles the full alert list below. */}
          {dogRecord?.alerts?.length > 0 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setAlertsOpen((o) => !o); }}
              aria-expanded={alertsOpen}
              aria-label={`${dogRecord.alerts.length} ${dogRecord.alerts.length === 1 ? "note" : "notes"} on this dog`}
              className="self-center inline-flex items-center gap-1 text-[10px] md:text-[11px] font-bold text-[#B91C1C] bg-[#FEF2F2] border border-[#FCA5A5] rounded-md px-1.5 py-0.5 cursor-pointer transition-colors hover:bg-[#FEE2E2] font-[inherit] shrink-0"
              title={alertsOpen ? "Hide notes" : "Show notes"}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              {dogRecord.alerts.length}
              <span className="ml-0.5 text-[8px] opacity-70">{alertsOpen ? "▲" : "▾"}</span>
            </button>
          )}
          {pricing.isPaidInFull ? (
            <span
              className="text-[10px] md:text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-md ml-auto shrink-0"
              title={`Paid in full (£${pricing.subtotal})`}
            >
              Paid
            </span>
          ) : pricing.subtotal > 0 ? (
            <span
              className="text-sm md:text-[17px] font-black text-[#1E6B5C] ml-auto shrink-0"
              title={pricing.isDepositPaid ? `£${pricing.amountDue} due (deposit of £${pricing.depositPaid} paid)` : undefined}
            >
              {"\u00A3"}{pricing.amountDue}
              {pricing.isDepositPaid && (
                <span className="ml-1 text-[9px] md:text-[10px] font-semibold text-emerald-600 align-middle">
                  dep.
                </span>
              )}
            </span>
          ) : null}
        </div>

        {/* Row 2: owner + alerts */}
        {(displayOwner || dogRecord?.alerts?.length > 0) && (
          <div className="flex items-center gap-2 pl-4 md:pl-5">
            {displayOwner && (
              <div className="text-xs md:text-sm font-semibold text-brand-teal min-w-0 truncate">
                {displayOwner}
              </div>
            )}
            {dogRecord?.alerts?.length > 0 && (
              <div className="flex flex-wrap justify-end gap-1 ml-auto shrink-0">
                {dogRecord.alerts.map((alert, idx) => (
                  <span key={idx} className="bg-[#FEF2F2] text-[#B91C1C] border border-[#FCA5A5] text-[9px] md:text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center shadow-sm">
                    {alert}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Expanded alert list — only when the row-1 warning chip is
            open. Each alert gets its own coloured note line. */}
        {dogRecord?.alerts?.length > 0 && alertsOpen && (
          <ul
            onClick={(e) => e.stopPropagation()}
            className="list-none m-0 p-0 pl-4 md:pl-5 mt-0.5 flex flex-col gap-1 animate-pop-in"
          >
            {dogRecord.alerts.map((alert, idx) => (
              <li
                key={idx}
                className="flex items-start gap-1.5 text-[11px] font-medium text-[#B91C1C] bg-[#FEF2F2] border border-[#FCA5A5] rounded-md px-2 py-1"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-0.5 shrink-0">
                  <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <span className="break-words">{alert}</span>
              </li>
            ))}
          </ul>
        )}

        {/* Row 4: service + status pill row */}
        <div className="flex items-stretch gap-1 md:gap-[5px] pl-4 md:pl-5 mt-1 md:mt-1.5">
          {/* Service pill — stretches to match status picker height */}
          <span className="flex-1 min-w-0 text-[11px] font-bold px-2 py-1 rounded-md text-center bg-slate-100 text-slate-700 border border-slate-200 flex items-center justify-center">
            {service?.name || booking.service || "\u2014"}
          </span>

          {/* Status pill / inline picker */}
          {statusOpen ? (
            <div
              className="flex-1 min-w-0 flex flex-col gap-[3px] animate-pop-in"
              role="listbox"
              aria-label="Set booking status"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === "Escape") { e.stopPropagation(); setStatusOpen(false); }
              }}
            >
              {[
                { id: "No-show", ...STATUS_DISPLAY["No-show"] },
                { id: "Checked in", ...STATUS_DISPLAY["Checked in"] },
                { id: "Ready for pick-up", ...STATUS_DISPLAY["Ready for pick-up"] },
              ].map((s) => {
                const isCurrent = s.id === booking.status;
                return (
                  <button
                    key={s.id}
                    type="button"
                    role="option"
                    aria-selected={isCurrent}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!isCurrent && onUpdate) onUpdate({ ...booking, status: s.id }, currentDateStr, currentDateStr);
                      setStatusOpen(false);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") e.stopPropagation();
                    }}
                    className={`w-full text-[9px] md:text-[11px] font-bold py-1 md:py-[5px] px-1.5 rounded-md text-center border cursor-pointer transition-all font-[inherit] ${
                      isCurrent ? "ring-2 ring-offset-1" : "opacity-70 hover:opacity-100"
                    }`}
                    style={{
                      background: s.bg,
                      color: s.color,
                      borderColor: s.border,
                      ...(isCurrent ? { "--tw-ring-color": s.color } : {}),
                    }}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          ) : (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setStatusOpen(true); }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.stopPropagation();
                  e.preventDefault();
                  setStatusOpen(true);
                }
              }}
              aria-haspopup="listbox"
              aria-expanded={statusOpen}
              aria-label={`Change status, currently ${statusObj.label}`}
              className="flex-1 min-w-0 text-[9px] md:text-[11px] font-bold py-1 md:py-[5px] px-1.5 rounded-md text-center truncate cursor-pointer transition-all hover:brightness-95 flex items-center justify-center gap-0.5 font-[inherit]"
              style={{ background: statusObj.bg, color: statusObj.color, border: `1px solid ${statusObj.border}` }}
            >
              {statusObj.label}
              <span aria-hidden="true" className="text-[8px] opacity-60">{"\u25BE"}</span>
            </button>
          )}
        </div>
        </div>
      </div>

      {showDetail && (
        <Suspense fallback={null}>
          <BookingDetailModal
            booking={booking}
            onClose={() => setShowDetail(false)}
            onAdd={onAdd}
            onRemove={onRemove}
            onOpenHuman={onOpenHuman}
            onOpenDog={onOpenDog}
            onUpdate={onUpdate}
            currentDateStr={currentDateStr}
            currentDateObj={currentDateObj}
            bookingsByDate={bookingsByDate}
            dayOpenState={dayOpenState}
            dogs={dogs}
            humans={humans}
            onUpdateDog={onUpdateDog}
            onRebook={onRebook}
            daySettings={daySettings}
          />
        </Suspense>
      )}
    </>
  );
}

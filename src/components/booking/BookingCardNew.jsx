// src/components/booking/BookingCardNew.jsx
import { useState, useRef, useEffect, lazy, Suspense } from "react";
import { Calendar, LogIn, Droplets, Sparkles, Check } from "lucide-react";
import { createPortal } from "react-dom";
import { SERVICES } from "../../constants/index.js";
import { useSalon } from "../../contexts/SalonContext.js";
import { useToast } from "../../contexts/ToastContext.jsx";
import {
  getDogByIdOrName,
  getHumanByIdOrName,
  computeBookingPricing,
  resolveBookingDisplay,
} from "../../engine/bookingRules.js";
import { titleCase } from "../../utils/text.js";
import { ConfirmDialog } from "../shared/ConfirmDialog.jsx";

const BookingDetailModal = lazy(() =>
  import("../modals/BookingDetailModal.jsx").then((module) => ({
    default: module.BookingDetailModal,
  })),
);

const SIZE_DOT = {
  small:  { dot: "var(--color-size-small)", border: "var(--color-brand-yellow-dark)", gradient: "linear-gradient(90deg, var(--color-size-small), #FACC15)", glow: "rgba(245,197,24," },
  medium: { dot: "var(--color-brand-teal)", border: "var(--color-brand-teal-dark)", gradient: "linear-gradient(90deg, var(--color-brand-teal), var(--color-brand-teal-light))", glow: "rgba(45,139,122," },
  large:  { dot: "var(--color-brand-coral)", border: "var(--color-brand-coral-dark)", gradient: "linear-gradient(90deg, var(--color-brand-coral), #F472B6)", glow: "rgba(231,84,108," },
};

const SIZE_FALLBACK_THEME = { dot: "#00B8E0", border: "#0099BD", gradient: "linear-gradient(90deg, #00B8E0, #38BDF8)", glow: "rgba(14,165,233," };

// Status palette — pulls from the brand: mustard for "still to come", teal for
// "in the salon now", deep purple for "all done". Cancelled stays coral.
// "Booked" is the default state for newly created bookings.
const STATUS_DISPLAY = {
  "Booked":             { bg: "#FFF6CC", color: "var(--color-brand-purple)", border: "var(--color-brand-yellow)", label: "Booked" },
  "Checked in":         { bg: "#E0F0EC", color: "var(--color-brand-teal-dark)", border: "#2A6F6B", label: "Checked in" },
  "In bath":            { bg: "#CFFAFE", color: "#0E7490", border: "#22D3EE", label: "In bath" },
  "Ready for pick-up":  { bg: "#EDE3F5", color: "var(--color-brand-purple)", border: "#5B3D80", label: "Ready" },
  "Completed":          { bg: "#E2D9F0", color: "var(--color-brand-purple)", border: "#5B3D80", label: "Completed" },
  "Cancelled":          { bg: "#FFE5EC", color: "var(--color-brand-coral-dark)", border: "var(--color-brand-coral)", label: "Cancelled" },
};

// The five-step inline progression. Cancelled is terminal and only
// reachable via the detail modal — never appears here.
const STATUS_PROGRESSION = ["Booked", "Checked in", "In bath", "Ready for pick-up", "Completed"];

const STATUS_ICONS = {
  "Booked": Calendar,
  "Checked in": LogIn,
  "In bath": Droplets,
  "Ready for pick-up": Sparkles,
  "Completed": Check,
};

const SIZE_TOOLTIP = {
  small: "Small dog",
  medium: "Medium dog",
  large: "Large dog",
};

// Short human-readable timestamp for the override-badge tooltip:
// "Mon 18 May at 13:57". Falls back to the raw ISO string if parsing
// fails so a malformed value is still visible to whoever is debugging.
function formatOverrideAt(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const date = d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const time = d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${date} at ${time}`;
}

function formatConfirmedAt(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const date = d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const time = d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${date} at ${time}`;
}

/**
 * AlertsPopover — small popup that lists every alert on a dog.
 * Rendered via portal so it escapes the booking card's overflow:
 * hidden and the surrounding grid. Positioned next to its anchor
 * with a soft drop-shadow.
 */
function AlertsPopover({ alerts, anchorRect, onClose, dogName }) {
  const popRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    const onDown = (e) => {
      if (!popRef.current?.contains(e.target)) onClose();
    };
    document.addEventListener("keydown", onKey);
    // Use timeout so the click that opened the popover doesn't
    // immediately close it.
    const t = setTimeout(() => document.addEventListener("mousedown", onDown), 0);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
      clearTimeout(t);
    };
  }, [onClose]);

  if (!anchorRect) return null;

  // Position below the icon, aligned to its left edge. Clamp to
  // viewport so it never sits half-off-screen.
  const POPUP_WIDTH = 260;
  const margin = 8;
  const top = Math.min(
    anchorRect.bottom + 6,
    window.innerHeight - margin - 60,
  );
  let left = anchorRect.left;
  if (left + POPUP_WIDTH > window.innerWidth - margin) {
    left = window.innerWidth - margin - POPUP_WIDTH;
  }
  if (left < margin) left = margin;

  return createPortal(
    <div
      role="dialog"
      aria-label={`Notes on ${dogName}`}
      ref={popRef}
      onClick={(e) => e.stopPropagation()}
      style={{ position: "fixed", top, left, width: POPUP_WIDTH, zIndex: 1100 }}
      className="bg-white border border-[#FCA5A5] rounded-2xl shadow-elevated p-3 animate-pop-in"
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#B91C1C]">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          Notes on {dogName}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close notes"
          className="w-6 h-6 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer border-none bg-transparent font-[inherit]"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      <ul className="list-none m-0 p-0 flex flex-col gap-1.5">
        {alerts.map((alert, idx) => (
          <li
            key={idx}
            className="text-[12px] font-medium text-[#7F1D1D] bg-[#FEF2F2] border border-[#FCA5A5] rounded-lg px-2.5 py-1.5 leading-snug break-words"
          >
            {alert}
          </li>
        ))}
      </ul>
    </div>,
    document.body,
  );
}

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
  const [alertsAnchor, setAlertsAnchor] = useState(null);
  // pendingSkipStatus tracks a "skip ≥2 steps" status change waiting for
  // staff to confirm via ConfirmDialog (replaces the old window.confirm).
  const [pendingSkipStatus, setPendingSkipStatus] = useState(null);
  // shape: { nextStatus: string, previous: string }
  const alertsButtonRef = useRef(null);
  const toast = useToast();

  const applyStatusChange = (nextStatus, previous) => {
    if (onUpdate) onUpdate({ ...booking, status: nextStatus }, currentDateStr, currentDateStr);
    toast.show(
      `Marked as ${STATUS_DISPLAY[nextStatus]?.label ?? nextStatus}`,
      "info",
      () => onUpdate?.({ ...booking, status: previous }, currentDateStr, currentDateStr),
    );
  };

  const changeStatus = (nextStatus) => {
    if (!nextStatus || nextStatus === booking.status) return;
    const previous = booking.status || "Booked";
    const prevIdx = STATUS_PROGRESSION.indexOf(previous);
    const nextIdx = STATUS_PROGRESSION.indexOf(nextStatus);
    const skipped = nextIdx - prevIdx;
    if (skipped >= 2) {
      setPendingSkipStatus({ nextStatus, previous });
      return;
    }
    applyStatusChange(nextStatus, previous);
  };

  const sizeTheme = SIZE_DOT[booking.size] || SIZE_FALLBACK_THEME;

  const service = SERVICES.find((s) => s.id === booking.service);
  const statusObj = STATUS_DISPLAY[booking.status] || STATUS_DISPLAY["Booked"];

  const dogRecord = getDogByIdOrName(dogs, booking.dog_id || booking._dogId || booking.dogName);
  // Single source of truth (matches BookingHeader + transforms.ts): live join,
  // falling back to bookings.*_snapshot only when the dog/owner row is missing.
  const display = resolveBookingDisplay(booking, dogs, humans);

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

  // resolveBookingDisplay returns sentinel strings ("Unknown" / "Unknown owner")
  // when the joined dog/human row can't be resolved. Use the missing flags to
  // swap those for friendlier UI copy without leaking the sentinel.
  const displayDogName = titleCase(
    display.dogMissing ? "Unnamed booking" : display.dogName,
  );
  const displayBreed = titleCase(display.breed);
  const displayOwner = titleCase(display.ownerMissing ? "" : display.owner);

  const handleCardClick = onClick || (() => setShowDetail(true));

  return (
    <>
      {/* Outer wrapper is a plain div, not role="button", so the inner
          buttons (dog name, alerts, status) aren't nested interactives.
          The dog-name button below is the keyboard target for "open
          details"; mouse users can still click anywhere on the card. */}
      <div
        aria-hidden={searchDimmed || undefined}
        draggable={draggable || undefined}
        onDragStart={onDragStart ? (e) => onDragStart(booking, e) : undefined}
        onDragEnd={onDragEnd}
        onClick={handleCardClick}
        className={`bg-white border-[1.5px] border-slate-200 rounded-2xl overflow-hidden flex flex-col cursor-pointer transition-all hover:border-brand-purple hover:-translate-y-px box-border focus-within:ring-2 focus-within:ring-brand-yellow focus-within:ring-offset-1 ${searchDimmed ? "opacity-30 pointer-events-none" : ""} ${isBeingDragged ? "opacity-50" : ""}`}
        style={{ boxShadow: `0 1px 4px rgba(0,0,0,0.04), 0 2px 8px ${sizeTheme.glow}0.08)` }}
        onMouseEnter={(e) => { e.currentTarget.style.boxShadow = `0 4px 16px ${sizeTheme.glow}0.15)`; }}
        onMouseLeave={(e) => { e.currentTarget.style.boxShadow = `0 1px 4px rgba(0,0,0,0.04), 0 2px 8px ${sizeTheme.glow}0.08)`; }}
      >
        {/* Gradient top accent bar */}
        <div className="h-[3px]" style={{ background: sizeTheme.gradient }} />

        <div className="p-2 md:p-3 flex flex-col gap-0.5 md:gap-1">
        {/* Row 1: size dot + dog name (breed) + price */}
        <div className="flex items-baseline gap-2">
          <span
            className="w-3 h-3 rounded-full shrink-0 inline-block self-center"
            style={{ background: sizeTheme.dot, boxShadow: `0 0 0 2px ${sizeTheme.dot}33` }}
            role="img"
            aria-label={SIZE_TOOLTIP[booking.size] || "Size not set"}
            title={SIZE_TOOLTIP[booking.size] || "Size not set"}
          />
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); handleCardClick(); }}
            tabIndex={searchDimmed ? -1 : 0}
            aria-label={`Open booking for ${displayDogName}`}
            className="text-[13px] md:text-sm font-bold font-display text-brand-purple whitespace-nowrap overflow-hidden text-ellipsis min-w-0 text-left bg-transparent border-none p-0 m-0 cursor-pointer font-[inherit] focus:outline-none rounded"
          >
            {displayDogName}
          </button>
          {/* Alert icon — single click target that opens a popup
              listing every note on the dog. No count or label so the
              card stays uncluttered; the icon's job is just to flag. */}
          {dogRecord?.alerts?.length > 0 && (
            <button
              ref={alertsButtonRef}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (alertsAnchor) {
                  setAlertsAnchor(null);
                } else {
                  const rect = alertsButtonRef.current?.getBoundingClientRect();
                  if (rect) setAlertsAnchor(rect);
                }
              }}
              aria-expanded={!!alertsAnchor}
              aria-haspopup="dialog"
              aria-label={`${dogRecord.alerts.length} ${dogRecord.alerts.length === 1 ? "note" : "notes"} on this dog`}
              title={`${dogRecord.alerts.length} ${dogRecord.alerts.length === 1 ? "note" : "notes"}`}
              className="self-center inline-flex items-center justify-center w-6 h-6 rounded-full text-[#B91C1C] bg-[#FEF2F2] border border-[#FCA5A5] cursor-pointer transition-colors hover:bg-[#B91C1C] hover:text-white font-[inherit] shrink-0"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </button>
          )}
          {booking.staffCapacityOverride && (
            <span
              role="img"
              aria-label={
                booking.staffCapacityOverrideAt
                  ? `Capacity overridden on ${formatOverrideAt(booking.staffCapacityOverrideAt)}`
                  : "Capacity overridden by staff"
              }
              title={
                booking.staffCapacityOverrideAt
                  ? `Capacity overridden on ${formatOverrideAt(booking.staffCapacityOverrideAt)}`
                  : "Capacity overridden by staff"
              }
              className="self-center text-[8px] md:text-[9px] font-extrabold uppercase tracking-wider text-amber-900 bg-amber-100 border border-amber-300 px-1 py-0.5 rounded-md shrink-0 leading-none"
            >
              Over
            </span>
          )}
          {booking.reminderConfirmedAt && (
            <span
              role="img"
              aria-label={`Customer confirmed at ${formatConfirmedAt(booking.reminderConfirmedAt)}`}
              title={`Confirmed via WhatsApp at ${formatConfirmedAt(booking.reminderConfirmedAt)}`}
              className="self-center inline-flex items-center justify-center w-5 h-5 rounded-full text-emerald-700 bg-emerald-50 border border-emerald-200 shrink-0"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </span>
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
              className="text-[10px] md:text-[11px] font-bold text-slate-500 ml-auto shrink-0 tabular-nums"
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

        {/* Row 2: service — what we're doing today */}
        <div className="pl-4 md:pl-5 text-[11px] md:text-[12px] font-semibold text-brand-purple/80 truncate">
          {service?.name || booking.service || "—"}
        </div>

        {/* Row 3: owner + breed (subtle, tertiary). Alert pills moved
            into the popover so they don't crowd the card. */}
        {(displayOwner || displayBreed) && (
          <div className="flex items-center gap-2 pl-4 md:pl-5">
            <div className="text-[10px] md:text-[11px] font-medium text-slate-500 min-w-0 truncate">
              {displayOwner}
              {displayOwner && displayBreed && <span className="text-slate-300"> · </span>}
              {displayBreed}
            </div>
          </div>
        )}

        {/* Row 4: status pill */}
        <div className="flex items-stretch gap-1 md:gap-[5px] pl-4 md:pl-5 mt-0.5 md:mt-1">
          {/* Status pill / inline picker (service moved to row 2) */}
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
              {STATUS_PROGRESSION.map((id) => {
                const s = { id, ...STATUS_DISPLAY[id] };
                const isCurrent = s.id === booking.status;
                return (
                  <button
                    key={s.id}
                    type="button"
                    role="option"
                    aria-selected={isCurrent}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!isCurrent) changeStatus(s.id);
                      setStatusOpen(false);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") e.stopPropagation();
                    }}
                    className={`w-full text-[11px] md:text-[12px] font-bold py-1 md:py-[5px] px-1.5 rounded-md text-center border cursor-pointer transition-all font-[inherit] flex items-center justify-center gap-1 ${
                      isCurrent ? "ring-2 ring-offset-1" : "opacity-70 hover:opacity-100"
                    }`}
                    style={{
                      background: s.bg,
                      color: s.color,
                      borderColor: s.border,
                      ...(isCurrent ? { "--tw-ring-color": s.color } : {}),
                    }}
                  >
                    {(() => { const Icon = STATUS_ICONS[s.id] || Calendar; return <Icon size={12} strokeWidth={2.5} aria-hidden="true" />; })()}
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
              className="flex-1 min-w-0 text-[11px] md:text-[12px] font-bold py-1 md:py-[5px] px-1.5 rounded-md text-center truncate cursor-pointer transition-all hover:brightness-95 flex items-center justify-center gap-1 font-[inherit]"
              style={{ background: statusObj.bg, color: statusObj.color, border: `1px solid ${statusObj.border}` }}
            >
              {(() => { const Icon = STATUS_ICONS[booking.status] || Calendar; return <Icon size={12} strokeWidth={2.5} aria-hidden="true" />; })()}
              {statusObj.label}
              <span aria-hidden="true" className="text-[10px] opacity-60">{"\u25BE"}</span>
            </button>
          )}
        </div>
        </div>
      </div>

      {alertsAnchor && dogRecord?.alerts?.length > 0 && (
        <AlertsPopover
          alerts={dogRecord.alerts}
          anchorRect={alertsAnchor}
          onClose={() => setAlertsAnchor(null)}
          dogName={displayDogName}
        />
      )}

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

      {pendingSkipStatus && (
        <ConfirmDialog
          title="Skip ahead?"
          message={`Skip from "${STATUS_DISPLAY[pendingSkipStatus.previous]?.label || pendingSkipStatus.previous}" straight to "${STATUS_DISPLAY[pendingSkipStatus.nextStatus]?.label || pendingSkipStatus.nextStatus}"?`}
          confirmLabel="Skip and update"
          cancelLabel="Cancel"
          variant="primary"
          onConfirm={() => {
            const { nextStatus, previous } = pendingSkipStatus;
            setPendingSkipStatus(null);
            applyStatusChange(nextStatus, previous);
          }}
          onCancel={() => setPendingSkipStatus(null)}
        />
      )}
    </>
  );
}

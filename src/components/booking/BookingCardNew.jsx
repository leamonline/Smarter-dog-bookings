// src/components/booking/BookingCardNew.jsx
import { useState, useRef, useEffect, lazy, Suspense } from "react";
import { Calendar, LogIn, Droplets, Sparkles, Check } from "lucide-react";
import { createPortal } from "react-dom";
import { SERVICES, STATUS_DISPLAY, BOOKING_STATUS, BOOKING_STATUSES } from "../../constants/index";
import { SizeDot } from "../ui/SizeDot.jsx";
import { useSalon } from "../../contexts/SalonContext";
import { useToast } from "../../contexts/ToastContext.jsx";
import {
  getDogByIdOrName,
  computeBookingPricing,
  resolveBookingDisplay,
} from "../../engine/bookingRules";
import { titleCase } from "../../utils/text";
import { ConfirmDialog } from "../shared/ConfirmDialog.jsx";
import { useBookingDeliveryFailure } from "../../supabase/hooks/useDeliveryFailures.js";

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

// Status palette (bg / text / border per status) now lives in
// src/constants/salon.ts as STATUS_DISPLAY — the single source of truth shared
// with the detail modal so card and pop-up can't drift. Imported above.

// The five-step inline progression. Cancelled is terminal and only
// reachable via the detail modal — never appears here. BOOKING_STATUSES
// already encodes the progression order, so derive rather than restate it.
const STATUS_PROGRESSION = BOOKING_STATUSES.map((s) => s.id);

const STATUS_ICONS = {
  [BOOKING_STATUS.BOOKED]: Calendar,
  [BOOKING_STATUS.CHECKED_IN]: LogIn,
  [BOOKING_STATUS.IN_BATH]: Droplets,
  [BOOKING_STATUS.READY_FOR_PICKUP]: Sparkles,
  [BOOKING_STATUS.COMPLETED]: Check,
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
      role="region"
      aria-label={`Notes on ${dogName}`}
      ref={popRef}
      onClick={(e) => e.stopPropagation()}
      style={{ position: "fixed", top, left, width: POPUP_WIDTH, zIndex: 1100 }}
      className="bg-white border border-red-300 rounded-2xl shadow-elevated p-3 animate-pop-in"
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 text-label text-red-700">
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
          className="tap-target w-6 h-6 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer border-none bg-transparent font-[inherit]"
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
            className="text-xs font-medium text-red-900 bg-red-50 border border-red-300 rounded-lg px-2.5 py-1.5 leading-snug break-words"
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
  } = useSalon();

  const [showDetail, setShowDetail] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [alertsAnchor, setAlertsAnchor] = useState(null);
  // pendingSkipStatus tracks a "skip ≥2 steps" status change waiting for
  // staff to confirm via ConfirmDialog (replaces the old window.confirm).
  const [pendingSkipStatus, setPendingSkipStatus] = useState(null);
  // shape: { nextStatus: string, previous: string }
  const alertsButtonRef = useRef(null);
  const statusOptionRefs = useRef([]);
  const toast = useToast();
  const deliveryFailure = useBookingDeliveryFailure(booking.id);

  // When the inline status picker opens, move focus to the current status so
  // keyboard users land on a sensible option and can arrow between them.
  useEffect(() => {
    if (!statusOpen) return;
    const curIdx = Math.max(0, STATUS_PROGRESSION.indexOf(booking.status));
    statusOptionRefs.current[curIdx]?.focus();
  }, [statusOpen, booking.status]);

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
    const previous = booking.status || BOOKING_STATUS.BOOKED;
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
  const statusObj = STATUS_DISPLAY[booking.status] || STATUS_DISPLAY[BOOKING_STATUS.BOOKED];

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
          {/* SizeDot carries a letter (S/M/L/?), so size isn't conveyed by
              colour alone — WCAG 2.1 SC 1.4.1. */}
          <span className="self-center inline-flex shrink-0">
            <SizeDot size={booking.size} dim={16} />
          </span>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); handleCardClick(); }}
            tabIndex={searchDimmed ? -1 : 0}
            aria-label={`Open booking for ${displayDogName}`}
            // shrink-0 so the name never loses the space fight on narrow
            // grid cards — the breed (below) truncates first instead.
            className="text-[13px] md:text-sm font-bold font-display text-brand-purple whitespace-nowrap overflow-hidden text-ellipsis shrink-0 max-w-[70%] text-left bg-transparent border-none p-0 m-0 cursor-pointer font-[inherit] focus:outline-none rounded"
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
              aria-haspopup="true"
              aria-label={`${dogRecord.alerts.length} ${dogRecord.alerts.length === 1 ? "note" : "notes"} on this dog`}
              title={`${dogRecord.alerts.length} ${dogRecord.alerts.length === 1 ? "note" : "notes"}`}
              className="tap-target group/note self-center inline-flex items-center justify-center bg-transparent border-none p-0 cursor-pointer font-[inherit] shrink-0"
            >
              {/* 16px visual circle (matches the SizeDot) sits inside the 44px
                  transparent tap target the .tap-target util provides. */}
              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full text-red-700 bg-red-50 border border-red-300 transition-colors group-hover/note:bg-red-700 group-hover/note:text-white">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </span>
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
              className="self-center inline-block w-2 h-2 rounded-full bg-amber-400 ring-2 ring-amber-100 shrink-0"
            />
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
          {deliveryFailure && deliveryFailure.length > 0 && (
            <span
              role="img"
              aria-label="A message to this customer failed to deliver"
              title={`Failed to deliver: ${deliveryFailure
                .map((f) => f.trigger_type)
                .join(", ")}. Open the booking to fix the number and resend.`}
              className="self-center inline-flex items-center justify-center w-5 h-5 rounded-full text-red-700 bg-red-50 border border-red-200 shrink-0"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </span>
          )}
          {/* Breed follows the name; service sits far right, directly
              above the price on line 2. Two text lines, not three. */}
          <span className="min-w-0 truncate text-[10px] md:text-[11px] font-medium text-slate-500">
            {displayBreed}
          </span>
          <span className="ml-auto shrink-0 text-[10px] md:text-[11px] font-semibold text-brand-purple/80">
            {service?.name || booking.service || "—"}
          </span>
        </div>

        {/* Row 2: owner (left) + price (far right) */}
        <div className="flex items-baseline gap-2 pl-4 md:pl-5">
          <div className="text-[10px] md:text-[11px] font-medium text-slate-500 min-w-0 truncate">
            {displayOwner}
          </div>
          {pricing.subtotal > 0 && (
            // Main number is always the full appointment value (service +
            // add-ons + custom price). Payment state is secondary: a "due"
            // figure so the till sees what to collect, or a "Paid" chip.
            <span className="ml-auto shrink-0 inline-flex items-baseline gap-1.5 whitespace-nowrap tabular-nums">
              <span className="text-[12px] md:text-[13px] font-bold text-slate-800">
                {"£"}{pricing.subtotal}
              </span>
              {pricing.isPaidInFull ? (
                <span
                  className="text-[9px] md:text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1 py-0.5 rounded leading-none"
                  title={`Paid in full (£${pricing.subtotal})`}
                >
                  Paid
                </span>
              ) : pricing.isDepositPaid ? (
                <span
                  className="text-[10px] md:text-[11px] font-semibold text-slate-500"
                  title={`£${pricing.amountDue} due at pick-up (deposit of £${pricing.depositPaid} paid)`}
                >
                  {"\u00A3"}{pricing.amountDue} due
                </span>
              ) : null}
            </span>
          )}
        </div>

        {/* Row 3: status pill */}
        <div className="flex items-stretch gap-1 md:gap-[5px] pl-4 md:pl-5 mt-0.5 md:mt-1">
          {/* Status pill / inline picker (service moved to row 2) */}
          {statusOpen ? (
            <div
              className="flex-1 min-w-0 flex flex-col gap-[3px] animate-pop-in"
              role="listbox"
              aria-label="Set booking status"
              aria-live="polite"
              aria-atomic="true"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === "Escape") { e.stopPropagation(); setStatusOpen(false); return; }
                const navKeys = ["ArrowDown", "ArrowUp", "Home", "End"];
                if (!navKeys.includes(e.key)) return;
                e.preventDefault();
                e.stopPropagation();
                const count = STATUS_PROGRESSION.length;
                let idx = statusOptionRefs.current.findIndex((el) => el === document.activeElement);
                if (idx < 0) idx = Math.max(0, STATUS_PROGRESSION.indexOf(booking.status));
                let next = idx;
                if (e.key === "ArrowDown") next = (idx + 1) % count;
                else if (e.key === "ArrowUp") next = (idx - 1 + count) % count;
                else if (e.key === "Home") next = 0;
                else if (e.key === "End") next = count - 1;
                statusOptionRefs.current[next]?.focus();
              }}
            >
              {STATUS_PROGRESSION.map((id, i) => {
                const s = { id, ...STATUS_DISPLAY[id] };
                const isCurrent = s.id === booking.status;
                return (
                  <button
                    key={s.id}
                    ref={(el) => (statusOptionRefs.current[i] = el)}
                    type="button"
                    role="option"
                    aria-selected={isCurrent}
                    tabIndex={isCurrent ? 0 : -1}
                    aria-current={isCurrent ? "true" : undefined}
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

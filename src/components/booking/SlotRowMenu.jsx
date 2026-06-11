import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Ban, Clock, CalendarPlus, AlertTriangle } from "lucide-react";
import { ConfirmDialog } from "../shared/ConfirmDialog.jsx";

function formatSlot(slot) {
  const [h, m] = slot.split(":");
  const hour = parseInt(h, 10);
  // 24-hour, no leading zero: "9:00", "9:30", "13:00"
  return `${hour}:${m}`;
}

/**
 * SlotRowMenu — the boxed time button to the left of each slot row.
 *
 * The whole box (clock + time, styled like the old list-view arrival
 * pill) is one button. Clicking it opens a portalled actions menu for
 * that slot:
 *
 *  - "Book this time" when a seat is free → `onOpenBooking()` opens
 *    NewBookingModal pre-filled with this slot.
 *  - "Override & book" when the slot is fully booked → confirm dialog,
 *    then `onOverbook()` opens NewBookingModal with the override armed.
 *  - "Block …" items for free seats → `onBlockSeat(index)`.
 *
 * The menu is portalled to document.body so it escapes the parent
 * row's opacity:0.7 (on empty rows).
 */
export function SlotRowMenu({
  slot,
  seatStates,
  onBlockSeat,
  disabled,
  hasBooking,
  onOpenBooking,
  onOverbook,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState(null);
  const [pendingOverbook, setPendingOverbook] = useState(false);
  const boxRef = useRef(null);
  const popRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handle = (e) => {
      if (
        !popRef.current?.contains(e.target) &&
        !boxRef.current?.contains(e.target)
      ) {
        setMenuOpen(false);
      }
    };
    const onKey = (e) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", handle);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", handle);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const slotLabel = formatSlot(slot);

  const availableSeats = (seatStates || [])
    .map((s, i) => ({ seat: s, index: i }))
    .filter(({ seat }) => seat.type === "available");
  const hasFreeSeat = availableSeats.length > 0;
  const isFullyBooked = (seatStates || []).every((s) => s.type === "booking");

  const canBook = !disabled && hasFreeSeat && !!onOpenBooking;
  const canOverbook = !disabled && isFullyBooked && !!onOverbook;
  const canBlock = !disabled && !!onBlockSeat && availableSeats.length > 0;
  const hasActions = canBook || canOverbook || canBlock;

  const openMenu = () => {
    if (!hasActions) return;
    const r = boxRef.current?.getBoundingClientRect();
    if (r) setAnchorRect(r);
    setMenuOpen((o) => !o);
  };

  const handleConfirmOverbook = () => {
    setPendingOverbook(false);
    onOverbook?.();
  };

  // Compute popover position in viewport coords. Clamped so it
  // never sits half off-screen on the right edge.
  let popLeft = 0;
  let popTop = 0;
  if (anchorRect) {
    const POPUP_WIDTH = 200;
    const margin = 8;
    popTop = anchorRect.bottom + 6;
    popLeft = anchorRect.left;
    if (popLeft + POPUP_WIDTH > window.innerWidth - margin) {
      popLeft = window.innerWidth - margin - POPUP_WIDTH;
    }
    if (popLeft < margin) popLeft = margin;
  }

  const boxAriaLabel = !hasActions
    ? slotLabel
    : isFullyBooked
      ? `${slotLabel} — fully booked, open slot actions`
      : `${slotLabel} — open slot actions`;

  return (
    <>
      <button
        ref={boxRef}
        type="button"
        onClick={openMenu}
        aria-label={boxAriaLabel}
        aria-haspopup={hasActions ? "menu" : undefined}
        aria-expanded={hasActions ? menuOpen : undefined}
        title={hasActions ? "Slot actions" : slotLabel}
        disabled={!hasActions}
        className={`h-full w-full flex flex-col items-center justify-center gap-1 bg-white border rounded-2xl px-1 py-2.5 shadow-[0_1px_3px_rgba(0,0,0,0.03)] font-[inherit] transition-colors ${
          hasActions
            ? "cursor-pointer border-slate-200 hover:border-brand-yellow/70 hover:bg-brand-yellow/10"
            : "cursor-default border-slate-200"
        } ${menuOpen ? "border-brand-yellow bg-brand-yellow/10" : ""}`}
      >
        <Clock
          size={14}
          strokeWidth={2.2}
          className="text-brand-purple/60"
          aria-hidden="true"
        />
        <span
          className={`text-[13px] md:text-sm font-bold tabular-nums leading-none ${
            hasBooking ? "text-brand-purple" : "text-slate-400"
          }`}
        >
          {slotLabel}
        </span>
      </button>

      {pendingOverbook && (
        <ConfirmDialog
          title="This time is fully booked"
          message="Override and book anyway?"
          confirmLabel="Override and book"
          cancelLabel="Pick another time"
          variant="primary"
          onConfirm={handleConfirmOverbook}
          onCancel={() => setPendingOverbook(false)}
        />
      )}

      {menuOpen && hasActions && anchorRect && createPortal(
        <div
          ref={popRef}
          role="menu"
          style={{
            position: "fixed",
            top: popTop,
            left: popLeft,
            width: 200,
            backgroundColor: "var(--color-brand-purple)",
            zIndex: 1100,
          }}
          className="rounded-2xl p-2.5 flex flex-col gap-1.5 shadow-[0_12px_28px_rgba(45,0,75,0.45),0_4px_10px_rgba(45,0,75,0.3)] animate-[fadeIn_0.12s_ease-out]"
        >
          <div className="px-1 pb-1 text-[10px] font-bold text-brand-yellow uppercase tracking-wider">
            {slotLabel}
          </div>
          {canBook && (
            <MenuItem
              icon={CalendarPlus}
              label="Book this time"
              onClick={() => {
                setMenuOpen(false);
                onOpenBooking();
              }}
            />
          )}
          {canOverbook && (
            <MenuItem
              icon={AlertTriangle}
              label="Override & book"
              onClick={() => {
                setMenuOpen(false);
                setPendingOverbook(true);
              }}
            />
          )}
          {canBlock && (
            availableSeats.length === 2 ? (
              <>
                <MenuItem
                  icon={Ban}
                  label="Block this timeslot"
                  onClick={() => {
                    onBlockSeat(0);
                    onBlockSeat(1);
                    setMenuOpen(false);
                  }}
                />
                <MenuItem
                  icon={Ban}
                  label="Block seat 1 only"
                  onClick={() => {
                    onBlockSeat(0);
                    setMenuOpen(false);
                  }}
                />
                <MenuItem
                  icon={Ban}
                  label="Block seat 2 only"
                  onClick={() => {
                    onBlockSeat(1);
                    setMenuOpen(false);
                  }}
                />
              </>
            ) : (
              availableSeats.map(({ index }) => (
                <MenuItem
                  key={index}
                  icon={Ban}
                  label={`Block seat ${index + 1}`}
                  onClick={() => {
                    onBlockSeat(index);
                    setMenuOpen(false);
                  }}
                />
              ))
            )
          )}
        </div>,
        document.body,
      )}
    </>
  );
}

function MenuItem({ label, onClick, icon: Icon }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-full text-[12px] font-bold bg-brand-yellow text-brand-purple cursor-pointer transition-colors border-none font-[inherit] hover:bg-brand-yellow-dark"
    >
      <Icon size={12} strokeWidth={2.4} aria-hidden="true" />
      {label}
    </button>
  );
}

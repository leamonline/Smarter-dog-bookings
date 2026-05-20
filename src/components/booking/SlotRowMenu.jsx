import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Ban, MoreVertical } from "lucide-react";
import { ConfirmDialog } from "../shared/ConfirmDialog.jsx";

function formatSlot(slot) {
  const [h, m] = slot.split(":");
  const hour = parseInt(h, 10);
  // 24-hour, no leading zero: "9:00", "9:30", "13:00"
  return `${hour}:${m}`;
}

/**
 * SlotRowMenu — the slot row's left-column UI.
 *
 * Two affordances stacked in the column:
 *
 *  - **Time button** (primary). Clicking it routes to a new booking:
 *    - If the slot has at least one available seat, calls `onOpenBooking()`
 *      which opens NewBookingModal pre-filled with this slot.
 *    - If the slot is fully booked, opens an "This time is fully booked.
 *      Override and book anyway?" confirm dialog. On confirm, calls
 *      `onOverbook()` which opens NewBookingModal with the override
 *      pre-armed.
 *
 *  - **⋯ icon** (secondary, only when seats are available). Opens the
 *    admin popover for "Block seat 1/2/timeslot". Portalled so it
 *    escapes the parent row's opacity:0.7.
 *
 * `onOpenBooking` / `onOverbook` are independent — a parent that
 * doesn't want the time to be clickable can simply omit them.
 */
export function SlotRowMenu({
  slot,
  seatStates,
  onBlockSeat,
  disabled,
  triggerClassName = "",
  hasBooking,
  onOpenBooking,
  onOverbook,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState(null);
  const [pendingOverbook, setPendingOverbook] = useState(false);
  const moreRef = useRef(null);
  const popRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handle = (e) => {
      if (
        !popRef.current?.contains(e.target) &&
        !moreRef.current?.contains(e.target)
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

  const moreDisabled = disabled || !onBlockSeat || availableSeats.length === 0;
  const timeDisabled = disabled || (!onOpenBooking && !onOverbook);

  const handleTimeClick = () => {
    if (timeDisabled) return;
    if (hasFreeSeat && onOpenBooking) {
      onOpenBooking();
      return;
    }
    if (isFullyBooked && onOverbook) {
      setPendingOverbook(true);
    }
  };

  const handleConfirmOverbook = () => {
    setPendingOverbook(false);
    onOverbook?.();
  };

  const openMoreMenu = () => {
    if (moreDisabled) return;
    const r = moreRef.current?.getBoundingClientRect();
    if (r) setAnchorRect(r);
    setMenuOpen((o) => !o);
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

  const timeAriaLabel = timeDisabled
    ? slotLabel
    : isFullyBooked
      ? `${slotLabel} — fully booked, click to override and book`
      : `${slotLabel} — book a dog in`;

  const timeTitle = timeDisabled
    ? slotLabel
    : isFullyBooked
      ? "Fully booked. Click to override."
      : "Click to book";

  return (
    <div className="relative h-full flex flex-col items-stretch justify-center gap-0.5">
      <button
        type="button"
        onClick={handleTimeClick}
        aria-label={timeAriaLabel}
        title={timeTitle}
        disabled={timeDisabled}
        className={`w-full text-[12px] md:text-[13px] font-extrabold text-center cursor-pointer border-none bg-transparent transition-colors font-[inherit] rounded-md tabular-nums py-1 ${
          timeDisabled
            ? "cursor-default"
            : isFullyBooked
              ? "hover:bg-amber-100 hover:text-amber-900"
              : "hover:bg-brand-yellow/15 hover:text-brand-purple"
        } ${hasBooking ? "text-brand-purple" : "text-slate-400"} ${triggerClassName}`}
      >
        {slotLabel}
      </button>

      {!moreDisabled && (
        <button
          ref={moreRef}
          type="button"
          onClick={openMoreMenu}
          aria-label={`${slotLabel} — open slot actions`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          title="Slot actions"
          className="self-center w-5 h-4 flex items-center justify-center text-slate-400 hover:text-brand-purple cursor-pointer border-none bg-transparent rounded p-0"
        >
          <MoreVertical size={12} strokeWidth={2.4} aria-hidden="true" />
        </button>
      )}

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

      {menuOpen && !moreDisabled && anchorRect && createPortal(
        <div
          ref={popRef}
          role="menu"
          // Portalled to document.body so the parent row's
          // opacity:0.7 (on empty rows) doesn't bleed through.
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
          {availableSeats.length === 2 ? (
            <>
              <MenuItem
                label="Block this timeslot"
                onClick={() => {
                  onBlockSeat(0);
                  onBlockSeat(1);
                  setMenuOpen(false);
                }}
              />
              <MenuItem
                label="Block seat 1 only"
                onClick={() => {
                  onBlockSeat(0);
                  setMenuOpen(false);
                }}
              />
              <MenuItem
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
                label={`Block seat ${index + 1}`}
                onClick={() => {
                  onBlockSeat(index);
                  setMenuOpen(false);
                }}
              />
            ))
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}

function MenuItem({ label, onClick }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-full text-[12px] font-bold bg-brand-yellow text-brand-purple cursor-pointer transition-colors border-none font-[inherit] hover:bg-brand-yellow-dark"
    >
      <Ban size={12} strokeWidth={2.4} aria-hidden="true" />
      {label}
    </button>
  );
}

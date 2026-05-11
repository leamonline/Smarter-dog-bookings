import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Ban } from "lucide-react";

function formatSlot(slot) {
  const [h, m] = slot.split(":");
  const hour = parseInt(h, 10);
  // 24-hour, no leading zero: "9:00", "9:30", "13:00"
  return `${hour}:${m}`;
}

/**
 * SlotRowMenu — popover menu of slot-level admin actions
 * (Block seat 1, Block seat 2, Block timeslot). The trigger is
 * the row's time label itself.
 *
 * The popover is rendered via portal so it escapes the parent
 * slot row, which uses opacity:0.7 on empty rows. Without the
 * portal, that opacity would composite the popover content too
 * — making the dark-purple background look translucent.
 */
export function SlotRowMenu({
  slot,
  seatStates,
  onBlockSeat,
  disabled,
  triggerClassName = "",
  hasBooking,
}) {
  const [open, setOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState(null);
  const triggerRef = useRef(null);
  const popRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handle = (e) => {
      if (
        !popRef.current?.contains(e.target) &&
        !triggerRef.current?.contains(e.target)
      ) {
        setOpen(false);
      }
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handle);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", handle);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const slotLabel = formatSlot(slot);

  const availableSeats = (seatStates || [])
    .map((s, i) => ({ seat: s, index: i }))
    .filter(({ seat }) => seat.type === "available");

  const menuDisabled = disabled || !onBlockSeat || availableSeats.length === 0;

  const openMenu = () => {
    if (menuDisabled) return;
    const r = triggerRef.current?.getBoundingClientRect();
    if (r) setAnchorRect(r);
    setOpen((o) => !o);
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

  return (
    <div className="relative h-full">
      <button
        ref={triggerRef}
        type="button"
        onClick={openMenu}
        aria-label={
          menuDisabled
            ? `${slotLabel} — no actions available`
            : `${slotLabel} — open slot actions`
        }
        aria-haspopup={menuDisabled ? undefined : "menu"}
        aria-expanded={menuDisabled ? undefined : open}
        disabled={menuDisabled}
        title={menuDisabled ? slotLabel : "Click for slot actions"}
        className={`w-full h-full text-[12px] md:text-[13px] font-extrabold text-center cursor-pointer border-none bg-transparent transition-colors font-[inherit] rounded-md tabular-nums ${
          menuDisabled
            ? "cursor-default"
            : "hover:bg-brand-yellow/15 hover:text-brand-purple"
        } ${hasBooking ? "text-brand-purple" : "text-slate-400"} ${triggerClassName}`}
      >
        {slotLabel}
      </button>

      {open && !menuDisabled && anchorRect && createPortal(
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
            backgroundColor: "#2D004B",
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
                  setOpen(false);
                }}
              />
              <MenuItem
                label="Block seat 1 only"
                onClick={() => {
                  onBlockSeat(0);
                  setOpen(false);
                }}
              />
              <MenuItem
                label="Block seat 2 only"
                onClick={() => {
                  onBlockSeat(1);
                  setOpen(false);
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
                  setOpen(false);
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

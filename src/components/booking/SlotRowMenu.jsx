import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Ban, Clock, CalendarPlus, AlertTriangle, Zap } from "lucide-react";
import { ConfirmDialog } from "../shared/ConfirmDialog.jsx";

function formatSlot(slot) {
  const [h, m] = slot.split(":");
  const hour = parseInt(h, 10);
  // 24-hour, no leading zero: "9:00", "9:30", "13:00"
  return `${hour}:${m}`;
}

// Menu geometry. Width is fixed; only the height is dynamic (2–6 items), so
// only the height is measured before placing.
const GAP = 8; // gap between the trigger box and the menu
const MARGIN = 8; // min distance the menu keeps from any viewport edge
const MENU_W = 220; // menu width (left-aligned rows + icon gutter)

/**
 * Pure placement maths — given the trigger's viewport rect and the MEASURED
 * menu height, return where the menu should sit so it's never clipped.
 *
 * Preference order (matches the whitespace in each calendar row):
 *   1. right of the trigger, top-aligned then clamped fully on-screen
 *   2. left of the trigger (same clamp)
 *   3. narrow screens — below, else above, centred + horizontally clamped
 *   4. last resort — below with a vertical clamp so it's still on-screen
 *
 * `clampTop` is the fix for the original bug: it slides the menu up as needed
 * so its whole height stays inside the viewport instead of running off the fold.
 */
export function computePlacement(rect, menuH, menuW = MENU_W) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const clampTop = (t) => Math.max(MARGIN, Math.min(t, vh - menuH - MARGIN));
  const roomRight = vw - rect.right - GAP;
  const roomLeft = rect.left - GAP;

  if (roomRight >= menuW + MARGIN) {
    return { placement: "right", top: clampTop(rect.top), left: rect.right + GAP };
  }
  if (roomLeft >= menuW + MARGIN) {
    return { placement: "left", top: clampTop(rect.top), left: rect.left - GAP - menuW };
  }
  let left = rect.left + rect.width / 2 - menuW / 2;
  left = Math.max(MARGIN, Math.min(left, vw - menuW - MARGIN));
  const below = rect.bottom + GAP;
  if (below + menuH <= vh - MARGIN) {
    return { placement: "below", top: below, left };
  }
  const above = rect.top - GAP - menuH;
  if (above >= MARGIN) {
    return { placement: "above", top: above, left };
  }
  return { placement: "below", top: clampTop(below), left };
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
 *  - "Open for immediate booking" / "Remove immediate booking" →
 *    `onToggleImmediate()`. The parent (SlotGrid) only passes the callback
 *    on today's slots before the 30-minute cutoff — the menu itself stays
 *    date-agnostic, like the rest of its options.
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
  isImmediate,
  onToggleImmediate,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState(null); // trigger rect (viewport coords)
  const [pos, setPos] = useState(null); // {top,left,placement} — null until measured
  const [pendingOverbook, setPendingOverbook] = useState(false);
  const boxRef = useRef(null);
  const popRef = useRef(null);

  const closeMenu = () => setMenuOpen(false);

  useEffect(() => {
    if (!menuOpen) return;
    const handle = (e) => {
      if (
        !popRef.current?.contains(e.target) &&
        !boxRef.current?.contains(e.target)
      ) {
        closeMenu();
      }
    };
    const onKey = (e) => {
      if (e.key === "Escape") closeMenu();
    };
    document.addEventListener("mousedown", handle);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", handle);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  // Measure the rendered menu height, then place it — synchronously before
  // paint so the unplaced frame is never visible (menu stays visibility:hidden
  // until `pos` is set). Re-runs when it opens or the trigger rect moves.
  useLayoutEffect(() => {
    if (!menuOpen || !anchorRect) return;
    const el = popRef.current;
    if (!el) return;
    const menuH = el.offsetHeight || 0;
    setPos(computePlacement(anchorRect, menuH));
  }, [menuOpen, anchorRect]);

  // Keep the menu glued to its trigger if the page scrolls or resizes while
  // open. Capture phase catches scrolls on inner scroll containers too.
  // Re-reading the rect into `anchorRect` re-runs the placement effect above.
  useEffect(() => {
    if (!menuOpen) return;
    const sync = () => {
      const r = boxRef.current?.getBoundingClientRect();
      if (r) setAnchorRect(r);
    };
    window.addEventListener("scroll", sync, true);
    window.addEventListener("resize", sync);
    return () => {
      window.removeEventListener("scroll", sync, true);
      window.removeEventListener("resize", sync);
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
  // Opening needs a free seat to be worth anything; un-flagging is always
  // offered while the flag is set, even once the slot has filled.
  const canImmediate = !disabled && !!onToggleImmediate && (hasFreeSeat || isImmediate);
  const hasActions = canBook || canOverbook || canBlock || canImmediate;

  const openMenu = () => {
    if (!hasActions) return;
    if (menuOpen) {
      closeMenu();
      return;
    }
    const r = boxRef.current?.getBoundingClientRect();
    if (!r) return;
    setAnchorRect(r);
    setPos(null); // hide until measured this open cycle
    setMenuOpen(true);
  };

  const handleConfirmOverbook = () => {
    setPendingOverbook(false);
    onOverbook?.();
  };

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
          aria-label={`Slot actions for ${slotLabel}`}
          style={{
            position: "fixed",
            top: pos?.top ?? 0,
            left: pos?.left ?? 0,
            width: MENU_W,
            backgroundColor: "var(--color-brand-purple)",
            visibility: pos ? "visible" : "hidden",
            zIndex: 1100,
          }}
          className="rounded-2xl p-1.5 flex flex-col shadow-[0_12px_28px_rgba(45,0,75,0.45),0_4px_10px_rgba(45,0,75,0.3)] animate-[fadeIn_0.12s_ease-out]"
        >
          <div className="px-2.5 pt-1.5 pb-2 text-[10px] font-bold text-brand-yellow uppercase tracking-wider">
            {slotLabel}
          </div>
          {canBook && (
            <MenuItem
              variant="primary"
              icon={CalendarPlus}
              label="Book this time"
              onClick={() => {
                closeMenu();
                onOpenBooking();
              }}
            />
          )}
          {canOverbook && (
            <MenuItem
              variant="primary"
              icon={AlertTriangle}
              label="Override & book"
              onClick={() => {
                closeMenu();
                setPendingOverbook(true);
              }}
            />
          )}
          {(canBook || canOverbook) && canBlock && (
            <div role="separator" className="my-1 h-px bg-white/10" />
          )}
          {canBlock && (
            availableSeats.length === 2 ? (
              <>
                <MenuItem
                  variant="destructive"
                  icon={Ban}
                  label="Block this timeslot"
                  onClick={() => {
                    // Both seats in ONE call. Two calls meant two whole-row
                    // day_settings upserts racing each other, and the stale
                    // first payload could land last and reopen a seat.
                    onBlockSeat([0, 1]);
                    closeMenu();
                  }}
                />
                <MenuItem
                  variant="destructive"
                  icon={Ban}
                  label="Block seat 1 only"
                  onClick={() => {
                    onBlockSeat(0);
                    closeMenu();
                  }}
                />
                <MenuItem
                  variant="destructive"
                  icon={Ban}
                  label="Block seat 2 only"
                  onClick={() => {
                    onBlockSeat(1);
                    closeMenu();
                  }}
                />
              </>
            ) : (
              availableSeats.map(({ index }) => (
                <MenuItem
                  key={index}
                  variant="destructive"
                  icon={Ban}
                  label={`Block seat ${index + 1}`}
                  onClick={() => {
                    onBlockSeat(index);
                    closeMenu();
                  }}
                />
              ))
            )
          )}
          {canImmediate && (canBook || canOverbook || canBlock) && (
            <div role="separator" className="my-1 h-px bg-white/10" />
          )}
          {canImmediate && (
            <MenuItem
              variant="toggle"
              icon={Zap}
              label={isImmediate ? "Remove immediate booking" : "Open for immediate booking"}
              onClick={() => {
                closeMenu();
                onToggleImmediate();
              }}
            />
          )}
        </div>,
        document.body,
      )}
    </>
  );
}

const MENU_ITEM_VARIANTS = {
  // Solid mustard CTA — the one action that should pop.
  primary: "bg-brand-yellow text-brand-purple hover:bg-brand-yellow-dark",
  // Muted by default, coral on hover — clearly "danger", not primary.
  destructive:
    "bg-transparent text-brand-coral-light hover:bg-brand-coral hover:text-white",
  // Echoes the yellow "LAST MINUTE" badge without competing with the CTA.
  toggle: "bg-brand-yellow/10 text-brand-yellow hover:bg-brand-yellow/20",
  // Future-proof neutral row.
  neutral: "bg-transparent text-white/90 hover:bg-white/10",
};

function MenuItem({ label, onClick, icon: Icon, variant = "neutral" }) {
  const base =
    "w-full inline-flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-[12px] font-bold text-left cursor-pointer border-none font-[inherit] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-yellow/70 focus-visible:ring-inset";
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`${base} ${MENU_ITEM_VARIANTS[variant] ?? MENU_ITEM_VARIANTS.neutral}`}
    >
      <span className="shrink-0 inline-flex w-4 justify-center">
        <Icon size={13} strokeWidth={2.4} aria-hidden="true" />
      </span>
      <span className="min-w-0">{label}</span>
    </button>
  );
}

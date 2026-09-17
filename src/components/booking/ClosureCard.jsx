import { useState, useRef, useEffect } from "react";
import { DoorClosed, MoreHorizontal, Pencil, Undo2 } from "lucide-react";
import { closureLabel, closureRangeLabel } from "../../engine/closures";

/**
 * One coral card standing in for every slot a partial-day closure covers.
 *
 * Coral because the salon already reads coral as "not happening" (cancelled
 * bookings, the close-day control). Bold white text on a solid coral field so
 * it reads at a glance from across the salon.
 *
 * Bookings that were already in the diary when the closure was saved come in
 * as `children`, each wrapped by the caller in a NeedsAttentionFrame.
 */
export function ClosureCard({ closure, slots = [], onReopen, onEditReason, children }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapRef = useRef(null);
  const hasActions = !!onReopen || !!onEditReason;
  const count = slots.length;

  useEffect(() => {
    if (!menuOpen) return;
    const onDocDown = (e) => {
      if (!wrapRef.current?.contains(e.target)) setMenuOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <div
      ref={wrapRef}
      className="relative h-full rounded-2xl bg-brand-coral text-white shadow-[0_2px_8px_rgba(231,84,108,0.35)] px-4 py-3 flex flex-col gap-2"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0 w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
          <DoorClosed size={16} strokeWidth={2.4} aria-hidden="true" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="text-[15px] md:text-base font-extrabold leading-tight break-words">
            {closureLabel(closure)}
          </div>
          <div className="text-[11px] font-semibold text-white/85 tabular-nums mt-0.5">
            {closureRangeLabel(closure)} · {count} {count === 1 ? "slot" : "slots"}
          </div>
        </div>

        {hasActions && (
          <button
            type="button"
            aria-label={`Closure actions for ${closureRangeLabel(closure)}`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
            className="tap-target shrink-0 w-8 h-8 rounded-full flex items-center justify-center border-none cursor-pointer bg-white/15 text-white hover:bg-white/25 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <MoreHorizontal size={16} strokeWidth={2.4} aria-hidden="true" />
          </button>
        )}
      </div>

      {menuOpen && hasActions && (
        <div
          role="menu"
          aria-label="Closure actions"
          className="absolute right-3 top-12 z-20 w-52 rounded-xl bg-white p-1.5 shadow-[0_12px_28px_rgba(45,0,75,0.35)] flex flex-col"
        >
          {onEditReason && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                onEditReason();
              }}
              className="w-full inline-flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[12px] font-bold text-left cursor-pointer border-none bg-transparent text-brand-purple hover:bg-slate-100 font-[inherit]"
            >
              <Pencil size={13} strokeWidth={2.4} aria-hidden="true" />
              Edit reason
            </button>
          )}
          {onReopen && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                onReopen();
              }}
              className="w-full inline-flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[12px] font-bold text-left cursor-pointer border-none bg-transparent text-brand-coral hover:bg-brand-coral-light font-[inherit]"
            >
              <Undo2 size={13} strokeWidth={2.4} aria-hidden="true" />
              Reopen these times
            </button>
          )}
        </div>
      )}

      {children && <div className="flex flex-col gap-2.5 pt-1">{children}</div>}
    </div>
  );
}

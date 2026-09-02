/**
 * BulkActionBar — floats above the conversation list while ≥1 conversation
 * is ticked (Debt 10; extracted from InboxWorkspaceController.jsx).
 *
 * Closing is reopenable, so there's no confirm step; the success toast
 * carries the undo. A full-width wrapper centres the pill via flexbox (not a
 * translate), which leaves `transform` free for the pop-in animation and
 * keeps the bar clear of the iPhone home indicator via the safe-area offset.
 * The wrapper is click-through so it never blocks the list behind it.
 */
import { Spinner } from "../../../ui/Spinner.jsx";

export function BulkActionBar({ count, busy = false, onClose, onClear }) {
  if (!count) return null;
  return (
    <div className="fixed inset-x-0 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-30 flex justify-center px-3 pointer-events-none">
      <div
        role="region"
        aria-label="Bulk actions"
        className="pointer-events-auto animate-card-pop-in inline-flex items-center gap-3 max-w-[calc(100vw-1.5rem)] px-3 py-2 rounded-full bg-brand-purple text-white shadow-lg shadow-brand-purple/30 ring-1 ring-white/10"
      >
        <span className="text-[13px] font-semibold pl-1 whitespace-nowrap">
          {count} selected
        </span>
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-brand-yellow text-brand-purple text-[12px] font-bold whitespace-nowrap cursor-pointer hover:bg-brand-yellow-dark active:scale-[0.97] motion-safe:transition-transform transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:opacity-60 disabled:cursor-not-allowed font-[inherit]"
        >
          {busy ? (
            <>
              <Spinner size="sm" className="text-brand-purple" label="Closing" />
              Closing…
            </>
          ) : (
            <>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Close {count} conversation{count === 1 ? "" : "s"}
            </>
          )}
        </button>
        <button
          type="button"
          onClick={onClear}
          className="text-[12px] font-semibold text-white/80 hover:text-white pr-1 cursor-pointer bg-transparent border-none rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 font-[inherit]"
        >
          Clear
        </button>
      </div>
    </div>
  );
}

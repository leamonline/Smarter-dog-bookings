// Pinned footer for the New Booking modal: the validation error (kept next to
// the primary action so it can't scroll off-screen) plus the Confirm / Cancel
// buttons. Lifted out of BookingFormFields so it stays fixed at the bottom of
// the modal while the date/time/recurring body scrolls — matching the
// header / scroll-body / pinned-footer shape the app's ModalShell uses.
//
// Presentational only: the `ready` gate and button copy are unchanged so the
// existing NewBookingModal tests keep passing.
export function BookingActions({
  hasDogs,
  dogEntries,
  selectedDateStr,
  selectedSlot,
  primaryTheme,
  error,
  onConfirm,
  onClose,
}) {
  const ready = hasDogs && selectedDateStr && selectedSlot;
  const label = dogEntries.length > 1
    ? `Confirm ${dogEntries.length} Bookings`
    : "Confirm Booking";

  return (
    <div className="shrink-0 px-6 pt-3 pb-5 border-t border-slate-100 bg-[var(--color-brand-paper)] max-sm:pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
      {/* ─── Error — stays pinned by the action, never off-screen ─── */}
      {error && (
        <div role="status" aria-live="polite" className="text-[13px] text-brand-coral font-semibold bg-brand-coral-light px-3.5 py-2.5 rounded-control mb-3">
          {error}
        </div>
      )}

      {/* ─── Actions ─── */}
      <div className="flex gap-2.5">
        <button
          onClick={onConfirm}
          disabled={!ready}
          className="flex-1 py-[13px] rounded-xl border-none font-bold text-sm cursor-pointer font-inherit transition-all active:scale-[0.98] motion-safe:transition-transform disabled:bg-slate-200 disabled:text-slate-600 disabled:cursor-not-allowed"
          style={{
            background: ready ? primaryTheme.gradient[0] : undefined,
            color: ready ? primaryTheme.headerText : undefined,
          }}
          onMouseEnter={(e) => { if (ready) e.currentTarget.style.background = primaryTheme.primary; }}
          onMouseLeave={(e) => { if (ready) e.currentTarget.style.background = primaryTheme.gradient[0]; }}
        >
          {label}
        </button>
        <button onClick={onClose} className="py-[13px] px-5 rounded-xl border-[1.5px] border-slate-200 bg-white text-slate-500 text-sm font-semibold cursor-pointer font-inherit transition-colors active:scale-[0.98] motion-safe:transition-transform hover:border-slate-300 hover:text-slate-700">Cancel</button>
      </div>
    </div>
  );
}

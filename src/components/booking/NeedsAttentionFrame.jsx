// A booking that was already in the diary when staff closed those times.
// It is NOT moved or cancelled automatically — staff decide. So it stays on
// the calendar inside the closure, wrapped in a hazard frame nobody can
// scroll past, and stays draggable so it can be moved to a free slot.
export function NeedsAttentionFrame({
  children,
  label = "Needs attention: booked during a closure",
}) {
  return (
    <div role="group" aria-label={label} className="relative rounded-2xl p-[5px]">
      {/* The stripes live on their own layer so ONLY they pulse. Putting the
          animation on the wrapper faded the booking with it, which made the
          one card staff most need to read the hardest to read. */}
      <span
        aria-hidden="true"
        className="absolute inset-0 rounded-2xl needs-attention-stripes needs-attention-pulse pointer-events-none"
      />
      <span
        className="absolute -top-2 left-3 z-10 inline-flex items-center rounded-md bg-brand-yellow px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-900 shadow-sm ring-1 ring-slate-900 pointer-events-none"
        aria-hidden="true"
      >
        NEEDS ATTENTION
      </span>
      <div className="relative rounded-xl overflow-hidden bg-white">{children}</div>
    </div>
  );
}

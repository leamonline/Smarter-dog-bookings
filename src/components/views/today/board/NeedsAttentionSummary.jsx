// "Everything's on track" — or the exact number of things that aren't.
//
// The point of this control is that a groomer can answer "does anything need
// me?" from across the room, without reading a single token. Zero is a
// sentence, not an empty warning panel; non-zero is a press that dims the calm
// dogs so the exceptional ones stand out WHERE THEY ALREADY ARE. It never
// filters them into a separate list: moving a dog to prove it needs attention
// would destroy the spatial memory the board exists to build, and the same
// booking would then appear twice on one screen.

export const NEEDS_ATTENTION_DEFINITION =
  "Needs attention means late arrivals, unconfirmed bookings, dogs waiting to be collected, and unpaid balances.";

export function NeedsAttentionSummary({ summary, isToday, active, onToggle }) {
  if (summary.count === 0) {
    // A browsed past or future date needs no reassurance — nothing on it is
    // happening now, so claiming it is "on track" would be noise.
    return isToday ? (
      <span data-attention-state="clear" className="text-[13px] font-bold text-brand-teal-text">
        {summary.headline}
      </span>
    ) : null;
  }

  return (
    <button
      type="button"
      aria-pressed={active}
      data-attention-state={active ? "focused" : "pending"}
      aria-describedby="needs-attention-definition"
      aria-label={
        active
          ? `Stop highlighting; ${summary.count} ${summary.count === 1 ? "dog needs" : "dogs need"} attention`
          : `Highlight the ${summary.count} ${summary.count === 1 ? "dog" : "dogs"} needing attention`
      }
      onClick={onToggle}
      className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-control px-2.5 -mx-1 text-[13px] font-bold leading-none outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-purple focus-visible:ring-offset-2 ${
        active
          ? "bg-brand-purple text-white"
          : "text-brand-coral-text hover:bg-brand-coral/[0.08]"
      }`}
    >
      <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${active ? "bg-white" : "bg-brand-coral"}`} />
      {active ? `Highlighting ${summary.count} · Clear` : summary.headline}
    </button>
  );
}

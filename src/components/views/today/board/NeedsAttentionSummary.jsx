// "Everything's on track" — or exactly what is not, itemised.
//
// An opaque "11 things need you" sounds urgent but forces a second round of
// interpretation: urgent WHY? The strip names each reason with its count —
// "2 late · 1 to confirm · £88 due" — so the number defines itself, and
// pressing one segment highlights exactly the dogs it names, in place. It
// never filters dogs away: moving a dog to prove it needs attention would
// destroy the spatial memory the board exists to build.
//
// Zero is a sentence, not an empty warning panel; a browsed date gets nothing
// at all, because nothing on it is happening now.

export const NEEDS_ATTENTION_DEFINITION =
  "Needs attention means late arrivals, unconfirmed bookings, dogs waiting to be collected, and unpaid balances.";

/** Reason → the segment's words. Money speaks in pounds; everything else in dogs. */
function segmentLabel(reason, count, dueNow) {
  if (reason === "unpaid") return `£${Math.round(dueNow)} due`;
  if (reason === "late") return `${count} late`;
  if (reason === "toConfirm") return `${count} to confirm`;
  return `${count} waiting`;
}

const SEGMENT_TONE = {
  late: "text-brand-coral-text",
  toConfirm: "text-amber-800",
  waiting: "text-brand-purple",
  unpaid: "text-brand-coral-text",
};

export function NeedsAttentionSummary({
  summary,
  dueNow = 0,
  isToday,
  activeReason = null,
  onSelectReason,
}) {
  if (summary.count === 0) {
    return isToday ? (
      <span data-attention-state="clear" className="text-[13px] font-bold text-brand-teal-text">
        {summary.headline}
      </span>
    ) : null;
  }

  const segments = [
    summary.reasons.late.length > 0 && { reason: "late", ids: summary.reasons.late },
    summary.reasons.toConfirm.length > 0 && { reason: "toConfirm", ids: summary.reasons.toConfirm },
    summary.reasons.waiting.length > 0 && { reason: "waiting", ids: summary.reasons.waiting },
    summary.reasons.unpaid.length > 0 && dueNow > 0 && { reason: "unpaid", ids: summary.reasons.unpaid },
  ].filter(Boolean);

  if (segments.length === 0) {
    // Attention on money alone with nothing yet due-now: fall back to the
    // plain sentence rather than rendering an empty strip.
    return (
      <span data-attention-state="pending" className="text-[13px] font-bold text-brand-purple">
        {summary.headline}
      </span>
    );
  }

  return (
    <span
      role="group"
      aria-label="Needs attention"
      data-attention-state={activeReason ? "focused" : "pending"}
      className="inline-flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5"
    >
      {segments.map((segment, index) => {
        const active = activeReason === segment.reason;
        const label = segmentLabel(segment.reason, segment.ids.length, dueNow);
        const distinct = new Set(segment.ids).size;
        return (
          <span key={segment.reason} className="inline-flex items-center">
            {index > 0 ? <span aria-hidden="true" className="mx-1 font-normal text-slate-300">·</span> : null}
            <button
              type="button"
              aria-pressed={active}
              data-attention-segment={segment.reason}
              aria-describedby="needs-attention-definition"
              aria-label={active
                ? `Stop highlighting ${label}`
                : `Highlight ${label} — ${distinct} ${distinct === 1 ? "dog" : "dogs"}`}
              onClick={() => onSelectReason?.(active ? null : segment.reason)}
              className={`inline-flex min-h-11 items-center rounded-control px-2 text-[13px] font-bold leading-none tabular-nums outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-purple focus-visible:ring-offset-2 ${
                active
                  ? "bg-brand-purple text-white"
                  : `${SEGMENT_TONE[segment.reason]} hover:bg-brand-purple/[0.06]`
              }`}
            >
              {label}
            </button>
          </span>
        );
      })}
    </span>
  );
}

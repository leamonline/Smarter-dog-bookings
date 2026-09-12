// src/components/ui/MetricBar.jsx
//
// One labelled measurement: a heading row, a progress track, and a caption.
// Replaces the near-identical `CapacityBar` and `RevenueBar` that used to live
// in the two dashboard rail cards.
//
// Why it is laid out in three rows rather than one. Both originals put the
// label and the value+caption cluster on a single flex row, with `truncate` on
// the label and `shrink-0` on the cluster. The rail's grid track is 240px at
// xl and 220px at lg, so the card's content box is 208px / 188px — narrower
// than a caption like "36 of 56 seats booked this week" on its own. Because
// the cluster refused to shrink, the label collapsed to "T…" and the cluster
// ran straight out of the card. Giving the caption its own row means the row
// can always fit, whatever the caption says.
//
// The caption wraps rather than truncating: it is the measurement itself, not
// decoration, and the rail scrolls internally, so a second line costs nothing
// worth hiding information for. Only the label truncates.
//
// This primitive owns LAYOUT ONLY. It deliberately knows nothing about
// capacity, revenue, closed days or pounds — callers keep their own semantics
// and pass the rendered result in. That is why `value` is a node and the fill
// colour arrives as a class name.

/**
 * @param {object} props
 * @param {string} props.label            Row heading, e.g. "This week".
 * @param {string} [props.subLabel]       Quieter suffix to the label, e.g. a short date.
 * @param {React.ReactNode} props.value   Rendered figure: "64%", "£1768", an italic "closed".
 * @param {React.ReactNode} [props.caption] The measurement line. Omit when there is nothing true to say.
 * @param {number|null} [props.progress]  0-100. `null` renders an empty track.
 * @param {string} [props.progressClassName] Fill colour class, supplied by the caller.
 * @param {boolean} [props.loading]       Marks the row busy for assistive tech.
 */
export function MetricBar({
  label,
  subLabel,
  value,
  caption,
  progress = null,
  progressClassName = "",
  loading = false,
}) {
  // Clamp the drawn track only. The caller's `value` is never touched — an
  // over-target figure should still read as what it is.
  const trackWidth =
    typeof progress === "number" && Number.isFinite(progress)
      ? Math.min(100, Math.max(0, progress))
      : null;

  return (
    <div aria-busy={loading || undefined}>
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <div className="text-xs font-semibold text-brand-purple truncate min-w-0">
          {label}
          {subLabel && (
            <span className="text-ink-muted font-medium ml-1">{subLabel}</span>
          )}
        </div>
        <div className="text-xs font-semibold text-slate-500 tabular-nums shrink-0">
          {value}
        </div>
      </div>

      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
        {trackWidth !== null && (
          <div
            className={`h-full ${progressClassName} rounded-full transition-all`}
            style={{ width: `${trackWidth}%` }}
            aria-hidden="true"
          />
        )}
      </div>

      {caption && (
        <div className="text-caption text-ink-muted mt-1.5">{caption}</div>
      )}
    </div>
  );
}

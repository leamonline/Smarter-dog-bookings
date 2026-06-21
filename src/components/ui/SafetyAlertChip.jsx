import { useState } from "react";
import { AlertTriangle } from "lucide-react";

/**
 * Welfare-critical safety alerts shown on a dog or human card (e.g. "Reactive
 * to dogs", "Muzzle required"). These cards are themselves buttons that open
 * the profile, which created two problems flagged in the June 2026 UX review:
 *
 *  1. The chip truncated to the first alert + a "+N" count, and the full text
 *     lived only in a `title` tooltip — invisible to screen readers AND to
 *     touch users (no hover), so the only way to read a dog's full safety
 *     alert on a phone was to open the profile. For safety info that's a
 *     genuine welfare risk, not just an a11y nicety.
 *  2. The Humans flag chip had no `aria-label` at all.
 *
 * This shared chip fixes both: the complete, comma-joined value is always in
 * `aria-label` (so assistive tech hears every alert regardless of state), and
 * the chip is a real button that expands in place on tap / Enter / Space to
 * show the full text — no profile trip required. It stops its own activation
 * from bubbling to the card so expanding never also opens the profile.
 */
export function SafetyAlertChip({ items, className = "" }) {
  const [expanded, setExpanded] = useState(false);
  const list = (items || []).filter(Boolean);
  if (list.length === 0) return null;

  const full = list.join(", ");
  const collapsedText = list.length > 1 ? `${list[0]} +${list.length - 1}` : list[0];
  // Only offer expand/collapse when there's actually more to reveal than the
  // collapsed line already shows (multiple alerts, or one that may truncate).
  const canExpand = list.length > 1 || collapsedText.length > 14;

  return (
    <button
      type="button"
      title={full}
      aria-label={`Safety alert: ${full}`}
      aria-expanded={canExpand ? expanded : undefined}
      onClick={(e) => {
        e.stopPropagation();
        if (canExpand) setExpanded((v) => !v);
      }}
      onKeyDown={(e) => {
        // The parent card is also a button; keep the chip's own Enter/Space
        // activation from bubbling up and opening the profile as well.
        if (e.key === "Enter" || e.key === " ") e.stopPropagation();
      }}
      className={`inline-flex items-start gap-1 max-w-full text-micro font-semibold text-brand-coral-text bg-brand-coral-light border border-brand-coral/20 px-1.5 py-0.5 rounded-md text-left cursor-pointer transition-colors hover:bg-brand-coral/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-coral/50 focus-visible:ring-offset-1 ${className}`}
    >
      <AlertTriangle size={12} aria-hidden="true" className="shrink-0 mt-px" />
      <span className={expanded ? "whitespace-normal break-words" : "truncate"}>
        {expanded ? full : collapsedText}
      </span>
    </button>
  );
}

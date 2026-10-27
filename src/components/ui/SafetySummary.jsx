// src/components/ui/SafetySummary.jsx
//
// The day card's safety area: a full-width, 44px-high tap target that says what
// staff must know before handling the dog, in words.
//
//   • Up to two recorded warnings, one per line, most important first (the
//     caller orders them; see engine/safetyOrder.ts).
//   • If they cannot all be read — more than two, or a line too long for the
//     width — it says so plainly instead of cutting words off:
//     "Review safety instructions before handling · 4 alerts". That is a prompt
//     to open the full list, not a claim that everything is still visible.
//   • Text is never smaller than text-caption (12px) and never truncated to
//     fit; the drawer keeps every original note in full.
//
// Presentational: it opens nothing itself. DayCard decides what a tap does.
import { useLayoutEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";

const VISIBLE_LINES = 2;

/** True when any of the listed lines would be wider than the text column. */
function useLinesOverflow(listed) {
  // One string for the dependency list, so the effect re-tests when the wording changes.
  const wording = listed.join("\n");
  const columnRef = useRef(null);
  const ghostRefs = useRef([]);
  const [overflowing, setOverflowing] = useState(false);

  useLayoutEffect(() => {
    const column = columnRef.current;
    if (!column) return undefined;
    const measure = () => {
      const room = column.clientWidth;
      setOverflowing(ghostRefs.current.some((ghost) => ghost && ghost.offsetWidth > room));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(column);
    return () => observer.disconnect();
  }, [wording]);

  return { columnRef, ghostRefs, overflowing };
}

/**
 * @param {{
 *   facts: string[];
 *   expanded: boolean;
 *   controls: string;
 *   onOpen: () => void;
 *   className?: string;
 * }} props `facts` is the full ordered list; `controls` is the id of the drawer it opens.
 */
export function SafetySummary({ facts, expanded, controls, onOpen, className = "" }) {
  const listed = facts.slice(0, VISIBLE_LINES);
  const { columnRef, ghostRefs, overflowing } = useLinesOverflow(listed);
  const needsReview = facts.length > VISIBLE_LINES || overflowing;
  const count = `${facts.length} ${facts.length === 1 ? "alert" : "alerts"}`;

  return (
    <button
      type="button"
      data-safety-summary
      data-safety-review={needsReview ? "true" : "false"}
      aria-label={`Safety alert: ${facts.join(", ")}`}
      aria-expanded={expanded}
      aria-controls={controls}
      onClick={onOpen}
      className={`flex min-h-touch-target min-w-0 flex-1 items-center gap-1.5 rounded-control bg-brand-coral-light px-2 text-left text-caption font-semibold text-brand-coral-text ${className}`}
    >
      <AlertTriangle size={14} className="shrink-0" aria-hidden="true" />
      <span ref={columnRef} className="relative min-w-0 flex-1">
        {needsReview ? (
          <span className="block">Review safety instructions before handling · {count}</span>
        ) : (
          listed.map((fact) => (
            <span key={fact} className="block truncate">
              {fact}
            </span>
          ))
        )}
        {/* Unseen copies of the lines at their natural width, so the real ones
            can be tested for fit. They hold no layout and are hidden from
            assistive technology. */}
        {listed.map((fact, index) => (
          <span
            key={`ghost-${fact}`}
            ref={(node) => {
              ghostRefs.current[index] = node;
            }}
            aria-hidden="true"
            data-text={fact}
            className="pointer-events-none invisible absolute left-0 top-0 whitespace-nowrap after:content-[attr(data-text)]"
          />
        ))}
      </span>
    </button>
  );
}

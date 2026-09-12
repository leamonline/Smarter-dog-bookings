import { useEffect, useRef, useState } from "react";

/**
 * Three-column dashboard shell.
 *
 * On xl+, all three columns are sticky-pinned to the viewport so they
 * don't scroll with the page. The middle AND right columns mirror the
 * left column's measured height (via ResizeObserver) so all three
 * end at the same Y — the bottom of the left column (where the
 * Revenue card sits). Middle + right both scroll internally if their
 * content overflows.
 *
 * That mirrored height is published as a custom property and applied by a
 * `lg:` utility, NOT as an inline max-height, because an inline height
 * applies at every width while the layout it was measured from exists only
 * from `lg` up. Below `lg` the grid is a single column and the left column
 * is `display:none` — which reports a height of 0, so the last desktop
 * measurement stuck and went on capping the booking grid on phones. With
 * `overflow-hidden` also being `lg:`-scoped down there, the schedule simply
 * spilled out of its box and collided with the capacity card underneath it.
 * Scoping the constraint to the breakpoint that produces it means it cannot
 * outlive the sidebar again.
 */
// Unset, `var()` leaves max-height at its initial `none`, so the first paint
// (and every width below lg) is simply unconstrained.
const MATCHED_HEIGHT_CLASS = "lg:max-h-[var(--dashboard-row-height,none)]";

export function DashboardShell({ left, main, right }) {
  const leftRef = useRef(null);
  const [matchedMaxHeight, setMatchedMaxHeight] = useState(null);

  useEffect(() => {
    if (!leftRef.current || typeof ResizeObserver === "undefined") return;
    const el = leftRef.current;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        // Use contentRect.height — excludes border on the column wrapper.
        const h = Math.round(entry.contentRect.height);
        if (h > 0) setMatchedMaxHeight(h);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const matchedHeightStyle = matchedMaxHeight
    ? { "--dashboard-row-height": `${matchedMaxHeight}px` }
    : undefined;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[240px_minmax(0,1fr)_300px] gap-4 lg:gap-6 relative lg:items-start">
      {/* Left sidebar — visible on xl+, content drives the row height
          for the middle + right columns via ResizeObserver. */}
      {left && (
        <div
          ref={leftRef}
          className="hidden lg:block lg:order-1 lg:sticky lg:top-4"
        >
          {left}
        </div>
      )}

      {/* Middle column — pinned to viewport and constrained to the
          measured left-column height so the booking grid card ends
          at the same point as the Revenue card. Internal scroll
          handles overflow. */}
      <div
        className={`order-1 lg:order-2 min-w-0 lg:sticky lg:top-4 lg:overflow-hidden lg:flex lg:flex-col ${MATCHED_HEIGHT_CLASS}`}
        style={matchedHeightStyle}
      >
        {main}
      </div>

      {/* Right column — same height contract as middle. Long workflow
          stacks (waitlist, to-do, booking history) scroll internally.
          Bottom corners rounded so scrolled content fades into a
          rounded edge instead of a hard clip — matches the visual
          shape of the booking grid card in the middle column. */}
      {right && (
        <div
          className={`order-2 lg:order-3 hidden xl:block lg:sticky lg:top-4 lg:overflow-y-auto lg:rounded-b-2xl ${MATCHED_HEIGHT_CLASS}`}
          style={matchedHeightStyle}
        >
          {right}
        </div>
      )}
    </div>
  );
}

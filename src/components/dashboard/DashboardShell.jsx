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
 */
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
    ? { maxHeight: `${matchedMaxHeight}px` }
    : undefined;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)_260px] xl:grid-cols-[280px_minmax(0,1fr)_300px] gap-4 lg:gap-6 relative lg:items-start">
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
        className="order-1 lg:order-2 min-w-0 lg:sticky lg:top-4 lg:overflow-hidden lg:flex lg:flex-col"
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
          className="order-2 lg:order-3 lg:sticky lg:top-4 lg:overflow-y-auto lg:rounded-b-2xl"
          style={matchedHeightStyle}
        >
          {right}
        </div>
      )}
    </div>
  );
}

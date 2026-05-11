import { useEffect, useRef, useState } from "react";

/**
 * Three-column dashboard shell.
 *
 * On xl+, all three columns are sticky-pinned to the viewport so they
 * don't scroll with the page. The middle column's max-height is mirrored
 * to the left column's measured height so the booking grid card always
 * ends at the same Y as the bottom of the left column (where the Revenue
 * card sits). The grid card scrolls internally if its content overflows.
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

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[300px_minmax(0,1fr)_320px] gap-4 xl:gap-6 relative xl:items-start">
      {/* Left sidebar — visible on xl+, content drives the row height
          for the middle column via ResizeObserver. */}
      {left && (
        <div
          ref={leftRef}
          className="hidden xl:block xl:order-1 xl:sticky xl:top-4"
        >
          {left}
        </div>
      )}

      {/* Middle column — pinned to viewport and constrained to the
          measured left-column height so the booking grid card ends
          at the same point as the Revenue card. Internal scroll
          handles overflow. */}
      <div
        className="order-1 xl:order-2 min-w-0 xl:sticky xl:top-4 xl:overflow-hidden xl:flex xl:flex-col"
        style={
          matchedMaxHeight
            ? { maxHeight: `${matchedMaxHeight}px` }
            : undefined
        }
      >
        {main}
      </div>

      {right && (
        <div className="order-2 xl:order-3 xl:sticky xl:top-4 xl:max-h-[calc(100vh-100px)] xl:overflow-y-auto">
          {right}
        </div>
      )}
    </div>
  );
}

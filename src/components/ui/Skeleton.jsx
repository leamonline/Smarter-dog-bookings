// src/components/ui/Skeleton.jsx
//
// Skeleton placeholders shown while route-level data loads. Replace
// the full-screen "Loading..." overlay so the top nav stays mounted
// and the user knows roughly what's coming. Each shape mirrors the
// final layout of the view it stands in for.

import "./skeleton.css";

export function SkeletonBlock({ className = "", style }) {
  return (
    <div
      className={`bg-slate-200/70 rounded animate-skeleton-pulse ${className}`}
      style={style}
      aria-hidden="true"
    />
  );
}

// Internal alias so existing callers inside this file don't change.
const Block = SkeletonBlock;

export function CardGridSkeleton({ rows = 3, cols = 3 }) {
  const cells = rows * cols;
  return (
    <div
      role="status"
      aria-label="Loading directory"
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
    >
      {Array.from({ length: cells }).map((_, i) => (
        <div key={i} className="bg-white rounded-xl border border-slate-200 overflow-hidden h-[140px] flex flex-col">
          <Block className="h-[3px] rounded-none" />
          <div className="p-3.5 px-4 flex-1 flex flex-col gap-2">
            <Block className="h-4 w-2/3" />
            <Block className="h-3 w-1/2" />
            <Block className="h-3 w-1/3 mt-auto" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ThreadSkeleton({ bubbles = 5 }) {
  return (
    <div role="status" aria-label="Loading conversation" className="flex flex-col gap-2 p-4">
      {Array.from({ length: bubbles }).map((_, i) => {
        const outbound = i % 3 === 1;
        return (
          <div key={i} className={`flex ${outbound ? "justify-end" : "justify-start"}`}>
            <Block
              className="rounded-2xl"
              style={{ width: `${50 + ((i * 13) % 30)}%`, height: 36 + (i % 3) * 8 }}
            />
          </div>
        );
      })}
    </div>
  );
}


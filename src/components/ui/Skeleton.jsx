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

export function DayGridSkeleton({ rows = 10 }) {
  return (
    <div role="status" aria-label="Loading day schedule" className="flex flex-col gap-2 p-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-2">
          <Block className="w-14 h-12 shrink-0" />
          <Block className="flex-1 h-12" />
          <Block className="flex-1 h-12" />
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

export function ReportsSkeleton() {
  return (
    <div role="status" aria-label="Loading reports" className="flex flex-col gap-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col gap-2">
            <Block className="h-3 w-1/2" />
            <Block className="h-8 w-2/3" />
            <Block className="h-3 w-1/3" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 h-48">
          <Block className="h-3 w-1/4 mb-3" />
          <Block className="h-32 w-full" />
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5 h-48">
          <Block className="h-3 w-1/4 mb-3" />
          <Block className="h-3 w-full mb-2" />
          <Block className="h-3 w-5/6 mb-2" />
          <Block className="h-3 w-2/3" />
        </div>
      </div>
    </div>
  );
}

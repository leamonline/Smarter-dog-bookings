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

// Stacked text lines — body/paragraph placeholder. Last line is shorter.
export function SkeletonText({ lines = 3, lastWidth = "60%", className = "" }) {
  return (
    <div className={`flex flex-col gap-2 ${className}`} role="status" aria-label="Loading">
      {Array.from({ length: lines }).map((_, i) => (
        <Block
          key={i}
          className="h-3 rounded"
          style={{ width: i === lines - 1 ? lastWidth : "100%" }}
        />
      ))}
    </div>
  );
}

// Circular placeholder — avatars, dots.
export function SkeletonCircle({ size = 40, className = "" }) {
  return <Block className={`rounded-full ${className}`} style={{ width: size, height: size }} />;
}

// Reports: a row of KPI cards while metrics load.
export function SkeletonKpiRow({ count = 4 }) {
  return (
    <div
      role="status"
      aria-label="Loading metrics"
      className="grid grid-cols-2 md:grid-cols-4 gap-3"
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="bg-white rounded-2xl border border-slate-200 shadow-card-resting p-3 md:p-5 flex flex-col gap-2"
        >
          <Block className="h-2.5 w-2/3" />
          <Block className="h-7 w-1/2" />
        </div>
      ))}
    </div>
  );
}

// Reports: a card-shaped chart placeholder with a faux bar row.
export function SkeletonChart({ bars = 7 }) {
  return (
    <div
      role="status"
      aria-label="Loading chart"
      className="bg-white rounded-2xl border border-slate-200 shadow-card-resting overflow-hidden"
    >
      <Block className="h-[3px] rounded-none" />
      <div className="p-5">
        <Block className="h-2.5 w-1/3 mb-4" />
        <div className="flex items-end gap-2 h-32">
          {Array.from({ length: bars }).map((_, i) => (
            <Block
              key={i}
              className="flex-1 rounded-t"
              style={{ height: `${40 + ((i * 17) % 55)}%` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}


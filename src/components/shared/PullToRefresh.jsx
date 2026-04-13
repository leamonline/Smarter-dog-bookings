import { useRef, useState, useCallback } from "react";

const THRESHOLD = 60;

export function PullToRefresh({ onRefresh, children }) {
  const [pulling, setPulling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const startY = useRef(0);
  const containerRef = useRef(null);

  const handleTouchStart = useCallback((e) => {
    if (containerRef.current?.scrollTop > 0) return;
    startY.current = e.touches[0].clientY;
    setPulling(true);
  }, []);

  const handleTouchMove = useCallback((e) => {
    if (!pulling || refreshing) return;
    const delta = e.touches[0].clientY - startY.current;
    if (delta < 0) { setPullDistance(0); return; }
    setPullDistance(Math.min(delta * 0.5, THRESHOLD * 1.5));
  }, [pulling, refreshing]);

  const handleTouchEnd = useCallback(async () => {
    if (!pulling) return;
    setPulling(false);

    if (pullDistance >= THRESHOLD && onRefresh) {
      setRefreshing(true);
      try { await onRefresh(); } catch { /* swallow */ }
      setRefreshing(false);
    }
    setPullDistance(0);
  }, [pulling, pullDistance, onRefresh]);

  return (
    <div
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="relative"
    >
      {(pullDistance > 0 || refreshing) && (
        <div
          className="flex items-center justify-center text-slate-400 text-xs font-semibold overflow-hidden transition-[height] duration-150"
          style={{ height: refreshing ? 36 : pullDistance * 0.6 }}
        >
          {refreshing ? (
            <svg className="animate-spin w-4 h-4 text-brand-blue" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
              <path d="M12 2a10 10 0 019.8 8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
          ) : pullDistance >= THRESHOLD ? (
            "Release to refresh"
          ) : (
            "Pull to refresh"
          )}
        </div>
      )}
      {children}
    </div>
  );
}

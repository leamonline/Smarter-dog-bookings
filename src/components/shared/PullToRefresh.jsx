import { createContext, useContext, useEffect, useRef, useState } from "react";

const THRESHOLD = 60;
const REST = { progress: 0, dragging: false, refreshing: false };
const PullContext = createContext(REST);

export function usePullToRefresh() {
  return useContext(PullContext);
}

/** Refuse refresh if any scroller between the finger and page is away from top. */
function isAtTop(node) {
  for (let el = node; el instanceof Element; el = el.parentElement) {
    if (el.scrollTop > 0) return false;
  }
  return window.scrollY <= 0;
}

export function PullToRefresh({ onRefresh, children, className = "" }) {
  const [state, setState] = useState(REST);
  const containerRef = useRef(null);
  const refreshRef = useRef(onRefresh);
  const runRefreshRef = useRef(null);
  useEffect(() => { refreshRef.current = onRefresh; }, [onRefresh]);

  useEffect(() => {
    const container = containerRef.current;
    let gesture = null;
    let refreshing = false;
    let active = true;
    let suppressClickUntil = 0;

    const reset = () => { gesture = null; if (!refreshing && active) setState(REST); };
    const runRefresh = async () => {
      if (refreshing || !refreshRef.current) return;
      refreshing = true;
      setState({ progress: 1, dragging: false, refreshing: true });
      try { await refreshRef.current(); } catch { /* Caller owns the error/retry UI. */ }
      finally {
        refreshing = false;
        if (active) setState(REST);
      }
    };
    runRefreshRef.current = runRefresh;
    const start = (event) => {
      if (refreshing) return;
      reset();
      if (!refreshRef.current || event.touches.length !== 1 || !isAtTop(event.target)) return;
      // Editing or dragging within appointment actions belongs to that control.
      if (event.target.closest("input, textarea, select, [data-stack-details]")) return;
      gesture = { x: event.touches[0].clientX, y: event.touches[0].clientY, distance: 0 };
    };
    const move = (event) => {
      if (!gesture || refreshing) return;
      if (event.touches.length !== 1 || !isAtTop(event.target)) { reset(); return; }
      const dy = event.touches[0].clientY - gesture.y;
      const dx = Math.abs(event.touches[0].clientX - gesture.x);
      if (dy < 0 || dx > Math.abs(dy)) { reset(); return; }
      if (dy < 8) {
        gesture.distance = 0;
        setState(REST);
        return;
      }
      // A non-passive listener lets this gesture own overscroll without also
      // triggering Safari/Chrome's browser refresh. Ordinary scrolling is native.
      if (event.cancelable) event.preventDefault();
      gesture.distance = Math.min(dy * .5, THRESHOLD * 1.5);
      suppressClickUntil = performance.now() + 500;
      setState({ progress: gesture.distance / THRESHOLD, dragging: true, refreshing: false });
    };
    const end = () => {
      if (!gesture) return;
      const shouldRefresh = gesture.distance >= THRESHOLD;
      gesture = null;
      if (shouldRefresh) void runRefresh();
      else if (!refreshing) setState(REST);
    };
    const click = (event) => {
      if (performance.now() < suppressClickUntil) { event.preventDefault(); event.stopPropagation(); }
    };
    container.addEventListener("touchstart", start, { passive: true });
    container.addEventListener("touchmove", move, { passive: false });
    container.addEventListener("touchend", end);
    container.addEventListener("touchcancel", reset);
    container.addEventListener("click", click, true);
    return () => {
      active = false;
      runRefreshRef.current = null;
      container.removeEventListener("touchstart", start);
      container.removeEventListener("touchmove", move);
      container.removeEventListener("touchend", end);
      container.removeEventListener("touchcancel", reset);
      container.removeEventListener("click", click, true);
    };
  }, []);

  return (
    <PullContext.Provider value={state}>
      <div ref={containerRef} data-pull-to-refresh className={`relative ${className}`.trim()}>
        {onRefresh && (
          <button type="button" onClick={() => runRefreshRef.current?.()} disabled={state.refreshing}
            className="sr-only focus:not-sr-only focus:min-h-11 focus:px-3">
            Refresh appointments
          </button>
        )}
        <div className="pointer-events-none sticky top-2 z-30 h-0 text-center" role="status" aria-live="polite">
          {(state.progress > 0 || state.refreshing) && (
            <span data-refresh-indicator className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-semibold text-brand-purple shadow-sm">
              {state.refreshing ? "Refreshing…" : state.progress >= 1 ? "Release to refresh" : "Pull to refresh"}
            </span>
          )}
        </div>
        {children}
      </div>
    </PullContext.Provider>
  );
}

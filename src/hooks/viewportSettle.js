// ============================================================
// src/hooks/viewportSettle.js
//
// The geometry a phone reports on a viewport event is not always final.
// iOS fires visualViewport `resize` as the on-screen keyboard STARTS to
// animate, carrying an intermediate height, and fires nothing when the
// keyboard lands roughly a quarter of a second later. A measurement taken
// on the event alone is therefore short by however much keyboard was still
// to come — on a real iPhone that left the Inbox shell ~140px too tall and
// the reply box exactly under the keyboard's accessory bar, while the same
// code passed a Chromium simulation that reported the final height at once.
//
// Re-running the measurement a few times over the following second reads
// the settled geometry whatever the platform does. Every run is idempotent
// (same inputs, same style writes, React bails on the unchanged state), so
// the cost is a handful of cheap reads and there is no observable change
// on a browser that reported the final value first time.
// ============================================================

export const VIEWPORT_SETTLE_DELAYS_MS = [100, 250, 500, 900];

/**
 * Run `measure` again at each settle delay. Returns a cancel function; call
 * it before scheduling a replacement so bursts of events do not stack.
 */
export function scheduleSettled(measure, delays = VIEWPORT_SETTLE_DELAYS_MS) {
  const timers = delays.map((ms) => window.setTimeout(measure, ms));
  return () => {
    for (const id of timers) window.clearTimeout(id);
  };
}

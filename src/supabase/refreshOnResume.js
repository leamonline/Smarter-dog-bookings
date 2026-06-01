// ============================================================
// src/supabase/refreshOnResume.js
//
// Shared "the app just came back to life" signal. Fires registered
// callbacks when the tab becomes visible again or the device regains
// connectivity — the moments when a backgrounded PWA (the salon iPad
// waking from sleep, or a flaky connection coming back) may have missed
// Supabase realtime events while its websocket was asleep.
//
// Data hooks register their refresh() so panels reconcile on resume
// rather than showing stale data until the next change happens to fire.
// Realtime stays the primary mechanism; this is just a cheap safety net.
//
// One set of DOM listeners total, attached lazily on the first
// registration and removed when the last consumer unregisters. Bursts
// (visibilitychange + online often fire together) are coalesced.
// ============================================================

const callbacks = new Set();
let attached = false;
let lastFiredAt = 0;

function fire() {
  // Coalesce near-simultaneous resume signals into one sweep.
  const now = Date.now();
  if (now - lastFiredAt < 1000) return;
  lastFiredAt = now;
  for (const cb of callbacks) {
    try {
      cb();
    } catch {
      // A single failing refresh must not stop the others.
    }
  }
}

function onVisibility() {
  if (typeof document !== "undefined" && document.visibilityState === "visible") {
    fire();
  }
}

function attach() {
  if (attached || typeof document === "undefined" || typeof window === "undefined") {
    return;
  }
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("online", fire);
  attached = true;
}

function detach() {
  if (!attached) return;
  document.removeEventListener("visibilitychange", onVisibility);
  window.removeEventListener("online", fire);
  attached = false;
}

/**
 * Register a callback to run when the app resumes (tab visible / back
 * online). Returns an unregister function; when the last callback is
 * removed the DOM listeners are detached.
 */
export function registerResume(callback) {
  callbacks.add(callback);
  attach();
  return () => {
    callbacks.delete(callback);
    if (callbacks.size === 0) detach();
  };
}

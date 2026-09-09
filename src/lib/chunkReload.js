import { captureException } from "./sentry.js";
import { safeGet, safeSet, safeRemove } from "./storage";

const RELOAD_FLAG = "app:chunk-reload-attempted";
const FLAG_TTL_MS = 10_000;

const CHUNK_ERROR_PATTERNS = [
  /Failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /Importing a module script failed/i,
  /Loading chunk [^ ]+ failed/i,
  /ChunkLoadError/i,
  // Safari: a hashed chunk that no longer exists on the CDN comes back as the
  // SPA's index.html, and Safari reports the MIME type rather than the fetch.
  /not a valid JavaScript MIME type/i,
];

export function isStaleChunkError(value) {
  if (!value) return false;
  const message =
    typeof value === "string"
      ? value
      : value.message || value.reason?.message || String(value);
  return CHUNK_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

/**
 * True while a stale-chunk reload has been requested in this session and the
 * loop-guard TTL has not yet cleared it. Between `location.reload()` being
 * called and the page actually going away, React keeps rendering: Vite's
 * preload helper resolves the failed import to `undefined` once the
 * `vite:preloadError` was default-prevented, so the `lazy()` mapping throws
 * "undefined is not an object (evaluating 'e.TodayView')" into the nearest
 * error boundary. That is the shadow of a reload already in flight, not a
 * second error, and callers use this to avoid reporting it.
 */
export function isChunkReloadPending() {
  return Boolean(safeGet("session", RELOAD_FLAG));
}

/**
 * Reload once per session window. Returns true when a reload was started and
 * false when the loop guard refused (the previous reload did not fix it), so
 * the caller can let the real error surface instead of swallowing it.
 */
export function handleStaleChunkError(source, error) {
  if (safeGet("session", RELOAD_FLAG)) {
    captureException(error ?? new Error(`stale chunk after reload (${source})`), {
      tags: { chunkReload: "loop_guard_hit", source },
    });
    return false;
  }
  safeSet("session", RELOAD_FLAG, String(Date.now()));

  captureException(error ?? new Error(`stale chunk reload (${source})`), {
    tags: { chunkReload: "reloading", source },
  });

  window.location.reload();
  return true;
}

const reloadOnce = handleStaleChunkError;

export function installChunkReloadHandler() {
  if (typeof window === "undefined") return;

  // Clear the loop-guard after the app has been up long enough that we trust
  // the current bundle. Without this, a user who keeps the tab open across
  // two consecutive deploys would only get one auto-reload.
  window.setTimeout(() => {
    safeRemove("session", RELOAD_FLAG);
  }, FLAG_TTL_MS);

  window.addEventListener("vite:preloadError", (event) => {
    // Only swallow Vite's error when a reload is actually on its way. If the
    // loop guard refuses (we already reloaded and it is still broken), let
    // the import reject normally so the error boundary shows its recovery UI
    // instead of a confusing "undefined is not an object" from the lazy map.
    if (reloadOnce("vite:preloadError", event.payload)) {
      event.preventDefault?.();
    }
  });

  window.addEventListener("error", (event) => {
    if (isStaleChunkError(event.error) || isStaleChunkError(event.message)) {
      reloadOnce("window.error", event.error);
    }
  });

  window.addEventListener("unhandledrejection", (event) => {
    if (isStaleChunkError(event.reason)) {
      reloadOnce("unhandledrejection", event.reason);
    }
  });
}

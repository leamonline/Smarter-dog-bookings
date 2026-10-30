import { captureException, registerChunkReloadNoiseFilter } from "./sentry.js";
import { safeGet, safeSet } from "./storage";

const RELOAD_FLAG = "app:chunk-reload-attempted";
const RELOAD_PARAM = "__sd_chunk_reload";
const FLAG_TTL_MS = 10_000;
const NOTICE_ID = "chunk-reload-notice";

const CHUNK_ERROR_PATTERNS = [
  /Failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /Importing a module script failed/i,
  /Loading chunk [^ ]+ failed/i,
  /ChunkLoadError/i,
  // Safari: a hashed chunk that no longer exists comes back as HTML, and
  // Safari reports the MIME type rather than the fetch.
  /not a valid JavaScript MIME type/i,
  // Chrome, when the same HTML body is served for a module script.
  /Expected a JavaScript(?:-or-Wasm)? module script but the server responded with a MIME type/i,
  /disallowed MIME type/i,
];

// Vite's preload helper resolves a failed import to `undefined` once
// `vite:preloadError` is default-prevented. The lazy() mapping then throws
// one of these instead of the original fetch error. They are only noise while
// a reload is already in flight; a real bug with the same shape still reports
// when no reload is pending.
const LAZY_SHADOW_PATTERNS = [
  /undefined is not an object/i,
  /Cannot read properties of undefined/i,
  /can't access property/i,
  /Element type is invalid/i,
];

// Set when THIS document has already started navigating to a fresh copy.
// A second preload/error event before unload is the same failure, not proof
// that the reload failed to help. The session timestamp is what the next
// document reads.
let reloadScheduled = false;
// Survives when sessionStorage is unavailable (private mode): the query param
// on the URL we just landed from, copied here before it is stripped.
let memoryAttemptAt = 0;

/** Test-only. The reload flag lives for the life of the document. */
export function resetChunkReloadForTests() {
  reloadScheduled = false;
  memoryAttemptAt = 0;
}

export function isStaleChunkError(value) {
  if (!value) return false;
  const message =
    typeof value === "string"
      ? value
      : value.message || value.reason?.message || String(value);
  return CHUNK_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

export function isLazyImportShadow(value) {
  if (!value) return false;
  const message = typeof value === "string" ? value : value.message || String(value);
  return LAZY_SHADOW_PATTERNS.some((pattern) => pattern.test(message));
}

function attemptAt() {
  const stored = Number(safeGet("session", RELOAD_FLAG));
  const storedAt = Number.isFinite(stored) ? stored : 0;
  return Math.max(storedAt, memoryAttemptAt);
}

function reloadBlocked() {
  const at = attemptAt();
  return at > 0 && Date.now() - at < FLAG_TTL_MS;
}

/**
 * True only while this document has already asked the browser to load the
 * fresh copy. Callers use it to ignore the lazy() "undefined is not an object"
 * throw that Vite's prevented preload produces on the way out. A timestamp
 * left by a previous document does not count: that page already settled, and
 * a new failure there is a real error (the loop guard).
 */
export function isChunkReloadPending() {
  return reloadScheduled;
}

/** Whether a stale-chunk failure should navigate away rather than show the recovery UI. */
export function staleChunkReloadAllowed() {
  return reloadScheduled || !reloadBlocked();
}

function eventText(event) {
  if (!event || typeof event !== "object") return "";
  const parts = [event.message];
  const values = event.exception?.values;
  if (Array.isArray(values)) {
    for (const value of values) parts.push(value?.value, value?.type);
  }
  return parts.filter((part) => typeof part === "string" && part).join("\n");
}

function isHandledChunkNoise(event) {
  // The loop guard is the case that is still broken. Keep it.
  if (event?.tags?.chunkReload === "loop_guard_hit") return false;
  if (!reloadScheduled) return false;
  const text = eventText(event);
  return isStaleChunkError(text) || isLazyImportShadow(text);
}

function rememberAttempt(now) {
  memoryAttemptAt = now;
  safeSet("session", RELOAD_FLAG, String(now));
}

function showUpdatingNotice() {
  if (typeof document === "undefined" || !document.body) return;
  if (document.getElementById(NOTICE_ID)) return;
  const el = document.createElement("div");
  el.id = NOTICE_ID;
  // Not role="status": the React boundary announces the same sentence, and a
  // second status role makes the two impossible to tell apart.
  el.setAttribute("aria-live", "polite");
  // Inline, because the CSS chunk may be the file that just disappeared.
  el.style.cssText = [
    "position:fixed",
    "left:50%",
    "bottom:1.25rem",
    "transform:translateX(-50%)",
    "z-index:9999",
    "background:#0f172a",
    "color:#fff",
    "padding:0.75rem 1rem",
    "border-radius:0.75rem",
    "font:600 0.875rem/1.4 system-ui,sans-serif",
    "box-shadow:0 8px 24px rgba(15,23,42,.25)",
    "max-width:min(24rem,calc(100% - 2rem))",
    "text-align:center",
  ].join(";");
  el.textContent = "Updating to the latest version…";
  document.body.appendChild(el);
}

function replaceWithFreshDocument(now) {
  const url = new URL(window.location.href);
  url.searchParams.set(RELOAD_PARAM, String(now));
  // replace(), not assign(): Back must not return to the document whose
  // chunks no longer exist. A new URL also bypasses the HTTP cache of this
  // exact document, which is what leaves the customer portal (no service
  // worker) on a stale shell after a normal reload(). The staff worker still
  // answers navigations from the shell it precached; once the new worker has
  // claimed the page, that shell is the current deploy.
  window.location.replace(url.toString());
}

/** User-asked refresh. Bypasses the loop guard and still cache-busts the document. */
export function reloadFreshDocument() {
  if (reloadScheduled) return;
  const now = Date.now();
  rememberAttempt(now);
  reloadScheduled = true;
  showUpdatingNotice();
  replaceWithFreshDocument(now);
}

/**
 * Reload once per TTL window. Returns true when a reload is underway (including
 * a duplicate event for a reload already started) and false when the loop guard
 * refused, so the caller can show the recovery UI instead of swallowing it.
 *
 * A successful reload is not reported. The page is about to go away, and an
 * info-level exception still opens a Sentry issue. The loop-guard branch stays
 * an error: that one means the fresh document is still broken.
 */
export function handleStaleChunkError(source, error) {
  if (reloadScheduled) return true;
  if (reloadBlocked()) {
    captureException(error ?? new Error(`stale chunk after reload (${source})`), {
      tags: { chunkReload: "loop_guard_hit", source },
    });
    return false;
  }
  const now = Date.now();
  rememberAttempt(now);
  reloadScheduled = true;
  showUpdatingNotice();
  replaceWithFreshDocument(now);
  return true;
}

function stripReloadParam() {
  let url;
  try {
    url = new URL(window.location.href);
  } catch {
    return;
  }
  const stamp = Number(url.searchParams.get(RELOAD_PARAM));
  if (!url.searchParams.has(RELOAD_PARAM)) return;
  if (Number.isFinite(stamp) && stamp > 0) {
    // Prefer the original attempt time so the TTL is measured from the
    // failure, not from when this document finished parsing.
    rememberAttempt(stamp);
  }
  url.searchParams.delete(RELOAD_PARAM);
  const next = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState(window.history.state, "", next);
}

export function installChunkReloadHandler() {
  if (typeof window === "undefined") return;

  registerChunkReloadNoiseFilter(isHandledChunkNoise);
  stripReloadParam();

  window.addEventListener("vite:preloadError", (event) => {
    // Only swallow Vite's error when a reload is actually on its way. If the
    // loop guard refuses, let the import reject so the error boundary shows
    // its recovery UI instead of a lazy-mapping shadow.
    if (handleStaleChunkError("vite:preloadError", event.payload)) {
      event.preventDefault?.();
    }
  });

  window.addEventListener("error", (event) => {
    if (isStaleChunkError(event.error) || isStaleChunkError(event.message)) {
      handleStaleChunkError("window.error", event.error || event.message);
    }
  });

  window.addEventListener("unhandledrejection", (event) => {
    if (isStaleChunkError(event.reason)) {
      if (handleStaleChunkError("unhandledrejection", event.reason)) {
        event.preventDefault?.();
      }
    }
  });
}

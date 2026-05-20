import { captureException } from "./sentry.js";
import { safeGet, safeSet, safeRemove } from "./storage.ts";

const RELOAD_FLAG = "app:chunk-reload-attempted";
const FLAG_TTL_MS = 10_000;

const CHUNK_ERROR_PATTERNS = [
  /Failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /Importing a module script failed/i,
  /Loading chunk [^ ]+ failed/i,
  /ChunkLoadError/i,
];

function isStaleChunkError(value) {
  if (!value) return false;
  const message =
    typeof value === "string"
      ? value
      : value.message || value.reason?.message || String(value);
  return CHUNK_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

function reloadOnce(source, error) {
  if (safeGet("session", RELOAD_FLAG)) {
    captureException(error ?? new Error(`stale chunk after reload (${source})`), {
      tags: { chunkReload: "loop_guard_hit", source },
    });
    return;
  }
  safeSet("session", RELOAD_FLAG, String(Date.now()));

  captureException(error ?? new Error(`stale chunk reload (${source})`), {
    tags: { chunkReload: "reloading", source },
  });

  window.location.reload();
}

export function installChunkReloadHandler() {
  if (typeof window === "undefined") return;

  // Clear the loop-guard after the app has been up long enough that we trust
  // the current bundle. Without this, a user who keeps the tab open across
  // two consecutive deploys would only get one auto-reload.
  window.setTimeout(() => {
    safeRemove("session", RELOAD_FLAG);
  }, FLAG_TTL_MS);

  window.addEventListener("vite:preloadError", (event) => {
    event.preventDefault?.();
    reloadOnce("vite:preloadError", event.payload);
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

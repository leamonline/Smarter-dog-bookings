// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("./sentry.js", () => ({
  captureException: vi.fn(),
  registerChunkReloadNoiseFilter: vi.fn(),
}));

const RELOAD_FLAG = "app:chunk-reload-attempted";
const RELOAD_PARAM = "__sd_chunk_reload";

function stubLocation(href = "https://smarterdog.co.uk/staff/today?date=2026-10-30") {
  const replace = vi.fn();
  const reload = vi.fn();
  const url = new URL(href);
  Object.defineProperty(window, "location", {
    configurable: true,
    value: {
      href,
      pathname: url.pathname,
      search: url.search,
      hash: url.hash,
      replace,
      reload,
    },
  });
  return { replace, reload };
}

describe("installChunkReloadHandler", () => {
  let listeners;
  let originalAdd;
  let replace;

  beforeEach(async () => {
    vi.resetModules();
    sessionStorage.clear();
    listeners = {};
    originalAdd = window.addEventListener;
    window.addEventListener = vi.fn((name, cb) => {
      listeners[name] = cb;
    });
    ({ replace } = stubLocation());
    const { installChunkReloadHandler } = await import("./chunkReload.js");
    installChunkReloadHandler();
  });

  afterEach(() => {
    window.addEventListener = originalAdd;
    document.getElementById("chunk-reload-notice")?.remove();
  });

  function failChunk(message = "Failed to fetch dynamically imported module: /app/assets/X.js") {
    listeners.error({ error: new Error(message), message });
  }

  it("navigates once to a cache-busting URL on a dynamic import failure", () => {
    failChunk();
    expect(replace).toHaveBeenCalledTimes(1);
    const next = new URL(replace.mock.calls[0][0]);
    expect(next.pathname).toBe("/staff/today");
    expect(next.searchParams.get("date")).toBe("2026-10-30");
    expect(next.searchParams.get(RELOAD_PARAM)).toMatch(/^\d+$/);
    expect(document.getElementById("chunk-reload-notice")?.textContent).toMatch(/Updating to the latest version/);
  });

  it("reloads on a vite:preloadError event and default-prevents it", () => {
    const event = { preventDefault: vi.fn(), payload: new Error("preload") };
    listeners["vite:preloadError"](event);
    expect(replace).toHaveBeenCalledTimes(1);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
  });

  it("reloads on an unhandledrejection with ChunkLoadError and prevents it", () => {
    const event = { reason: new Error("ChunkLoadError: loading chunk abc failed"), preventDefault: vi.fn() };
    listeners.unhandledrejection(event);
    expect(replace).toHaveBeenCalledTimes(1);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
  });

  it("treats a second matching event on the same document as the same reload", () => {
    failChunk();
    failChunk();
    listeners["vite:preloadError"]({ preventDefault: vi.fn(), payload: new Error("preload") });
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it("does not default-prevent a vite:preloadError once the loop guard has refused", () => {
    sessionStorage.setItem(RELOAD_FLAG, String(Date.now()));
    const event = { preventDefault: vi.fn(), payload: new Error("preload") };
    listeners["vite:preloadError"](event);
    expect(replace).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it("allows another reload once the previous attempt is older than the TTL", () => {
    sessionStorage.setItem(RELOAD_FLAG, String(Date.now() - 10_001));
    failChunk();
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it("reloads on Safari's MIME-type message for a chunk served as HTML", () => {
    failChunk(
      "'text/html' is not a valid JavaScript MIME type for module script 'https://x/app/assets/HumanCardModal-DJeUhpCi.js'.",
    );
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it("reloads on Chrome's MIME-type message for a chunk served as HTML", () => {
    failChunk(
      "Failed to load module script: Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of \"text/html\".",
    );
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it("reports a reload as pending only after this document has scheduled one", async () => {
    const { isChunkReloadPending } = await import("./chunkReload.js");
    expect(isChunkReloadPending()).toBe(false);
    sessionStorage.setItem(RELOAD_FLAG, String(Date.now()));
    // A timestamp from the previous document is the loop guard, not an
    // in-flight reload. A real error on this page must still be reported.
    expect(isChunkReloadPending()).toBe(false);
    sessionStorage.removeItem(RELOAD_FLAG);
    failChunk();
    expect(isChunkReloadPending()).toBe(true);
  });

  it("does not report a recovering reload, and reports a loop-guard hit as an error", async () => {
    const { captureException } = await import("./sentry.js");
    captureException.mockClear();
    failChunk();
    failChunk();
    expect(captureException).not.toHaveBeenCalled();

    sessionStorage.setItem(RELOAD_FLAG, String(Date.now()));
    const { resetChunkReloadForTests } = await import("./chunkReload.js");
    resetChunkReloadForTests();
    failChunk();
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException.mock.calls[0][1].tags).toMatchObject({
      chunkReload: "loop_guard_hit",
      source: "window.error",
    });
    expect(captureException.mock.calls[0][1].level).toBeUndefined();
  });

  it("asks Sentry to drop chunk noise only while a reload is in flight", async () => {
    const { registerChunkReloadNoiseFilter } = await import("./sentry.js");
    const filter = registerChunkReloadNoiseFilter.mock.calls.at(-1)[0];
    const stale = { message: "Failed to fetch dynamically imported module" };
    const shadow = { exception: { values: [{ value: "undefined is not an object (evaluating 'e.Analytics')" }] } };
    const real = { message: "x is not a function" };
    expect(filter(stale)).toBe(false);
    expect(filter(shadow)).toBe(false);
    failChunk();
    expect(filter(stale)).toBe(true);
    expect(filter(shadow)).toBe(true);
    expect(filter(real)).toBe(false);
    expect(filter({ ...stale, tags: { chunkReload: "loop_guard_hit" } })).toBe(false);
  });

  it("ignores unrelated errors", () => {
    listeners.error({ error: new TypeError("x is not a function"), message: "x is not a function" });
    listeners.unhandledrejection({ reason: new Error("network timeout"), preventDefault: vi.fn() });
    expect(replace).not.toHaveBeenCalled();
  });

  it("strips the cache-bust param on the next document and keeps the guard", async () => {
    window.addEventListener = originalAdd;
    vi.resetModules();
    const stamp = Date.now();
    stubLocation(`https://smarterdog.co.uk/book/login?${RELOAD_PARAM}=${stamp}`);
    const replaceState = vi.spyOn(window.history, "replaceState");
    const { installChunkReloadHandler, staleChunkReloadAllowed } = await import("./chunkReload.js");
    installChunkReloadHandler();
    expect(replaceState).toHaveBeenCalled();
    const next = replaceState.mock.calls.at(-1)[2];
    expect(next).toBe("/book/login");
    expect(sessionStorage.getItem(RELOAD_FLAG)).toBe(String(stamp));
    expect(staleChunkReloadAllowed()).toBe(false);
    replaceState.mockRestore();
  });
});

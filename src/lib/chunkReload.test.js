// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("./sentry.js", () => ({
  captureException: vi.fn(),
}));

const RELOAD_FLAG = "app:chunk-reload-attempted";

describe("installChunkReloadHandler", () => {
  let reloadSpy;
  let listeners;
  let originalAdd;

  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
    sessionStorage.clear();
    listeners = {};
    originalAdd = window.addEventListener;
    window.addEventListener = vi.fn((name, cb) => {
      listeners[name] = cb;
    });
    reloadSpy = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { reload: reloadSpy },
    });
    const { installChunkReloadHandler } = await import("./chunkReload.js");
    installChunkReloadHandler();
  });

  afterEach(() => {
    window.addEventListener = originalAdd;
    vi.useRealTimers();
  });

  it("reloads on a Failed-to-fetch dynamic import error", () => {
    listeners.error({
      error: new Error("Failed to fetch dynamically imported module: /assets/X.js"),
    });
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it("reloads on a vite:preloadError event", () => {
    listeners["vite:preloadError"]({ preventDefault: vi.fn(), payload: new Error("preload") });
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it("reloads on an unhandledrejection with ChunkLoadError", () => {
    listeners.unhandledrejection({ reason: new Error("ChunkLoadError: ...") });
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it("does not loop: second matching event in the same session is a no-op", () => {
    listeners.error({ error: new Error("Failed to fetch dynamically imported module") });
    listeners.error({ error: new Error("Failed to fetch dynamically imported module") });
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it("clears the loop-guard after the TTL so a later deploy can trigger again", () => {
    listeners.error({ error: new Error("Failed to fetch dynamically imported module") });
    expect(reloadSpy).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(10_001);
    expect(sessionStorage.getItem(RELOAD_FLAG)).toBeNull();
  });

  it("ignores unrelated errors", () => {
    listeners.error({ error: new TypeError("x is not a function") });
    listeners.unhandledrejection({ reason: new Error("network timeout") });
    expect(reloadSpy).not.toHaveBeenCalled();
  });
});

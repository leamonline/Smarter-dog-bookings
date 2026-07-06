import { describe, it, expect, afterEach, vi } from "vitest";
import { isNetworkError, friendlySaveError } from "./friendlyError";

const FALLBACK = "We couldn’t save your details just now. Please try again.";

describe("isNetworkError", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("recognises the common fetch/network failure shapes", () => {
    expect(isNetworkError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isNetworkError({ message: "NetworkError when attempting to fetch resource" })).toBe(true);
    expect(isNetworkError({ message: "Load failed" })).toBe(true);
    expect(isNetworkError("network request failed")).toBe(true);
    expect(isNetworkError({ message: "connection reset by peer" })).toBe(true);
    expect(isNetworkError({ message: "request timed out" })).toBe(true);
  });

  it("does NOT treat a real server/DB error as a network drop", () => {
    expect(isNetworkError({ message: 'duplicate key value violates unique constraint "humans_email_key"' })).toBe(false);
    expect(isNetworkError({ message: "new row violates row-level security policy" })).toBe(false);
    expect(isNetworkError({ message: "Capped at 1 (2-2-1 rule)" })).toBe(false);
    expect(isNetworkError(null)).toBe(false);
    expect(isNetworkError(undefined)).toBe(false);
  });

  it("trusts navigator.onLine === false even with an empty error", () => {
    vi.stubGlobal("navigator", { onLine: false });
    expect(isNetworkError(null)).toBe(true);
  });
});

describe("friendlySaveError", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("gives a distinct, reassuring line for a dropped connection", () => {
    const msg = friendlySaveError(new TypeError("Failed to fetch"), FALLBACK);
    expect(msg).toMatch(/offline|connection/i);
    expect(msg).toMatch(/nothing’s lost|try again/i);
  });

  it("returns the caller's fallback for a real error — never the raw message", () => {
    const raw = 'duplicate key value violates unique constraint "humans_email_key"';
    const msg = friendlySaveError({ message: raw }, FALLBACK);
    expect(msg).toBe(FALLBACK);
    expect(msg).not.toContain(raw);
    expect(msg).not.toMatch(/constraint|violates|row-level/i);
  });
});

// useDraftPersistence tests. Lives in the component project (jsdom) because the
// hook needs renderHook + a real localStorage (a browser global).
import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

import { useDraftPersistence } from "./useDraftPersistence.js";

const KEY = "sdb:draft:test:abc";
const DAY_MS = 24 * 60 * 60 * 1000;

function seed(key, payload) {
  localStorage.setItem(key, JSON.stringify(payload));
}

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("useDraftPersistence", () => {
  it("returns null when no draft is stored", () => {
    const { result } = renderHook(() => useDraftPersistence(KEY));
    expect(result.current.restored).toBeNull();
  });

  it("restores the saved data object when a valid draft exists", () => {
    const data = { name: "Ada", dogs: [{ name: "Rex" }] };
    seed(KEY, { savedAt: Date.now(), data });

    const { result } = renderHook(() => useDraftPersistence(KEY));
    expect(result.current.restored).toEqual(data);
  });

  it("save() writes { savedAt, data } under the key and round-trips", () => {
    const { result } = renderHook(() => useDraftPersistence(KEY));
    const obj = { step: 2, email: "a@b.co" };

    act(() => result.current.save(obj));

    const stored = JSON.parse(localStorage.getItem(KEY));
    expect(stored.data).toEqual(obj);
    expect(typeof stored.savedAt).toBe("number");
  });

  it("clear() removes the stored draft", () => {
    seed(KEY, { savedAt: Date.now(), data: { a: 1 } });
    const { result } = renderHook(() => useDraftPersistence(KEY));

    act(() => result.current.clear());

    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("ignores and clears a draft older than the default 7-day expiry", () => {
    seed(KEY, { savedAt: Date.now() - 8 * DAY_MS, data: { a: 1 } });

    const { result } = renderHook(() => useDraftPersistence(KEY));

    expect(result.current.restored).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull(); // stale entry removed
  });

  it("honours a custom maxAgeMs", () => {
    // Just outside a 1s window → ignored.
    seed(KEY, { savedAt: Date.now() - 2000, data: { stale: true } });
    const { result: stale } = renderHook(() =>
      useDraftPersistence(KEY, { maxAgeMs: 1000 }),
    );
    expect(stale.current.restored).toBeNull();

    // Inside the window → restored.
    const fresh = { fresh: true };
    seed(KEY, { savedAt: Date.now(), data: fresh });
    const { result: ok } = renderHook(() =>
      useDraftPersistence(KEY, { maxAgeMs: 1000 }),
    );
    expect(ok.current.restored).toEqual(fresh);
  });

  it("is a no-op when disabled: restored is null and save() writes nothing", () => {
    seed(KEY, { savedAt: Date.now(), data: { a: 1 } });

    const { result } = renderHook(() =>
      useDraftPersistence(KEY, { enabled: false }),
    );

    expect(result.current.restored).toBeNull();

    act(() => result.current.save({ b: 2 }));
    // The seeded value is untouched and no new write happened.
    expect(JSON.parse(localStorage.getItem(KEY)).data).toEqual({ a: 1 });
  });

  it("tolerates corrupt JSON (restored null, no throw)", () => {
    localStorage.setItem(KEY, "{not valid json");
    const { result } = renderHook(() => useDraftPersistence(KEY));
    expect(result.current.restored).toBeNull();
  });

  it("tolerates a payload missing the data field", () => {
    seed(KEY, { savedAt: Date.now() });
    const { result } = renderHook(() => useDraftPersistence(KEY));
    expect(result.current.restored).toBeNull();
  });

  it("survives a localStorage read failure", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });
    const { result } = renderHook(() => useDraftPersistence(KEY));
    expect(result.current.restored).toBeNull();
  });

  it("swallows a localStorage write failure in save()", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });
    const { result } = renderHook(() => useDraftPersistence(KEY));
    expect(() => act(() => result.current.save({ a: 1 }))).not.toThrow();
  });

  it("reads the draft once per mount — later storage changes don't affect restored", () => {
    const original = { v: 1 };
    seed(KEY, { savedAt: Date.now(), data: original });

    const { result, rerender } = renderHook(() => useDraftPersistence(KEY));
    expect(result.current.restored).toEqual(original);

    // Mutate storage after mount; restored is ref-stable and must not change.
    seed(KEY, { savedAt: Date.now(), data: { v: 2 } });
    rerender();
    expect(result.current.restored).toEqual(original);
  });
});

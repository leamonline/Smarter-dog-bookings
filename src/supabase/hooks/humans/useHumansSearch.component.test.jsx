import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useHumansSearch } from "./useHumansSearch";

// The search hook is a pure state machine — no supabase. The directory
// fetch lives in useHumansData; this seam only owns the debounce and the
// isSearching flag, so that's all these tests cover.
afterEach(() => {
  vi.useRealTimers();
});

describe("useHumansSearch", () => {
  it("mirrors the input immediately and flags isSearching", () => {
    const { result } = renderHook(() => useHumansSearch());

    act(() => result.current.searchHumans("da"));

    expect(result.current.searchQuery).toBe("da");
    expect(result.current.isSearching).toBe(true);
    // The debounced term hasn't fired yet.
    expect(result.current.effectiveSearch).toBe("");
  });

  it("coalesces rapid keystrokes into one trimmed effectiveSearch", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useHumansSearch());

    act(() => result.current.searchHumans("d"));
    act(() => result.current.searchHumans("da"));
    act(() => result.current.searchHumans("  dave "));

    // Each keystroke restarts the 300ms window — nothing fires at 299ms.
    act(() => vi.advanceTimersByTime(299));
    expect(result.current.effectiveSearch).toBe("");

    act(() => vi.advanceTimersByTime(1));
    // Only the final term lands, trimmed; "d"/"da" never fired.
    expect(result.current.effectiveSearch).toBe("dave");
    expect(result.current.searchQuery).toBe("  dave ");
  });

  it("finishSearching clears the in-flight flag", () => {
    const { result } = renderHook(() => useHumansSearch());

    act(() => result.current.searchHumans("dave"));
    expect(result.current.isSearching).toBe(true);

    // useHumansData calls this once the directory RPC settles.
    act(() => result.current.finishSearching());
    expect(result.current.isSearching).toBe(false);
  });
});

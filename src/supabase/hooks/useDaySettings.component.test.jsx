// Boot-prefetch consumption tests for useDaySettings (consume + fallback).
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

function setSupabase(value) {
  globalThis.__supabaseMockDaySettings = value;
}

vi.mock("../client.js", () => ({
  get supabase() {
    return globalThis.__supabaseMockDaySettings;
  },
}));

vi.mock("../bootPrefetch.js", () => ({
  primeBootPrefetch: vi.fn(),
  takeBootPrefetch: vi.fn(() => null),
  _resetBootPrefetchForTests: vi.fn(),
}));

const { takeBootPrefetch } = await import("../bootPrefetch.js");
const { useDaySettings } = await import("./useDaySettings.js");

const weekStart = new Date(2026, 4, 18); // Mon 18 May 2026

// Realistic day_settings row for the Monday of the test week.
const ROW = {
  setting_date: "2026-05-18",
  is_open: true,
  overrides: { "09:00": { 0: "block" } },
  extra_slots: ["13:30"],
};

// Realtime channel + the fallback week select, whose terminal is
// .abortSignal().
function makeStub({ selectResult } = {}) {
  const channel = {
    on: vi.fn(() => channel),
    subscribe: vi.fn(() => channel),
  };
  const builder = {};
  for (const m of ["select", "gte", "lte"]) {
    builder[m] = vi.fn(() => builder);
  }
  builder.abortSignal = vi.fn(() =>
    Promise.resolve(selectResult ?? { data: [], error: null }),
  );
  return {
    from: vi.fn(() => builder),
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(),
  };
}

beforeEach(() => {
  setSupabase(undefined);
  takeBootPrefetch.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useDaySettings boot prefetch", () => {
  it("consumes a primed week promise and skips its own initial read", async () => {
    takeBootPrefetch.mockReturnValue(
      Promise.resolve({ data: [ROW], error: null }),
    );
    const stub = makeStub();
    setSupabase(stub);

    const { result } = renderHook(() => useDaySettings(weekStart));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(takeBootPrefetch).toHaveBeenCalledWith("daySettingsWeek", {
      startStr: "2026-05-18",
    });
    // The DB row overrides the built defaults for its date…
    expect(result.current.daySettings["2026-05-18"]).toEqual({
      isOpen: true,
      overrides: { "09:00": { 0: "block" } },
      extraSlots: ["13:30"],
    });
    // …the other six days still get defaults…
    expect(Object.keys(result.current.daySettings)).toHaveLength(7);
    // …and the client was never asked for the initial read.
    expect(stub.from).not.toHaveBeenCalled();
  });

  it("falls back to its own read when the prefetch misses", async () => {
    takeBootPrefetch.mockReturnValue(null);
    const stub = makeStub({ selectResult: { data: [ROW], error: null } });
    setSupabase(stub);

    const { result } = renderHook(() => useDaySettings(weekStart));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(stub.from).toHaveBeenCalledWith("day_settings");
    expect(result.current.daySettings["2026-05-18"].extraSlots).toEqual([
      "13:30",
    ]);
  });
});

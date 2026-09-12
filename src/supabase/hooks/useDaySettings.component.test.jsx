// Boot-prefetch consumption tests for useDaySettings (consume + fallback).
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

function setSupabase(value) {
  globalThis.__supabaseMockDaySettings = value;
}

vi.mock("../client", () => ({
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
const { useDaySettings } = await import("./useDaySettings");

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
function makeStub({ selectResult, upsertResult, rpcResult } = {}) {
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
  builder.upsert = vi.fn(() =>
    Promise.resolve(upsertResult ?? { data: null, error: null }),
  );
  return {
    from: vi.fn(() => builder),
    rpc: vi.fn(() =>
      Promise.resolve(rpcResult ?? { data: { status: "closed" }, error: null }),
    ),
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(),
    builder,
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
      immediateSlots: [],
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

describe("useDaySettings closure integrity", () => {
  it("closes a day through the atomic closure RPC rather than a plain settings upsert", async () => {
    takeBootPrefetch.mockReturnValue(
      Promise.resolve({ data: [ROW], error: null }),
    );
    const stub = makeStub();
    setSupabase(stub);

    const { result } = renderHook(() => useDaySettings(weekStart));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let outcome;
    await act(async () => {
      outcome = await result.current.toggleDayOpen("2026-05-18");
    });

    expect(stub.rpc).toHaveBeenCalledWith(
      "close_day_with_rearrangement_tasks",
      { p_date: "2026-05-18" },
    );
    expect(stub.builder.upsert).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ ok: true });
    expect(result.current.daySettings["2026-05-18"].isOpen).toBe(false);
  });

  it("rolls the optimistic closure back when the atomic command fails", async () => {
    takeBootPrefetch.mockReturnValue(
      Promise.resolve({ data: [ROW], error: null }),
    );
    const stub = makeStub({
      rpcResult: {
        data: null,
        error: { message: "closure could not be saved" },
      },
    });
    setSupabase(stub);

    const { result } = renderHook(() => useDaySettings(weekStart));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let outcome;
    await act(async () => {
      outcome = await result.current.toggleDayOpen("2026-05-18");
    });

    expect(outcome).toEqual({
      ok: false,
      error: "closure could not be saved",
    });
    expect(result.current.daySettings["2026-05-18"].isOpen).toBe(true);
  });

  it("keeps an ordinary day-settings upsert for reopening", async () => {
    takeBootPrefetch.mockReturnValue(
      Promise.resolve({
        data: [{ ...ROW, is_open: false }],
        error: null,
      }),
    );
    const stub = makeStub();
    setSupabase(stub);

    const { result } = renderHook(() => useDaySettings(weekStart));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.toggleDayOpen("2026-05-18");
    });

    expect(stub.rpc).not.toHaveBeenCalled();
    expect(stub.builder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        setting_date: "2026-05-18",
        is_open: true,
      }),
      { onConflict: "setting_date" },
    );
  });

  it("honours an explicit close target instead of reopening stale state", async () => {
    takeBootPrefetch.mockReturnValue(
      Promise.resolve({
        data: [{ ...ROW, is_open: false }],
        error: null,
      }),
    );
    const stub = makeStub();
    setSupabase(stub);

    const { result } = renderHook(() => useDaySettings(weekStart));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.toggleDayOpen("2026-05-18", false);
    });

    expect(stub.rpc).toHaveBeenCalledWith(
      "close_day_with_rearrangement_tasks",
      { p_date: "2026-05-18" },
    );
    expect(stub.builder.upsert).not.toHaveBeenCalled();
    expect(result.current.daySettings["2026-05-18"].isOpen).toBe(false);
  });
});

// Blocking a whole timeslot must be ONE write. Every day-settings mutation
// upserts the entire row, so two calls for the same slot raced on the same
// primary key: the first payload (seat 0 only) was already stale when it left,
// and if it committed last the row came back with just one seat blocked.
describe("useDaySettings — setOverride across several seats", () => {
  it("sends one upsert carrying every seat when given a list", async () => {
    takeBootPrefetch.mockReturnValue(
      Promise.resolve({ data: [{ ...ROW, overrides: {} }], error: null }),
    );
    const stub = makeStub();
    setSupabase(stub);

    const { result } = renderHook(() => useDaySettings(weekStart));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.setOverride("2026-05-18", "09:00", [0, 1], "blocked");
    });

    expect(stub.builder.upsert).toHaveBeenCalledTimes(1);
    expect(stub.builder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        setting_date: "2026-05-18",
        overrides: { "09:00": { 0: "blocked", 1: "blocked" } },
      }),
      { onConflict: "setting_date" },
    );
    expect(result.current.daySettings["2026-05-18"].overrides).toEqual({
      "09:00": { 0: "blocked", 1: "blocked" },
    });
  });

  it("keeps per-seat toggle semantics, so the same list unblocks again", async () => {
    takeBootPrefetch.mockReturnValue(
      Promise.resolve({
        data: [{ ...ROW, overrides: { "09:00": { 0: "blocked", 1: "blocked" } } }],
        error: null,
      }),
    );
    const stub = makeStub();
    setSupabase(stub);

    const { result } = renderHook(() => useDaySettings(weekStart));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.setOverride("2026-05-18", "09:00", [0, 1], "blocked");
    });

    expect(stub.builder.upsert).toHaveBeenCalledTimes(1);
    // Both seats cleared, so the slot key drops out of overrides entirely.
    expect(result.current.daySettings["2026-05-18"].overrides).toEqual({});
  });

  it("still accepts a bare seat index for a single-seat block", async () => {
    takeBootPrefetch.mockReturnValue(
      Promise.resolve({ data: [{ ...ROW, overrides: {} }], error: null }),
    );
    const stub = makeStub();
    setSupabase(stub);

    const { result } = renderHook(() => useDaySettings(weekStart));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.setOverride("2026-05-18", "09:00", 1, "blocked");
    });

    expect(result.current.daySettings["2026-05-18"].overrides).toEqual({
      "09:00": { 1: "blocked" },
    });
  });
});

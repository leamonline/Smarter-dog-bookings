// Boot-prefetch consumption tests for useSalonConfig (consume + fallback).
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

function setSupabase(value) {
  globalThis.__supabaseMockSalonConfig = value;
}

vi.mock("../client.js", () => ({
  get supabase() {
    return globalThis.__supabaseMockSalonConfig;
  },
}));

vi.mock("../bootPrefetch.js", () => ({
  primeBootPrefetch: vi.fn(),
  takeBootPrefetch: vi.fn(() => null),
  _resetBootPrefetchForTests: vi.fn(),
}));

const { takeBootPrefetch } = await import("../bootPrefetch.js");
const { useSalonConfig } = await import("./useSalonConfig.js");

// Realistic salon_config row (dbConfigToApp folds defaults over nulls).
const CONFIG_ROW = {
  id: "cfg-1",
  default_pickup_offset: 4,
  pricing: null,
  enforce_capacity: true,
  large_dog_slots: null,
  settings: null,
};

// The select chain is .select().limit().abortSignal().maybeSingle();
// maybeSingle is the terminal.
function makeStub({ selectResult } = {}) {
  const builder = {};
  for (const m of ["select", "limit", "abortSignal", "not"]) {
    builder[m] = vi.fn(() => builder);
  }
  builder.maybeSingle = vi.fn(() =>
    Promise.resolve(selectResult ?? { data: null, error: null }),
  );
  return { from: vi.fn(() => builder) };
}

beforeEach(() => {
  setSupabase(undefined);
  takeBootPrefetch.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useSalonConfig boot prefetch", () => {
  it("consumes a primed config promise and skips its own SELECT", async () => {
    takeBootPrefetch.mockReturnValue(
      Promise.resolve({ data: CONFIG_ROW, error: null }),
    );
    const stub = makeStub();
    setSupabase(stub);

    const { result } = renderHook(() => useSalonConfig());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(takeBootPrefetch).toHaveBeenCalledWith("salonConfig");
    // Prefetched row flows through dbConfigToApp as usual…
    expect(result.current.config?.defaultPickupOffset).toBe(4);
    expect(result.current.config?.enforceCapacity).toBe(true);
    expect(result.current.error).toBeNull();
    // …and the client was never asked for the initial read.
    expect(stub.from).not.toHaveBeenCalled();
  });

  it("falls back to its own SELECT when the prefetch misses", async () => {
    takeBootPrefetch.mockReturnValue(null);
    const stub = makeStub({ selectResult: { data: CONFIG_ROW, error: null } });
    setSupabase(stub);

    const { result } = renderHook(() => useSalonConfig());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(stub.from).toHaveBeenCalledWith("salon_config");
    expect(result.current.config?.defaultPickupOffset).toBe(4);
    expect(result.current.error).toBeNull();
  });
});

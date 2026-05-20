import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

function setSupabase(value) {
  globalThis.__supabaseMockDogs = value;
}

vi.mock("../client.js", () => ({
  get supabase() {
    return globalThis.__supabaseMockDogs;
  },
}));

const { useDogs } = await import("./useDogs.js");

function makeSupabaseStub({ countResult, rowsResult } = {}) {
  const channel = {};
  channel.on = vi.fn(() => channel);
  channel.subscribe = vi.fn(() => channel);

  return {
    from: vi.fn(() => {
      const builder = {};
      const terminal = vi.fn();

      builder.select = vi.fn((_cols, opts) => {
        // count query: select('*', { count: 'exact', head: true })
        if (opts?.head) {
          builder.abortSignal = vi.fn(() =>
            Promise.resolve(countResult ?? { count: 0, error: null }),
          );
        } else {
          builder.abortSignal = vi.fn(() =>
            Promise.resolve(rowsResult ?? { data: [], error: null }),
          );
        }
        return builder;
      });

      builder.order = vi.fn(() => builder);
      builder.limit = vi.fn(() => builder);
      builder.eq = vi.fn(() => builder);
      builder.range = vi.fn(() => Promise.resolve(rowsResult ?? { data: [], error: null }));
      // Default abortSignal in case select() hasn't been called yet
      builder.abortSignal = vi.fn(() => Promise.resolve({ data: [], error: null }));
      terminal;
      return builder;
    }),
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(),
  };
}

describe("useDogs", () => {
  beforeEach(() => {
    setSupabase(undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns loading=false and empty maps in offline mode", async () => {
    setSupabase(null);
    const { result } = renderHook(() => useDogs({}));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.dogs).toEqual({});
    expect(result.current.dogsById).toEqual({});
    expect(result.current.error).toBeNull();
  });

  it("loads the initial page of dogs and exposes them through dogs / dogsById", async () => {
    const rows = [
      { id: "dog-1", name: "Bella", breed: "Cockapoo", size: "small", human_id: "human-1" },
      { id: "dog-2", name: "Max", breed: "Shih Tzu", size: "medium", human_id: "human-1" },
    ];
    setSupabase(
      makeSupabaseStub({
        countResult: { count: 2, error: null },
        rowsResult: { data: rows, error: null },
      }),
    );

    const humansById = {
      "human-1": { id: "human-1", name: "Sarah", surname: "Jones", fullName: "Sarah Jones" },
    };

    const { result } = renderHook(() => useDogs(humansById));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(Object.keys(result.current.dogsById)).toEqual(["dog-1", "dog-2"]);
    expect(result.current.dogsById["dog-1"].name).toBe("Bella");
    expect(result.current.totalCount).toBe(2);
  });

  it("surfaces fetch errors via the error field", async () => {
    setSupabase(
      makeSupabaseStub({
        countResult: { count: null, error: { message: "rls denied" } },
      }),
    );
    const { result } = renderHook(() => useDogs({}));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("rls denied");
  });
});

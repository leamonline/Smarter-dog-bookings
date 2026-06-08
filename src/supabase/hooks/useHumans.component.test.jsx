import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

function setSupabase(value) {
  globalThis.__supabaseMockHumans = value;
}

vi.mock("../client.js", () => ({
  get supabase() {
    return globalThis.__supabaseMockHumans;
  },
}));

const { useHumans } = await import("./useHumans.js");

// The directory now loads through the search_humans_directory RPC, which
// returns { rows, total, letters }. The stub records every rpc call so tests
// can assert the params (offset, sort, filter flags, letter) the hook sends.
function makeSupabaseStub(rpcImpl) {
  const channel = {};
  channel.on = vi.fn(() => channel);
  channel.subscribe = vi.fn(() => channel);

  const rpc = vi.fn((fn, params) =>
    Promise.resolve(
      rpcImpl
        ? rpcImpl(fn, params)
        : { data: { rows: [], total: 0, letters: [] }, error: null },
    ),
  );

  return {
    rpc,
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn(() => Promise.resolve({ data: [], error: null })),
      single: vi.fn(() => Promise.resolve({ data: null, error: null })),
    })),
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(),
  };
}

const h1 = { id: "h1", name: "Sarah", surname: "Jones", phone: "07700900111", whatsapp: true };
const h2 = { id: "h2", name: "Dave", surname: "Smith", phone: "07700900112" };

describe("useHumans directory", () => {
  beforeEach(() => {
    setSupabase(undefined);
    try {
      localStorage.removeItem("humansDirSort");
    } catch {
      /* ignore */
    }
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("falls back to empty maps and loading=false when supabase is null", async () => {
    setSupabase(null);
    const { result } = renderHook(() => useHumans());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.humans).toEqual({});
    expect(result.current.directoryHumans).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it("loads the first directory page from the RPC on mount", async () => {
    setSupabase(
      makeSupabaseStub(() => ({
        data: { rows: [h1, h2], total: 2, letters: ["D", "S"] },
        error: null,
      })),
    );
    const { result } = renderHook(() => useHumans());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.directoryHumans.map((h) => h.id)).toEqual(["h1", "h2"]);
    expect(result.current.totalCount).toBe(2);
    expect(result.current.availableLetters).toEqual(["D", "S"]);
    expect(result.current.hasMore).toBe(false);
    // Rows are folded into the lookup cache too.
    expect(result.current.humansById.h1.fullName).toBe("Sarah Jones");
  });

  it("surfaces an RPC error via state.error", async () => {
    setSupabase(
      makeSupabaseStub(() => ({ data: null, error: { message: "rls denied" } })),
    );
    const { result } = renderHook(() => useHumans());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("rls denied");
  });

  it("loadMore appends the next page with an incremented offset", async () => {
    const stub = makeSupabaseStub((_fn, params) => ({
      data: {
        rows: params.p_offset === 0 ? [h1] : [h2],
        total: 5,
        letters: ["D", "S"],
      },
      error: null,
    }));
    setSupabase(stub);
    const { result } = renderHook(() => useHumans());
    await waitFor(() => expect(result.current.directoryHumans.length).toBe(1));
    expect(result.current.hasMore).toBe(true); // 1 loaded of 5

    await act(async () => {
      await result.current.loadMore();
    });

    expect(result.current.directoryHumans.map((h) => h.id)).toEqual(["h1", "h2"]);
    // Second RPC call paged from offset 1.
    const offsets = stub.rpc.mock.calls.map(([, p]) => p.p_offset);
    expect(offsets).toContain(1);
  });

  it("setDirSort persists the choice and refetches with p_sort=last", async () => {
    const stub = makeSupabaseStub(() => ({
      data: { rows: [h1], total: 1, letters: ["S"] },
      error: null,
    }));
    setSupabase(stub);
    const { result } = renderHook(() => useHumans());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.setDirSort("last"));

    await waitFor(() =>
      expect(stub.rpc.mock.calls.some(([, p]) => p.p_sort === "last")).toBe(true),
    );
    expect(localStorage.getItem("humansDirSort")).toBe("last");
  });

  it("toggleDirFilter sends the server filter flag, and setDirLetter sends the letter", async () => {
    const stub = makeSupabaseStub(() => ({
      data: { rows: [], total: 0, letters: [] },
      error: null,
    }));
    setSupabase(stub);
    const { result } = renderHook(() => useHumans());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.toggleDirFilter("noDogs"));
    await waitFor(() =>
      expect(stub.rpc.mock.calls.some(([, p]) => p.p_no_dogs === true)).toBe(true),
    );

    act(() => result.current.setDirLetter("A"));
    await waitFor(() =>
      expect(stub.rpc.mock.calls.some(([, p]) => p.p_letter === "A")).toBe(true),
    );
  });

  it("debounced search drives the RPC's p_search param", async () => {
    const stub = makeSupabaseStub(() => ({
      data: { rows: [h2], total: 1, letters: ["D"] },
      error: null,
    }));
    setSupabase(stub);
    const { result } = renderHook(() => useHumans());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.searchHumans("dave"));
    expect(result.current.searchQuery).toBe("dave"); // input reflects immediately

    await waitFor(() =>
      expect(stub.rpc.mock.calls.some(([, p]) => p.p_search === "dave")).toBe(true),
    );
  });
});

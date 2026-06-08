import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

function setSupabase(value) {
  globalThis.__supabaseMockDogs = value;
}

vi.mock("../client.js", () => ({
  get supabase() {
    return globalThis.__supabaseMockDogs;
  },
}));

const { useDogs } = await import("./useDogs.js");

// The Dogs Directory is now server-driven: the initial load, search, filters,
// sort, A–Z and counts all go through the search_dogs_directory RPC. The stub
// records rpc() calls and returns a configurable { rows, total, letters }.
function makeSupabaseStub({ rpcImpl } = {}) {
  const channel = {};
  channel.on = vi.fn(() => channel);
  channel.subscribe = vi.fn(() => channel);

  const rpc = vi.fn((name, args) =>
    Promise.resolve(
      rpcImpl
        ? rpcImpl(name, args)
        : { data: { rows: [], total: 0, letters: [] }, error: null },
    ),
  );

  // from() is only hit by the lookup-cache helpers / archived fetch, none of
  // which these tests trigger — keep it chainable so an accidental call is inert.
  const from = vi.fn(() => {
    const builder = {};
    builder.select = vi.fn(() => builder);
    builder.not = vi.fn(() => builder);
    builder.order = vi.fn(() => builder);
    builder.eq = vi.fn(() => builder);
    builder.in = vi.fn(() => Promise.resolve({ data: [], error: null }));
    builder.limit = vi.fn(() => Promise.resolve({ data: [], error: null }));
    builder.single = vi.fn(() => Promise.resolve({ data: null, error: null }));
    return builder;
  });

  return { rpc, from, channel: vi.fn(() => channel), removeChannel: vi.fn() };
}

const ROW = (over = {}) => ({
  id: "dog-1",
  name: "Bella",
  breed: "Cockapoo",
  size: "small",
  human_id: "human-1",
  owner_name: "Sarah",
  owner_surname: "Jones",
  owner_phone: "07700900111",
  owner_whatsapp: false,
  ...over,
});

describe("useDogs", () => {
  beforeEach(() => {
    setSupabase(undefined);
    try {
      localStorage.removeItem("dogsDirSort");
    } catch {
      /* ignore */
    }
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

  it("loads the initial directory page via the RPC and exposes list, caches, total and letters", async () => {
    const rows = [ROW(), ROW({ id: "dog-2", name: "Max", breed: "Shih Tzu", size: "medium" })];
    setSupabase(
      makeSupabaseStub({
        rpcImpl: () => ({ data: { rows, total: 2, letters: ["B", "M"] }, error: null }),
      }),
    );

    const { result } = renderHook(() =>
      useDogs({ "human-1": { id: "human-1", name: "Sarah", surname: "Jones", fullName: "Sarah Jones" } }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.directoryDogs.map((d) => d.id)).toEqual(["dog-1", "dog-2"]);
    expect(result.current.directoryDogs[0].ownerFullName).toBe("Sarah Jones");
    expect(Object.keys(result.current.dogsById)).toEqual(["dog-1", "dog-2"]);
    expect(result.current.totalCount).toBe(2);
    expect(result.current.dogAvailableLetters).toEqual(["B", "M"]);
  });

  it("surfaces RPC errors via the error field", async () => {
    setSupabase(
      makeSupabaseStub({ rpcImpl: () => ({ data: null, error: { message: "rls denied" } }) }),
    );
    const { result } = renderHook(() => useDogs({}));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("rls denied");
  });

  it("setDirSort persists the mode and refetches with p_sort=recent", async () => {
    const stub = makeSupabaseStub({
      rpcImpl: () => ({ data: { rows: [ROW()], total: 1, letters: ["B"] }, error: null }),
    });
    setSupabase(stub);
    const { result } = renderHook(() => useDogs({}));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.setDirSort("recent"));

    await waitFor(() =>
      expect(stub.rpc).toHaveBeenLastCalledWith(
        "search_dogs_directory",
        expect.objectContaining({ p_sort: "recent" }),
      ),
    );
    expect(localStorage.getItem("dogsDirSort")).toBe("recent");
  });

  it("toggleDirFilter('size', ...) refetches with the size filter", async () => {
    const stub = makeSupabaseStub({
      rpcImpl: () => ({ data: { rows: [ROW()], total: 1, letters: ["B"] }, error: null }),
    });
    setSupabase(stub);
    const { result } = renderHook(() => useDogs({}));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.toggleDirFilter("size", "small"));

    await waitFor(() =>
      expect(stub.rpc).toHaveBeenLastCalledWith(
        "search_dogs_directory",
        expect.objectContaining({ p_size: "small" }),
      ),
    );
  });

  it("loadMore appends the next page with an incremented offset", async () => {
    const stub = makeSupabaseStub({
      rpcImpl: (_n, args) =>
        args.p_offset === 0
          ? { data: { rows: [ROW(), ROW({ id: "dog-2", name: "Max" })], total: 4, letters: ["B", "M"] }, error: null }
          : { data: { rows: [ROW({ id: "dog-3", name: "Coco" })], total: 4, letters: ["B", "C", "M"] }, error: null },
    });
    setSupabase(stub);
    const { result } = renderHook(() => useDogs({}));
    await waitFor(() => expect(result.current.directoryDogs.length).toBe(2));

    await act(async () => {
      await result.current.loadMore();
    });

    expect(stub.rpc).toHaveBeenLastCalledWith(
      "search_dogs_directory",
      expect.objectContaining({ p_offset: 2 }),
    );
    expect(result.current.directoryDogs.map((d) => d.id)).toEqual(["dog-1", "dog-2", "dog-3"]);
  });

  it("a directory refetch merges into dogsById without evicting earlier rows", async () => {
    const stub = makeSupabaseStub({
      rpcImpl: (_n, args) =>
        args.p_sort === "recent"
          ? { data: { rows: [ROW({ id: "dog-9", name: "Rex" })], total: 1, letters: ["R"] }, error: null }
          : { data: { rows: [ROW(), ROW({ id: "dog-2", name: "Max" })], total: 2, letters: ["B", "M"] }, error: null },
    });
    setSupabase(stub);
    const { result } = renderHook(() => useDogs({}));
    await waitFor(() => expect(Object.keys(result.current.dogsById).sort()).toEqual(["dog-1", "dog-2"]));

    act(() => result.current.setDirSort("recent"));

    // directoryDogs is replaced by the new page...
    await waitFor(() => expect(result.current.directoryDogs.map((d) => d.id)).toEqual(["dog-9"]));
    // ...but the lookup cache keeps the earlier rows (never evict).
    expect(Object.keys(result.current.dogsById).sort()).toEqual(["dog-1", "dog-2", "dog-9"]);
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

function setSupabase(value) {
  globalThis.__supabaseMockHumansData = value;
}

vi.mock("../../client.js", () => ({
  get supabase() {
    return globalThis.__supabaseMockHumansData;
  },
}));

const { useHumansData } = await import("./useHumansData");

// Trimmed copy of the useHumans anchor harness: records rpc calls, captures
// realtime handlers (fire via stub._channel.fire), and resolves from()
// chains through fromImpl.
function makeStub(rpcImpl, { fromImpl } = {}) {
  const handlers = [];
  const channel = { _handlers: handlers };
  channel.on = vi.fn((_type, filter, cb) => {
    handlers.push({ filter, cb });
    return channel;
  });
  channel.subscribe = vi.fn(() => channel);
  channel.fire = (event, payload) => {
    for (const h of handlers) {
      if (h.filter?.event === event) h.cb(payload);
    }
  };

  const rpc = vi.fn((fn, params) =>
    Promise.resolve(
      rpcImpl
        ? rpcImpl(fn, params)
        : { data: { rows: [], total: 0, letters: [] }, error: null },
    ),
  );

  const from = vi.fn((table) => {
    const calls = [];
    const builder = {};
    for (const m of ["select", "not", "order", "limit"]) {
      builder[m] = vi.fn((...args) => {
        calls.push({ method: m, args });
        return builder;
      });
    }
    builder.then = (onResolve, onReject) => {
      const result = fromImpl?.({ table, calls });
      return Promise.resolve(result ?? { data: [], error: null }).then(
        onResolve,
        onReject,
      );
    };
    return builder;
  });

  return { rpc, from, channel: vi.fn(() => channel), removeChannel: vi.fn(), _channel: channel };
}

const h1 = { id: "h1", name: "Sarah", surname: "Jones", phone: "07700900111" };
const h2 = { id: "h2", name: "Dave", surname: "Smith", phone: "07700900112" };

function renderData(props = {}) {
  return renderHook(() =>
    useHumansData({
      effectiveSearch: "",
      finishSearching: () => {},
      ...props,
    }),
  );
}

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

describe("useHumansData directory", () => {
  it("falls back to empty maps and loading=false when supabase is null", async () => {
    setSupabase(null);
    const { result } = renderData();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.humans).toEqual({});
    expect(result.current.directoryHumans).toEqual([]);
  });

  it("loads page 0 on mount, folds the caches and reports finishSearching", async () => {
    const finishSearching = vi.fn();
    setSupabase(
      makeStub(() => ({
        data: { rows: [h1, h2], total: 2, letters: ["D", "S"] },
        error: null,
      })),
    );
    const { result } = renderData({ finishSearching });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.directoryHumans.map((h) => h.id)).toEqual(["h1", "h2"]);
    expect(result.current.totalCount).toBe(2);
    expect(result.current.availableLetters).toEqual(["D", "S"]);
    expect(result.current.hasMore).toBe(false);
    expect(result.current.humansById.h1.fullName).toBe("Sarah Jones");
    expect(result.current.humans["Sarah Jones"].id).toBe("h1");
    // The search hook's isSearching flag is cleared once the page lands.
    expect(finishSearching).toHaveBeenCalled();
  });

  it("surfaces an RPC error via state.error (and still settles the search)", async () => {
    const finishSearching = vi.fn();
    setSupabase(makeStub(() => ({ data: null, error: { message: "rls denied" } })));
    const { result } = renderData({ finishSearching });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("rls denied");
    expect(finishSearching).toHaveBeenCalled();
  });

  it("loadMore appends the next page from the current offset", async () => {
    const stub = makeStub((_fn, params) => ({
      data: { rows: params.p_offset === 0 ? [h1] : [h2], total: 2, letters: [] },
      error: null,
    }));
    setSupabase(stub);
    const { result } = renderData();
    await waitFor(() => expect(result.current.directoryHumans.length).toBe(1));
    expect(result.current.hasMore).toBe(true);

    await act(async () => {
      await result.current.loadMore();
    });

    expect(result.current.directoryHumans.map((h) => h.id)).toEqual(["h1", "h2"]);
    expect(result.current.hasMore).toBe(false);
    expect(stub.rpc.mock.calls.map(([, p]) => p.p_offset)).toContain(1);
  });

  it("sort, filters and letter drive the RPC params; sort persists", async () => {
    const stub = makeStub();
    setSupabase(stub);
    const { result } = renderData();
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.setDirSort("last"));
    await waitFor(() =>
      expect(stub.rpc.mock.calls.some(([, p]) => p.p_sort === "last")).toBe(true),
    );
    expect(localStorage.getItem("humansDirSort")).toBe("last");

    act(() => result.current.toggleDirFilter("noDogs"));
    await waitFor(() =>
      expect(stub.rpc.mock.calls.some(([, p]) => p.p_no_dogs === true)).toBe(true),
    );

    act(() => result.current.setDirLetter("A"));
    await waitFor(() => expect(result.current.dirLetter).toBe("A"));
    // Clicking the active letter again clears it.
    act(() => result.current.setDirLetter("A"));
    await waitFor(() => expect(result.current.dirLetter).toBeNull());
  });
});

describe("useHumansData realtime", () => {
  it("DELETE drops the row from caches, list and count; payloads without old.id are ignored", async () => {
    const stub = makeStub(() => ({
      data: { rows: [h1, h2], total: 2, letters: [] },
      error: null,
    }));
    setSupabase(stub);
    const { result } = renderData();
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => stub._channel.fire("DELETE", { old: { id: "h1" } }));

    expect(result.current.humansById.h1).toBeUndefined();
    expect(result.current.humans["Sarah Jones"]).toBeUndefined();
    expect(result.current.directoryHumans.map((h) => h.id)).toEqual(["h2"]);
    expect(result.current.totalCount).toBe(1);

    act(() => stub._channel.fire("DELETE", { old: {} }));
    expect(result.current.directoryHumans.map((h) => h.id)).toEqual(["h2"]);
  });

  it("INSERT/UPDATE refetch page 0 of the live query (queryRef, not mount defaults)", async () => {
    const stub = makeStub(() => ({
      data: { rows: [h1], total: 1, letters: [] },
      error: null,
    }));
    setSupabase(stub);
    const { result } = renderData();
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.toggleDirFilter("flagged"));
    await waitFor(() =>
      expect(stub.rpc.mock.calls.some(([, p]) => p.p_flagged === true)).toBe(true),
    );

    const before = stub.rpc.mock.calls.length;
    act(() => stub._channel.fire("INSERT", { new: { id: "h9" } }));
    await waitFor(() => expect(stub.rpc.mock.calls.length).toBe(before + 1));
    expect(stub.rpc.mock.calls.at(-1)[1]).toMatchObject({
      p_flagged: true,
      p_offset: 0,
    });
  });
});

describe("useHumansData fetchArchivedHumans", () => {
  it("returns mapped rows without merging them into the live caches", async () => {
    const archivedRow = {
      id: "h8",
      name: "Old",
      surname: "Customer",
      archived_at: "2026-05-01T00:00:00Z",
    };
    setSupabase(
      makeStub(undefined, {
        fromImpl: ({ table }) =>
          table === "humans" ? { data: [archivedRow], error: null } : undefined,
      }),
    );
    const { result } = renderData();
    await waitFor(() => expect(result.current.loading).toBe(false));

    const rows = await result.current.fetchArchivedHumans();

    expect(rows).toHaveLength(1);
    expect(rows[0].fullName).toBe("Old Customer");
    expect(result.current.humansById.h8).toBeUndefined();
  });

  it("degrades to an empty list on error", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    setSupabase(
      makeStub(undefined, {
        fromImpl: () => ({ data: null, error: { message: "boom" } }),
      }),
    );
    const { result } = renderData();
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(await result.current.fetchArchivedHumans()).toEqual([]);
    expect(error).toHaveBeenCalled();
  });
});

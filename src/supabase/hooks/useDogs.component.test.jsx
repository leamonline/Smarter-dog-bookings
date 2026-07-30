import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

function setSupabase(value) {
  globalThis.__supabaseMockDogs = value;
}

vi.mock("../client", () => ({
  get supabase() {
    return globalThis.__supabaseMockDogs;
  },
}));

const { useDogs } = await import("./useDogs");

// The Dogs Directory is now server-driven: the initial load, search, filters,
// sort, A–Z and counts all go through the search_dogs_directory RPC. The stub
// records rpc() calls and returns a configurable { rows, total, letters }.
//
// from() covers every table chain the hook issues:
//   .select().eq().single()          → fetchDogById (selectSingleResult)
//   .select().in()                   → ensureDogsForHumans / ensureDogsByIds (inResult)
//   .select().not().order().limit()  → fetchArchivedDogs (limitResult)
//   .insert().select().single()      → addDog (insertResult, default echoes payload)
//   .update().eq().select().single() → updateDog (updateResult)
//   .delete().eq()                   → deleteDog (deleteResult)
// The channel stub captures postgres_changes handlers so tests can fire
// realtime payloads directly (same approach as the useBookings tests).
function makeSupabaseStub({
  rpcImpl,
  onInsert,
  insertResult,
  selectSingleResult,
  updateResult,
  deleteResult,
  inResult,
  limitResult,
} = {}) {
  const handlers = [];
  const channel = { _handlers: handlers };
  channel.on = vi.fn((_event, filter, cb) => {
    handlers.push({ filter, cb });
    return channel;
  });
  channel.subscribe = vi.fn(() => channel);
  channel.fire = (event, payload) => {
    for (const h of handlers) {
      if (h.filter?.event === event) h.cb(payload);
    }
  };

  const rpc = vi.fn((name, args) =>
    Promise.resolve(
      rpcImpl
        ? rpcImpl(name, args)
        : { data: { rows: [], total: 0, letters: [] }, error: null },
    ),
  );

  const updateCalls = [];
  const deleteCalls = [];
  const inCalls = [];

  const from = vi.fn(() => {
    // Each from() call gets a fresh builder; `op` tracks whether a mutation
    // started the chain so the terminal single()/eq() resolves the right result.
    let op = "select";
    const builder = {};
    builder.select = vi.fn(() => builder);
    builder.not = vi.fn(() => builder);
    builder.order = vi.fn(() => builder);
    builder.eq = vi.fn((col, val) => {
      if (op === "delete") {
        deleteCalls.push({ col, val });
        return Promise.resolve(deleteResult ?? { error: null });
      }
      return builder;
    });
    builder.in = vi.fn((col, ids) => {
      inCalls.push({ col, ids });
      return Promise.resolve(
        typeof inResult === "function"
          ? inResult(col, ids)
          : inResult ?? { data: [], error: null },
      );
    });
    builder.limit = vi.fn(() => Promise.resolve(limitResult ?? { data: [], error: null }));
    builder.single = vi.fn(() =>
      Promise.resolve(
        op === "update"
          ? updateResult ?? { data: null, error: null }
          : selectSingleResult ?? { data: null, error: null },
      ),
    );
    builder.update = vi.fn((payload) => {
      op = "update";
      updateCalls.push(payload);
      return builder;
    });
    builder.delete = vi.fn(() => {
      op = "delete";
      return builder;
    });
    builder.insert = vi.fn((payload) => {
      onInsert?.(payload);
      const row = { id: "new-dog", alerts: [], ...payload };
      return {
        select: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve(insertResult ?? { data: row, error: null })),
        })),
      };
    });
    return builder;
  });

  return {
    rpc,
    from,
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(),
    _channel: channel,
    _updateCalls: updateCalls,
    _deleteCalls: deleteCalls,
    _inCalls: inCalls,
  };
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

const HUMANS = {
  "human-1": { id: "human-1", name: "Sarah", surname: "Jones", fullName: "Sarah Jones" },
};

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
    vi.useRealTimers();
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

  it("addDog persists behaviour alerts chosen at creation", async () => {
    let inserted = null;
    const stub = makeSupabaseStub({ onInsert: (p) => { inserted = p; } });
    setSupabase(stub);
    const humans = {
      "human-1": { id: "human-1", name: "Sarah", surname: "Jones", fullName: "Sarah Jones" },
    };
    const { result } = renderHook(() => useDogs(humans));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let saved;
    await act(async () => {
      saved = await result.current.addDog({
        name: "Rex",
        breed: "Cockapoo",
        humanId: "human-1",
        alerts: ["Bites / Nips", "Allergic to chicken"],
      });
    });

    // The insert must carry the alerts (the bug was that it didn't), and the
    // returned dog should surface them.
    expect(inserted).toBeTruthy();
    expect(inserted.alerts).toEqual(["Bites / Nips", "Allergic to chicken"]);
    expect(saved.alerts).toEqual(["Bites / Nips", "Allergic to chicken"]);
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

  // ---- Directory: pagination boundary, letters, sort persistence ----

  it("hasMore tracks the pagination boundary across loadMore", async () => {
    // 3 dogs server-side, page size larger than each stubbed page: the flag
    // must stay true while rows remain and flip false once offset+rows == total.
    const stub = makeSupabaseStub({
      rpcImpl: (_n, args) =>
        args.p_offset === 0
          ? { data: { rows: [ROW(), ROW({ id: "dog-2", name: "Max" })], total: 3, letters: [] }, error: null }
          : { data: { rows: [ROW({ id: "dog-3", name: "Coco" })], total: 3, letters: [] }, error: null },
    });
    setSupabase(stub);
    const { result } = renderHook(() => useDogs({}));
    await waitFor(() => expect(result.current.directoryDogs.length).toBe(2));
    expect(result.current.hasMore).toBe(true);

    await act(async () => {
      await result.current.loadMore();
    });

    expect(result.current.directoryDogs).toHaveLength(3);
    expect(result.current.hasMore).toBe(false);
  });

  it("tolerates a null RPC payload (no rows key) without crashing", async () => {
    setSupabase(makeSupabaseStub({ rpcImpl: () => ({ data: null, error: null }) }));
    const { result } = renderHook(() => useDogs({}));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.directoryDogs).toEqual([]);
    expect(result.current.totalCount).toBe(0);
    expect(result.current.hasMore).toBe(false);
  });

  it("setDirLetter sends the letter and re-selecting it clears back to the full list", async () => {
    const stub = makeSupabaseStub();
    setSupabase(stub);
    const { result } = renderHook(() => useDogs({}));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.setDirLetter("B"));
    await waitFor(() =>
      expect(stub.rpc).toHaveBeenLastCalledWith(
        "search_dogs_directory",
        expect.objectContaining({ p_letter: "B" }),
      ),
    );

    act(() => result.current.setDirLetter("B"));
    await waitFor(() =>
      expect(stub.rpc).toHaveBeenLastCalledWith(
        "search_dogs_directory",
        expect.objectContaining({ p_letter: null }),
      ),
    );
  });

  it("boolean filters toggle and an active size filter clears when re-selected", async () => {
    const stub = makeSupabaseStub();
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

    // Re-selecting the active size acts as a clear (it's an enum chip, not a toggle).
    act(() => result.current.toggleDirFilter("size", "small"));
    await waitFor(() =>
      expect(stub.rpc).toHaveBeenLastCalledWith(
        "search_dogs_directory",
        expect.objectContaining({ p_size: null }),
      ),
    );

    act(() => result.current.toggleDirFilter("alert"));
    await waitFor(() =>
      expect(stub.rpc).toHaveBeenLastCalledWith(
        "search_dogs_directory",
        expect.objectContaining({ p_alert: true }),
      ),
    );

    act(() => result.current.toggleDirFilter("incomplete"));
    await waitFor(() =>
      expect(stub.rpc).toHaveBeenLastCalledWith(
        "search_dogs_directory",
        expect.objectContaining({ p_incomplete: true }),
      ),
    );
  });

  it("initialises dirSort from localStorage so the choice sticks across reloads", async () => {
    localStorage.setItem("dogsDirSort", "recent");
    const stub = makeSupabaseStub();
    setSupabase(stub);
    const { result } = renderHook(() => useDogs({}));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.dirSort).toBe("recent");
    expect(stub.rpc).toHaveBeenCalledWith(
      "search_dogs_directory",
      expect.objectContaining({ p_sort: "recent" }),
    );
  });

  it("setDirSort still refetches when localStorage writes fail (private mode)", async () => {
    const stub = makeSupabaseStub();
    setSupabase(stub);
    const { result } = renderHook(() => useDogs({}));
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Quota / private-mode failures must be non-fatal: the sort still applies.
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });
    act(() => result.current.setDirSort("recent"));

    expect(result.current.dirSort).toBe("recent");
    await waitFor(() =>
      expect(stub.rpc).toHaveBeenLastCalledWith(
        "search_dogs_directory",
        expect.objectContaining({ p_sort: "recent" }),
      ),
    );
  });

  // ---- Debounced search ----

  it("searchDogs debounces 300ms before driving p_search and clearSearch resets", async () => {
    vi.useFakeTimers();
    const stub = makeSupabaseStub();
    setSupabase(stub);
    const { result } = renderHook(() => useDogs({}));
    // Flush the mount fetch (promise microtasks only — no timers involved).
    await act(async () => {});
    expect(result.current.loading).toBe(false);

    act(() => result.current.searchDogs("bella"));
    // The input mirrors immediately; the fetch term waits for the debounce.
    expect(result.current.searchQuery).toBe("bella");
    expect(result.current.isSearching).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(299);
    });
    expect(stub.rpc.mock.calls.some(([, p]) => p.p_search === "bella")).toBe(false);
    expect(result.current.isSearching).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(stub.rpc.mock.calls.some(([, p]) => p.p_search === "bella")).toBe(true);
    expect(result.current.isSearching).toBe(false);

    act(() => result.current.clearSearch());
    expect(result.current.searchQuery).toBe("");
    expect(result.current.isSearching).toBe(false);
    // Clearing re-runs the directory effect with the unfiltered term.
    await act(async () => {});
    expect(stub.rpc.mock.calls.at(-1)[1].p_search).toBe(null);
  });

  it("offline: a debounced search resets isSearching instead of hanging on 'Searching…'", async () => {
    // Pins the fix where fetchDirectory's offline early-return forgot to clear
    // isSearching, leaving a no-match query stuck on the searching state.
    vi.useFakeTimers();
    setSupabase(null);
    const { result } = renderHook(() => useDogs({}));
    await act(async () => {});
    expect(result.current.loading).toBe(false);

    act(() => result.current.searchDogs("zz"));
    expect(result.current.isSearching).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current.isSearching).toBe(false);
    expect(result.current.loading).toBe(false);
  });

  // ---- Realtime ----

  it("realtime DELETE drops the row from all caches and decrements totalCount", async () => {
    const stub = makeSupabaseStub({
      rpcImpl: () => ({
        data: { rows: [ROW(), ROW({ id: "dog-2", name: "Max" })], total: 2, letters: ["B", "M"] },
        error: null,
      }),
    });
    setSupabase(stub);
    const { result } = renderHook(() => useDogs(HUMANS));
    await waitFor(() => expect(result.current.directoryDogs).toHaveLength(2));

    act(() => {
      stub._channel.fire("DELETE", { old: { id: "dog-1", human_id: "human-1" } });
    });

    expect(result.current.directoryDogs.map((d) => d.id)).toEqual(["dog-2"]);
    expect(result.current.dogsById["dog-1"]).toBeUndefined();
    expect(result.current.dogs["dog-1"]).toBeUndefined();
    expect(result.current.totalCount).toBe(1);

    // Payloads without an id (e.g. replica identity not set) must be ignored.
    act(() => {
      stub._channel.fire("DELETE", { old: {} });
    });
    expect(result.current.totalCount).toBe(1);
  });

  it("realtime INSERT refetches the current directory page", async () => {
    let rows = [ROW()];
    const stub = makeSupabaseStub({
      rpcImpl: () => ({ data: { rows, total: rows.length, letters: [] }, error: null }),
    });
    setSupabase(stub);
    const { result } = renderHook(() => useDogs({}));
    await waitFor(() => expect(result.current.directoryDogs).toHaveLength(1));

    // The new dog appears on the server; the INSERT echo should re-pull page 0.
    rows = [ROW(), ROW({ id: "dog-2", name: "Max" })];
    act(() => {
      stub._channel.fire("INSERT", { new: { id: "dog-2", human_id: "human-1" } });
    });

    await waitFor(() => expect(result.current.directoryDogs).toHaveLength(2));
    expect(result.current.totalCount).toBe(2);
  });

  it("realtime UPDATE refetches and invalidates the affected owners' dogsByHumanId entries", async () => {
    const stub = makeSupabaseStub({
      inResult: { data: [{ id: "dog-5", name: "Rex", breed: "Lab", human_id: "human-1", alerts: [] }], error: null },
    });
    setSupabase(stub);
    const { result } = renderHook(() => useDogs(HUMANS));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.ensureDogsForHumans(["human-1"]);
    });
    expect(result.current.dogsByHumanId["human-1"].map((d) => d.id)).toEqual(["dog-5"]);

    const callsBefore = stub.rpc.mock.calls.length;
    act(() => {
      stub._channel.fire("UPDATE", {
        old: { id: "dog-5", human_id: "human-1" },
        new: { id: "dog-5", human_id: "human-2" },
      });
    });

    // A dog moving owner must drop the stale per-owner grouping so the next
    // read refetches it, and the directory page is re-pulled.
    expect(result.current.dogsByHumanId["human-1"]).toBeUndefined();
    await waitFor(() => expect(stub.rpc.mock.calls.length).toBeGreaterThan(callsBefore));
  });

  // ---- addDog ----

  it("addDog surfaces a supabase error and returns null", async () => {
    const stub = makeSupabaseStub({
      insertResult: { data: null, error: { message: "rls denied" } },
    });
    setSupabase(stub);
    const { result } = renderHook(() => useDogs(HUMANS));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let saved;
    await act(async () => {
      saved = await result.current.addDog({ name: "Rex", breed: "Lab", humanId: "human-1" });
    });

    expect(saved).toBeNull();
    expect(result.current.error).toBe("rls denied");
    // No optimistic insert on the online path — nothing to roll back.
    expect(result.current.dogs).toEqual({});
  });

  it("addDog returns null without inserting when the owner cannot be resolved", async () => {
    const onInsert = vi.fn();
    const stub = makeSupabaseStub({ onInsert });
    setSupabase(stub);
    const { result } = renderHook(() => useDogs({}));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let saved;
    await act(async () => {
      saved = await result.current.addDog({ name: "Rex", breed: "Lab", humanId: "ghost" });
    });

    expect(saved).toBeNull();
    expect(onInsert).not.toHaveBeenCalled();
  });

  it("offline CRUD: addDog creates a temp-id dog, updateDog merges, deleteDog removes", async () => {
    setSupabase(null);
    const { result } = renderHook(() => useDogs(HUMANS));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let added;
    await act(async () => {
      added = await result.current.addDog({ name: "Rex", breed: "Lab", humanId: "human-1" });
    });
    // Offline dogs get a temp id so they're distinguishable from saved rows.
    expect(added.id).toMatch(/^temp-/);
    expect(added.humanId).toBe("Sarah Jones");
    expect(result.current.dogs[added.id].name).toBe("Rex");
    expect(result.current.dogsById[added.id].human_id).toBe("human-1");

    let updated;
    await act(async () => {
      updated = await result.current.updateDog(added.id, { breed: "Poodle" });
    });
    expect(updated.breed).toBe("Poodle");
    expect(result.current.dogs[added.id].breed).toBe("Poodle");

    let res;
    await act(async () => {
      res = await result.current.deleteDog(added.id);
    });
    expect(res).toEqual({ ok: true });
    expect(result.current.dogsById[added.id]).toBeUndefined();
    expect(result.current.dogs[added.id]).toBeUndefined();
  });

  // ---- updateDog ----

  it("updateDog maps camelCase fields to db columns and merges the saved row", async () => {
    const stub = makeSupabaseStub({
      rpcImpl: () => ({ data: { rows: [ROW()], total: 1, letters: ["B"] }, error: null }),
      updateResult: {
        data: {
          id: "dog-1",
          name: "Bella",
          breed: "Poodle",
          human_id: "human-1",
          groom_notes: "Short clip",
          alerts: ["Bites / Nips"],
          custom_price: 30,
          size: "large",
        },
        error: null,
      },
    });
    setSupabase(stub);
    const { result } = renderHook(() => useDogs(HUMANS));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let saved;
    await act(async () => {
      saved = await result.current.updateDog("dog-1", {
        breed: "Poodle",
        groomNotes: "Short clip",
        customPrice: 30,
        size: "large",
        alerts: ["Bites / Nips"],
        archivedAt: null,
        humanId: "human-1",
      });
    });

    // The camelCase → snake_case mapping is what actually hits the table,
    // with the owner reference resolved to its id.
    expect(stub._updateCalls[0]).toEqual({
      breed: "Poodle",
      groom_notes: "Short clip",
      custom_price: 30,
      size: "large",
      alerts: ["Bites / Nips"],
      archived_at: null,
      human_id: "human-1",
    });
    expect(saved.breed).toBe("Poodle");
    expect(saved.groomNotes).toBe("Short clip");
    expect(saved.humanId).toBe("Sarah Jones");
    expect(result.current.dogsById["dog-1"].breed).toBe("Poodle");
    expect(result.current.dogs["dog-1"].customPrice).toBe(30);
  });

  it("updateDog resolves the dog by name when no id matches", async () => {
    const stub = makeSupabaseStub({
      rpcImpl: () => ({ data: { rows: [ROW()], total: 1, letters: ["B"] }, error: null }),
      updateResult: {
        data: { id: "dog-1", name: "Bella", breed: "Poodle", human_id: "human-1", alerts: [] },
        error: null,
      },
    });
    setSupabase(stub);
    const { result } = renderHook(() => useDogs(HUMANS));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let saved;
    await act(async () => {
      saved = await result.current.updateDog("Bella", { breed: "Poodle" });
    });

    expect(saved.id).toBe("dog-1");
    expect(result.current.dogs["dog-1"].breed).toBe("Poodle");
  });

  it("updateDog rolls back the optimistic merge and returns null on a supabase error", async () => {
    const stub = makeSupabaseStub({
      rpcImpl: () => ({ data: { rows: [ROW()], total: 1, letters: ["B"] }, error: null }),
      updateResult: { data: null, error: { message: "rls denied" } },
    });
    setSupabase(stub);
    const { result } = renderHook(() => useDogs(HUMANS));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let saved;
    await act(async () => {
      saved = await result.current.updateDog("dog-1", { breed: "Poodle" });
    });

    expect(saved).toBeNull();
    // Rolled back to the directory row's original breed.
    expect(result.current.dogs["dog-1"].breed).toBe("Cockapoo");
    expect(result.current.dogsById["dog-1"].breed).toBe("Cockapoo");
  });

  it("updateDog rolls back and returns null when the new owner cannot be resolved", async () => {
    const stub = makeSupabaseStub({
      rpcImpl: () => ({ data: { rows: [ROW()], total: 1, letters: ["B"] }, error: null }),
    });
    setSupabase(stub);
    const { result } = renderHook(() => useDogs(HUMANS));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let saved;
    await act(async () => {
      saved = await result.current.updateDog("dog-1", { breed: "Poodle", humanId: "ghost" });
    });

    expect(saved).toBeNull();
    expect(result.current.dogs["dog-1"].breed).toBe("Cockapoo");
    // The reassignment never reached the table.
    expect(stub._updateCalls).toHaveLength(0);
  });

  it("updateDog is a no-op for an unknown dog", async () => {
    const stub = makeSupabaseStub();
    setSupabase(stub);
    const { result } = renderHook(() => useDogs(HUMANS));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let saved;
    await act(async () => {
      saved = await result.current.updateDog("ghost", { breed: "Poodle" });
    });

    expect(saved).toBeUndefined();
    expect(stub._updateCalls).toHaveLength(0);
  });

  it("updateDog skips the DB write when no persistable fields changed", async () => {
    const stub = makeSupabaseStub({
      rpcImpl: () => ({ data: { rows: [ROW()], total: 1, letters: ["B"] }, error: null }),
    });
    setSupabase(stub);
    const { result } = renderHook(() => useDogs(HUMANS));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let saved;
    await act(async () => {
      saved = await result.current.updateDog("dog-1", {});
    });

    expect(saved.id).toBe("dog-1");
    expect(stub._updateCalls).toHaveLength(0);
  });

  // ---- deleteDog ----

  it("deleteDog removes the dog, decrements totalCount and rejects bad ids", async () => {
    const stub = makeSupabaseStub({
      rpcImpl: () => ({ data: { rows: [ROW()], total: 1, letters: ["B"] }, error: null }),
    });
    setSupabase(stub);
    const { result } = renderHook(() => useDogs(HUMANS));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let res;
    await act(async () => {
      res = await result.current.deleteDog("dog-1");
    });

    expect(res).toEqual({ ok: true });
    expect(stub._deleteCalls).toEqual([{ col: "id", val: "dog-1" }]);
    expect(result.current.dogsById["dog-1"]).toBeUndefined();
    expect(result.current.totalCount).toBe(0);

    // Guard clauses: no id and unknown id fail fast without a network call.
    await act(async () => {
      expect(await result.current.deleteDog("")).toEqual({ ok: false, error: "Missing dog id" });
      expect(await result.current.deleteDog("ghost")).toEqual({ ok: false, error: "Dog not found" });
    });
    expect(stub._deleteCalls).toHaveLength(1);
  });

  it("deleteDog maps FK violations to a friendly message and rolls back", async () => {
    const stub = makeSupabaseStub({
      rpcImpl: () => ({ data: { rows: [ROW()], total: 1, letters: ["B"] }, error: null }),
      deleteResult: { error: { code: "23503", message: "violates foreign key constraint" } },
    });
    setSupabase(stub);
    const { result } = renderHook(() => useDogs(HUMANS));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let res;
    await act(async () => {
      res = await result.current.deleteDog("dog-1");
    });

    expect(res).toEqual({
      ok: false,
      error: "This dog can't be deleted — it's still referenced by other records.",
    });
    // The optimistic removal must be undone so the card doesn't vanish.
    expect(result.current.dogsById["dog-1"]).toBeTruthy();
    expect(result.current.dogs["dog-1"]).toBeTruthy();
    expect(result.current.totalCount).toBe(1);
  });

  it("deleteDog surfaces other supabase errors verbatim", async () => {
    const stub = makeSupabaseStub({
      rpcImpl: () => ({ data: { rows: [ROW()], total: 1, letters: ["B"] }, error: null }),
      deleteResult: { error: { code: "500", message: "boom" } },
    });
    setSupabase(stub);
    const { result } = renderHook(() => useDogs(HUMANS));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let res;
    await act(async () => {
      res = await result.current.deleteDog("dog-1");
    });

    expect(res).toEqual({ ok: false, error: "boom" });
    expect(result.current.dogsById["dog-1"]).toBeTruthy();
  });

  // ---- fetchDogById ----

  it("fetchDogById serves cached dogs without a network round-trip", async () => {
    const stub = makeSupabaseStub({
      rpcImpl: () => ({
        data: { rows: [ROW({ breed: "Unknown", groom_notes: "Nervous" })], total: 1, letters: ["B"] },
        error: null,
      }),
    });
    setSupabase(stub);
    const { result } = renderHook(() => useDogs(HUMANS));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let dog;
    await act(async () => {
      dog = await result.current.fetchDogById("dog-1");
    });

    expect(dog.id).toBe("dog-1");
    // Placeholder breeds are sanitised on the way out of the cache too.
    expect(dog.breed).toBe("");
    expect(dog.groomNotes).toBe("Nervous");
    expect(dog.humanId).toBe("Sarah Jones");
    // The directory seed is the only traffic — the cache hit avoided from().
    expect(stub.from).not.toHaveBeenCalled();
  });

  it("fetchDogById fetches a missing dog, merges it, then serves the cache", async () => {
    const stub = makeSupabaseStub({
      selectSingleResult: {
        data: { id: "dog-7", name: "Coco", breed: "Poodle", human_id: "human-1", alerts: [] },
        error: null,
      },
    });
    setSupabase(stub);
    const { result } = renderHook(() => useDogs(HUMANS));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let dog;
    await act(async () => {
      dog = await result.current.fetchDogById("dog-7");
    });

    expect(dog.name).toBe("Coco");
    expect(dog.humanId).toBe("Sarah Jones");
    expect(result.current.dogsById["dog-7"]).toBeTruthy();
    expect(result.current.dogs["dog-7"].name).toBe("Coco");

    // Second lookup must come from the merged cache, not another select.
    const fromCalls = stub.from.mock.calls.length;
    await act(async () => {
      dog = await result.current.fetchDogById("dog-7");
    });
    expect(dog.name).toBe("Coco");
    expect(stub.from.mock.calls.length).toBe(fromCalls);
  });

  it("fetchDogById returns null for empty ids, fetch errors and offline misses", async () => {
    const stub = makeSupabaseStub({
      selectSingleResult: { data: null, error: { message: "not found" } },
    });
    setSupabase(stub);
    const { result, unmount } = renderHook(() => useDogs({}));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      expect(await result.current.fetchDogById("")).toBeNull();
      expect(await result.current.fetchDogById("ghost")).toBeNull();
    });

    // Unmount before swapping the mock to null: the channel cleanup reads the
    // live client, which in the app is a module constant and never flips.
    unmount();
    setSupabase(null);
    const offline = renderHook(() => useDogs({}));
    await waitFor(() => expect(offline.result.current.loading).toBe(false));
    await act(async () => {
      expect(await offline.result.current.fetchDogById("ghost")).toBeNull();
    });
  });

  // ---- ensureDogsForHumans ----

  it("ensureDogsForHumans groups fetched dogs per owner and never refetches", async () => {
    const stub = makeSupabaseStub({
      inResult: {
        data: [
          { id: "d1", name: "Rex", breed: "Lab", human_id: "human-1", alerts: [] },
          { id: "d2", name: "Fido", breed: "Pug", human_id: "human-1" },
          // Orphan rows (no owner) must be skipped, not grouped under undefined.
          { id: "d3", name: "Stray", breed: "Mix", human_id: null },
        ],
        error: null,
      },
    });
    setSupabase(stub);
    const { result } = renderHook(() => useDogs(HUMANS));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.ensureDogsForHumans(["human-1", "human-2"]);
    });

    expect(result.current.dogsByHumanId["human-1"].map((d) => d.name)).toEqual(["Rex", "Fido"]);
    expect(result.current.dogsByHumanId["human-1"][0].humanId).toBe("Sarah Jones");
    // Owners with no dogs get an explicit empty list so callers stop re-asking.
    expect(result.current.dogsByHumanId["human-2"]).toEqual([]);
    expect(stub._inCalls).toEqual([{ col: "human_id", ids: ["human-1", "human-2"] }]);

    // Already-fetched (and empty-list) ids are skipped on subsequent calls.
    await act(async () => {
      await result.current.ensureDogsForHumans(["human-1", "human-2"]);
      await result.current.ensureDogsForHumans([]);
    });
    expect(stub._inCalls).toHaveLength(1);
  });

  it("ensureDogsForHumans clears the fetched marker on error so a retry refetches", async () => {
    const stub = makeSupabaseStub({
      inResult: { data: null, error: { message: "boom" } },
    });
    setSupabase(stub);
    const { result } = renderHook(() => useDogs({}));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.ensureDogsForHumans(["human-1"]);
    });
    expect(result.current.dogsByHumanId).toEqual({});

    await act(async () => {
      await result.current.ensureDogsForHumans(["human-1"]);
    });
    expect(stub._inCalls).toHaveLength(2);
  });

  // ---- ensureDogsByIds ----

  it("ensureDogsByIds fetches only uncached ids and merges rows into both maps", async () => {
    const stub = makeSupabaseStub({
      rpcImpl: () => ({ data: { rows: [ROW()], total: 1, letters: ["B"] }, error: null }),
      inResult: {
        data: [{ id: "dog-8", name: "Ziggy", breed: "Beagle", human_id: "human-1", alerts: [] }],
        error: null,
      },
    });
    setSupabase(stub);
    const { result } = renderHook(() => useDogs(HUMANS));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      // dog-1 is already cached from the directory; falsy ids and duplicates
      // must be filtered before the query.
      await result.current.ensureDogsByIds(["dog-1", "dog-8", "dog-8", null, undefined, ""]);
    });

    expect(stub._inCalls).toEqual([{ col: "id", ids: ["dog-8"] }]);
    expect(result.current.dogsById["dog-8"]).toBeTruthy();
    expect(result.current.dogs["dog-8"].name).toBe("Ziggy");
    expect(result.current.dogs["dog-8"].humanId).toBe("Sarah Jones");

    // All-cached and empty calls are no-ops.
    await act(async () => {
      await result.current.ensureDogsByIds(["dog-1", "dog-8"]);
      await result.current.ensureDogsByIds([]);
    });
    expect(stub._inCalls).toHaveLength(1);
  });

  it("ensureDogsByIds marks ids fetched even when the query returns no rows", async () => {
    const stub = makeSupabaseStub({ inResult: { data: [], error: null } });
    setSupabase(stub);
    const { result } = renderHook(() => useDogs({}));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.ensureDogsByIds(["ghost"]);
      // A deleted/unknown id mustn't trigger a refetch storm on every render.
      await result.current.ensureDogsByIds(["ghost"]);
    });

    expect(stub._inCalls).toHaveLength(1);
    expect(result.current.dogsById["ghost"]).toBeUndefined();
  });

  it("ensureDogsByIds clears the fetched marker on error so a retry refetches", async () => {
    const stub = makeSupabaseStub({ inResult: { data: null, error: { message: "boom" } } });
    setSupabase(stub);
    const { result } = renderHook(() => useDogs({}));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.ensureDogsByIds(["dog-9"]);
      await result.current.ensureDogsByIds(["dog-9"]);
    });

    expect(stub._inCalls).toHaveLength(2);
  });

  // ---- fetchArchivedDogs ----

  it("fetchArchivedDogs returns entries with owner fields from the humans join", async () => {
    const stub = makeSupabaseStub({
      limitResult: {
        data: [
          {
            id: "dog-a",
            name: "Old Boy",
            breed: "Pug",
            human_id: "human-1",
            alerts: [],
            humans: { name: "Sarah", surname: "Jones", phone: "07700900111", whatsapp: true },
          },
        ],
        error: null,
      },
    });
    setSupabase(stub);
    const { result } = renderHook(() => useDogs(HUMANS));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let archived;
    await act(async () => {
      archived = await result.current.fetchArchivedDogs();
    });

    expect(archived.map((d) => d.id)).toEqual(["dog-a"]);
    expect(archived[0].ownerFullName).toBe("Sarah Jones");
    expect(archived[0].ownerPhone).toBe("07700900111");
    expect(archived[0].ownerWhatsapp).toBe(true);
    // Archived dogs must never leak into the live caches the grid/search read.
    expect(result.current.dogsById["dog-a"]).toBeUndefined();
    expect(result.current.dogs["dog-a"]).toBeUndefined();
  });

  // ---- single source of truth (Debt #14) ----

  it("a rename leaves no stale entry under the old name in any lookup", async () => {
    const { getDogByIdOrName } = await import("../../engine/bookingRules");
    const stub = makeSupabaseStub({
      rpcImpl: () => ({ data: { rows: [ROW()], total: 1, letters: ["B"] }, error: null }),
      updateResult: {
        data: { ...ROW(), name: "Luna" },
        error: null,
      },
    });
    setSupabase(stub);
    const { result } = renderHook(() => useDogs(HUMANS));
    await waitFor(() => expect(result.current.dogs["dog-1"]).toBeTruthy());
    expect(getDogByIdOrName(result.current.dogs, "Bella")?.id).toBe("dog-1");

    await act(async () => {
      await result.current.updateDog("dog-1", { name: "Luna" });
    });

    // The register's drift scenario: with two parallel maps, a rename could
    // leave a stale app-shape entry resolving under the old name. The map is
    // now derived from dogsById, so old-name lookups die with the rename and
    // the raw + app shapes agree by construction.
    expect(getDogByIdOrName(result.current.dogs, "Bella")).toBeNull();
    expect(getDogByIdOrName(result.current.dogs, "Luna")?.id).toBe("dog-1");
    expect(result.current.dogs["dog-1"].name).toBe("Luna");
    expect(result.current.dogsById["dog-1"].name).toBe("Luna");
  });

  it("fetchArchivedDogs returns [] offline and on query errors", async () => {
    setSupabase(null);
    const offline = renderHook(() => useDogs({}));
    await waitFor(() => expect(offline.result.current.loading).toBe(false));
    await act(async () => {
      expect(await offline.result.current.fetchArchivedDogs()).toEqual([]);
    });

    const stub = makeSupabaseStub({ limitResult: { data: null, error: { message: "boom" } } });
    setSupabase(stub);
    const { result } = renderHook(() => useDogs({}));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      expect(await result.current.fetchArchivedDogs()).toEqual([]);
    });
  });
});

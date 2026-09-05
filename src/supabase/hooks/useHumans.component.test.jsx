import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

function setSupabase(value) {
  globalThis.__supabaseMockHumans = value;
}

vi.mock("../client", () => ({
  get supabase() {
    return globalThis.__supabaseMockHumans;
  },
}));

const { useHumans } = await import("./useHumans");

// The directory now loads through the search_humans_directory RPC, which
// returns { rows, total, letters }. The stub records every rpc call so tests
// can assert the params (offset, sort, filter flags, letter) the hook sends.
//
// Beyond the RPC, the hook touches three more surfaces:
//   - from() query chains (CRUD, trusted-contact joins, on-demand lookups).
//     The builder returned by from() is a chainable thenable: every query
//     method records itself and returns the builder, and the terminal
//     (await / .single() / .maybeSingle()) resolves through fromImpl with the
//     recorded trace — so a test can dispatch on table / op / terminal
//     without re-stubbing every chain shape the hook uses.
//   - the realtime channel: handlers are captured so tests can fire
//     INSERT / UPDATE / DELETE payloads via stub._channel.fire().
//   - functions.invoke (the post-approval welcome message).
function makeSupabaseStub(rpcImpl, { fromImpl, invokeImpl } = {}) {
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

  const fromCalls = [];
  const from = vi.fn((table) => {
    const calls = [];
    const builder = {};
    for (const m of [
      "select",
      "insert",
      "update",
      "delete",
      "eq",
      "in",
      "is",
      "not",
      "order",
      "limit",
      "ilike",
    ]) {
      builder[m] = vi.fn((...args) => {
        calls.push({ method: m, args });
        return builder;
      });
    }
    const settle = (terminal) => {
      const op =
        calls.find((c) => ["insert", "update", "delete"].includes(c.method))
          ?.method || "select";
      const ctx = {
        table,
        op,
        terminal,
        calls,
        payload: calls.find((c) => c.method === op)?.args[0],
        arg: (method) => calls.find((c) => c.method === method)?.args,
      };
      fromCalls.push(ctx);
      const result = fromImpl?.(ctx);
      // Defaults mirror supabase-js: awaited list chains resolve to rows,
      // single/maybeSingle to a lone row.
      return Promise.resolve(
        result !== undefined
          ? result
          : terminal === "await"
            ? { data: [], error: null }
            : { data: null, error: null },
      );
    };
    builder.single = vi.fn(() => settle("single"));
    builder.maybeSingle = vi.fn(() => settle("maybeSingle"));
    builder.then = (onResolve, onReject) =>
      settle("await").then(onResolve, onReject);
    return builder;
  });

  return {
    rpc,
    from,
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(),
    functions: {
      invoke: vi.fn((name, opts) =>
        Promise.resolve(
          invokeImpl ? invokeImpl(name, opts) : { data: null, error: null },
        ),
      ),
    },
    _channel: channel,
    _fromCalls: fromCalls,
  };
}

const h1 = { id: "h1", name: "Sarah", surname: "Jones", phone: "07700900111", whatsapp: true };
const h2 = { id: "h2", name: "Dave", surname: "Smith", phone: "07700900112" };

// Default directory payload for tests that exercise CRUD / RPC actions on an
// already-loaded two-person directory. Non-directory RPCs (merge / approve /
// reject) succeed unless a test overrides them.
const twoHumansRpcImpl = (fn) =>
  fn === "search_humans_directory"
    ? { data: { rows: [h1, h2], total: 2, letters: ["D", "S"] }, error: null }
    : { data: null, error: null };

async function renderLoadedHumans(stub) {
  setSupabase(stub);
  const rendered = renderHook(() => useHumans());
  await waitFor(() => expect(rendered.result.current.loading).toBe(false));
  return rendered;
}

// Reset on entry rather than in afterEach: testing-library's cleanup()
// unmounts after our afterEach runs, and the hook's effect teardown still
// calls supabase.removeChannel — so the stub must survive until React is done.
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

describe("useHumans directory", () => {
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

  it("hasMore flips off once loadMore reaches the server total", async () => {
    const stub = makeSupabaseStub((_fn, params) => ({
      data: {
        rows: params.p_offset === 0 ? [h1] : [h2],
        total: 2,
        letters: ["D", "S"],
      },
      error: null,
    }));
    setSupabase(stub);
    const { result } = renderHook(() => useHumans());
    await waitFor(() => expect(result.current.directoryHumans.length).toBe(1));
    expect(result.current.hasMore).toBe(true); // 1 of 2

    await act(async () => {
      await result.current.loadMore();
    });

    // offset (1) + rows (1) === total (2): the list is exhausted.
    expect(result.current.directoryHumans.map((h) => h.id)).toEqual(["h1", "h2"]);
    expect(result.current.hasMore).toBe(false);
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

  it("clicking the active letter again clears it back to the full list", async () => {
    const stub = makeSupabaseStub();
    setSupabase(stub);
    const { result } = renderHook(() => useHumans());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.setDirLetter("A"));
    await waitFor(() => expect(result.current.dirLetter).toBe("A"));

    act(() => result.current.setDirLetter("A"));
    await waitFor(() => expect(result.current.dirLetter).toBeNull());
    // The clearing refetch goes out with p_letter back to null.
    expect(stub.rpc.mock.calls.at(-1)[1].p_letter).toBeNull();
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

  it("coalesces rapid keystrokes into one trimmed fetch and resets isSearching", async () => {
    vi.useFakeTimers();
    try {
      const stub = makeSupabaseStub();
      setSupabase(stub);
      const { result } = renderHook(() => useHumans());
      // Promises stay real under fake timers, so a flush settles the mount fetch.
      await act(async () => {});
      expect(result.current.loading).toBe(false);

      act(() => result.current.searchHumans("d"));
      act(() => result.current.searchHumans("da"));
      act(() => result.current.searchHumans("  dave "));
      expect(result.current.searchQuery).toBe("  dave ");
      expect(result.current.isSearching).toBe(true);

      // Each keystroke restarts the 300ms window — nothing fires at 299ms.
      await act(async () => {
        vi.advanceTimersByTime(299);
      });
      expect(stub.rpc.mock.calls.some(([, p]) => p.p_search !== null)).toBe(false);

      await act(async () => {
        vi.advanceTimersByTime(1);
      });
      await act(async () => {});

      // Only the final term reached the server, trimmed; "d"/"da" never fired.
      const searches = stub.rpc.mock.calls
        .map(([, p]) => p.p_search)
        .filter((s) => s !== null);
      expect(searches).toEqual(["dave"]);
      expect(result.current.isSearching).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("useHumans realtime", () => {
  it("DELETE drops the row from caches, the visible list and the count", async () => {
    const stub = makeSupabaseStub(twoHumansRpcImpl);
    const { result } = await renderLoadedHumans(stub);

    act(() => stub._channel.fire("DELETE", { old: { id: "h1" } }));

    expect(result.current.humansById.h1).toBeUndefined();
    expect(result.current.humans["Sarah Jones"]).toBeUndefined();
    expect(result.current.directoryHumans.map((h) => h.id)).toEqual(["h2"]);
    expect(result.current.totalCount).toBe(1);

    // A DELETE payload without old.id is ignored (replica identity quirks).
    act(() => stub._channel.fire("DELETE", { old: {} }));
    expect(result.current.directoryHumans.map((h) => h.id)).toEqual(["h2"]);
  });

  it("INSERT and UPDATE refetch page 0 of the active query", async () => {
    const stub = makeSupabaseStub(twoHumansRpcImpl);
    const { result } = await renderLoadedHumans(stub);

    // Activate a filter first so we can prove the resync reuses the live query
    // (queryRef), not the mount-time defaults.
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

    const beforeUpdate = stub.rpc.mock.calls.length;
    act(() => stub._channel.fire("UPDATE", { new: { id: "h1" } }));
    await waitFor(() =>
      expect(stub.rpc.mock.calls.length).toBe(beforeUpdate + 1),
    );
    expect(stub.rpc.mock.calls.at(-1)[1]).toMatchObject({
      p_flagged: true,
      p_offset: 0,
    });
  });
});

describe("useHumans updateHuman", () => {
  it("maps camelCase updates to DB columns and strips phone format chars", async () => {
    const stub = makeSupabaseStub(twoHumansRpcImpl, {
      fromImpl: (ctx) =>
        ctx.table === "humans" && ctx.op === "update"
          ? { data: { ...h1, ...ctx.payload }, error: null }
          : undefined,
    });
    const { result } = await renderLoadedHumans(stub);

    let saved;
    await act(async () => {
      saved = await result.current.updateHuman("h1", {
        notes: "Prefers Saturdays",
        // iOS Contacts wraps pasted numbers in bidi marks (Cf chars); the
        // hook must strip those but keep visible spacing.
        phone: "‭07700 900123‬",
        sms: true,
        whatsapp: false,
        email: "sarah@example.com",
        address: "1 Bark Lane",
        historyFlag: "vip",
        reminderHours: 48,
        reminderChannels: ["sms"],
        archivedAt: null,
      });
    });

    const update = stub._fromCalls.find(
      (c) => c.table === "humans" && c.op === "update",
    );
    expect(update.arg("eq")).toEqual(["id", "h1"]);
    expect(update.payload).toEqual({
      notes: "Prefers Saturdays",
      phone: "07700 900123",
      sms: true,
      whatsapp: false,
      email: "sarah@example.com",
      address: "1 Bark Lane",
      history_flag: "vip",
      reminder_hours: 48,
      reminder_channels: ["sms"],
      archived_at: null,
    });
    expect(saved.notes).toBe("Prefers Saturdays");
    expect(result.current.humans["Sarah Jones"].email).toBe("sarah@example.com");
    expect(result.current.humansById.h1.fullName).toBe("Sarah Jones");
  });

  it("re-keys the humans map when a rename changes the full name", async () => {
    const stub = makeSupabaseStub(twoHumansRpcImpl, {
      fromImpl: (ctx) =>
        ctx.table === "humans" && ctx.op === "update"
          ? { data: { ...h1, name: "Sara" }, error: null }
          : undefined,
    });
    const { result } = await renderLoadedHumans(stub);

    let saved;
    await act(async () => {
      // Resolving by full name exercises the name-based lookup fallback.
      saved = await result.current.updateHuman("Sarah Jones", { name: "Sara" });
    });

    expect(saved.fullName).toBe("Sara Jones");
    expect(result.current.humans["Sarah Jones"]).toBeUndefined();
    expect(result.current.humans["Sara Jones"].id).toBe("h1");
  });

  it("rolls back the optimistic update and surfaces the error on failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const stub = makeSupabaseStub(twoHumansRpcImpl, {
      fromImpl: (ctx) =>
        ctx.table === "humans" && ctx.op === "update"
          ? { data: null, error: { message: "rls denied" } }
          : undefined,
    });
    const { result } = await renderLoadedHumans(stub);

    let saved;
    await act(async () => {
      saved = await result.current.updateHuman("h1", { notes: "nope" });
    });

    expect(saved).toBeNull();
    expect(result.current.error).toBe("rls denied");
    // Optimistic note rolled back to the loaded value.
    expect(result.current.humans["Sarah Jones"].notes).toBe("");
  });

  it("returns null without touching the DB for an unknown identifier", async () => {
    const stub = makeSupabaseStub(twoHumansRpcImpl);
    const { result } = await renderLoadedHumans(stub);

    const saved = await result.current.updateHuman("nobody", { notes: "x" });

    expect(saved).toBeNull();
    expect(stub.from).not.toHaveBeenCalled();
  });

  it("trustedIds updates replace the link set atomically without writing the humans row", async () => {
    const stub = makeSupabaseStub(twoHumansRpcImpl);
    const { result } = await renderLoadedHumans(stub);

    let saved;
    await act(async () => {
      saved = await result.current.updateHuman("h1", { trustedIds: ["h2"] });
    });

    // One server-side transaction (replace_trusted_contacts RPC) and no
    // client-side delete/insert pair — the old non-atomic shape could lose
    // every link when the insert failed after the delete committed.
    expect(stub.rpc).toHaveBeenCalledWith("replace_trusted_contacts", {
      p_human_id: "h1",
      p_contacts: [{ trusted_id: "h2", relationship: null }],
    });
    expect(
      stub._fromCalls.some((c) => c.table === "human_trusted_contacts"),
    ).toBe(false);
    expect(saved.trustedIds).toEqual(["Dave Smith"]);
    expect(saved.trustedContacts).toEqual([
      { id: "h2", fullName: "Dave Smith", relationship: "" },
    ]);
    // Trusted-only updates must not issue a humans UPDATE.
    expect(
      stub._fromCalls.some((c) => c.table === "humans" && c.op === "update"),
    ).toBe(false);
  });

  it("trustedContacts updates persist trimmed relationship labels", async () => {
    const stub = makeSupabaseStub(twoHumansRpcImpl);
    const { result } = await renderLoadedHumans(stub);

    let saved;
    await act(async () => {
      saved = await result.current.updateHuman("h1", {
        trustedContacts: [{ id: "h2", relationship: "  Neighbour " }],
      });
    });

    expect(stub.rpc).toHaveBeenCalledWith("replace_trusted_contacts", {
      p_human_id: "h1",
      p_contacts: [{ trusted_id: "h2", relationship: "Neighbour" }],
    });
    expect(saved.trustedContacts).toEqual([
      { id: "h2", fullName: "Dave Smith", relationship: "Neighbour" },
    ]);
  });

  it("rolls back local state when the trusted replace RPC fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const stub = makeSupabaseStub((fn) => {
      if (fn === "replace_trusted_contacts")
        return { data: null, error: { message: "replace denied" } };
      return twoHumansRpcImpl(fn);
    });
    const { result } = await renderLoadedHumans(stub);

    let saved;
    await act(async () => {
      saved = await result.current.updateHuman("h1", { trustedIds: ["h2"] });
    });

    expect(saved).toBeNull();
    expect(result.current.error).toBe("replace denied");
    // Local state rolls back to the pre-update trusted list, and because
    // the replace ran inside one server transaction the DB still holds the
    // previous links too — UI and DB agree again on failure.
    expect(result.current.humans["Sarah Jones"].trustedIds).toEqual([]);
    expect(
      stub._fromCalls.some((c) => c.table === "human_trusted_contacts"),
    ).toBe(false);
  });
});

describe("useHumans addHuman", () => {
  it("inserts a sanitised row and folds the saved human into both maps", async () => {
    const stub = makeSupabaseStub(twoHumansRpcImpl, {
      fromImpl: (ctx) =>
        ctx.table === "humans" && ctx.op === "insert"
          ? { data: { id: "h9", ...ctx.payload }, error: null }
          : undefined,
    });
    const { result } = await renderLoadedHumans(stub);

    let saved;
    await act(async () => {
      saved = await result.current.addHuman({
        name: "New",
        surname: "Person",
        phone: "‪07700900999‬",
        whatsapp: true,
      });
    });

    const insert = stub._fromCalls.find(
      (c) => c.table === "humans" && c.op === "insert",
    );
    expect(insert.payload).toEqual({
      name: "New",
      surname: "Person",
      phone: "07700900999",
      sms: false,
      whatsapp: true,
      email: "",
      address: "",
      notes: "",
    });
    expect(saved.id).toBe("h9");
    expect(saved.fullName).toBe("New Person");
    expect(result.current.humans["New Person"].id).toBe("h9");
    expect(result.current.humansById.h9.fullName).toBe("New Person");
  });

  it("translates a unique-constraint violation into a friendly duplicate error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const stub = makeSupabaseStub(twoHumansRpcImpl, {
      fromImpl: (ctx) =>
        ctx.table === "humans" && ctx.op === "insert"
          ? { data: null, error: { code: "23505", message: "duplicate key" } }
          : undefined,
    });
    const { result } = await renderLoadedHumans(stub);

    let thrown;
    await act(async () => {
      thrown = await result.current
        .addHuman({ name: "New", surname: "Person" })
        .catch((e) => e);
    });

    expect(thrown.message).toBe(
      "New Person already exists. Please use a different name.",
    );
    expect(result.current.error).toBe(thrown.message);
    // No phantom entry left behind on failure.
    expect(result.current.humans["New Person"]).toBeUndefined();
  });

  it("rethrows other insert errors with the raw message", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const stub = makeSupabaseStub(twoHumansRpcImpl, {
      fromImpl: (ctx) =>
        ctx.table === "humans" && ctx.op === "insert"
          ? { data: null, error: { message: "boom" } }
          : undefined,
    });
    const { result } = await renderLoadedHumans(stub);

    let thrown;
    await act(async () => {
      thrown = await result.current
        .addHuman({ name: "New", surname: "Person" })
        .catch((e) => e);
    });

    expect(thrown.message).toBe("boom");
    expect(result.current.error).toBe("boom");
  });
});

describe("useHumans deleteHuman", () => {
  it("guards against a missing id and an unknown human", async () => {
    const stub = makeSupabaseStub(twoHumansRpcImpl);
    const { result } = await renderLoadedHumans(stub);

    expect(await result.current.deleteHuman("")).toEqual({
      ok: false,
      error: "Missing human id",
    });
    expect(await result.current.deleteHuman("nope")).toEqual({
      ok: false,
      error: "Human not found",
    });
    expect(stub.from).not.toHaveBeenCalled();
  });

  it("optimistically removes the human and decrements the count on success", async () => {
    const stub = makeSupabaseStub(twoHumansRpcImpl, {
      fromImpl: (ctx) =>
        ctx.table === "humans" && ctx.op === "delete" ? { error: null } : undefined,
    });
    const { result } = await renderLoadedHumans(stub);

    let outcome;
    await act(async () => {
      outcome = await result.current.deleteHuman("h1");
    });

    expect(outcome).toEqual({ ok: true });
    expect(result.current.humansById.h1).toBeUndefined();
    expect(result.current.humans["Sarah Jones"]).toBeUndefined();
    expect(result.current.totalCount).toBe(1);
  });

  it("rolls back and explains the FK failure when the human is a pickup contact", async () => {
    const stub = makeSupabaseStub(twoHumansRpcImpl, {
      fromImpl: (ctx) =>
        ctx.table === "humans" && ctx.op === "delete"
          ? { error: { code: "23503", message: "violates foreign key" } }
          : undefined,
    });
    const { result } = await renderLoadedHumans(stub);

    let outcome;
    await act(async () => {
      outcome = await result.current.deleteHuman("h1");
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.error).toMatch(/pickup contact/);
    // Rolled back — the human is still in both maps.
    expect(result.current.humansById.h1.id).toBe("h1");
    expect(result.current.humans["Sarah Jones"].id).toBe("h1");
  });

  it("rolls back and returns the raw message for other delete errors", async () => {
    const stub = makeSupabaseStub(twoHumansRpcImpl, {
      fromImpl: (ctx) =>
        ctx.table === "humans" && ctx.op === "delete"
          ? { error: { message: "boom" } }
          : undefined,
    });
    const { result } = await renderLoadedHumans(stub);

    let outcome;
    await act(async () => {
      outcome = await result.current.deleteHuman("h1");
    });

    expect(outcome).toEqual({ ok: false, error: "boom" });
    expect(result.current.humansById.h1.id).toBe("h1");
  });
});

describe("useHumans mergeHumans", () => {
  it("guards against missing ids and self-merges", async () => {
    const stub = makeSupabaseStub(twoHumansRpcImpl);
    const { result } = await renderLoadedHumans(stub);

    expect(await result.current.mergeHumans("", "h2")).toEqual({
      ok: false,
      error: "Missing human id",
    });
    expect(await result.current.mergeHumans("h1", "h1")).toEqual({
      ok: false,
      error: "Cannot merge a record into itself",
    });
  });

  it("calls the merge_humans RPC and drops the loser from the local maps", async () => {
    const stub = makeSupabaseStub(twoHumansRpcImpl);
    const { result } = await renderLoadedHumans(stub);

    let outcome;
    await act(async () => {
      outcome = await result.current.mergeHumans("h1", "h2");
    });

    expect(outcome).toEqual({ ok: true });
    expect(stub.rpc).toHaveBeenCalledWith("merge_humans", {
      p_winner: "h1",
      p_loser: "h2",
    });
    expect(result.current.humansById.h2).toBeUndefined();
    expect(result.current.humans["Dave Smith"]).toBeUndefined();
    expect(result.current.totalCount).toBe(1);
  });

  it("keeps both records when the RPC fails", async () => {
    const stub = makeSupabaseStub((fn) =>
      fn === "merge_humans"
        ? { data: null, error: { message: "merge blew up" } }
        : twoHumansRpcImpl(fn),
    );
    const { result } = await renderLoadedHumans(stub);

    let outcome;
    await act(async () => {
      outcome = await result.current.mergeHumans("h1", "h2");
    });

    expect(outcome).toEqual({ ok: false, error: "merge blew up" });
    expect(result.current.humansById.h2.id).toBe("h2");
    expect(result.current.totalCount).toBe(2);
  });
});

describe("useHumans signup approval", () => {
  it("approveSignup calls the RPC, sends the welcome and marks the human approved", async () => {
    const stub = makeSupabaseStub(twoHumansRpcImpl);
    const { result } = await renderLoadedHumans(stub);

    let outcome;
    await act(async () => {
      outcome = await result.current.approveSignup("h1");
    });

    expect(outcome).toEqual({ ok: true, welcomeStatus: "unconfirmed" });
    expect(stub.rpc).toHaveBeenCalledWith("approve_customer_signup", {
      p_human_id: "h1",
    });
    expect(stub.functions.invoke).toHaveBeenCalledWith(
      "notify-customer-welcome",
      { body: { human_id: "h1" } },
    );
    expect(result.current.humansById.h1.approvedAt).toBeTruthy();
    expect(result.current.humans["Sarah Jones"].approvedAt).toBeTruthy();
  });

  it("approveSignup fails fast on RPC error without sending the welcome", async () => {
    const stub = makeSupabaseStub((fn) =>
      fn === "approve_customer_signup"
        ? { data: null, error: { message: "staff only" } }
        : twoHumansRpcImpl(fn),
    );
    const { result } = await renderLoadedHumans(stub);

    const outcome = await result.current.approveSignup("h1");

    expect(outcome).toEqual({ ok: false, error: "staff only" });
    expect(stub.functions.invoke).not.toHaveBeenCalled();
    expect(await result.current.approveSignup("")).toEqual({
      ok: false,
      error: "Missing human id",
    });
  });

  it("a failed welcome message never fails the approval", async () => {
    // The approval has committed by the time the welcome goes out, so a
    // messaging hiccup must downgrade to a console warning.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const stub = makeSupabaseStub(twoHumansRpcImpl, {
      invokeImpl: () => ({ data: null, error: { message: "whatsapp down" } }),
    });
    const { result } = await renderLoadedHumans(stub);

    let outcome;
    await act(async () => {
      outcome = await result.current.approveSignup("h1");
    });

    expect(outcome).toEqual({ ok: true, welcomeStatus: "unconfirmed" });
    expect(result.current.humansById.h1.approvedAt).toBeTruthy();
    expect(warn).toHaveBeenCalled();
  });

  it("a welcome invoke that throws is also swallowed", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const stub = makeSupabaseStub(twoHumansRpcImpl, {
      invokeImpl: () => {
        throw new Error("network gone");
      },
    });
    const { result } = await renderLoadedHumans(stub);

    let outcome;
    await act(async () => {
      outcome = await result.current.approveSignup("h1");
    });

    expect(outcome).toEqual({ ok: true, welcomeStatus: "unconfirmed" });
    expect(warn).toHaveBeenCalled();
  });

  it("rejectSignup archives the human out of the maps and the directory", async () => {
    const stub = makeSupabaseStub(twoHumansRpcImpl);
    const { result } = await renderLoadedHumans(stub);

    let outcome;
    await act(async () => {
      outcome = await result.current.rejectSignup("h2", "spam signup");
    });

    expect(outcome).toEqual({ ok: true });
    expect(stub.rpc).toHaveBeenCalledWith("reject_customer_signup", {
      p_human_id: "h2",
      p_reason: "spam signup",
    });
    expect(result.current.humansById.h2).toBeUndefined();
    expect(result.current.humans["Dave Smith"]).toBeUndefined();
    expect(result.current.directoryHumans.map((h) => h.id)).toEqual(["h1"]);
    expect(result.current.totalCount).toBe(1);
  });

  it("rejectSignup keeps the human when the RPC fails", async () => {
    const stub = makeSupabaseStub((fn) =>
      fn === "reject_customer_signup"
        ? { data: null, error: { message: "staff only" } }
        : twoHumansRpcImpl(fn),
    );
    const { result } = await renderLoadedHumans(stub);

    const outcome = await result.current.rejectSignup("h2");

    expect(outcome).toEqual({ ok: false, error: "staff only" });
    // Defaults the reason to null when not supplied.
    expect(stub.rpc).toHaveBeenCalledWith("reject_customer_signup", {
      p_human_id: "h2",
      p_reason: null,
    });
    expect(result.current.humansById.h2.id).toBe("h2");
  });
});

describe("useHumans archived & on-demand lookups", () => {
  it("fetchArchivedHumans returns mapped rows without merging them into the maps", async () => {
    const archivedRow = {
      id: "h8",
      name: "Old",
      surname: "Customer",
      archived_at: "2026-05-01T00:00:00Z",
    };
    const stub = makeSupabaseStub(twoHumansRpcImpl, {
      fromImpl: (ctx) =>
        ctx.table === "humans" && ctx.calls.some((c) => c.method === "not")
          ? { data: [archivedRow], error: null }
          : undefined,
    });
    const { result } = await renderLoadedHumans(stub);

    const rows = await result.current.fetchArchivedHumans();

    expect(rows).toHaveLength(1);
    expect(rows[0].fullName).toBe("Old Customer");
    expect(rows[0].archivedAt).toBe("2026-05-01T00:00:00Z");
    // Archived records must not leak into the live directory caches.
    expect(result.current.humans["Old Customer"]).toBeUndefined();
    expect(result.current.humansById.h8).toBeUndefined();
  });

  it("fetchArchivedHumans degrades to an empty list on error", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const stub = makeSupabaseStub(twoHumansRpcImpl, {
      fromImpl: (ctx) =>
        ctx.table === "humans" && ctx.calls.some((c) => c.method === "not")
          ? { data: null, error: { message: "boom" } }
          : undefined,
    });
    const { result } = await renderLoadedHumans(stub);

    expect(await result.current.fetchArchivedHumans()).toEqual([]);
    expect(error).toHaveBeenCalled();
  });

  it("fetchHumanById hydrates trusted contacts and serves repeats from cache", async () => {
    const h2Full = {
      ...h2,
      email: "dave@example.com",
      approved_at: null,
      signup_submitted_at: "2026-06-01T09:00:00Z",
    };
    const stub = makeSupabaseStub(twoHumansRpcImpl, {
      fromImpl: (ctx) => {
        if (ctx.table === "humans" && ctx.terminal === "single")
          return { data: h2Full, error: null };
        if (ctx.table === "human_trusted_contacts")
          return {
            data: [
              { trusted_id: "h1", relationship: "partner" },
              // A trusted id whose human row no longer resolves to a name
              // must be dropped, not rendered blank.
              { trusted_id: "ghost", relationship: "dog walker" },
            ],
            error: null,
          };
        if (ctx.table === "humans" && ctx.calls.some((c) => c.method === "in"))
          return { data: [{ id: "h1", name: "Sarah", surname: "Jones" }], error: null };
        return undefined;
      },
    });
    const { result } = await renderLoadedHumans(stub);

    let entry;
    await act(async () => {
      entry = await result.current.fetchHumanById("h2");
    });

    // The full select("*") projection carries the signup state the
    // directory RPC omits.
    expect(entry.signupSubmittedAt).toBe("2026-06-01T09:00:00Z");
    expect(entry.trustedContacts).toEqual([
      { id: "h1", fullName: "Sarah Jones", relationship: "partner" },
    ]);
    expect(entry.trustedIds).toEqual(["Sarah Jones"]);
    expect(result.current.humansById.h2.trustedContacts).toHaveLength(1);
    expect(result.current.humans["Dave Smith"].trustedContacts).toHaveLength(1);

    // A second fetch is a cache hit — no further queries. This is what stops
    // the profile modal's effect from re-querying in a loop.
    const fromCallsBefore = stub.from.mock.calls.length;
    let cached;
    await act(async () => {
      cached = await result.current.fetchHumanById("h2");
    });
    expect(cached.id).toBe("h2");
    expect(stub.from.mock.calls.length).toBe(fromCallsBefore);
  });

  it("fetchHumanById returns null for a blank id or a missing row", async () => {
    const stub = makeSupabaseStub(twoHumansRpcImpl, {
      fromImpl: (ctx) =>
        ctx.table === "humans" && ctx.terminal === "single"
          ? { data: null, error: { message: "not found" } }
          : undefined,
    });
    const { result } = await renderLoadedHumans(stub);

    expect(await result.current.fetchHumanById("")).toBeNull();
    expect(await result.current.fetchHumanById("missing")).toBeNull();
  });

  it("findHumanByFullName trims the inputs, hydrates the match and caches it", async () => {
    const stub = makeSupabaseStub(twoHumansRpcImpl, {
      fromImpl: (ctx) => {
        if (ctx.terminal === "maybeSingle") {
          const name = ctx.calls.find((c) => c.method === "ilike")?.args[1];
          return name === "Cara"
            ? {
                data: { id: "h3", name: "Cara", surname: "Lane", phone: "07700900113" },
                error: null,
              }
            : { data: null, error: null };
        }
        if (ctx.table === "human_trusted_contacts") return { data: [], error: null };
        return undefined;
      },
    });
    const { result } = await renderLoadedHumans(stub);

    let entry;
    await act(async () => {
      entry = await result.current.findHumanByFullName("  Cara  ", " Lane ");
    });

    expect(entry.fullName).toBe("Cara Lane");
    const lookup = stub._fromCalls.find((c) => c.terminal === "maybeSingle");
    expect(
      lookup.calls.filter((c) => c.method === "ilike").map((c) => c.args),
    ).toEqual([
      ["name", "Cara"],
      ["surname", "Lane"],
    ]);
    expect(result.current.humans["Cara Lane"].id).toBe("h3");
    expect(result.current.humansById.h3.trustedContacts).toEqual([]);

    // Blank parts skip the lookup; a clean miss resolves to null.
    expect(await result.current.findHumanByFullName("", "Lane")).toBeNull();
    expect(await result.current.findHumanByFullName("Ghost", "Person")).toBeNull();
  });

  it("searchHumansByTerm dedupes across the three queries and hydrates the maps", async () => {
    const h3 = { id: "h3", name: "Cara", surname: "Lane", phone: "07700900113" };
    const h4 = { id: "h4", name: "Carl", surname: "Carter", phone: "07700900114" };
    const stub = makeSupabaseStub(twoHumansRpcImpl, {
      fromImpl: (ctx) => {
        const ilike = ctx.calls.find((c) => c.method === "ilike");
        if (!ilike || ilike.args[1] !== "%car%") return { data: [], error: null };
        if (ilike.args[0] === "name") return { data: [h3, h4], error: null };
        // h4 matches by surname too — the union must not duplicate them.
        if (ilike.args[0] === "surname") return { data: [h4], error: null };
        return { data: [], error: null };
      },
    });
    const { result } = await renderLoadedHumans(stub);

    let entries;
    await act(async () => {
      entries = await result.current.searchHumansByTerm("  car ");
    });

    expect(entries.map((e) => e.id)).toEqual(["h3", "h4"]);
    // Matches are folded in name-keyed so the memoised pickers see them.
    expect(result.current.humans["Cara Lane"].id).toBe("h3");
    expect(result.current.humansById.h4.fullName).toBe("Carl Carter");

    // Zero matches resolve to an empty list without touching the maps.
    let none;
    await act(async () => {
      none = await result.current.searchHumansByTerm("zzz");
    });
    expect(none).toEqual([]);

    // A blank term never hits the network.
    const fromCallsBefore = stub.from.mock.calls.length;
    expect(await result.current.searchHumansByTerm("   ")).toEqual([]);
    expect(stub.from.mock.calls.length).toBe(fromCallsBefore);
  });

  it("ensureHumansByIds fetches only ids missing from the caches", async () => {
    const stub = makeSupabaseStub(twoHumansRpcImpl, {
      fromImpl: (ctx) =>
        ctx.table === "humans" && ctx.calls.some((c) => c.method === "in")
          ? {
              data: [{ id: "h3", name: "Cara", surname: "Lane", phone: "07700900113" }],
              error: null,
            }
          : undefined,
    });
    const { result } = await renderLoadedHumans(stub);

    // Everything already cached → no query at all.
    await result.current.ensureHumansByIds(["h1", "h2"]);
    expect(stub.from).not.toHaveBeenCalled();

    // Duplicates and blanks collapse to a single missing id.
    await act(async () => {
      await result.current.ensureHumansByIds(["h1", "h3", "h3", null, undefined, ""]);
    });

    const query = stub._fromCalls.find((c) =>
      c.calls.some((m) => m.method === "in"),
    );
    expect(query.arg("in")).toEqual(["id", ["h3"]]);
    expect(result.current.humansById.h3.fullName).toBe("Cara Lane");
    expect(result.current.humans["Cara Lane"].id).toBe("h3");
  });

  it("ensureHumansByIds marks failed ids as fetched so it never retries them", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const stub = makeSupabaseStub(twoHumansRpcImpl, {
      fromImpl: (ctx) =>
        ctx.table === "humans" && ctx.calls.some((c) => c.method === "in")
          ? { data: null, error: { message: "boom" } }
          : undefined,
    });
    const { result } = await renderLoadedHumans(stub);

    await act(async () => {
      await result.current.ensureHumansByIds(["h4"]);
    });
    expect(result.current.humansById.h4).toBeUndefined();
    expect(stub.from).toHaveBeenCalledTimes(1);

    // The fetched-set dedupe prevents a refetch loop after a failure.
    await act(async () => {
      await result.current.ensureHumansByIds(["h4"]);
    });
    expect(stub.from).toHaveBeenCalledTimes(1);
  });
});

describe("useHumans sample-data mode (!supabase)", () => {
  it("CRUD stays optimistic-only and lookups resolve from the local cache", async () => {
    setSupabase(null);
    const { result } = renderHook(() => useHumans());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // addHuman: temp id, format chars stripped, both maps populated.
    let added;
    await act(async () => {
      added = await result.current.addHuman({
        name: "Lone",
        surname: "Wolf",
        phone: "‪07700900100‬",
      });
    });
    expect(added.id).toMatch(/^temp-/);
    expect(result.current.humans["Lone Wolf"].phone).toBe("07700900100");
    expect(result.current.humansById[added.id].fullName).toBe("Lone Wolf");

    // updateHuman: returns the optimistic shape, no network to confirm it.
    let updated;
    await act(async () => {
      updated = await result.current.updateHuman(added.id, { notes: "offline note" });
    });
    expect(updated.notes).toBe("offline note");
    expect(result.current.humans["Lone Wolf"].notes).toBe("offline note");

    // fetchHumanById falls back to the local cache rather than fetching.
    const fetched = await result.current.fetchHumanById(added.id);
    expect(fetched.id).toBe(added.id);
    expect(await result.current.fetchHumanById("unknown")).toBeNull();

    // Read helpers degrade to empty results, never crash.
    expect(await result.current.fetchArchivedHumans()).toEqual([]);
    expect(await result.current.searchHumansByTerm("lone")).toEqual([]);
    expect(await result.current.findHumanByFullName("Lone", "Wolf")).toBeNull();
    await result.current.ensureHumansByIds(["x"]);

    // Connection-required actions explain themselves instead of failing silently.
    expect(await result.current.mergeHumans("a", "b")).toEqual({
      ok: false,
      error: expect.stringMatching(/sample data/),
    });
    expect(await result.current.approveSignup("a")).toEqual({
      ok: false,
      error: expect.stringMatching(/sample data/),
    });
    expect(await result.current.rejectSignup("a")).toEqual({
      ok: false,
      error: expect.stringMatching(/sample data/),
    });

    // deleteHuman: the optimistic removal is the whole operation on sample data.
    let deleted;
    await act(async () => {
      deleted = await result.current.deleteHuman(added.id);
    });
    expect(deleted).toEqual({ ok: true });
    expect(result.current.humans["Lone Wolf"]).toBeUndefined();
  });
});

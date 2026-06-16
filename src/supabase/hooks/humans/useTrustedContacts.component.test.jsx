import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

function setSupabase(value) {
  globalThis.__supabaseMockTrusted = value;
}

vi.mock("../../client.js", () => ({
  get supabase() {
    return globalThis.__supabaseMockTrusted;
  },
}));

const { useTrustedContacts, fetchTrustedContactsForHuman } = await import(
  "./useTrustedContacts"
);

// Chainable thenable from() stub (trimmed from the useHumans anchor
// harness): every query method records itself and returns the builder; the
// terminal (await) resolves through fromImpl with the recorded trace.
function makeStub(fromImpl, rpcImpl) {
  const fromCalls = [];
  const rpcCalls = [];
  const rpc = vi.fn((name, args) => {
    rpcCalls.push({ name, args });
    return Promise.resolve(rpcImpl?.(name, args) ?? { data: null, error: null });
  });
  const from = vi.fn((table) => {
    const calls = [];
    const builder = {};
    for (const m of ["select", "insert", "delete", "eq", "in"]) {
      builder[m] = vi.fn((...args) => {
        calls.push({ method: m, args });
        return builder;
      });
    }
    builder.then = (onResolve, onReject) => {
      const op =
        calls.find((c) => ["insert", "delete"].includes(c.method))?.method ||
        "select";
      const ctx = {
        table,
        op,
        calls,
        payload: calls.find((c) => c.method === op)?.args[0],
        arg: (method) => calls.find((c) => c.method === method)?.args,
      };
      fromCalls.push(ctx);
      const result = fromImpl?.(ctx);
      return Promise.resolve(result ?? { data: [], error: null }).then(
        onResolve,
        onReject,
      );
    };
    return builder;
  });
  return { from, rpc, _fromCalls: fromCalls, _rpcCalls: rpcCalls };
}

// Pre-loaded maps as the caller (updateHuman) would hold them.
const prevHumansById = {
  h1: { id: "h1", fullName: "Sarah Jones" },
  h2: { id: "h2", fullName: "Dave Smith" },
};
const prevHumans = {
  "Sarah Jones": prevHumansById.h1,
  "Dave Smith": prevHumansById.h2,
};

beforeEach(() => {
  setSupabase(undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetchTrustedContactsForHuman", () => {
  it("resolves display names and drops ids that no longer resolve", async () => {
    setSupabase(
      makeStub((ctx) => {
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
        if (ctx.table === "humans")
          return {
            data: [{ id: "h1", name: "Sarah", surname: "Jones" }],
            error: null,
          };
        return undefined;
      }),
    );

    const result = await fetchTrustedContactsForHuman("h2");

    expect(result.trustedContacts).toEqual([
      { id: "h1", fullName: "Sarah Jones", relationship: "partner" },
    ]);
    expect(result.trustedIds).toEqual(["Sarah Jones"]);
  });

  it("returns empty for a blank id, offline, or no join rows", async () => {
    setSupabase(null);
    expect(await fetchTrustedContactsForHuman("h2")).toEqual({
      trustedContacts: [],
      trustedIds: [],
    });

    setSupabase(makeStub(() => ({ data: [], error: null })));
    expect(await fetchTrustedContactsForHuman("")).toEqual({
      trustedContacts: [],
      trustedIds: [],
    });
    expect(await fetchTrustedContactsForHuman("h2")).toEqual({
      trustedContacts: [],
      trustedIds: [],
    });
  });
});

describe("useTrustedContacts replaceTrustedLinks", () => {
  it("replaces the link set via one atomic RPC, preserving known relationship labels", async () => {
    const stub = makeStub();
    setSupabase(stub);
    const { result } = renderHook(() => useTrustedContacts());

    let outcome;
    await act(async () => {
      outcome = await result.current.replaceTrustedLinks({
        humanId: "h1",
        updates: { trustedIds: ["h2"] },
        prevHumans,
        prevHumansById,
        // The existing label for the h1↔h2 pair carries over when the
        // caller only supplies trustedIds.
        currentTrustedContacts: [
          { id: "h2", fullName: "Dave Smith", relationship: "Neighbour" },
        ],
      });
    });

    // One server-side transaction: a single RPC call and NO client-side
    // delete/insert pair (the old non-atomic shape this fix retires).
    expect(stub._rpcCalls).toEqual([
      {
        name: "replace_trusted_contacts",
        args: {
          p_human_id: "h1",
          p_contacts: [{ trusted_id: "h2", relationship: "Neighbour" }],
        },
      },
    ]);
    expect(stub._fromCalls).toHaveLength(0);
    expect(outcome).toEqual({
      ok: true,
      trustedNames: ["Dave Smith"],
      savedTrustedContacts: [
        { id: "h2", fullName: "Dave Smith", relationship: "Neighbour" },
      ],
    });
  });

  it("trustedContacts payloads win, with trimmed relationship labels", async () => {
    const stub = makeStub();
    setSupabase(stub);
    const { result } = renderHook(() => useTrustedContacts());

    let outcome;
    await act(async () => {
      outcome = await result.current.replaceTrustedLinks({
        humanId: "h1",
        updates: { trustedContacts: [{ id: "h2", relationship: "  Sister " }] },
        prevHumans,
        prevHumansById,
        currentTrustedContacts: [],
      });
    });

    expect(stub._rpcCalls.at(-1).args.p_contacts).toEqual([
      { trusted_id: "h2", relationship: "Sister" },
    ]);
    expect(outcome.savedTrustedContacts).toEqual([
      { id: "h2", fullName: "Dave Smith", relationship: "Sister" },
    ]);
  });

  it("skips entries that resolve to no known human", async () => {
    const stub = makeStub();
    setSupabase(stub);
    const { result } = renderHook(() => useTrustedContacts());

    let outcome;
    await act(async () => {
      outcome = await result.current.replaceTrustedLinks({
        humanId: "h1",
        updates: { trustedIds: ["nobody-known", "h2"] },
        prevHumans,
        prevHumansById,
        currentTrustedContacts: [],
      });
    });

    // Only the resolvable pair is sent; the RPC replaces with exactly
    // this set (an empty set would clear all links, same as before).
    expect(stub._rpcCalls.at(-1).args.p_contacts).toEqual([
      { trusted_id: "h2", relationship: null },
    ]);
    expect(outcome.trustedNames).toEqual(["Dave Smith"]);
  });

  it("keeps a valid-UUID contact that isn't in the snapshot, hydrating its name from the DB", async () => {
    // The picked human lives past the paginated 50-row window, so it is in
    // NEITHER prevHumans nor prevHumansById. The old code dropped it (silent
    // unlink on the full-replace RPC); now its UUID carries it through and the
    // display name is fetched so it never renders blank.
    const offPageId = "0a8e0c2e-1111-4111-8111-111111111111";
    const stub = makeStub((ctx) => {
      if (ctx.table === "humans")
        return {
          data: [{ id: offPageId, name: "Pat", surname: "Lee" }],
          error: null,
        };
      return undefined;
    });
    setSupabase(stub);
    const { result } = renderHook(() => useTrustedContacts());

    let outcome;
    await act(async () => {
      outcome = await result.current.replaceTrustedLinks({
        humanId: "h1",
        updates: { trustedContacts: [{ id: offPageId, relationship: "" }] },
        prevHumans,
        prevHumansById,
        currentTrustedContacts: [],
      });
    });

    expect(stub._rpcCalls.at(-1).args.p_contacts).toEqual([
      { trusted_id: offPageId, relationship: null },
    ]);
    expect(outcome.savedTrustedContacts).toEqual([
      { id: offPageId, fullName: "Pat Lee", relationship: "" },
    ]);
  });

  it("surfaces an RPC failure with the previous links left intact server-side", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const stub = makeStub(undefined, () => ({
      data: null,
      error: { message: "replace denied" },
    }));
    setSupabase(stub);
    const { result } = renderHook(() => useTrustedContacts());

    let outcome;
    await act(async () => {
      outcome = await result.current.replaceTrustedLinks({
        humanId: "h1",
        updates: { trustedIds: ["h2"] },
        prevHumans,
        prevHumansById,
        currentTrustedContacts: [],
      });
    });

    expect(outcome).toEqual({ ok: false, error: { message: "replace denied" } });
    // Atomicity is the point of the fix: the failed replace ran inside one
    // server transaction, so no client-side delete could have stranded the
    // human with zero links.
    expect(stub._fromCalls).toHaveLength(0);
  });
});

describe("useTrustedContacts hydration bookkeeping", () => {
  it("marks ids hydrated so fetchHumanById can serve repeats from cache", () => {
    const { result } = renderHook(() => useTrustedContacts());

    expect(result.current.isTrustedHydrated("h1")).toBe(false);
    act(() => result.current.markTrustedHydrated("h1"));
    expect(result.current.isTrustedHydrated("h1")).toBe(true);
    expect(result.current.isTrustedHydrated("h2")).toBe(false);
  });
});

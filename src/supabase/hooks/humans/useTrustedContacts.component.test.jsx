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
function makeStub(fromImpl) {
  const fromCalls = [];
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
  return { from, _fromCalls: fromCalls };
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
  it("clears then inserts the new pairs, preserving known relationship labels", async () => {
    const stub = makeStub((ctx) =>
      ctx.table === "human_trusted_contacts" ? { error: null } : undefined,
    );
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

    const ops = stub._fromCalls.map((c) => c.op);
    // The clearing DELETE always precedes the INSERT.
    expect(ops).toEqual(["delete", "insert"]);
    expect(stub._fromCalls[0].arg("eq")).toEqual(["human_id", "h1"]);
    expect(stub._fromCalls[1].payload).toEqual([
      { human_id: "h1", trusted_id: "h2", relationship: "Neighbour" },
    ]);
    expect(outcome).toEqual({
      ok: true,
      trustedNames: ["Dave Smith"],
      savedTrustedContacts: [
        { id: "h2", fullName: "Dave Smith", relationship: "Neighbour" },
      ],
    });
  });

  it("trustedContacts payloads win, with trimmed relationship labels", async () => {
    const stub = makeStub((ctx) =>
      ctx.table === "human_trusted_contacts" ? { error: null } : undefined,
    );
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

    expect(stub._fromCalls.at(-1).payload).toEqual([
      { human_id: "h1", trusted_id: "h2", relationship: "Sister" },
    ]);
    expect(outcome.savedTrustedContacts).toEqual([
      { id: "h2", fullName: "Dave Smith", relationship: "Sister" },
    ]);
  });

  it("skips entries that resolve to no known human", async () => {
    const stub = makeStub((ctx) =>
      ctx.table === "human_trusted_contacts" ? { error: null } : undefined,
    );
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

    // Only the resolvable pair was written; an empty resolution set would
    // skip the INSERT entirely.
    expect(stub._fromCalls.at(-1).payload).toEqual([
      { human_id: "h1", trusted_id: "h2", relationship: null },
    ]);
    expect(outcome.trustedNames).toEqual(["Dave Smith"]);
  });

  it("fails fast when the clearing delete is denied — no insert attempted", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const stub = makeStub((ctx) =>
      ctx.op === "delete" ? { error: { message: "clear denied" } } : { error: null },
    );
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

    expect(outcome).toEqual({ ok: false, error: { message: "clear denied" } });
    expect(stub._fromCalls.some((c) => c.op === "insert")).toBe(false);
  });

  it("reports the insert failure after the clear has already committed", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const stub = makeStub((ctx) =>
      ctx.op === "insert" ? { error: { message: "insert denied" } } : { error: null },
    );
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

    expect(outcome).toEqual({ ok: false, error: { message: "insert denied" } });
    // The replace is non-atomic: the DELETE has already gone through, so
    // this partial failure loses the existing links server-side. Documented
    // behaviour (tracked separately), not endorsed.
    expect(stub._fromCalls.some((c) => c.op === "delete")).toBe(true);
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

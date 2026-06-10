import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useState } from "react";

function setSupabase(value) {
  globalThis.__supabaseMockHumanLookups = value;
}

vi.mock("../../client.js", () => ({
  get supabase() {
    return globalThis.__supabaseMockHumanLookups;
  },
}));

const { useHumanLookups } = await import("./useHumanLookups");

// Chainable thenable from() stub (trimmed from the useHumans anchor
// harness) — see that file for the full notes.
function makeStub(fromImpl) {
  const fromCalls = [];
  const from = vi.fn((table) => {
    const calls = [];
    const builder = {};
    for (const m of ["select", "eq", "in", "is", "ilike", "limit"]) {
      builder[m] = vi.fn((...args) => {
        calls.push({ method: m, args });
        return builder;
      });
    }
    const settle = (terminal) => {
      const ctx = {
        table,
        terminal,
        calls,
        arg: (method) => calls.find((c) => c.method === method)?.args,
      };
      fromCalls.push(ctx);
      const result = fromImpl?.(ctx);
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
  return { from, _fromCalls: fromCalls };
}

const h1 = { id: "h1", name: "Sarah", surname: "Jones", phone: "07700900111" };

// Host harness owning the caches and the hydration bookkeeping the
// composer normally wires in from useHumansData / useTrustedContacts.
function useHarness() {
  const [humans, setHumans] = useState({
    "Sarah Jones": { ...h1, fullName: "Sarah Jones" },
  });
  const [humansById, setHumansById] = useState({
    h1: { ...h1, fullName: "Sarah Jones" },
  });
  const [hydrated] = useState(() => new Set());
  const lookups = useHumanLookups({
    humans,
    humansById,
    setHumans,
    setHumansById,
    isTrustedHydrated: (id) => hydrated.has(id),
    markTrustedHydrated: (id) => hydrated.add(id),
  });
  return { humans, humansById, hydrated, ...lookups };
}

beforeEach(() => {
  setSupabase(undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("useHumanLookups fetchHumanById", () => {
  it("fetches the full row, hydrates trusted contacts and marks the id hydrated", async () => {
    const stub = makeStub((ctx) => {
      if (ctx.table === "humans" && ctx.terminal === "single")
        return {
          data: { id: "h2", name: "Dave", surname: "Smith", signup_submitted_at: "2026-06-01T09:00:00Z" },
          error: null,
        };
      if (ctx.table === "human_trusted_contacts")
        return { data: [{ trusted_id: "h1", relationship: "partner" }], error: null };
      if (ctx.table === "humans" && ctx.calls.some((c) => c.method === "in"))
        return { data: [h1], error: null };
      return undefined;
    });
    setSupabase(stub);
    const { result } = renderHook(() => useHarness());

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
    expect(result.current.humans["Dave Smith"].trustedContacts).toHaveLength(1);
    expect(result.current.hydrated.has("h2")).toBe(true);
  });

  it("serves hydrated ids from the local maps without a query", async () => {
    const stub = makeStub();
    setSupabase(stub);
    const { result } = renderHook(() => useHarness());

    act(() => {
      result.current.hydrated.add("h1");
    });

    const cached = await result.current.fetchHumanById("h1");
    expect(cached.id).toBe("h1");
    expect(stub.from).not.toHaveBeenCalled();

    // Blank id / missing row resolve to null.
    expect(await result.current.fetchHumanById("")).toBeNull();
  });
});

describe("useHumanLookups findHumanByFullName", () => {
  it("trims the inputs, hydrates the match and caches it", async () => {
    const stub = makeStub((ctx) => {
      if (ctx.terminal === "maybeSingle")
        return {
          data: { id: "h3", name: "Cara", surname: "Lane", phone: "07700900113" },
          error: null,
        };
      if (ctx.table === "human_trusted_contacts") return { data: [], error: null };
      return undefined;
    });
    setSupabase(stub);
    const { result } = renderHook(() => useHarness());

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
    expect(result.current.hydrated.has("h3")).toBe(true);

    // Blank parts skip the lookup entirely.
    expect(await result.current.findHumanByFullName("", "Lane")).toBeNull();
  });
});

describe("useHumanLookups searchHumansByTerm", () => {
  it("dedupes across the three queries and hydrates the maps", async () => {
    const h3 = { id: "h3", name: "Cara", surname: "Lane", phone: "07700900113" };
    const h4 = { id: "h4", name: "Carl", surname: "Carter", phone: "07700900114" };
    const stub = makeStub((ctx) => {
      const ilike = ctx.calls.find((c) => c.method === "ilike");
      if (!ilike || ilike.args[1] !== "%car%") return { data: [], error: null };
      if (ilike.args[0] === "name") return { data: [h3, h4], error: null };
      // h4 matches by surname too — the union must not duplicate them.
      if (ilike.args[0] === "surname") return { data: [h4], error: null };
      return { data: [], error: null };
    });
    setSupabase(stub);
    const { result } = renderHook(() => useHarness());

    let entries;
    await act(async () => {
      entries = await result.current.searchHumansByTerm("  car ");
    });

    expect(entries.map((e) => e.id)).toEqual(["h3", "h4"]);
    expect(result.current.humans["Cara Lane"].id).toBe("h3");
    expect(result.current.humansById.h4.fullName).toBe("Carl Carter");

    // A blank term never hits the network.
    const before = stub.from.mock.calls.length;
    expect(await result.current.searchHumansByTerm("   ")).toEqual([]);
    expect(stub.from.mock.calls.length).toBe(before);
  });
});

describe("useHumanLookups ensureHumansByIds", () => {
  it("fetches only ids missing from the caches, collapsing dupes and blanks", async () => {
    const stub = makeStub((ctx) =>
      ctx.calls.some((c) => c.method === "in")
        ? { data: [{ id: "h3", name: "Cara", surname: "Lane" }], error: null }
        : undefined,
    );
    setSupabase(stub);
    const { result } = renderHook(() => useHarness());

    // Everything already cached → no query at all.
    await result.current.ensureHumansByIds(["h1"]);
    expect(stub.from).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.ensureHumansByIds(["h1", "h3", "h3", null, undefined, ""]);
    });

    const query = stub._fromCalls.find((c) => c.calls.some((m) => m.method === "in"));
    expect(query.arg("in")).toEqual(["id", ["h3"]]);
    expect(result.current.humansById.h3.fullName).toBe("Cara Lane");
    expect(result.current.humans["Cara Lane"].id).toBe("h3");
  });

  it("marks failed ids as fetched so it never retries them", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const stub = makeStub((ctx) =>
      ctx.calls.some((c) => c.method === "in")
        ? { data: null, error: { message: "boom" } }
        : undefined,
    );
    setSupabase(stub);
    const { result } = renderHook(() => useHarness());

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

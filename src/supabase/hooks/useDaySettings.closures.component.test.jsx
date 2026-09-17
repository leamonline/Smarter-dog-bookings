// Partial-day closure mutations.
//
// The property that matters: a closure and the seats it blocks travel in ONE
// update payload. Two writes on the same row race, and the loser silently
// undoes the winner — which here would leave a card saying "Closed" over slots
// a customer could still book, or blocked seats with no card explaining them.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

function setSupabase(value) {
  globalThis.__supabaseMockDaySettings = value;
}

vi.mock("../client", () => ({
  get supabase() {
    return globalThis.__supabaseMockDaySettings;
  },
}));

vi.mock("../bootPrefetch.js", () => ({
  primeBootPrefetch: vi.fn(),
  takeBootPrefetch: vi.fn(() => null),
  _resetBootPrefetchForTests: vi.fn(),
}));

const { takeBootPrefetch } = await import("../bootPrefetch.js");
const { useDaySettings } = await import("./useDaySettings");

const weekStart = new Date(2026, 4, 18); // Mon 18 May 2026
const DATE = "2026-05-18";

const row = (over = {}) => ({
  setting_date: DATE,
  is_open: true,
  overrides: {},
  extra_slots: [],
  immediate_slots: [],
  closures: [],
  ...over,
});

// Same stub shape as useDaySettings.component.test.jsx, with every .update()
// payload captured so a test can assert exactly what was sent.
function makeStub(rows) {
  const updates = [];
  const channel = { on: vi.fn(() => channel), subscribe: vi.fn(() => channel) };
  const builder = {};
  let writing = false;
  for (const m of ["gte", "lte"]) builder[m] = vi.fn(() => builder);
  builder.select = vi.fn(() =>
    writing
      ? Promise.resolve({ data: [{ setting_date: DATE }], error: null })
      : builder,
  );
  builder.update = vi.fn((payload) => {
    writing = true;
    updates.push(payload);
    return builder;
  });
  builder.eq = vi.fn(() => builder);
  builder.abortSignal = vi.fn(() => Promise.resolve({ data: rows, error: null }));
  builder.upsert = vi.fn(() => Promise.resolve({ data: null, error: null }));
  return {
    updates,
    client: {
      from: vi.fn(() => builder),
      rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(),
    },
  };
}

async function mountWith(rows) {
  const stub = makeStub(rows);
  setSupabase(stub.client);
  const { result } = renderHook(() => useDaySettings(weekStart));
  await waitFor(() => expect(result.current.loading).toBe(false));
  return { stub, result };
}

beforeEach(() => {
  setSupabase(undefined);
  takeBootPrefetch.mockReset();
  takeBootPrefetch.mockReturnValue(null);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useDaySettings — addClosure", () => {
  it("writes the closure and its blocked seats in ONE payload", async () => {
    const { stub, result } = await mountWith([row()]);

    let outcome;
    await act(async () => {
      outcome = await result.current.addClosure(DATE, {
        from: "09:00",
        to: "10:30",
        reason: "doctor's appointment",
      });
    });

    expect(outcome.ok).toBe(true);
    expect(stub.updates).toHaveLength(1);

    const payload = stub.updates[0];
    expect(payload.closures).toHaveLength(1);
    expect(payload.closures[0]).toMatchObject({
      from: "09:00",
      to: "10:30",
      reason: "doctor's appointment",
    });
    expect(payload.closures[0].id).toEqual(expect.any(String));

    // from inclusive, to exclusive — 09:00, 09:30, 10:00. Not 10:30.
    expect(Object.keys(payload.overrides).sort()).toEqual(["09:00", "09:30", "10:00"]);
    for (const slot of ["09:00", "09:30", "10:00"]) {
      expect(payload.overrides[slot]).toEqual({ 0: "blocked", 1: "blocked" });
    }
  });

  it("leaves an unrelated seat block alone", async () => {
    const { stub, result } = await mountWith([
      row({ overrides: { "12:00": { 0: "blocked" } } }),
    ]);

    await act(async () => {
      await result.current.addClosure(DATE, {
        from: "09:00",
        to: "09:30",
        reason: "late start",
      });
    });

    expect(stub.updates[0].overrides["12:00"]).toEqual({ 0: "blocked" });
  });

  it("covers an extra slot after 13:00 like any other", async () => {
    const { stub, result } = await mountWith([row({ extra_slots: ["13:30"] })]);

    await act(async () => {
      await result.current.addClosure(DATE, {
        from: "13:00",
        to: "14:00",
        reason: "early finish",
      });
    });

    expect(Object.keys(stub.updates[0].overrides).sort()).toEqual(["13:00", "13:30"]);
  });

  it("refuses an invalid range without writing anything", async () => {
    const { stub, result } = await mountWith([row()]);

    let outcome;
    await act(async () => {
      outcome = await result.current.addClosure(DATE, {
        from: "10:00",
        to: "09:00",
        reason: "backwards",
      });
    });

    expect(outcome.ok).toBe(false);
    expect(stub.updates).toHaveLength(0);
  });

  it("refuses an empty reason without writing anything", async () => {
    const { stub, result } = await mountWith([row()]);

    let outcome;
    await act(async () => {
      outcome = await result.current.addClosure(DATE, {
        from: "09:00",
        to: "10:00",
        reason: "   ",
      });
    });

    expect(outcome.ok).toBe(false);
    expect(stub.updates).toHaveLength(0);
  });

  it("refuses a closure overlapping one already on the day", async () => {
    const { stub, result } = await mountWith([
      row({
        closures: [{ id: "c1", from: "09:00", to: "10:00", reason: "late start" }],
      }),
    ]);

    let outcome;
    await act(async () => {
      outcome = await result.current.addClosure(DATE, {
        from: "09:30",
        to: "11:00",
        reason: "another thing",
      });
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.error).toMatch(/overlap/i);
    expect(stub.updates).toHaveLength(0);
  });
});

describe("useDaySettings — removeClosure", () => {
  it("clears the closure and frees its seats in one payload", async () => {
    const { stub, result } = await mountWith([
      row({
        overrides: {
          "09:00": { 0: "blocked", 1: "blocked" },
          "09:30": { 0: "blocked", 1: "blocked" },
        },
        closures: [{ id: "c1", from: "09:00", to: "10:00", reason: "late start" }],
      }),
    ]);

    await act(async () => {
      await result.current.removeClosure(DATE, "c1");
    });

    expect(stub.updates).toHaveLength(1);
    expect(stub.updates[0].closures).toEqual([]);
    expect(stub.updates[0].overrides).toEqual({});
  });

  it("declines to write when the closure is already gone", async () => {
    const { stub, result } = await mountWith([row()]);

    await act(async () => {
      await result.current.removeClosure(DATE, "does-not-exist");
    });

    expect(stub.updates).toHaveLength(0);
  });
});

describe("useDaySettings — updateClosureReason", () => {
  it("changes only the reason, touching no other column", async () => {
    const { stub, result } = await mountWith([
      row({
        overrides: { "09:00": { 0: "blocked", 1: "blocked" } },
        closures: [{ id: "c1", from: "09:00", to: "09:30", reason: "late start" }],
      }),
    ]);

    await act(async () => {
      await result.current.updateClosureReason(DATE, "c1", "early finish");
    });

    const payload = stub.updates[0];
    expect(payload.closures[0].reason).toBe("early finish");
    expect(payload.closures[0].from).toBe("09:00");
    expect(payload.overrides).toBeUndefined();
  });

  it("refuses an empty reason", async () => {
    const { stub, result } = await mountWith([
      row({ closures: [{ id: "c1", from: "09:00", to: "09:30", reason: "late start" }] }),
    ]);

    let outcome;
    await act(async () => {
      outcome = await result.current.updateClosureReason(DATE, "c1", "  ");
    });

    expect(outcome.ok).toBe(false);
    expect(stub.updates).toHaveLength(0);
  });
});

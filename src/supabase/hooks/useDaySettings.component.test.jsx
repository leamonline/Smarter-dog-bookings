// Boot-prefetch consumption tests for useDaySettings (consume + fallback).
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

// Realistic day_settings row for the Monday of the test week.
const ROW = {
  setting_date: "2026-05-18",
  is_open: true,
  overrides: { "09:00": { 0: "block" } },
  extra_slots: ["13:30"],
};

// Realtime channel, the fallback week select (terminal .abortSignal()) and the
// two write shapes: a field-scoped .update().eq().select(), and the .upsert()
// that only runs when the date has no row yet.
function makeStub({ selectResult, updateResult, upsertResult, rpcResult } = {}) {
  const channel = {
    on: vi.fn(() => channel),
    subscribe: vi.fn(() => channel),
  };
  let writing = false;
  const builder = {};
  for (const m of ["gte", "lte"]) {
    builder[m] = vi.fn(() => builder);
  }
  // .select() ends an UPDATE but only continues the week read.
  builder.select = vi.fn(() =>
    writing
      ? Promise.resolve(
          updateResult ?? { data: [{ setting_date: ROW.setting_date }], error: null },
        )
      : builder,
  );
  builder.update = vi.fn(() => {
    writing = true;
    return builder;
  });
  builder.eq = vi.fn(() => builder);
  builder.abortSignal = vi.fn(() =>
    Promise.resolve(selectResult ?? { data: [], error: null }),
  );
  builder.upsert = vi.fn(() =>
    Promise.resolve(upsertResult ?? { data: null, error: null }),
  );
  return {
    from: vi.fn(() => builder),
    rpc: vi.fn(() =>
      Promise.resolve(rpcResult ?? { data: { status: "closed" }, error: null }),
    ),
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(),
    builder,
  };
}

beforeEach(() => {
  setSupabase(undefined);
  takeBootPrefetch.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useDaySettings boot prefetch", () => {
  it("consumes a primed week promise and skips its own initial read", async () => {
    takeBootPrefetch.mockReturnValue(
      Promise.resolve({ data: [ROW], error: null }),
    );
    const stub = makeStub();
    setSupabase(stub);

    const { result } = renderHook(() => useDaySettings(weekStart));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(takeBootPrefetch).toHaveBeenCalledWith("daySettingsWeek", {
      startStr: "2026-05-18",
    });
    // The DB row overrides the built defaults for its date…
    expect(result.current.daySettings["2026-05-18"]).toEqual({
      isOpen: true,
      overrides: { "09:00": { 0: "block" } },
      extraSlots: ["13:30"],
      immediateSlots: [],
      // The row predates the closures column, so it narrows to an empty list.
      closures: [],
    });
    // …the other six days still get defaults…
    expect(Object.keys(result.current.daySettings)).toHaveLength(7);
    // …and the client was never asked for the initial read.
    expect(stub.from).not.toHaveBeenCalled();
  });

  it("falls back to its own read when the prefetch misses", async () => {
    takeBootPrefetch.mockReturnValue(null);
    const stub = makeStub({ selectResult: { data: [ROW], error: null } });
    setSupabase(stub);

    const { result } = renderHook(() => useDaySettings(weekStart));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(stub.from).toHaveBeenCalledWith("day_settings");
    expect(result.current.daySettings["2026-05-18"].extraSlots).toEqual([
      "13:30",
    ]);
  });
});

describe("useDaySettings closure integrity", () => {
  it("closes a day through the atomic closure RPC rather than a plain settings upsert", async () => {
    takeBootPrefetch.mockReturnValue(
      Promise.resolve({ data: [ROW], error: null }),
    );
    const stub = makeStub();
    setSupabase(stub);

    const { result } = renderHook(() => useDaySettings(weekStart));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let outcome;
    await act(async () => {
      outcome = await result.current.toggleDayOpen("2026-05-18");
    });

    expect(stub.rpc).toHaveBeenCalledWith(
      "close_day_with_rearrangement_tasks",
      { p_date: "2026-05-18" },
    );
    expect(stub.builder.upsert).not.toHaveBeenCalled();
    expect(stub.builder.update).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ ok: true });
    expect(result.current.daySettings["2026-05-18"].isOpen).toBe(false);
  });

  it("rolls the optimistic closure back when the atomic command fails", async () => {
    takeBootPrefetch.mockReturnValue(
      Promise.resolve({ data: [ROW], error: null }),
    );
    const stub = makeStub({
      rpcResult: {
        data: null,
        error: { message: "closure could not be saved" },
      },
    });
    setSupabase(stub);

    const { result } = renderHook(() => useDaySettings(weekStart));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let outcome;
    await act(async () => {
      outcome = await result.current.toggleDayOpen("2026-05-18");
    });

    expect(outcome).toEqual({
      ok: false,
      error: "closure could not be saved",
    });
    expect(result.current.daySettings["2026-05-18"].isOpen).toBe(true);
  });

  it("reopens by writing is_open alone, leaving the rest of the row alone", async () => {
    takeBootPrefetch.mockReturnValue(
      Promise.resolve({
        data: [{ ...ROW, is_open: false }],
        error: null,
      }),
    );
    const stub = makeStub();
    setSupabase(stub);

    const { result } = renderHook(() => useDaySettings(weekStart));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.toggleDayOpen("2026-05-18");
    });

    expect(stub.rpc).not.toHaveBeenCalled();
    expect(stub.builder.update).toHaveBeenCalledWith({ is_open: true });
    expect(stub.builder.eq).toHaveBeenCalledWith("setting_date", "2026-05-18");
    // The row already exists, so nothing falls through to a whole-row insert.
    expect(stub.builder.upsert).not.toHaveBeenCalled();
  });

  it("honours an explicit close target instead of reopening stale state", async () => {
    takeBootPrefetch.mockReturnValue(
      Promise.resolve({
        data: [{ ...ROW, is_open: false }],
        error: null,
      }),
    );
    const stub = makeStub();
    setSupabase(stub);

    const { result } = renderHook(() => useDaySettings(weekStart));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.toggleDayOpen("2026-05-18", false);
    });

    expect(stub.rpc).toHaveBeenCalledWith(
      "close_day_with_rearrangement_tasks",
      { p_date: "2026-05-18" },
    );
    expect(stub.builder.upsert).not.toHaveBeenCalled();
    expect(result.current.daySettings["2026-05-18"].isOpen).toBe(false);
  });
});

// Blocking a whole timeslot must be ONE write. Every day-settings mutation
// upserts the entire row, so two calls for the same slot raced on the same
// primary key: the first payload (seat 0 only) was already stale when it left,
// and if it committed last the row came back with just one seat blocked.
describe("useDaySettings — setOverride across several seats", () => {
  it("sends one write carrying every seat when given a list", async () => {
    takeBootPrefetch.mockReturnValue(
      Promise.resolve({ data: [{ ...ROW, overrides: {} }], error: null }),
    );
    const stub = makeStub();
    setSupabase(stub);

    const { result } = renderHook(() => useDaySettings(weekStart));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.setOverride("2026-05-18", "09:00", [0, 1], "blocked");
    });

    expect(stub.builder.update).toHaveBeenCalledTimes(1);
    expect(stub.builder.update).toHaveBeenCalledWith({
      overrides: { "09:00": { 0: "blocked", 1: "blocked" } },
    });
    expect(result.current.daySettings["2026-05-18"].overrides).toEqual({
      "09:00": { 0: "blocked", 1: "blocked" },
    });
  });

  it("keeps per-seat toggle semantics, so the same list unblocks again", async () => {
    takeBootPrefetch.mockReturnValue(
      Promise.resolve({
        data: [{ ...ROW, overrides: { "09:00": { 0: "blocked", 1: "blocked" } } }],
        error: null,
      }),
    );
    const stub = makeStub();
    setSupabase(stub);

    const { result } = renderHook(() => useDaySettings(weekStart));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.setOverride("2026-05-18", "09:00", [0, 1], "blocked");
    });

    expect(stub.builder.update).toHaveBeenCalledTimes(1);
    // Both seats cleared, so the slot key drops out of overrides entirely.
    expect(result.current.daySettings["2026-05-18"].overrides).toEqual({});
  });

  it("still accepts a bare seat index for a single-seat block", async () => {
    takeBootPrefetch.mockReturnValue(
      Promise.resolve({ data: [{ ...ROW, overrides: {} }], error: null }),
    );
    const stub = makeStub();
    setSupabase(stub);

    const { result } = renderHook(() => useDaySettings(weekStart));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.setOverride("2026-05-18", "09:00", 1, "blocked");
    });

    expect(result.current.daySettings["2026-05-18"].overrides).toEqual({
      "09:00": { 1: "blocked" },
    });
  });
});

// ── Concurrent-write harness ──────────────────────────────────────────
// A stand-in for the day_settings table, so these tests can assert what the
// DATABASE ends up holding rather than what the client happened to send.
// Writes are held until the test releases them, so the test decides which one
// commits last — the only thing that picks a winner when two writes race on
// one primary key.
const COLUMN_DEFAULTS = {
  is_open: true, // the real column default; the weekday default lives in the app
  overrides: {},
  extra_slots: [],
  immediate_slots: [],
};

function makeDayTable(rows = []) {
  const table = new Map();
  for (const row of rows) {
    table.set(row.setting_date, { ...COLUMN_DEFAULTS, ...row });
  }
  return {
    read: (date) => table.get(date),
    // An UPDATE writes the columns it names and leaves every other column
    // of the row exactly as it found it.
    update(date, columns) {
      const row = table.get(date);
      if (!row) return [];
      table.set(date, { ...row, ...columns });
      return [{ setting_date: date }];
    },
    // An upsert asserts every column it carries, creating the row if absent.
    upsert(payload) {
      const row = table.get(payload.setting_date) ?? {
        ...COLUMN_DEFAULTS,
        setting_date: payload.setting_date,
      };
      table.set(payload.setting_date, { ...row, ...payload });
    },
  };
}

// Supabase stub whose writes queue up in `pending` instead of completing.
// Each entry carries the payload the client serialised and a release() that
// lets that write reach the table.
function makeRacingStub(table, { selectRows = [] } = {}) {
  const realtime = {};
  const channel = {
    on: vi.fn((_event, _filter, handler) => {
      realtime.deliver = handler;
      return channel;
    }),
    subscribe: vi.fn(() => channel),
  };
  const pending = [];

  function hold(apply) {
    return new Promise((resolve) => {
      pending.push({ release: () => resolve(apply()) });
    });
  }

  function makeBuilder() {
    const write = { mode: null, columns: null, date: null };
    const builder = {
      gte: vi.fn(() => builder),
      lte: vi.fn(() => builder),
      abortSignal: vi.fn(() =>
        Promise.resolve({ data: selectRows, error: null }),
      ),
      update: vi.fn((columns) => {
        write.mode = "update";
        write.columns = columns;
        return builder;
      }),
      eq: vi.fn((_column, value) => {
        write.date = value;
        return builder;
      }),
      // Terminal for the fetch path; terminal for an UPDATE too, which is why
      // it hands back a held promise once a write is in progress.
      select: vi.fn(() =>
        write.mode === "update"
          ? hold(() => ({
              data: table.update(write.date, write.columns),
              error: null,
            }))
          : builder,
      ),
      upsert: vi.fn((payload) => {
        write.mode = "upsert";
        write.columns = payload;
        return hold(() => {
          table.upsert(payload);
          return { data: null, error: null };
        });
      }),
    };
    return builder;
  }

  return {
    from: vi.fn(() => makeBuilder()),
    rpc: vi.fn(() =>
      Promise.resolve({ data: { status: "closed" }, error: null }),
    ),
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(),
    pending,
    realtime,
  };
}

describe("useDaySettings concurrent edits to one date", () => {
  // Monday of the test week, already holding a row.
  const DATE = "2026-05-18";

  // Seed the hook from the same row the fake table starts with, so local
  // state and the table agree before the two edits race.
  async function loadHook(stub, seed) {
    takeBootPrefetch.mockReturnValue(
      Promise.resolve({ data: [seed], error: null }),
    );
    setSupabase(stub);
    const { result } = renderHook(() => useDaySettings(weekStart));
    await waitFor(() => expect(result.current.loading).toBe(false));
    return result;
  }

  it("keeps the seat block when an immediate-slot toggle overlaps it", async () => {
    const seed = {
      setting_date: DATE,
      is_open: true,
      overrides: { "09:00": { 0: "block" } },
      extra_slots: [],
      immediate_slots: [],
    };
    const table = makeDayTable([seed]);
    const stub = makeRacingStub(table);
    const result = await loadHook(stub, seed);

    // Two unrelated edits to the same day, issued back to back from one
    // device: block seat 1 at 11:00, then open 12:00 for same-day booking.
    let blocked;
    let opened;
    await act(async () => {
      blocked = result.current.setOverride(DATE, "11:00", 1, "block");
      opened = result.current.toggleImmediateSlot(DATE, "12:00");
      await Promise.resolve();
    });

    expect(stub.pending).toHaveLength(2);

    // They are two independent requests, so nothing guarantees they commit in
    // the order they were sent. Let the second one land first.
    stub.pending[1].release();
    stub.pending[0].release();
    await act(async () => {
      await Promise.all([blocked, opened]);
    });

    const row = table.read(DATE);
    expect(row.overrides).toEqual({
      "09:00": { 0: "block" },
      "11:00": { 1: "block" },
    });
    expect(row.immediate_slots).toEqual(["12:00"]);
  });

  it("keeps an extra slot when a seat block is still in flight", async () => {
    const seed = {
      setting_date: DATE,
      is_open: true,
      overrides: {},
      extra_slots: [],
      immediate_slots: [],
    };
    const table = makeDayTable([seed]);
    const stub = makeRacingStub(table);
    const result = await loadHook(stub, seed);

    let blocked;
    let added;
    await act(async () => {
      blocked = result.current.setOverride(DATE, "09:00", 0, "block");
      added = result.current.addExtraSlot(DATE);
      await Promise.resolve();
    });

    expect(stub.pending).toHaveLength(2);
    stub.pending[1].release();
    stub.pending[0].release();
    await act(async () => {
      await Promise.all([blocked, added]);
    });

    const row = table.read(DATE);
    expect(row.overrides).toEqual({ "09:00": { 0: "block" } });
    expect(row.extra_slots).toEqual(["13:30"]);
  });

  it("creates a missing row with the salon's weekday default, not the column default", async () => {
    // Thursday: the salon defaults it closed, while the is_open column
    // defaults true. An UPDATE matches nothing here, so the insert fallback
    // has to carry the app's answer or the day opens to customers.
    const THURSDAY = "2026-05-21";
    const table = makeDayTable();
    const stub = makeRacingStub(table);
    const result = await loadHook(stub, {
      setting_date: DATE,
      is_open: true,
      overrides: {},
      extra_slots: [],
      immediate_slots: [],
    });

    let blocked;
    await act(async () => {
      blocked = result.current.setOverride(THURSDAY, "09:00", 0, "block");
      await Promise.resolve();
    });

    // One held write per round trip: the UPDATE that matches nothing, then
    // the insert it falls through to.
    stub.pending[0].release();
    await act(async () => {
      await Promise.resolve();
    });
    stub.pending[1].release();
    await act(async () => {
      await blocked;
    });

    const row = table.read(THURSDAY);
    expect(row.is_open).toBe(false);
    expect(row.overrides).toEqual({ "09:00": { 0: "block" } });
  });

  it("does not overwrite another device's edit that arrived mid-flight", async () => {
    const seed = {
      setting_date: DATE,
      is_open: true,
      overrides: {},
      extra_slots: [],
      immediate_slots: [],
    };
    const table = makeDayTable([seed]);
    const stub = makeRacingStub(table);
    const result = await loadHook(stub, seed);

    let blocked;
    await act(async () => {
      blocked = result.current.setOverride(DATE, "09:00", 0, "block");
      await Promise.resolve();
    });

    // While our block is still in flight, the other device opens 12:00 for
    // same-day booking and realtime brings us their row.
    table.update(DATE, { immediate_slots: ["12:00"] });
    await act(async () => {
      stub.realtime.deliver({ new: table.read(DATE) });
    });

    stub.pending[0].release();
    await act(async () => {
      await blocked;
    });

    const row = table.read(DATE);
    expect(row.overrides).toEqual({ "09:00": { 0: "block" } });
    expect(row.immediate_slots).toEqual(["12:00"]);
  });
});

// Boot-prefetch consumption tests for useSalonConfig (consume + fallback).
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { logger } from "../../lib/logger";

function setSupabase(value) {
  globalThis.__supabaseMockSalonConfig = value;
}

vi.mock("../client", () => ({
  get supabase() {
    return globalThis.__supabaseMockSalonConfig;
  },
  get bookingPolicyClient() {
    return globalThis.__supabaseMockSalonConfig;
  },
}));

vi.mock("../bootPrefetch.js", () => ({
  primeBootPrefetch: vi.fn(),
  takeBootPrefetch: vi.fn(() => null),
  _resetBootPrefetchForTests: vi.fn(),
}));

const { takeBootPrefetch } = await import("../bootPrefetch.js");
const { useSalonConfig } = await import("./useSalonConfig.js");

// Realistic salon_config row (dbConfigToApp folds defaults over nulls).
const CONFIG_ROW = {
  id: "cfg-1",
  updated_at: "2026-07-30T10:00:00.000Z",
  default_pickup_offset: 4,
  pricing: null,
  enforce_capacity: true,
  large_dog_slots: null,
  settings: null,
};

const BOOKING_RULES = {
  bookingHorizonDays: 180,
  autoConfirm: true,
  depositHoldHours: 12,
  depositBank: { accountName: "", sortCode: "", accountNumber: "" },
  termsUrl: "https://smarterdog.co.uk/terms",
  depositTermsVersion: null,
  depositTermsContentHash: null,
  customerPortal: {
    allowCancellations: true,
    allowRescheduling: true,
    allowRepeatBooking: false,
    showHistory: true,
  },
};

// The select chain is .select().limit().abortSignal().maybeSingle();
// maybeSingle is the terminal.
function makeStub({ selectResult } = {}) {
  const builder = {};
  for (const m of ["select", "limit", "abortSignal", "not"]) {
    builder[m] = vi.fn(() => builder);
  }
  builder.maybeSingle = vi.fn(() =>
    Promise.resolve(selectResult ?? { data: null, error: null }),
  );
  return {
    from: vi.fn(() => builder),
    rpc: vi.fn((name) => {
      if (name === "booking_policy_runtime_status") {
        return Promise.resolve({
          data: { state: "inactive", scheduledEffectiveAt: null },
          error: null,
        });
      }
      if (name === "current_booking_rules") {
        return Promise.resolve({ data: BOOKING_RULES, error: null });
      }
      throw new Error(`Unexpected RPC: ${name}`);
    }),
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

// This keeps the hook real while making the external Supabase boundary
// deterministic. `updates` records the requests the hook actually emits.
function makeWriteStub({
  readResults = [{ data: CONFIG_ROW, error: null }],
  updateResults = [],
  insertResults = [],
} = {}) {
  const updates = [];
  const inserts = [];
  let readIndex = 0;
  let updateIndex = 0;
  let insertIndex = 0;

  const client = {
    from: vi.fn(() => {
      let operation = "read";
      let currentUpdate = null;
      let currentInsert = null;
      const builder = {
        select: vi.fn(() => {
          if (operation === "update") currentUpdate.selected = true;
          if (operation === "insert") currentInsert.selected = true;
          return builder;
        }),
        limit: vi.fn(() => builder),
        abortSignal: vi.fn(() => builder),
        eq: vi.fn((column, value) => {
          currentUpdate?.filters.push({ op: "eq", column, value });
          return builder;
        }),
        is: vi.fn((column, value) => {
          currentUpdate?.filters.push({ op: "is", column, value });
          return builder;
        }),
        not: vi.fn(() => builder),
        update: vi.fn((payload) => {
          operation = "update";
          currentUpdate = { payload, filters: [], selected: false, terminal: null };
          updates.push(currentUpdate);
          return builder;
        }),
        insert: vi.fn((payload) => {
          operation = "insert";
          currentInsert = { payload, selected: false };
          inserts.push(currentInsert);
          return builder;
        }),
        maybeSingle: vi.fn(() => {
          if (operation === "update") {
            currentUpdate.terminal = currentUpdate.selected
              ? "select().maybeSingle()"
              : "maybeSingle()";
            if (!currentUpdate.selected) {
              return Promise.resolve({
                data: null,
                error: { message: "Update response must select the returned row." },
              });
            }
            return updateResults[updateIndex++] ?? Promise.resolve({ data: null, error: null });
          }
          return Promise.resolve(readResults[readIndex++] ?? { data: null, error: null });
        }),
        single: vi.fn(() => {
          if (operation !== "insert" || !currentInsert.selected) {
            return Promise.resolve({
              data: null,
              error: { message: "Insert response must select the returned row." },
            });
          }
          return insertResults[insertIndex++] ?? Promise.resolve({ data: null, error: null });
        }),
      };
      return builder;
    }),
    rpc: vi.fn((name) => {
      if (name === "booking_policy_runtime_status") {
        return Promise.resolve({
          data: { state: "inactive", scheduledEffectiveAt: null },
          error: null,
        });
      }
      if (name === "current_booking_rules") {
        return Promise.resolve({ data: BOOKING_RULES, error: null });
      }
      throw new Error(`Unexpected RPC: ${name}`);
    }),
  };

  return { client, updates, inserts };
}

beforeEach(() => {
  setSupabase(undefined);
  takeBootPrefetch.mockReset();
  vi.spyOn(logger, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useSalonConfig boot prefetch", () => {
  it("consumes a primed config promise and skips its own SELECT", async () => {
    takeBootPrefetch.mockReturnValue(
      Promise.resolve({ data: CONFIG_ROW, error: null }),
    );
    const stub = makeStub();
    setSupabase(stub);

    const { result } = renderHook(() => useSalonConfig());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(takeBootPrefetch).toHaveBeenCalledWith("salonConfig");
    // Prefetched row flows through dbConfigToApp as usual…
    expect(result.current.config?.defaultPickupOffset).toBe(4);
    expect(result.current.config?.enforceCapacity).toBe(true);
    expect(result.current.error).toBeNull();
    // …and the client was never asked for the initial read.
    expect(stub.from).not.toHaveBeenCalled();
  });

  it("falls back to its own SELECT when the prefetch misses", async () => {
    takeBootPrefetch.mockReturnValue(null);
    const stub = makeStub({ selectResult: { data: CONFIG_ROW, error: null } });
    setSupabase(stub);

    const { result } = renderHook(() => useSalonConfig());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(stub.from).toHaveBeenCalledWith("salon_config");
    expect(result.current.config?.defaultPickupOffset).toBe(4);
    expect(result.current.error).toBeNull();
  });

  it("exposes authoritative booking rules separately from legacy salon config", async () => {
    takeBootPrefetch.mockReturnValue(null);
    const stub = makeStub({ selectResult: { data: CONFIG_ROW, error: null } });
    setSupabase(stub);

    const { result } = renderHook(() => useSalonConfig());

    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(result.current.bookingRulesLoading).toBe(false));
    expect(result.current.config.advanceBookingWeeks).toBe(8);
    expect(result.current.bookingRules.bookingHorizonDays).toBe(180);
    expect(result.current.bookingPolicyRuntime.state).toBe("inactive");
    expect(result.current.updateBookingRules).toEqual(expect.any(Function));
  });
});

describe("useSalonConfig guarded saves", () => {
  it("serialises rapid updater saves and persists the accepted first change in the second payload", async () => {
    // Production break caught: deriving both updaters from one render snapshot
    // allows overlapping writes and loses the first accepted change.
    takeBootPrefetch.mockReturnValue(null);
    const firstWrite = deferred();
    const { client, updates } = makeWriteStub({
      updateResults: [
        firstWrite.promise,
        Promise.resolve({
          data: {
            ...CONFIG_ROW,
            updated_at: "2026-07-30T10:00:02.000Z",
            default_pickup_offset: 8,
            enforce_capacity: false,
          },
          error: null,
        }),
      ],
    });
    setSupabase(client);

    const { result } = renderHook(() => useSalonConfig());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let first;
    let second;
    await act(async () => {
      first = result.current.updateConfig((config) => ({
        ...config,
        defaultPickupOffset: 8,
      }));
      second = result.current.updateConfig((config) => ({
        ...config,
        enforceCapacity: false,
      }));
    });

    await waitFor(() => expect(updates).toHaveLength(1));
    expect(updates[0].payload).toMatchObject({
      default_pickup_offset: 8,
      enforce_capacity: true,
    });

    await act(async () => {
      firstWrite.resolve({
        data: {
          ...CONFIG_ROW,
          updated_at: "2026-07-30T10:00:01.000Z",
          default_pickup_offset: 8,
        },
        error: null,
      });
      await Promise.all([first, second]);
    });

    await expect(first).resolves.toEqual({ ok: true });
    await expect(second).resolves.toEqual({ ok: true });
    expect(updates).toHaveLength(2);
    expect(updates[1].payload).toMatchObject({
      default_pickup_offset: 8,
      enforce_capacity: false,
    });
    expect(updates[1]).toMatchObject({
      filters: [
        { op: "eq", column: "id", value: "cfg-1" },
        { op: "eq", column: "updated_at", value: "2026-07-30T10:00:01.000Z" },
      ],
      terminal: "select().maybeSingle()",
    });
    expect(result.current.config).toMatchObject({
      defaultPickupOffset: 8,
      enforceCapacity: false,
    });
  });

  it("runs the next queued updater from the restored config after a failed save", async () => {
    // Production break caught: a failed write leaves its optimistic value in
    // the base for the next queued updater, or poisons the queue entirely.
    takeBootPrefetch.mockReturnValue(null);
    const { client, updates } = makeWriteStub({
      updateResults: [
        Promise.resolve({ data: null, error: { message: "network failed" } }),
        Promise.resolve({
          data: {
            ...CONFIG_ROW,
            updated_at: "2026-07-30T10:00:01.000Z",
            enforce_capacity: false,
          },
          error: null,
        }),
      ],
    });
    setSupabase(client);

    const { result } = renderHook(() => useSalonConfig());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let first;
    let second;
    await act(async () => {
      first = result.current.updateConfig((config) => ({
        ...config,
        defaultPickupOffset: 8,
      }));
      second = result.current.updateConfig((config) => ({
        ...config,
        enforceCapacity: false,
      }));
      await Promise.all([first, second]);
    });

    await expect(first).resolves.toEqual({ ok: false, error: "network failed" });
    await expect(second).resolves.toEqual({ ok: true });
    expect(updates).toHaveLength(2);
    expect(updates[1].payload).toMatchObject({
      default_pickup_offset: 4,
      enforce_capacity: false,
    });
    expect(result.current.config).toMatchObject({
      defaultPickupOffset: 4,
      enforceCapacity: false,
    });
  });

  it("does not overwrite after an update commits but its acknowledgement is lost", async () => {
    // Production break caught: after an ambiguous network error, the next
    // queued save widens or advances its guard and overwrites the committed row.
    takeBootPrefetch.mockReturnValue(null);
    const committedRow = {
      ...CONFIG_ROW,
      updated_at: "2026-07-30T10:00:01.000Z",
      default_pickup_offset: 8,
    };
    const { client, updates } = makeWriteStub({
      readResults: [
        { data: CONFIG_ROW, error: null },
        { data: committedRow, error: null },
      ],
      updateResults: [
        Promise.resolve({ data: null, error: { message: "connection reset" } }),
        Promise.resolve({ data: null, error: null }),
      ],
    });
    setSupabase(client);

    const { result } = renderHook(() => useSalonConfig());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let firstResult;
    let secondResult;
    await act(async () => {
      const first = result.current.updateConfig((config) => ({
        ...config,
        defaultPickupOffset: 8,
      }));
      const second = result.current.updateConfig((config) => ({
        ...config,
        enforceCapacity: false,
      }));
      [firstResult, secondResult] = await Promise.all([first, second]);
    });

    expect(firstResult).toEqual({ ok: false, error: "connection reset" });
    expect(secondResult).toEqual({
      ok: false,
      error: "Settings changed elsewhere. The latest settings have been reloaded; please try your change again.",
    });
    expect(updates).toHaveLength(2);
    expect(updates[1]).toMatchObject({
      payload: {
        default_pickup_offset: 4,
        enforce_capacity: false,
      },
      filters: [
        { op: "eq", column: "id", value: "cfg-1" },
        { op: "eq", column: "updated_at", value: "2026-07-30T10:00:00.000Z" },
      ],
    });
    expect(result.current.config).toMatchObject({
      defaultPickupOffset: 8,
      enforceCapacity: true,
    });
  });

  it("reloads the authoritative config and asks the owner to retry after a version conflict", async () => {
    // Production break caught: a zero-row guarded update is reported as a
    // success, or a conflicting change remains displayed as if it committed.
    takeBootPrefetch.mockReturnValue(null);
    const authoritativeRow = {
      ...CONFIG_ROW,
      updated_at: "2026-07-30T10:00:03.000Z",
      default_pickup_offset: 11,
      enforce_capacity: false,
    };
    const { client, updates } = makeWriteStub({
      readResults: [
        { data: CONFIG_ROW, error: null },
        { data: authoritativeRow, error: null },
      ],
      updateResults: [Promise.resolve({ data: null, error: null })],
    });
    setSupabase(client);

    const { result } = renderHook(() => useSalonConfig());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let saveResult;
    await act(async () => {
      saveResult = await result.current.updateConfig((config) => ({
        ...config,
        defaultPickupOffset: 8,
      }));
    });
    expect(saveResult).toEqual({
      ok: false,
      error: "Settings changed elsewhere. The latest settings have been reloaded; please try your change again.",
    });

    expect(updates).toHaveLength(1);
    expect(result.current.config).toMatchObject({
      defaultPickupOffset: 11,
      enforceCapacity: false,
    });
  });

  it("rejects a queued raw value made stale by conflict recovery while a queued updater uses the reload", async () => {
    // Production break caught: a raw full-config value captured before a
    // conflict uses the reloaded version and erases the external changes.
    takeBootPrefetch.mockReturnValue(null);
    const externalRow = {
      ...CONFIG_ROW,
      updated_at: "2026-07-30T10:00:03.000Z",
      default_pickup_offset: 11,
      enforce_capacity: false,
      settings: { businessName: "External authority" },
    };
    const { client, updates } = makeWriteStub({
      readResults: [
        { data: CONFIG_ROW, error: null },
        { data: externalRow, error: null },
      ],
      updateResults: [
        Promise.resolve({ data: null, error: null }),
        Promise.resolve({
          data: {
            ...externalRow,
            updated_at: "2026-07-30T10:00:04.000Z",
            enforce_capacity: true,
          },
          error: null,
        }),
      ],
    });
    setSupabase(client);

    const { result } = renderHook(() => useSalonConfig());
    await waitFor(() => expect(result.current.loading).toBe(false));
    const staleValue = {
      ...result.current.config,
      businessName: "Queued stale raw value",
    };

    let conflictResult;
    let rawResult;
    let updaterResult;
    await act(async () => {
      const conflictSave = result.current.updateConfig((config) => ({
        ...config,
        defaultPickupOffset: 8,
      }));
      const rawSave = result.current.updateConfig(staleValue);
      const updaterSave = result.current.updateConfig((config) => ({
        ...config,
        enforceCapacity: true,
      }));
      [conflictResult, rawResult, updaterResult] = await Promise.all([
        conflictSave,
        rawSave,
        updaterSave,
      ]);
    });

    expect(conflictResult).toEqual({
      ok: false,
      error: "Settings changed elsewhere. The latest settings have been reloaded; please try your change again.",
    });
    expect(rawResult).toEqual({
      ok: false,
      error: "Settings changed while this save was queued. Please review the latest settings and try your change again.",
    });
    expect(updaterResult).toEqual({ ok: true });
    expect(updates).toHaveLength(2);
    expect(updates[1].payload).toMatchObject({
      default_pickup_offset: 11,
      enforce_capacity: true,
      settings: { businessName: "External authority" },
    });
    expect(result.current.config).toMatchObject({
      defaultPickupOffset: 11,
      enforceCapacity: true,
      businessName: "External authority",
    });
  });

  it("writes only the fetched row at its observed timestamp", async () => {
    // Production break caught: an update uses a broad singleton predicate,
    // allowing a write to overwrite another row or a newer version.
    takeBootPrefetch.mockReturnValue(null);
    const { client, updates } = makeWriteStub({
      updateResults: [
        Promise.resolve({
          data: { ...CONFIG_ROW, updated_at: "2026-07-30T10:00:01.000Z" },
          error: null,
        }),
      ],
    });
    setSupabase(client);

    const { result } = renderHook(() => useSalonConfig());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let saveResult;
    await act(async () => {
      saveResult = await result.current.updateConfig({ ...result.current.config, enforceCapacity: false });
    });
    expect(saveResult).toEqual({ ok: true });

    expect(updates).toEqual([
      expect.objectContaining({
        filters: [
          { op: "eq", column: "id", value: "cfg-1" },
          { op: "eq", column: "updated_at", value: "2026-07-30T10:00:00.000Z" },
        ],
        terminal: "select().maybeSingle()",
      }),
    ]);
  });

  it.each([
    [
      "omits row metadata",
      {
        default_pickup_offset: 9,
        pricing: null,
        enforce_capacity: false,
        large_dog_slots: null,
        settings: null,
      },
    ],
    [
      "returns a different row id",
      {
        ...CONFIG_ROW,
        id: "cfg-other",
        updated_at: "2026-07-30T10:00:01.000Z",
        default_pickup_offset: 9,
      },
    ],
  ])("fails closed when an update response %s", async (_case, malformedResponse) => {
    // Production break caught: an unverifiable update response is installed
    // and reported as saved instead of reloading authoritative state.
    takeBootPrefetch.mockReturnValue(null);
    const recoveredRow = {
      ...CONFIG_ROW,
      updated_at: "2026-07-30T10:00:02.000Z",
      default_pickup_offset: 12,
      enforce_capacity: false,
    };
    const { client, updates } = makeWriteStub({
      readResults: [
        { data: CONFIG_ROW, error: null },
        { data: recoveredRow, error: null },
      ],
      updateResults: [
        Promise.resolve({ data: malformedResponse, error: null }),
      ],
    });
    setSupabase(client);

    const { result } = renderHook(() => useSalonConfig());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let saveResult;
    await act(async () => {
      saveResult = await result.current.updateConfig((config) => ({
        ...config,
        defaultPickupOffset: 9,
      }));
    });

    expect(saveResult).toEqual({
      ok: false,
      error: "Couldn't verify the saved settings. The latest settings have been reloaded; please review them before trying again.",
    });
    expect(updates).toHaveLength(1);
    expect(result.current.config).toMatchObject({
      defaultPickupOffset: 12,
      enforceCapacity: false,
    });
  });

  it.each([
    ["returns an error", { data: null, error: { message: "read denied" } }],
    ["finds no row", { data: null, error: null }],
  ])("does not claim a reload when conflict recovery %s", async (_case, reloadResult) => {
    // Production break caught: failed conflict recovery claims the latest
    // settings were reloaded, then lets the stale row version be reused.
    takeBootPrefetch.mockReturnValue(null);
    const { client, updates } = makeWriteStub({
      readResults: [
        { data: CONFIG_ROW, error: null },
        reloadResult,
      ],
      updateResults: [Promise.resolve({ data: null, error: null })],
    });
    setSupabase(client);

    const { result } = renderHook(() => useSalonConfig());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let conflictResult;
    await act(async () => {
      conflictResult = await result.current.updateConfig((config) => ({
        ...config,
        defaultPickupOffset: 8,
      }));
    });

    expect(conflictResult).toEqual({
      ok: false,
      error: "Couldn't reload the latest settings. Please reload before trying your change again.",
    });
    expect(result.current.config.defaultPickupOffset).toBe(4);

    let laterResult;
    await act(async () => {
      laterResult = await result.current.updateConfig((config) => ({
        ...config,
        enforceCapacity: false,
      }));
    });
    expect(laterResult).toEqual({
      ok: false,
      error: "Couldn't save settings because the latest settings could not be verified. Please reload and try again.",
    });
    expect(updates).toHaveLength(1);
  });

  it("uses an IS NULL version guard when the authoritative timestamp is null", async () => {
    // Production break caught: nullable versions are treated as unguarded or
    // sent through timestamp equality rather than SQL's null predicate.
    takeBootPrefetch.mockReturnValue(null);
    const nullVersionRow = { ...CONFIG_ROW, updated_at: null };
    const { client, updates } = makeWriteStub({
      readResults: [{ data: nullVersionRow, error: null }],
      updateResults: [
        Promise.resolve({ data: nullVersionRow, error: null }),
      ],
    });
    setSupabase(client);

    const { result } = renderHook(() => useSalonConfig());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let saveResult;
    await act(async () => {
      saveResult = await result.current.updateConfig({ ...result.current.config, enforceCapacity: false });
    });
    expect(saveResult).toEqual({ ok: true });

    expect(updates[0].filters).toEqual([
      { op: "eq", column: "id", value: "cfg-1" },
      { op: "is", column: "updated_at", value: null },
    ]);
  });

  it("fails closed instead of widening an online save without a version", async () => {
    // Production break caught: a malformed authoritative row with no usable
    // version reaches an unguarded update instead of preserving the display.
    takeBootPrefetch.mockReturnValue(null);
    const rowWithoutVersion = { ...CONFIG_ROW, updated_at: undefined };
    const { client, updates } = makeWriteStub({
      readResults: [{ data: rowWithoutVersion, error: null }],
    });
    setSupabase(client);

    const { result } = renderHook(() => useSalonConfig());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let saveResult;
    await act(async () => {
      saveResult = await result.current.updateConfig({
        ...result.current.config,
        defaultPickupOffset: 9,
      });
    });

    expect(saveResult).toEqual({
      ok: false,
      error: "Couldn't save settings because the latest settings could not be verified. Please reload and try again.",
    });
    expect(updates).toHaveLength(0);
    expect(result.current.config.defaultPickupOffset).toBe(4);
  });

  it("uses an owner-seeded row identity and version for the next save", async () => {
    // Production break caught: seeding displays defaults but drops the
    // inserted row metadata, so the owner's first save is broad or rejected.
    takeBootPrefetch.mockReturnValue(null);
    const seededRow = {
      ...CONFIG_ROW,
      id: "cfg-seeded",
      updated_at: "2026-07-30T10:00:05.000Z",
    };
    const { client, updates, inserts } = makeWriteStub({
      readResults: [{ data: null, error: null }],
      insertResults: [Promise.resolve({ data: seededRow, error: null })],
      updateResults: [
        Promise.resolve({
          data: {
            ...seededRow,
            updated_at: "2026-07-30T10:00:06.000Z",
            enforce_capacity: false,
          },
          error: null,
        }),
      ],
    });
    setSupabase(client);

    const { result } = renderHook(() => useSalonConfig({ canSeed: true }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let saveResult;
    await act(async () => {
      saveResult = await result.current.updateConfig((config) => ({
        ...config,
        enforceCapacity: false,
      }));
    });

    expect(inserts).toHaveLength(1);
    expect(saveResult).toEqual({ ok: true });
    expect(updates).toHaveLength(1);
    expect(updates[0].filters).toEqual([
      { op: "eq", column: "id", value: "cfg-seeded" },
      { op: "eq", column: "updated_at", value: "2026-07-30T10:00:05.000Z" },
    ]);
  });

  it("fails closed online when no row exists and the caller cannot seed", async () => {
    // Production break caught: in-memory defaults without an authoritative
    // row are allowed to widen an online update across salon_config.
    takeBootPrefetch.mockReturnValue(null);
    const { client, updates, inserts } = makeWriteStub({
      readResults: [{ data: null, error: null }],
    });
    setSupabase(client);

    const { result } = renderHook(() => useSalonConfig());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let saveResult;
    await act(async () => {
      saveResult = await result.current.updateConfig((config) => ({
        ...config,
        defaultPickupOffset: 9,
      }));
    });

    expect(saveResult).toEqual({
      ok: false,
      error: "Couldn't save settings because the latest settings could not be verified. Please reload and try again.",
    });
    expect(updates).toHaveLength(0);
    expect(inserts).toHaveLength(0);
    expect(result.current.config.defaultPickupOffset).toBe(120);
  });

  it("keeps in-memory saves working without a Supabase client", async () => {
    // Production break caught: adding online write guards makes the existing
    // no-client path reject an in-memory settings change.
    setSupabase(undefined);

    const { result } = renderHook(() => useSalonConfig());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let saveResult;
    await act(async () => {
      saveResult = await result.current.updateConfig((config) => ({
        ...config,
        defaultPickupOffset: 9,
      }));
    });
    expect(saveResult).toEqual({ ok: true });
    expect(result.current.config.defaultPickupOffset).toBe(9);
  });
});

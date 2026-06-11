import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// vi.mock factories must not reference outer variables, so the stub client
// lives on globalThis (same pattern as the hook component tests).
function setSupabase(value) {
  globalThis.__supabaseMockBootPrefetch = value;
}

vi.mock("./client.js", () => ({
  get supabase() {
    return globalThis.__supabaseMockBootPrefetch;
  },
}));

const { primeBootPrefetch, takeBootPrefetch, _resetBootPrefetchForTests } =
  await import("./bootPrefetch.js");

// Chainable builder that records the gte/lte range per from() call and is
// thenable (Promise.resolve(builder) must fire + settle, like a PostgREST
// builder). maybeSingle is the salon_config terminal.
function makeClientStub() {
  const calls = [];
  const from = vi.fn((table) => {
    const call = { table, range: {} };
    calls.push(call);
    const builder = {};
    builder.select = vi.fn(() => builder);
    builder.order = vi.fn(() => builder);
    builder.limit = vi.fn(() => builder);
    builder.gte = vi.fn((_col, value) => {
      call.range.gte = value;
      return builder;
    });
    builder.lte = vi.fn((_col, value) => {
      call.range.lte = value;
      return builder;
    });
    builder.maybeSingle = vi.fn(() =>
      Promise.resolve({ data: { id: "config-row" }, error: null }),
    );
    builder.then = (onResolve, onReject) =>
      Promise.resolve({ data: [], error: null }).then(onResolve, onReject);
    return builder;
  });
  return { from, calls };
}

// The Monday rule under test, computed independently (mirrors
// useWeekNav.weekStart: dow === 0 ? -6 : 1 - dow).
function expectedWeek(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const dow = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
  const end = new Date(monday);
  end.setDate(monday.getDate() + 6);
  const fmt = (x) =>
    `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(
      x.getDate(),
    ).padStart(2, "0")}`;
  return { startStr: fmt(monday), endStr: fmt(end) };
}

beforeEach(() => {
  _resetBootPrefetchForTests();
  setSupabase(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("primeBootPrefetch", () => {
  it("no-ops when the supabase client is null (offline harness)", () => {
    setSupabase(null);
    expect(() => primeBootPrefetch()).not.toThrow();
    const { startStr } = expectedWeek("2026-06-10");
    expect(takeBootPrefetch("bookingsWeek", { startStr })).toBeNull();
    expect(takeBootPrefetch("salonConfig")).toBeNull();
  });

  it("primes once: a second call does not refire the queries", () => {
    const stub = makeClientStub();
    setSupabase(stub);
    primeBootPrefetch();
    expect(stub.from).toHaveBeenCalledTimes(3);
    expect(stub.from.mock.calls.map(([t]) => t).sort()).toEqual([
      "bookings",
      "day_settings",
      "salon_config",
    ]);
    primeBootPrefetch();
    expect(stub.from).toHaveBeenCalledTimes(3);
  });

  it("fires the three tier-1 queries over today's week when no ?date= is present", () => {
    const stub = makeClientStub();
    setSupabase(stub);
    primeBootPrefetch();

    const today = new Date();
    const fmt = (x) =>
      `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(
        x.getDate(),
      ).padStart(2, "0")}`;
    const { startStr, endStr } = expectedWeek(fmt(today));

    const bookings = stub.calls.find((c) => c.table === "bookings");
    const daySettings = stub.calls.find((c) => c.table === "day_settings");
    expect(bookings.range).toEqual({ gte: startStr, lte: endStr });
    expect(daySettings.range).toEqual({ gte: startStr, lte: endStr });
  });
});

describe("takeBootPrefetch", () => {
  it("hands the promise out exactly once for matching params", async () => {
    setSupabase(makeClientStub());
    primeBootPrefetch();
    const today = new Date();
    const fmt = (x) =>
      `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(
        x.getDate(),
      ).padStart(2, "0")}`;
    const { startStr } = expectedWeek(fmt(today));

    const first = takeBootPrefetch("bookingsWeek", { startStr });
    expect(first).not.toBeNull();
    await expect(first).resolves.toEqual({ data: [], error: null });
    // Single-consume: the second take must miss.
    expect(takeBootPrefetch("bookingsWeek", { startStr })).toBeNull();

    // salon_config has no params and resolves the maybeSingle result.
    const config = takeBootPrefetch("salonConfig");
    expect(config).not.toBeNull();
    await expect(config).resolves.toEqual({
      data: { id: "config-row" },
      error: null,
    });

    expect(takeBootPrefetch("daySettingsWeek", { startStr })).not.toBeNull();
  });

  it("returns null on a params mismatch and keeps the entry for a matching take", () => {
    setSupabase(makeClientStub());
    primeBootPrefetch();
    const today = new Date();
    const fmt = (x) =>
      `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(
        x.getDate(),
      ).padStart(2, "0")}`;
    const { startStr } = expectedWeek(fmt(today));

    expect(takeBootPrefetch("bookingsWeek", { startStr: "1999-01-04" })).toBeNull();
    // The mismatch must not consume the entry — the right week still hits.
    expect(takeBootPrefetch("bookingsWeek", { startStr })).not.toBeNull();
    // Unknown names never match.
    expect(takeBootPrefetch("nonsense", { startStr })).toBeNull();
  });

  it("expires primed entries after the 30s TTL", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-10T09:00:00"));
    setSupabase(makeClientStub());
    primeBootPrefetch();
    const { startStr } = expectedWeek("2026-06-10");

    // Just inside the TTL still hits…
    vi.setSystemTime(new Date("2026-06-10T09:00:29.999"));
    expect(takeBootPrefetch("daySettingsWeek", { startStr })).not.toBeNull();

    // …but 30s after priming, the remaining entries are stale.
    vi.setSystemTime(new Date("2026-06-10T09:00:30"));
    expect(takeBootPrefetch("bookingsWeek", { startStr })).toBeNull();
    expect(takeBootPrefetch("salonConfig")).toBeNull();
  });
});

describe("?date= week computation (must match useWeekNav's Monday rule)", () => {
  // Table includes a Sunday (belongs to the week that STARTED the previous
  // Monday), a Monday, a midweek day, and a year boundary.
  const cases = [
    { date: "2026-06-07", monday: "2026-06-01", sunday: "2026-06-07" }, // Sunday
    { date: "2026-06-08", monday: "2026-06-08", sunday: "2026-06-14" }, // Monday
    { date: "2026-06-10", monday: "2026-06-08", sunday: "2026-06-14" }, // Wednesday
    { date: "2026-01-01", monday: "2025-12-29", sunday: "2026-01-04" }, // year boundary
  ];

  it.each(cases)(
    "?date=$date → week $monday..$sunday",
    ({ date, monday, sunday }) => {
      vi.stubGlobal("window", { location: { search: `?date=${date}` } });
      const stub = makeClientStub();
      setSupabase(stub);
      primeBootPrefetch();

      const bookings = stub.calls.find((c) => c.table === "bookings");
      const daySettings = stub.calls.find((c) => c.table === "day_settings");
      expect(bookings.range).toEqual({ gte: monday, lte: sunday });
      expect(daySettings.range).toEqual({ gte: monday, lte: sunday });
      // Sanity: the rule table itself agrees with the shared helper.
      expect(expectedWeek(date)).toEqual({ startStr: monday, endStr: sunday });
      // And the consumer-side params key on the same startStr.
      expect(takeBootPrefetch("bookingsWeek", { startStr: monday })).not.toBeNull();
    },
  );

  it("ignores an invalid ?date= and falls back to today's week", () => {
    vi.stubGlobal("window", { location: { search: "?date=not-a-date" } });
    const stub = makeClientStub();
    setSupabase(stub);
    primeBootPrefetch();

    const today = new Date();
    const fmt = (x) =>
      `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(
        x.getDate(),
      ).padStart(2, "0")}`;
    const { startStr, endStr } = expectedWeek(fmt(today));
    const bookings = stub.calls.find((c) => c.table === "bookings");
    expect(bookings.range).toEqual({ gte: startStr, lte: endStr });
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

// The client is a module constant; drive it from globalThis so one test can
// be "connected" and the next "sample-data mode" without re-importing.
vi.mock("../customerClient", () => ({
  get customerSupabase() {
    return (globalThis as { __availabilityClient?: unknown }).__availabilityClient ?? null;
  },
}));
vi.mock("../repositories/bookingsRepo", () => ({
  listOnDateForCapacity: vi.fn(async () => ({ bookings: [], error: null })),
  listRangeForCapacity: vi.fn(async () => ({ byDate: {}, error: null })),
  listBlockedSeats: vi.fn(async () => ({ byDate: {}, error: null })),
  listImmediateSlots: vi.fn(async () => ({ date: null, slots: [] })),
}));
vi.mock("../repositories/humansRepo", () => ({
  getBookingRules: vi.fn(async () => null),
}));
vi.mock("../rpc", () => ({
  getOpenDays: vi.fn(async () => ({ data: [], error: null })),
}));

const {
  blockedSeatChunks,
  loadDayAvailability,
  loadImmediateSlots,
  loadPageAvailability,
  useCustomerAvailability,
} = await import("./useCustomerAvailability");
const bookingsRepo = await import("../repositories/bookingsRepo");
const humansRepo = await import("../repositories/humansRepo");
const rpc = await import("../rpc");

const client = { tag: "customer-client" };

beforeEach(() => {
  (globalThis as { __availabilityClient?: unknown }).__availabilityClient = client;
  vi.clearAllMocks();
});

describe("blockedSeatChunks", () => {
  it("splits a 28-day page into two 14-day windows", () => {
    expect(blockedSeatChunks("2026-09-01", "2026-09-28")).toEqual([
      { startDate: "2026-09-01", endDate: "2026-09-14" },
      { startDate: "2026-09-15", endDate: "2026-09-28" },
    ]);
  });

  it("clips the final window to the end date", () => {
    expect(blockedSeatChunks("2026-09-01", "2026-09-20")).toEqual([
      { startDate: "2026-09-01", endDate: "2026-09-14" },
      { startDate: "2026-09-15", endDate: "2026-09-20" },
    ]);
  });

  it("returns a single window for a range inside two weeks", () => {
    expect(blockedSeatChunks("2026-09-01", "2026-09-01")).toEqual([
      { startDate: "2026-09-01", endDate: "2026-09-01" },
    ]);
  });
});

describe("useCustomerAvailability", () => {
  it("reports connected only when a customer client exists", () => {
    expect(useCustomerAvailability().connected).toBe(true);
    (globalThis as { __availabilityClient?: unknown }).__availabilityClient = null;
    expect(useCustomerAvailability().connected).toBe(false);
  });

  it("is a stable singleton, so it can sit in an effect dependency array", () => {
    expect(useCustomerAvailability()).toBe(useCustomerAvailability());
  });

  it("loads the slot step's four reads for a date with the customer client", async () => {
    const [occupancy, blocked, immediate, rules] = await loadDayAvailability("2026-09-08", "h1");
    expect(bookingsRepo.listOnDateForCapacity).toHaveBeenCalledWith(client, "2026-09-08");
    expect(bookingsRepo.listBlockedSeats).toHaveBeenCalledWith(client, "2026-09-08", "2026-09-08");
    expect(bookingsRepo.listImmediateSlots).toHaveBeenCalledWith(client);
    expect(humansRepo.getBookingRules).toHaveBeenCalledWith(client, "h1");
    expect(occupancy).toEqual({ bookings: [], error: null });
    expect(blocked).toEqual({ byDate: {}, error: null });
    expect(immediate).toEqual({ date: null, slots: [] });
    expect(rules).toBeNull();
  });

  it("skips the per-human rules read when there is no human id", async () => {
    const [, , , rules] = await loadDayAvailability("2026-09-08");
    expect(humansRepo.getBookingRules).not.toHaveBeenCalled();
    expect(rules).toBeNull();
  });

  it("loads the date step's reads for a page, chunking blocked seats", async () => {
    const [openDays, occupancy, blockedChunks] = await loadPageAvailability("2026-09-01", "2026-09-28");
    expect(rpc.getOpenDays).toHaveBeenCalledWith(client, { startDate: "2026-09-01", endDate: "2026-09-28" });
    expect(bookingsRepo.listRangeForCapacity).toHaveBeenCalledWith(client, "2026-09-01", "2026-09-28");
    expect(bookingsRepo.listBlockedSeats).toHaveBeenCalledTimes(2);
    expect(openDays).toEqual({ data: [], error: null });
    expect(occupancy).toEqual({ byDate: {}, error: null });
    expect(blockedChunks).toHaveLength(2);
  });

  it("loads today's immediate slots", async () => {
    await loadImmediateSlots();
    expect(bookingsRepo.listImmediateSlots).toHaveBeenCalledWith(client);
  });

  it("throws rather than reading when there is no client", async () => {
    (globalThis as { __availabilityClient?: unknown }).__availabilityClient = null;
    await expect(loadDayAvailability("2026-09-08")).rejects.toThrow("Not connected");
    await expect(loadPageAvailability("2026-09-01", "2026-09-28")).rejects.toThrow("Not connected");
    await expect(loadImmediateSlots()).rejects.toThrow("Not connected");
    expect(bookingsRepo.listOnDateForCapacity).not.toHaveBeenCalled();
  });
});

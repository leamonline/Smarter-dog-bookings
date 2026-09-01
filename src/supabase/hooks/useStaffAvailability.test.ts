import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../client", () => ({
  get supabase() {
    return (globalThis as { __staffAvailClient?: unknown }).__staffAvailClient ?? null;
  },
}));
vi.mock("../repositories/bookingsRepo", () => ({
  listOnDateForCapacity: vi.fn(async () => ({ bookings: [], error: null })),
}));

const { loadDayOccupancy, useStaffAvailability } = await import("./useStaffAvailability");
const bookingsRepo = await import("../repositories/bookingsRepo");
const client = { tag: "staff-client" };

beforeEach(() => {
  (globalThis as { __staffAvailClient?: unknown }).__staffAvailClient = client;
  vi.clearAllMocks();
});

describe("useStaffAvailability", () => {
  it("reports connected only when a staff client exists, and is a stable singleton", () => {
    expect(useStaffAvailability().connected).toBe(true);
    expect(useStaffAvailability()).toBe(useStaffAvailability());
    (globalThis as { __staffAvailClient?: unknown }).__staffAvailClient = null;
    expect(useStaffAvailability().connected).toBe(false);
  });

  it("loads a day's occupancy through the repository with the staff client", async () => {
    const result = await loadDayOccupancy("2026-09-08");
    expect(bookingsRepo.listOnDateForCapacity).toHaveBeenCalledWith(client, "2026-09-08");
    expect(result).toEqual({ bookings: [], error: null });
  });

  it("rejects rather than reading when there is no client", async () => {
    (globalThis as { __staffAvailClient?: unknown }).__staffAvailClient = null;
    await expect(loadDayOccupancy("2026-09-08")).rejects.toThrow("Not connected");
    expect(bookingsRepo.listOnDateForCapacity).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../client", () => ({
  get supabase() {
    return (globalThis as { __staffContactsClient?: unknown }).__staffContactsClient ?? null;
  },
}));
vi.mock("../repositories/humansRepo", () => ({
  getContactCard: vi.fn(async () => ({ data: null, error: null })),
  listContactCards: vi.fn(async () => ({ data: [], error: null })),
  listTrustedContactLinks: vi.fn(async () => ({ data: [], error: null })),
  getReminderContact: vi.fn(async () => ({ data: null, error: null })),
}));
vi.mock("../repositories/bookingsRepo", () => ({
  listOwnerBookingsOnDate: vi.fn(async () => ({ data: [], error: null })),
  listServicesForBookings: vi.fn(async () => ({ data: [], error: null })),
}));

const { useStaffContacts } = await import("./useStaffContacts");
const humansRepo = await import("../repositories/humansRepo");
const bookingsRepo = await import("../repositories/bookingsRepo");
const client = { tag: "staff-client" };

beforeEach(() => {
  (globalThis as { __staffContactsClient?: unknown }).__staffContactsClient = client;
  vi.clearAllMocks();
});

describe("useStaffContacts", () => {
  it("reports connected only when a staff client exists, and is a stable singleton", () => {
    expect(useStaffContacts().connected).toBe(true);
    expect(useStaffContacts()).toBe(useStaffContacts());
    (globalThis as { __staffContactsClient?: unknown }).__staffContactsClient = null;
    expect(useStaffContacts().connected).toBe(false);
  });

  it("binds every read to the staff client", async () => {
    const c = useStaffContacts();
    await c.getContactCard("h1");
    await c.listContactCards(["h2", "h3"]);
    await c.listTrustedContactLinks("h1");
    await c.listOwnerBookingsOnDate("2026-09-08", "h1");
    await c.getReminderContact("h1");
    await c.listServicesForBookings(["b1"]);
    expect(humansRepo.getContactCard).toHaveBeenCalledWith(client, "h1");
    expect(humansRepo.listContactCards).toHaveBeenCalledWith(client, ["h2", "h3"]);
    expect(humansRepo.listTrustedContactLinks).toHaveBeenCalledWith(client, "h1");
    expect(bookingsRepo.listOwnerBookingsOnDate).toHaveBeenCalledWith(client, "2026-09-08", "h1");
    expect(humansRepo.getReminderContact).toHaveBeenCalledWith(client, "h1");
    expect(bookingsRepo.listServicesForBookings).toHaveBeenCalledWith(client, ["b1"]);
  });

  it("throws rather than reading when there is no client", () => {
    (globalThis as { __staffContactsClient?: unknown }).__staffContactsClient = null;
    expect(() => useStaffContacts().getContactCard("h1")).toThrow("Not connected");
    expect(humansRepo.getContactCard).not.toHaveBeenCalled();
  });
});

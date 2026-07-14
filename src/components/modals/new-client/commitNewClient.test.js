import { describe, it, expect, vi } from "vitest";
import { commitNewClient } from "./commitNewClient.js";

const human = {
  name: "Amanda", surname: "Booth", email: "", address: "",
  sms: false, whatsapp: false, notes: "",
};
const dog = (clientKey, name) => ({ clientKey, name, breed: "Cockapoo", size: "medium" });
const makeCommitted = () => ({ humanId: null, keyToDogId: {}, bookedKeys: new Set() });

// addDog that mirrors the REAL hook: it resolves the owner and returns null
// unless handed the owner directly via _ownerOverride — i.e. it reproduces the
// bug the wizard hit (owner not yet in the live map), so these tests guard the
// fix rather than rubber-stamping an always-succeeds mock.
const realisticAddDog = () =>
  vi.fn(async (d) => (d._ownerOverride?.id ? { id: `dog-${d.name}` } : null));

describe("commitNewClient", () => {
  it("saves a client without dogs or a booking", async () => {
    const addHuman = vi.fn(async () => ({ id: "h1" }));
    const addDog = realisticAddDog();
    const onAddBookings = vi.fn(async () => ({ ok: true }));

    const out = await commitNewClient({
      addHuman,
      addDog,
      onAddBookings,
      human,
      phone: "+447700900123",
      dogs: [],
      selections: {},
      dateStr: "",
      slot: "",
      committed: makeCommitted(),
    });

    expect(out).toEqual({ ok: true, humanId: "h1" });
    expect(addDog).not.toHaveBeenCalled();
    expect(onAddBookings).not.toHaveBeenCalled();
  });

  it("saves a client and dogs without making a booking", async () => {
    const addHuman = vi.fn(async () => ({ id: "h1" }));
    const addDog = realisticAddDog();
    const onAddBookings = vi.fn(async () => ({ ok: true }));

    await commitNewClient({
      addHuman,
      addDog,
      onAddBookings,
      human,
      phone: "+447700900123",
      dogs: [dog("a", "Alfie")],
      selections: { a: { booked: false, service: "full-groom", addons: [] } },
      dateStr: "",
      slot: "",
      committed: makeCommitted(),
    });

    expect(addDog).toHaveBeenCalledTimes(1);
    expect(onAddBookings).not.toHaveBeenCalled();
  });

  it("creates human → dog → booking, handing the just-created owner to addDog", async () => {
    const addHuman = vi.fn(async () => ({ id: "h1" }));
    const addDog = realisticAddDog();
    const onAddBookings = vi.fn(async () => ({ ok: true }));
    const committed = makeCommitted();

    const out = await commitNewClient({
      addHuman, addDog, onAddBookings, human, phone: "+447700900123",
      dogs: [dog("a", "Alfie")],
      selections: { a: { booked: true, service: "full-groom", addons: [] } },
      dateStr: "2026-07-01", slot: "09:00", committed,
    });

    expect(out).toEqual({ ok: true, humanId: "h1" });
    expect(addHuman).toHaveBeenCalledTimes(1);
    expect(addDog).toHaveBeenCalledTimes(1);
    // The fix: the owner is passed explicitly (regression guard for the stale
    // humansById closure that made addDog return null for a brand-new owner).
    expect(addDog.mock.calls[0][0]._ownerOverride).toEqual({ id: "h1", fullName: "Amanda Booth" });
    expect(onAddBookings).toHaveBeenCalledTimes(1);
  });

  it("reports a multi-dog partial booking failure with a count, and is idempotent on retry", async () => {
    const addHuman = vi.fn(async () => ({ id: "h1" }));
    const addDog = realisticAddDog();
    const onAddBookings = vi
      .fn()
      .mockResolvedValueOnce({ ok: true }) // Alfie books
      .mockResolvedValueOnce({ ok: false, error: "Slot is full" }) // Rex fails
      .mockResolvedValueOnce({ ok: true }); // Rex on retry
    const committed = makeCommitted();
    const args = {
      addHuman, addDog, onAddBookings, human, phone: "+447700900123",
      dogs: [dog("a", "Alfie"), dog("b", "Rex")],
      selections: {
        a: { booked: true, service: "full-groom", addons: [] },
        b: { booked: true, service: "bath-brush", addons: [] },
      },
      dateStr: "2026-07-01", slot: "09:00", committed,
    };

    await expect(commitNewClient(args)).rejects.toThrow(/Booked 1 of 2 dogs.*Rex/);
    expect(committed.bookedKeys.has("a")).toBe(true);
    expect(committed.bookedKeys.has("b")).toBe(false);

    // Retry: human + dogs are NOT re-created, and Alfie's booking is NOT re-sent.
    const out = await commitNewClient(args);
    expect(out.ok).toBe(true);
    expect(addHuman).toHaveBeenCalledTimes(1);
    expect(addDog).toHaveBeenCalledTimes(2);
    expect(onAddBookings).toHaveBeenCalledTimes(3); // A(ok), B(fail), B(retry) — A never re-sent
  });

  it("throws and writes nothing further when the customer can't be created", async () => {
    const addDog = realisticAddDog();
    const onAddBookings = vi.fn(async () => ({ ok: true }));
    await expect(
      commitNewClient({
        addHuman: vi.fn(async () => null), addDog, onAddBookings, human, phone: "+447700900123",
        dogs: [dog("a", "Alfie")],
        selections: { a: { booked: true, service: "full-groom" } },
        dateStr: "d", slot: "s", committed: makeCommitted(),
      }),
    ).rejects.toThrow(/Couldn't create the customer/);
    expect(addDog).not.toHaveBeenCalled();
    expect(onAddBookings).not.toHaveBeenCalled();
  });

  it("fires onCustomerCreated once the human is written", async () => {
    const onCustomerCreated = vi.fn();
    await commitNewClient({
      addHuman: vi.fn(async () => ({ id: "h1" })), addDog: realisticAddDog(),
      onAddBookings: vi.fn(async () => ({ ok: true })), human, phone: "+447700900123",
      dogs: [dog("a", "Alfie")],
      selections: { a: { booked: true, service: "full-groom" } },
      dateStr: "d", slot: "s", committed: makeCommitted(), onCustomerCreated,
    });
    expect(onCustomerCreated).toHaveBeenCalledTimes(1);
  });
});

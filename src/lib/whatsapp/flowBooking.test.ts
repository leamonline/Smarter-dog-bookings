import { describe, expect, it } from "vitest";

import {
  addDays,
  addonOptions,
  availableDateOptions,
  availableGroupDateOptions,
  availableSlotOptions,
  type BookingInsert,
  bookingGroupSummary,
  bookingRef,
  bookingSummary,
  confirmBooking,
  confirmGroupBooking,
  type DogRow,
  type ExistingBooking,
  type FlowDb,
  formatDateLong,
  type GroupBookingItem,
  type GroupInsertResult,
  groupSlotOptions,
  type HumanRow,
  type InsertResult,
  listPetOptions,
  petOptions,
  sanitizeDayOverrides,
  serviceOptions,
} from "../../../supabase/functions/_shared/flowBooking.ts";
import type { SlotOverrides } from "../../../supabase/functions/_shared/capacity.ts";

const HUMAN: HumanRow = { id: "h1", name: "Sam", surname: "Lee", phone: "+447700900123" };

const DOGS: DogRow[] = [
  { id: "d1", name: "Bella", breed: "Cockapoo", size: "small", human_id: "h1" },
  { id: "d2", name: "Rex", breed: "Labrador", size: "large", human_id: "h1" },
];

interface GroupInsertCall {
  items: GroupBookingItem[];
  dateStr: string;
  humanId: string;
}

interface FakeOpts {
  smallMed?: { booking_date: string; slot: string }[];
  largeDays?: { booking_date: string; has_capacity: boolean }[];
  insert?: (row: BookingInsert) => InsertResult;
  dogs?: DogRow[];
  // Multi-dog path: existing occupancy per date, and the group-insert result.
  bookingsByDate?: Record<string, ExistingBooking[]>;
  groupInsert?: (items: GroupBookingItem[], dateStr: string, humanId: string) => GroupInsertResult;
  // Staff seat blocks per date (already-sanitised day_settings.overrides).
  overridesByDate?: Record<string, Record<string, SlotOverrides>>;
  // Today's flagged last-minute slots (get_immediate_slots rows).
  immediateRows?: Array<{ setting_date: string; slot: string }>;
}

function makeDb(opts: FakeOpts = {}): {
  db: FlowDb;
  inserted: BookingInsert[];
  groupInserts: GroupInsertCall[];
} {
  const inserted: BookingInsert[] = [];
  const groupInserts: GroupInsertCall[] = [];
  const dogs = opts.dogs ?? DOGS;
  const db: FlowDb = {
    getHumanByPhone: async (phone) => (phone === HUMAN.phone ? HUMAN : null),
    getDogsByHuman: async (humanId) => dogs.filter((d) => d.human_id === humanId),
    getDogById: async (id) => dogs.find((d) => d.id === id) ?? null,
    getPricing: async () => null,
    getSmallMediumAvailability: async () => opts.smallMed ?? [],
    getLargeDogDays: async () => opts.largeDays ?? [],
    insertBooking: async (row) => {
      inserted.push(row);
      return opts.insert ? opts.insert(row) : { id: "booking-uuid-1" };
    },
    getBookingsForDate: async (dateStr) => opts.bookingsByDate?.[dateStr] ?? [],
    getDayOverrides: async (dateStr) => opts.overridesByDate?.[dateStr] ?? {},
    getImmediateSlots: async () => opts.immediateRows ?? [],
    insertBookingGroup: async (items, dateStr, humanId) => {
      groupInserts.push({ items, dateStr, humanId });
      return opts.groupInsert
        ? opts.groupInsert(items, dateStr, humanId)
        : { ids: items.map((_, i) => `grp-${i}`) };
    },
  };
  return { db, inserted, groupInserts };
}

describe("option builders", () => {
  it("lists pets with breed and size", () => {
    expect(petOptions(DOGS)).toEqual([
      { id: "d1", title: "Bella", description: "Cockapoo · Small" },
      { id: "d2", title: "Rex", description: "Labrador · Large" },
    ]);
  });

  it("filters services by size and labels 'from' prices", () => {
    const small = serviceOptions("small", null);
    // Guide prices always read "from £X" (the salon never quotes fixed).
    expect(small.find((s) => s.id === "puppy-groom")?.description).toBe("from £38");
    expect(small.find((s) => s.id === "full-groom")?.description).toBe("from £42");

    // puppy-groom is N/A for large dogs, so it must not be offered.
    const large = serviceOptions("large", null);
    expect(large.some((s) => s.id === "puppy-groom")).toBe(false);
    expect(large.find((s) => s.id === "full-groom")?.description).toBe("from £60");
  });

  it("honours DB pricing overrides", () => {
    const pricing = { "full-groom": { small: "£50+", medium: "£55+", large: "£70+" } };
    expect(serviceOptions("small", pricing).find((s) => s.id === "full-groom")?.description)
      .toBe("from £50");
  });

  it("labels add-on prices", () => {
    const opts = addonOptions();
    expect(opts.find((a) => a.id === "Flea Bath")?.description).toBe("+£10");
    expect(opts.find((a) => a.id === "Anal Glands")?.description).toBe("");
  });

  it("builds a pet list through FlowDb", async () => {
    const { db } = makeDb();
    expect(await listPetOptions(db, "h1")).toHaveLength(2);
  });
});

describe("availability", () => {
  it("dedupes small/medium days with any free slot", async () => {
    const { db } = makeDb({
      smallMed: [
        { booking_date: "2026-06-02", slot: "09:00" },
        { booking_date: "2026-06-02", slot: "09:30" },
        { booking_date: "2026-06-03", slot: "10:00" },
      ],
    });
    const dates = await availableDateOptions(db, "small", new Date("2026-05-26T09:00:00Z"));
    expect(dates.map((d) => d.id)).toEqual(["2026-06-02", "2026-06-03"]);
    expect(dates[0].title).toBe("Tuesday 2 June");
  });

  it("uses per-day capacity for large dogs", async () => {
    const { db } = makeDb({
      largeDays: [
        { booking_date: "2026-06-02", has_capacity: true },
        { booking_date: "2026-06-03", has_capacity: false },
      ],
    });
    const dates = await availableDateOptions(db, "large", new Date("2026-05-26T09:00:00Z"));
    expect(dates.map((d) => d.id)).toEqual(["2026-06-02"]);
  });

  it("orders small/medium slots by the grid", async () => {
    const { db } = makeDb({
      smallMed: [
        { booking_date: "2026-06-02", slot: "10:30" },
        { booking_date: "2026-06-02", slot: "09:00" },
        { booking_date: "2026-06-03", slot: "08:30" },
      ],
    });
    const slots = await availableSlotOptions(db, "small", "2026-06-02");
    expect(slots.map((s) => s.id)).toEqual(["09:00", "10:30"]);
    expect(slots[0].title).toBe("9:00 am");
  });

  it("returns candidate slots for large dogs", async () => {
    const { db } = makeDb();
    const slots = await availableSlotOptions(db, "large", "2026-06-02");
    expect(slots.map((s) => s.id)).toEqual(["08:30", "09:00", "12:00", "12:30", "13:00"]);
  });
});

describe("confirmBooking", () => {
  const base = {
    humanId: "h1",
    dogId: "d1",
    serviceId: "full-groom",
    dateStr: "2026-06-02",
    slot: "09:30",
    addons: ["Flea Bath"],
  };

  it("inserts and returns a reference on success", async () => {
    const { db, inserted } = makeDb({ insert: () => ({ id: "abc12345-0000-0000-0000-000000000000" }) });
    const res = await confirmBooking(db, base);
    expect(res).toEqual({ ok: true, bookingId: "abc12345-0000-0000-0000-000000000000", size: "small" });
    expect(inserted[0]).toMatchObject({
      booking_date: "2026-06-02",
      slot: "09:30",
      dog_id: "d1",
      size: "small",
      service: "full-groom",
      status: "Booked",
      confirmed: false,
      addons: ["Flea Bath"],
      source: "whatsapp_flow",
    });
    expect(bookingRef(res.ok ? res.bookingId : "")).toBe("SD-ABC123");
  });

  it("pins size from the dog row, not the client", async () => {
    const { inserted, db } = makeDb({ insert: () => ({ id: "x" }) });
    await confirmBooking(db, { ...base, dogId: "d2" }); // Rex is large
    expect(inserted[0].size).toBe("large");
  });

  it("maps the capacity trigger (P0001) to slot_taken", async () => {
    const { db } = makeDb({
      insert: () => ({ errorCode: "P0001", errorMessage: "Slot is full" }),
    });
    const res = await confirmBooking(db, base);
    expect(res).toEqual({ ok: false, kind: "slot_taken", message: "Slot is full" });
  });

  it("rejects a dog that isn't the caller's", async () => {
    const { db } = makeDb();
    const res = await confirmBooking(db, { ...base, humanId: "someone-else" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.kind).toBe("ownership");
  });

  it("surfaces generic insert errors", async () => {
    const { db } = makeDb({ insert: () => ({ errorCode: "23505", errorMessage: "duplicate" }) });
    const res = await confirmBooking(db, base);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.kind).toBe("error");
  });
});

describe("date + summary helpers", () => {
  it("formats dates and adds days without TZ drift", () => {
    expect(formatDateLong("2026-06-02")).toBe("Tuesday 2 June");
    expect(addDays("2026-06-02", 60)).toBe("2026-08-01");
  });

  it("builds a readable summary", () => {
    const summary = bookingSummary({
      dogName: "Bella",
      serviceId: "full-groom",
      size: "small",
      pricing: null,
      addons: ["Flea Bath"],
      dateStr: "2026-06-02",
      slot: "09:30",
    });
    expect(summary).toContain("Bella — Full Groom");
    expect(summary).toContain("Tuesday 2 June at 9:30 am");
    expect(summary).toContain("Add-ons: Flea Bath");
    expect(summary).toContain("From £42");
  });
});

// ── Multi-dog (group) booking ──────────────────────────────────
const TWO_SMALL: DogRow[] = [
  { id: "s1", name: "Bella", breed: "Cockapoo", size: "small", human_id: "h1" },
  { id: "s2", name: "Coco", breed: "Bichon", size: "small", human_id: "h1" },
];

describe("groupSlotOptions", () => {
  it("offers drop-off times the whole group fits, ordered by the grid", async () => {
    // Empty day: two small dogs fit in any single slot (2 seats each).
    const { db } = makeDb({ dogs: TWO_SMALL, bookingsByDate: { "2026-06-02": [] } });
    const slots = await groupSlotOptions(
      db,
      [{ id: "s1", size: "small" }, { id: "s2", size: "small" }],
      "2026-06-02",
    );
    const ids = slots.map((s) => s.id);
    expect(ids).toContain("09:00");
    // Ordered by the canonical grid (08:30 before 09:00 before 13:00).
    expect(ids).toEqual([...ids].sort((a, b) => a.localeCompare(b)));
  });
});

describe("staff seat blocks in the Flow slot picker", () => {
  it("drops a slot when the blocked seat plus an existing booking fill it", async () => {
    // Booking occupies seat index 0, staff blocked the remaining seat (index
    // 1) — the slot has no free seat, so it must not be offered. Before the
    // fix the Flow ignored overrides and offered it anyway.
    const { db } = makeDb({
      dogs: TWO_SMALL,
      bookingsByDate: { "2026-06-02": [{ slot: "09:00", size: "small" }] },
      overridesByDate: { "2026-06-02": { "09:00": { 1: "blocked" } } },
    });
    const slots = await groupSlotOptions(db, [{ id: "s1", size: "small" }], "2026-06-02");
    expect(slots.map((s) => s.id)).not.toContain("09:00");
  });

  it("drops a slot entirely when both seats are blocked", async () => {
    const { db } = makeDb({
      dogs: TWO_SMALL,
      bookingsByDate: { "2026-06-02": [] },
      overridesByDate: { "2026-06-02": { "09:00": { 0: "blocked", 1: "blocked" } } },
    });
    const slots = await groupSlotOptions(db, [{ id: "s1", size: "small" }], "2026-06-02");
    expect(slots.map((s) => s.id)).not.toContain("09:00");
  });

  it("still offers a slot with one blocked seat to a single dog", async () => {
    const { db } = makeDb({
      dogs: TWO_SMALL,
      bookingsByDate: { "2026-06-02": [] },
      overridesByDate: { "2026-06-02": { "09:00": { 0: "blocked" } } },
    });
    const slots = await groupSlotOptions(db, [{ id: "s1", size: "small" }], "2026-06-02");
    expect(slots.map((s) => s.id)).toContain("09:00");
  });
});

describe("same-day (last minute) slots in the Flow", () => {
  // groupAllocations keys "today" off toDateStr(now) — pin `now` so the
  // fixture dates below are today/not-today deterministically. 12:00 UTC is
  // the same calendar day in London year-round.
  const NOW = new Date("2026-06-02T12:00:00Z");
  const TODAY = "2026-06-02";

  it("offers only flagged slots for today", async () => {
    const { db } = makeDb({
      dogs: TWO_SMALL,
      bookingsByDate: { [TODAY]: [] },
      immediateRows: [{ setting_date: TODAY, slot: "10:00" }],
    });
    const slots = await groupSlotOptions(db, [{ id: "s1", size: "small" }], TODAY, NOW);
    expect(slots.map((s) => s.id)).toEqual(["10:00"]);
  });

  it("offers nothing for today when no slot is flagged", async () => {
    const { db } = makeDb({ dogs: TWO_SMALL, bookingsByDate: { [TODAY]: [] } });
    const slots = await groupSlotOptions(db, [{ id: "s1", size: "small" }], TODAY, NOW);
    expect(slots).toEqual([]);
  });

  it("leaves future dates unfiltered", async () => {
    const { db } = makeDb({
      dogs: TWO_SMALL,
      bookingsByDate: { "2026-06-03": [] },
      immediateRows: [{ setting_date: TODAY, slot: "10:00" }],
    });
    const slots = await groupSlotOptions(db, [{ id: "s1", size: "small" }], "2026-06-03", NOW);
    expect(slots.length).toBeGreaterThan(1);
  });

  it("labels today's date option Today — last minute", async () => {
    const { db } = makeDb({
      smallMed: [
        { booking_date: TODAY, slot: "10:00" },
        { booking_date: "2026-06-03", slot: "09:00" },
      ],
    });
    const dates = await availableDateOptions(db, "small", NOW);
    expect(dates[0]).toEqual({ id: TODAY, title: "Today — last minute" });
    expect(dates[1].title).toBe("Wednesday 3 June");
  });

  it("intersects large-dog candidates with today's flags", async () => {
    const { db } = makeDb({
      immediateRows: [{ setting_date: TODAY, slot: "12:00" }],
    });
    const slots = await availableSlotOptions(db, "large", TODAY, NOW);
    expect(slots.map((s) => s.id)).toEqual(["12:00"]);
  });

  it("bounces a today CONFIRM on an unflagged slot to the slot_taken retry", async () => {
    // The customer picked 09:00 while it was flagged; the flag lapsed before
    // CONFIRM. groupAllocations re-filters, so no insert is attempted.
    const { db, groupInserts } = makeDb({
      dogs: TWO_SMALL,
      bookingsByDate: { [TODAY]: [] },
      immediateRows: [],
    });
    const res = await confirmGroupBooking(
      db,
      {
        humanId: "h1",
        dateStr: TODAY,
        dropOff: "09:00",
        dogs: [{ dogId: "s1", serviceId: "full-groom", addons: [] }],
      },
      NOW,
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.kind).toBe("slot_taken");
    expect(groupInserts).toHaveLength(0);
  });
});

describe("sanitizeDayOverrides", () => {
  it("keeps well-formed per-seat overrides", () => {
    expect(sanitizeDayOverrides({ "09:00": { "0": "blocked", "1": "open" } })).toEqual({
      "09:00": { 0: "blocked", 1: "open" },
    });
  });

  it("drops malformed legacy shapes (date keys, numeric values) and junk", () => {
    // Real prod drift: a date-keyed row with numeric seat values.
    expect(sanitizeDayOverrides({ "2026-04-06": { "09:00": 0 } })).toEqual({});
    expect(sanitizeDayOverrides({ "09:00": { "0": 1 } })).toEqual({});
    expect(sanitizeDayOverrides({ "09:00": { seat: "blocked" } })).toEqual({});
    expect(sanitizeDayOverrides(null)).toEqual({});
    expect(sanitizeDayOverrides("nope")).toEqual({});
    expect(sanitizeDayOverrides([{ "09:00": { "0": "blocked" } }])).toEqual({});
  });

  it("keeps the good slots while dropping the bad", () => {
    expect(
      sanitizeDayOverrides({
        "09:00": { "0": "blocked" },
        "2026-04-06": { "09:00": 0 },
      }),
    ).toEqual({ "09:00": { 0: "blocked" } });
  });
});

describe("confirmGroupBooking", () => {
  const baseTwo = {
    humanId: "h1",
    dateStr: "2026-06-02",
    dropOff: "09:00",
    dogs: [
      { dogId: "s1", serviceId: "full-groom", addons: ["Flea Bath"] },
      { dogId: "s2", serviceId: "bath-and-brush", addons: [] },
    ],
  };

  it("inserts one group with a row per dog and returns all ids", async () => {
    const { db, groupInserts } = makeDb({
      dogs: TWO_SMALL,
      bookingsByDate: { "2026-06-02": [] },
      groupInsert: (items) => ({ ids: items.map((_, i) => `id-${i}`) }),
    });
    const res = await confirmGroupBooking(db, baseTwo);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.bookingIds).toHaveLength(2);
    expect(groupInserts).toHaveLength(1);
    expect(groupInserts[0].items).toHaveLength(2);
    // Each dog carried its own service; size is pinned from the dog row.
    const s1 = groupInserts[0].items.find((i) => i.dog_id === "s1");
    const s2 = groupInserts[0].items.find((i) => i.dog_id === "s2");
    expect(s1).toMatchObject({ service: "full-groom", size: "small", slot: "09:00", addons: ["Flea Bath"] });
    expect(s2).toMatchObject({ service: "bath-and-brush", size: "small", slot: "09:00" });
  });

  it("books a single dog as a group of one", async () => {
    const { db, groupInserts } = makeDb({ dogs: TWO_SMALL, bookingsByDate: { "2026-06-02": [] } });
    const res = await confirmGroupBooking(db, {
      humanId: "h1",
      dateStr: "2026-06-02",
      dropOff: "09:00",
      dogs: [{ dogId: "s1", serviceId: "full-groom", addons: [] }],
    });
    expect(res.ok).toBe(true);
    expect(groupInserts[0].items).toHaveLength(1);
  });

  it("rejects when a dog isn't on the caller's account", async () => {
    const { db } = makeDb({ dogs: TWO_SMALL, bookingsByDate: { "2026-06-02": [] } });
    const res = await confirmGroupBooking(db, {
      ...baseTwo,
      dogs: [{ dogId: "s1", serviceId: "full-groom", addons: [] }, { dogId: "stranger", serviceId: "full-groom", addons: [] }],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.kind).toBe("ownership");
  });

  it("maps the capacity trigger (P0001) to slot_taken", async () => {
    const { db } = makeDb({
      dogs: TWO_SMALL,
      bookingsByDate: { "2026-06-02": [] },
      groupInsert: () => ({ errorCode: "P0001", errorMessage: "Slot is full" }),
    });
    const res = await confirmGroupBooking(db, baseTwo);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.kind).toBe("slot_taken");
  });

  it("retries (slot_taken) when the chosen drop-off no longer fits the group", async () => {
    const { db, groupInserts } = makeDb({ dogs: TWO_SMALL, bookingsByDate: { "2026-06-02": [] } });
    const res = await confirmGroupBooking(db, { ...baseTwo, dropOff: "07:00" }); // not a real grid slot
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.kind).toBe("slot_taken");
    expect(groupInserts).toHaveLength(0); // never attempted the insert
  });
});

describe("availableGroupDateOptions", () => {
  it("uses small/medium availability when no large dog is in the group", async () => {
    const { db } = makeDb({
      dogs: TWO_SMALL,
      smallMed: [{ booking_date: "2026-06-02", slot: "09:00" }],
      largeDays: [{ booking_date: "2026-06-03", has_capacity: true }],
    });
    const dates = await availableGroupDateOptions(
      db,
      [{ id: "s1", size: "small" }, { id: "s2", size: "small" }],
      new Date("2026-05-26T09:00:00Z"),
    );
    expect(dates.map((d) => d.id)).toEqual(["2026-06-02"]);
  });

  it("falls back to large-dog day capacity when the group includes a large dog", async () => {
    const { db } = makeDb({
      smallMed: [{ booking_date: "2026-06-02", slot: "09:00" }],
      largeDays: [{ booking_date: "2026-06-03", has_capacity: true }],
    });
    const dates = await availableGroupDateOptions(
      db,
      [{ id: "d1", size: "small" }, { id: "d2", size: "large" }],
      new Date("2026-05-26T09:00:00Z"),
    );
    expect(dates.map((d) => d.id)).toEqual(["2026-06-03"]);
  });
});

describe("bookingGroupSummary", () => {
  it("lists the day once then a line per dog with prices", () => {
    const summary = bookingGroupSummary({
      dogs: [
        { dogName: "Bella", serviceId: "full-groom", size: "small", addons: ["Flea Bath"] },
        { dogName: "Coco", serviceId: "bath-and-brush", size: "small", addons: [] },
      ],
      pricing: null,
      dateStr: "2026-06-02",
      dropOff: "09:00",
    });
    expect(summary).toContain("Tuesday 2 June at 9:00 am");
    expect(summary).toContain("Bella — Full Groom (from £42)");
    expect(summary).toContain("Coco — Bath & Brush (from £38)");
    expect(summary).toContain("Add-ons: Flea Bath");
  });
});

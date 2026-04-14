/**
 * Transforms Tests
 *
 * Run: npx vitest run src/supabase/transforms.test.ts
 *
 * Tests cover all exports from transforms.ts:
 * toDateStr, dbHumansToMap, buildHumansById, dbDogsToMap, buildDogsById,
 * dbBookingsToArray, dbConfigToApp, appConfigToDb, findHumanByIdOrName,
 * findDogByIdOrName
 */

import { describe, it, expect } from "vitest";

import {
  toDateStr,
  dbHumansToMap,
  buildHumansById,
  dbDogsToMap,
  buildDogsById,
  dbBookingsToArray,
  dbConfigToApp,
  appConfigToDb,
  findHumanByIdOrName,
  findDogByIdOrName,
} from "./transforms.js";

// ============================================================
// Fixtures — realistic DB rows (snake_case)
// ============================================================

function humanRow(overrides = {}) {
  return {
    id: "h-1",
    name: "Jane",
    surname: "Smith",
    phone: "07700900001",
    sms: true,
    whatsapp: true,
    email: "jane@example.com",
    fb: "janesmith",
    insta: "@janesmith",
    tiktok: "",
    address: "10 Downing Street",
    notes: "Prefers mornings",
    history_flag: "",
    reminder_hours: 24,
    reminder_channels: ["whatsapp"],
    ...overrides,
  };
}

function humanRow2(overrides = {}) {
  return {
    id: "h-2",
    name: "Bob",
    surname: "Jones",
    phone: "07700900002",
    sms: false,
    whatsapp: true,
    email: "bob@example.com",
    fb: "",
    insta: "",
    tiktok: "",
    address: "22 Baker Street",
    notes: "",
    history_flag: "",
    reminder_hours: 48,
    reminder_channels: ["sms"],
    ...overrides,
  };
}

function dogRow(overrides = {}) {
  return {
    id: "d-1",
    name: "Biscuit",
    breed: "Cockapoo",
    age: "3",
    dob: "2023-01-15",
    size: "small",
    human_id: "h-1",
    alerts: ["nervous"],
    groom_notes: "Use gentle shampoo",
    custom_price: undefined,
    ...overrides,
  };
}

function dogRow2(overrides = {}) {
  return {
    id: "d-2",
    name: "Rex",
    breed: "German Shepherd",
    age: "5",
    dob: null,
    size: "large",
    human_id: "h-2",
    alerts: [],
    groom_notes: "",
    custom_price: 55,
    ...overrides,
  };
}

function bookingRow(overrides = {}) {
  return {
    id: "bk-1",
    slot: "09:00",
    size: "small",
    service: "full-groom",
    status: "Checked in",
    addons: ["nail-clip"],
    payment: "Paid",
    confirmed: true,
    dog_id: "d-1",
    pickup_by_id: null,
    booking_date: "2026-04-14",
    group_id: null,
    ...overrides,
  };
}

// ============================================================
// 1. toDateStr
// ============================================================
describe("toDateStr", () => {
  it("formats a valid Date to YYYY-MM-DD", () => {
    const d = new Date(2026, 3, 14); // April = month 3
    expect(toDateStr(d)).toBe("2026-04-14");
  });

  it("pads single-digit month and day", () => {
    const d = new Date(2026, 0, 5); // 5 Jan
    expect(toDateStr(d)).toBe("2026-01-05");
  });

  it("passes through a string unchanged", () => {
    expect(toDateStr("2026-12-25")).toBe("2026-12-25");
  });

  it("passes through an arbitrary string", () => {
    expect(toDateStr("not-a-date")).toBe("not-a-date");
  });

  it("returns empty string for an invalid Date object", () => {
    expect(toDateStr(new Date("nope"))).toBe("");
  });

  it("handles midnight correctly", () => {
    const d = new Date(2026, 5, 1, 0, 0, 0); // 1 June at midnight
    expect(toDateStr(d)).toBe("2026-06-01");
  });

  it("handles end of year", () => {
    const d = new Date(2026, 11, 31); // 31 Dec
    expect(toDateStr(d)).toBe("2026-12-31");
  });

  it("handles leap day", () => {
    const d = new Date(2028, 1, 29); // 29 Feb 2028
    expect(toDateStr(d)).toBe("2028-02-29");
  });
});

// ============================================================
// 2. dbHumansToMap
// ============================================================
describe("dbHumansToMap", () => {
  it("converts rows to a name-keyed map with camelCase fields", () => {
    const rows = [humanRow()];
    const map = dbHumansToMap(rows, {});

    expect(map["Jane Smith"]).toBeDefined();
    const h = map["Jane Smith"];
    expect(h.id).toBe("h-1");
    expect(h.fullName).toBe("Jane Smith");
    expect(h.phone).toBe("07700900001");
    expect(h.sms).toBe(true);
    expect(h.whatsapp).toBe(true);
    expect(h.email).toBe("jane@example.com");
    expect(h.historyFlag).toBe("");
  });

  it("defaults null fields to empty strings / false", () => {
    const row = humanRow({
      phone: null,
      sms: null,
      whatsapp: null,
      email: null,
      fb: null,
      insta: null,
      tiktok: null,
      address: null,
      notes: null,
      history_flag: null,
    });
    const map = dbHumansToMap([row], {});
    const h = map["Jane Smith"];

    expect(h.phone).toBe("");
    expect(h.sms).toBe(false);
    expect(h.whatsapp).toBe(false);
    expect(h.email).toBe("");
    expect(h.fb).toBe("");
    expect(h.insta).toBe("");
    expect(h.tiktok).toBe("");
    expect(h.address).toBe("");
    expect(h.notes).toBe("");
    expect(h.historyFlag).toBe("");
  });

  it("defaults reminderHours to 24 and reminderChannels to ['whatsapp'] when null", () => {
    const row = humanRow({ reminder_hours: null, reminder_channels: null });
    const map = dbHumansToMap([row], {});
    const h = map["Jane Smith"];

    expect(h.reminderHours).toBe(24);
    expect(h.reminderChannels).toEqual(["whatsapp"]);
  });

  it("maps trustedIds from the trustedMap by human id", () => {
    const trusted = { "h-1": ["h-2", "h-3"] };
    const map = dbHumansToMap([humanRow()], trusted);

    expect(map["Jane Smith"].trustedIds).toEqual(["h-2", "h-3"]);
  });

  it("defaults trustedIds to empty array when human id not in trustedMap", () => {
    const map = dbHumansToMap([humanRow()], {});
    expect(map["Jane Smith"].trustedIds).toEqual([]);
  });

  it("handles multiple rows keyed by full name", () => {
    const map = dbHumansToMap([humanRow(), humanRow2()], {});
    expect(Object.keys(map)).toEqual(["Jane Smith", "Bob Jones"]);
  });
});

// ============================================================
// 3. buildHumansById
// ============================================================
describe("buildHumansById", () => {
  it("builds an id-keyed map", () => {
    const rows = [humanRow(), humanRow2()];
    const byId = buildHumansById(rows);

    expect(byId["h-1"]).toBeDefined();
    expect(byId["h-2"]).toBeDefined();
    expect(byId["h-1"].name).toBe("Jane");
    expect(byId["h-2"].name).toBe("Bob");
  });

  it("adds fullName from name + surname", () => {
    const byId = buildHumansById([humanRow()]);
    expect(byId["h-1"].fullName).toBe("Jane Smith");
  });

  it("preserves all original DB row fields", () => {
    const byId = buildHumansById([humanRow()]);
    const h = byId["h-1"];
    expect(h.phone).toBe("07700900001");
    expect(h.history_flag).toBe("");
    expect(h.reminder_hours).toBe(24);
  });
});

// ============================================================
// 4. dbDogsToMap
// ============================================================
describe("dbDogsToMap", () => {
  it("converts rows to a name-keyed map with camelCase fields", () => {
    const humansById = buildHumansById([humanRow()]);
    const map = dbDogsToMap([dogRow()], humansById);

    expect(map["Biscuit"]).toBeDefined();
    const d = map["Biscuit"];
    expect(d.id).toBe("d-1");
    expect(d.breed).toBe("Cockapoo");
    expect(d.age).toBe("3");
    expect(d.size).toBe("small");
    expect(d.alerts).toEqual(["nervous"]);
    expect(d.groomNotes).toBe("Use gentle shampoo");
  });

  it("resolves owner name via humansById", () => {
    const humansById = buildHumansById([humanRow()]);
    const map = dbDogsToMap([dogRow()], humansById);

    expect(map["Biscuit"].humanId).toBe("Jane Smith");
    expect(map["Biscuit"]._humanId).toBe("h-1");
  });

  it("falls back to raw human_id when owner not found in humansById", () => {
    const map = dbDogsToMap([dogRow()], {});
    expect(map["Biscuit"].humanId).toBe("h-1");
  });

  it("defaults null fields to empty strings / arrays", () => {
    const row = dogRow({
      age: null,
      dob: null,
      size: null,
      human_id: null,
      alerts: null,
      groom_notes: null,
    });
    const map = dbDogsToMap([row], {});
    const d = map["Biscuit"];

    expect(d.age).toBe("");
    expect(d.size).toBeNull();
    expect(d._humanId).toBeNull();
    expect(d.alerts).toEqual([]);
    expect(d.groomNotes).toBe("");
  });

  it("preserves customPrice", () => {
    const humansById = buildHumansById([humanRow2()]);
    const map = dbDogsToMap([dogRow2()], humansById);
    expect(map["Rex"].customPrice).toBe(55);
  });

  it("handles multiple dogs", () => {
    const humansById = buildHumansById([humanRow(), humanRow2()]);
    const map = dbDogsToMap([dogRow(), dogRow2()], humansById);
    expect(Object.keys(map)).toEqual(["Biscuit", "Rex"]);
  });
});

// ============================================================
// 5. buildDogsById
// ============================================================
describe("buildDogsById", () => {
  it("builds an id-keyed map", () => {
    const byId = buildDogsById([dogRow(), dogRow2()]);
    expect(byId["d-1"]).toBeDefined();
    expect(byId["d-2"]).toBeDefined();
    expect(byId["d-1"].name).toBe("Biscuit");
    expect(byId["d-2"].name).toBe("Rex");
  });

  it("preserves all original DB row fields", () => {
    const byId = buildDogsById([dogRow()]);
    const d = byId["d-1"];
    expect(d.breed).toBe("Cockapoo");
    expect(d.human_id).toBe("h-1");
    expect(d.groom_notes).toBe("Use gentle shampoo");
  });
});

// ============================================================
// 6. dbBookingsToArray
// ============================================================
describe("dbBookingsToArray", () => {
  it("converts a full booking row with dog and owner resolution", () => {
    const humansById = buildHumansById([humanRow()]);
    const dogsById = buildDogsById([dogRow()]);
    const bookings = dbBookingsToArray([bookingRow()], dogsById, humansById);

    expect(bookings).toHaveLength(1);
    const bk = bookings[0];
    expect(bk.id).toBe("bk-1");
    expect(bk.slot).toBe("09:00");
    expect(bk.dogName).toBe("Biscuit");
    expect(bk.breed).toBe("Cockapoo");
    expect(bk.size).toBe("small");
    expect(bk.service).toBe("full-groom");
    expect(bk.owner).toBe("Jane Smith");
    expect(bk.status).toBe("Checked in");
    expect(bk.addons).toEqual(["nail-clip"]);
    expect(bk.payment).toBe("Paid");
    expect(bk.confirmed).toBe(true);
    expect(bk._dogId).toBe("d-1");
    expect(bk._ownerId).toBe("h-1");
    expect(bk._bookingDate).toBe("2026-04-14");
  });

  it("falls back to 'Unknown' dog name when dog_id not found", () => {
    const bookings = dbBookingsToArray([bookingRow()], {}, {});
    expect(bookings[0].dogName).toBe("Unknown");
    expect(bookings[0].breed).toBe("");
    expect(bookings[0].owner).toBe("Unknown");
  });

  it("defaults status to 'No-show' when null", () => {
    const dogsById = buildDogsById([dogRow()]);
    const humansById = buildHumansById([humanRow()]);
    const row = bookingRow({ status: null });
    const bookings = dbBookingsToArray([row], dogsById, humansById);
    expect(bookings[0].status).toBe("No-show");
  });

  it("defaults addons to empty array when null", () => {
    const dogsById = buildDogsById([dogRow()]);
    const humansById = buildHumansById([humanRow()]);
    const row = bookingRow({ addons: null });
    const bookings = dbBookingsToArray([row], dogsById, humansById);
    expect(bookings[0].addons).toEqual([]);
  });

  it("defaults payment to 'Due at Pick-up' when null", () => {
    const dogsById = buildDogsById([dogRow()]);
    const humansById = buildHumansById([humanRow()]);
    const row = bookingRow({ payment: null });
    const bookings = dbBookingsToArray([row], dogsById, humansById);
    expect(bookings[0].payment).toBe("Due at Pick-up");
  });

  it("sets confirmed to false when null", () => {
    const dogsById = buildDogsById([dogRow()]);
    const humansById = buildHumansById([humanRow()]);
    const row = bookingRow({ confirmed: null });
    const bookings = dbBookingsToArray([row], dogsById, humansById);
    expect(bookings[0].confirmed).toBe(false);
  });

  it("resolves pickup person from humansById", () => {
    const humansById = buildHumansById([humanRow(), humanRow2()]);
    const dogsById = buildDogsById([dogRow()]);
    const row = bookingRow({ pickup_by_id: "h-2" });
    const bookings = dbBookingsToArray([row], dogsById, humansById);
    expect(bookings[0].pickupBy).toBe("Bob Jones");
    expect(bookings[0]._pickupById).toBe("h-2");
  });

  it("falls back pickupBy to owner when pickup_by_id is null", () => {
    const humansById = buildHumansById([humanRow()]);
    const dogsById = buildDogsById([dogRow()]);
    const bookings = dbBookingsToArray(
      [bookingRow({ pickup_by_id: null })],
      dogsById,
      humansById,
    );
    expect(bookings[0].pickupBy).toBe("Jane Smith");
  });

  it("preserves groupId", () => {
    const dogsById = buildDogsById([dogRow()]);
    const humansById = buildHumansById([humanRow()]);
    const row = bookingRow({ group_id: "grp-abc" });
    const bookings = dbBookingsToArray([row], dogsById, humansById);
    expect(bookings[0]._groupId).toBe("grp-abc");
  });

  it("handles multiple booking rows", () => {
    const humansById = buildHumansById([humanRow(), humanRow2()]);
    const dogsById = buildDogsById([dogRow(), dogRow2()]);
    const rows = [
      bookingRow(),
      bookingRow({ id: "bk-2", dog_id: "d-2", slot: "10:00", size: "large" }),
    ];
    const bookings = dbBookingsToArray(rows, dogsById, humansById);
    expect(bookings).toHaveLength(2);
    expect(bookings[1].dogName).toBe("Rex");
  });
});

// ============================================================
// 7. dbConfigToApp
// ============================================================
describe("dbConfigToApp", () => {
  it("converts a normal config row to app SalonConfig", () => {
    const row = {
      default_pickup_offset: 90,
      pricing: { small: { "full-groom": "35" } },
      enforce_capacity: true,
      large_dog_slots: { "12:00": { seats: 2, canShare: true } },
    };
    const config = dbConfigToApp(row);

    expect(config).not.toBeNull();
    expect(config!.defaultPickupOffset).toBe(90);
    expect(config!.pricing).toEqual({ small: { "full-groom": "35" } });
    expect(config!.enforceCapacity).toBe(true);
    expect(config!.largeDogSlots).toEqual({ "12:00": { seats: 2, canShare: true } });
  });

  it("returns null when row is null", () => {
    expect(dbConfigToApp(null)).toBeNull();
  });

  it("defaults null fields to sensible values", () => {
    const row = {
      default_pickup_offset: null,
      pricing: null,
      enforce_capacity: null,
      large_dog_slots: null,
    };
    const config = dbConfigToApp(row);

    expect(config).not.toBeNull();
    expect(config!.defaultPickupOffset).toBe(120);
    expect(config!.pricing).toEqual({});
    expect(config!.enforceCapacity).toBe(true); // null !== false => true
    expect(config!.largeDogSlots).toEqual({});
  });

  it("sets enforceCapacity to false when explicitly false", () => {
    const row = {
      default_pickup_offset: 60,
      pricing: {},
      enforce_capacity: false,
      large_dog_slots: {},
    };
    const config = dbConfigToApp(row);
    expect(config!.enforceCapacity).toBe(false);
  });
});

// ============================================================
// 8. appConfigToDb
// ============================================================
describe("appConfigToDb", () => {
  it("converts app SalonConfig to DB row", () => {
    const config = {
      defaultPickupOffset: 90,
      pricing: { small: { "full-groom": "35" } },
      enforceCapacity: true,
      largeDogSlots: { "12:00": { seats: 2, canShare: true } },
    } as any;
    const dbRow = appConfigToDb(config);

    expect(dbRow.default_pickup_offset).toBe(90);
    expect(dbRow.pricing).toEqual({ small: { "full-groom": "35" } });
    expect(dbRow.enforce_capacity).toBe(true);
    expect(dbRow.large_dog_slots).toEqual({ "12:00": { seats: 2, canShare: true } });
  });

  it("round-trips with dbConfigToApp", () => {
    const original = {
      defaultPickupOffset: 60,
      pricing: { medium: { "bath-and-brush": "25" } },
      enforceCapacity: false,
      largeDogSlots: { "08:30": { seats: 1, canShare: true } },
    } as any;
    const dbRow = appConfigToDb(original);
    const restored = dbConfigToApp(dbRow);

    expect(restored).not.toBeNull();
    expect(restored!.defaultPickupOffset).toBe(original.defaultPickupOffset);
    expect(restored!.pricing).toEqual(original.pricing);
    expect(restored!.enforceCapacity).toBe(original.enforceCapacity);
    expect(restored!.largeDogSlots).toEqual(original.largeDogSlots);
  });
});

// ============================================================
// 9. findHumanByIdOrName
// ============================================================
describe("findHumanByIdOrName", () => {
  it("returns null when value is null (2-arg overload)", () => {
    const humansById = buildHumansById([humanRow()]);
    expect(findHumanByIdOrName(humansById, null)).toBeNull();
  });

  it("returns null when value is empty string (2-arg overload)", () => {
    const humansById = buildHumansById([humanRow()]);
    expect(findHumanByIdOrName(humansById, "")).toBeNull();
  });

  it("finds human by ID in humansById (2-arg overload)", () => {
    const humansById = buildHumansById([humanRow()]);
    const result = findHumanByIdOrName(humansById, "h-1");
    expect(result).not.toBeNull();
    expect(result!.fullName).toBe("Jane Smith");
  });

  it("finds human by fullName via Object.values search (2-arg overload)", () => {
    const humansById = buildHumansById([humanRow()]);
    const result = findHumanByIdOrName(humansById, "Jane Smith");
    expect(result).not.toBeNull();
    expect((result as any).id).toBe("h-1");
  });

  it("returns null when value is null (3-arg overload)", () => {
    const humansById = buildHumansById([humanRow()]);
    const humansMap = dbHumansToMap([humanRow()], {});
    expect(findHumanByIdOrName(humansById, humansMap, null)).toBeNull();
  });

  it("finds human by ID in humansById (3-arg overload)", () => {
    const humansById = buildHumansById([humanRow(), humanRow2()]);
    const humansMap = dbHumansToMap([humanRow(), humanRow2()], {});
    const result = findHumanByIdOrName(humansById, humansMap, "h-2");
    expect(result).not.toBeNull();
    expect(result!.fullName).toBe("Bob Jones");
  });

  it("finds human by name key in humans map (3-arg overload)", () => {
    const humansById = buildHumansById([]);
    const humansMap = dbHumansToMap([humanRow()], {});
    const result = findHumanByIdOrName(humansById, humansMap, "Jane Smith");
    expect(result).not.toBeNull();
    expect((result as any).id).toBe("h-1");
    expect((result as any).fullName).toBe("Jane Smith");
  });

  it("finds human by fullName via value search in humans map (3-arg overload)", () => {
    const humansById = buildHumansById([]);
    const humansMap = dbHumansToMap([humanRow2()], {});
    const result = findHumanByIdOrName(humansById, humansMap, "Bob Jones");
    expect(result).not.toBeNull();
    expect((result as any).id).toBe("h-2");
  });

  it("returns null when human not found anywhere", () => {
    const humansById = buildHumansById([humanRow()]);
    const humansMap = dbHumansToMap([humanRow()], {});
    expect(findHumanByIdOrName(humansById, humansMap, "Nobody Here")).toBeNull();
  });
});

// ============================================================
// 10. findDogByIdOrName
// ============================================================
describe("findDogByIdOrName", () => {
  it("returns null when value is null", () => {
    const dogsById = buildDogsById([dogRow()]);
    const dogsMap = dbDogsToMap([dogRow()], {});
    expect(findDogByIdOrName(dogsById, dogsMap, null)).toBeNull();
  });

  it("returns null when value is empty string", () => {
    const dogsById = buildDogsById([dogRow()]);
    const dogsMap = dbDogsToMap([dogRow()], {});
    expect(findDogByIdOrName(dogsById, dogsMap, "")).toBeNull();
  });

  it("finds dog by ID in dogsById", () => {
    const dogsById = buildDogsById([dogRow()]);
    const dogsMap = dbDogsToMap([dogRow()], {});
    const result = findDogByIdOrName(dogsById, dogsMap, "d-1");
    expect(result).not.toBeNull();
    expect(result!.name).toBe("Biscuit");
  });

  it("finds dog by name in dogs map when not in dogsById", () => {
    const dogsMap = dbDogsToMap([dogRow()], {});
    const result = findDogByIdOrName({}, dogsMap, "Biscuit");
    expect(result).not.toBeNull();
    expect(result!.name).toBe("Biscuit");
    expect(result!.id).toBe("d-1");
  });

  it("finds dog by name in dogsById as fallback", () => {
    const dogsById = buildDogsById([dogRow()]);
    const result = findDogByIdOrName(dogsById, {}, "Biscuit");
    expect(result).not.toBeNull();
    expect(result!.name).toBe("Biscuit");
  });

  it("returns null when dog not found anywhere", () => {
    const dogsById = buildDogsById([dogRow()]);
    const dogsMap = dbDogsToMap([dogRow()], {});
    expect(findDogByIdOrName(dogsById, dogsMap, "Ghost")).toBeNull();
  });

  it("finds dog by id value in dogs map via Object.values search", () => {
    const dogsMap = dbDogsToMap([dogRow(), dogRow2()], {});
    const result = findDogByIdOrName({}, dogsMap, "d-2");
    expect(result).not.toBeNull();
    expect(result!.name).toBe("Rex");
  });
});

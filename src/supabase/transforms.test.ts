// @ts-nocheck
import { describe, it, expect } from "vitest";
import {
  dbHumansToMap,
  buildHumansById,
  dbDogsToMap,
  buildDogsById,
  dbBookingsToArray,
  dbConfigToApp,
  appConfigToDb,
  toDateStr,
} from "./transforms.ts";

describe("dbHumansToMap", () => {
  const rows = [
    { id: "uuid-1", name: "Sarah", surname: "Jones", phone: "07700 900111", sms: true, whatsapp: true, email: "sarah@example.com", fb: "", insta: "@sarahj", tiktok: "", address: "123 Main St", notes: "Prefers texts", history_flag: "" },
    { id: "uuid-2", name: "Dave", surname: "Smith", phone: "", sms: false, whatsapp: false, email: "", fb: "", insta: "", tiktok: "", address: "", notes: "" },
  ];

  it("keys by full name", () => {
    const map = dbHumansToMap(rows, {});
    expect(map["Sarah Jones"]).toBeDefined();
    expect(map["Dave Smith"]).toBeDefined();
  });

  it("maps fields to camelCase", () => {
    const map = dbHumansToMap(rows, {});
    expect(map["Sarah Jones"].historyFlag).toBe("");
    expect(map["Sarah Jones"].phone).toBe("07700 900111");
    expect(map["Sarah Jones"].sms).toBe(true);
  });

  it("defaults missing fields to empty", () => {
    const map = dbHumansToMap(rows, {});
    expect(map["Dave Smith"].phone).toBe("");
    expect(map["Dave Smith"].email).toBe("");
    expect(map["Dave Smith"].sms).toBe(false);
  });

  it("resolves trusted contacts", () => {
    const trustedMap = { "uuid-1": ["Dave Smith"] };
    const map = dbHumansToMap(rows, trustedMap);
    expect(map["Sarah Jones"].trustedIds).toEqual(["Dave Smith"]);
    expect(map["Dave Smith"].trustedIds).toEqual([]);
  });
});

describe("buildHumansById", () => {
  it("builds UUID-keyed map with fullName", () => {
    const rows = [{ id: "uuid-1", name: "Sarah", surname: "Jones" }];
    const byId = buildHumansById(rows);
    expect(byId["uuid-1"].fullName).toBe("Sarah Jones");
  });
});

describe("dbDogsToMap", () => {
  it("resolves owner name from humansById", () => {
    const dogRows = [{ id: "d1", name: "Bella", breed: "Cockapoo", age: "3 yrs", human_id: "uuid-1", alerts: [], groom_notes: "Short cut" }];
    const humansById = { "uuid-1": { id: "uuid-1", name: "Sarah", surname: "Jones", fullName: "Sarah Jones" } };
    const map = dbDogsToMap(dogRows, humansById);
    expect(map["Bella"].humanId).toBe("Sarah Jones");
    expect(map["Bella"].groomNotes).toBe("Short cut");
  });

  it("falls back to human_id when owner not found", () => {
    const dogRows = [{ id: "d1", name: "Rex", breed: "Lab", human_id: "unknown-uuid", alerts: [] }];
    const map = dbDogsToMap(dogRows, {});
    expect(map["Rex"].humanId).toBe("unknown-uuid");
  });

  it("defaults optional fields", () => {
    const dogRows = [{ id: "d1", name: "Rex", breed: "Lab", human_id: "uuid-1" }];
    const humansById = { "uuid-1": { fullName: "Owner" } };
    const map = dbDogsToMap(dogRows, humansById);
    expect(map["Rex"].age).toBe("");
    expect(map["Rex"].alerts).toEqual([]);
    expect(map["Rex"].groomNotes).toBe("");
  });
});

describe("buildDogsById", () => {
  it("builds UUID-keyed map", () => {
    const rows = [{ id: "d1", name: "Bella" }];
    const byId = buildDogsById(rows);
    expect(byId["d1"].name).toBe("Bella");
  });
});

describe("dbBookingsToArray", () => {
  it("transforms booking rows with resolved names", () => {
    const rows = [{ id: "b1", slot: "08:30", dog_id: "d1", size: "small", service: "full_groom", status: "Not Arrived", addons: [], pickup_by_id: null, payment: "Due at Pick-up", booking_date: "2026-03-25" }];
    const dogsById = { "d1": { name: "Bella", breed: "Cockapoo", human_id: "uuid-1" } };
    const humansById = { "uuid-1": { fullName: "Sarah Jones" } };

    const result = dbBookingsToArray(rows, dogsById, humansById);
    expect(result).toHaveLength(1);
    expect(result[0].dogName).toBe("Bella");
    expect(result[0].breed).toBe("Cockapoo");
    expect(result[0].owner).toBe("Sarah Jones");
    expect(result[0]._dogId).toBe("d1");
  });

  it("handles missing dog gracefully", () => {
    const rows = [{ id: "b1", slot: "08:30", dog_id: "missing", size: "small", service: "full_groom", addons: [], booking_date: "2026-03-25" }];
    const result = dbBookingsToArray(rows, {}, {});
    expect(result[0].dogName).toBe("Unknown");
    expect(result[0].owner).toBe("Unknown");
  });

  it("resolves pickup person when different from owner", () => {
    const rows = [{ id: "b1", slot: "08:30", dog_id: "d1", size: "small", service: "full_groom", addons: [], pickup_by_id: "uuid-2", booking_date: "2026-03-25" }];
    const dogsById = { "d1": { name: "Bella", breed: "Cockapoo", human_id: "uuid-1" } };
    const humansById = { "uuid-1": { fullName: "Sarah Jones" }, "uuid-2": { fullName: "Dave Smith" } };
    const result = dbBookingsToArray(rows, dogsById, humansById);
    expect(result[0].pickupBy).toBe("Dave Smith");
  });
});

describe("dbConfigToApp / appConfigToDb", () => {
  it("returns null for null input", () => {
    expect(dbConfigToApp(null)).toBeNull();
  });

  it("converts DB config to app format", () => {
    const dbRow = { default_pickup_offset: 90, pricing: { a: 1 }, enforce_capacity: false, large_dog_slots: { "08:30": {} } };
    const app = dbConfigToApp(dbRow);
    expect(app.defaultPickupOffset).toBe(90);
    expect(app.enforceCapacity).toBe(false);
  });

  it("round-trips correctly", () => {
    const appConfig = { defaultPickupOffset: 120, pricing: { a: 1 }, enforceCapacity: true, largeDogSlots: {} };
    const db = appConfigToDb(appConfig);
    const back = dbConfigToApp(db);
    expect(back).toEqual(appConfig);
  });
});

describe("toDateStr", () => {
  it("passes through string dates", () => {
    expect(toDateStr("2026-03-25")).toBe("2026-03-25");
  });

  it("converts Date objects to YYYY-MM-DD", () => {
    const d = new Date("2026-03-25T00:00:00.000Z");
    expect(toDateStr(d)).toBe("2026-03-25");
  });
});

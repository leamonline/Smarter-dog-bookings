import { describe, it, expect } from "vitest";
import { buildSearchEntries } from "./helpers.js";

describe("buildSearchEntries", () => {
  it("returns one entry per dog with the owner first", () => {
    const dogs = { Bella: { id: "d1", name: "Bella", humanId: "Sarah Jones" } };
    const humans = { "Sarah Jones": { phone: "07700 900111", trustedIds: [] } };
    const entries = buildSearchEntries(dogs, humans);
    expect(entries).toHaveLength(1);
    expect(entries[0].dog.id).toBe("d1");
    expect(entries[0].humans).toEqual([
      { key: "Sarah Jones", phone: "07700 900111", isTrusted: false },
    ]);
  });

  it("nests trusted humans after the owner in the same entry", () => {
    const dogs = { Bella: { id: "d1", name: "Bella", humanId: "Sarah Jones" } };
    const humans = {
      "Sarah Jones": { phone: "07700 900111", trustedIds: ["Dave Smith", "Emma Wilson"] },
      "Dave Smith": { phone: "07700 900112" },
      "Emma Wilson": { phone: "07700 900113" },
    };
    const entries = buildSearchEntries(dogs, humans);
    expect(entries).toHaveLength(1);
    expect(entries[0].humans).toEqual([
      { key: "Sarah Jones", phone: "07700 900111", isTrusted: false },
      { key: "Dave Smith", phone: "07700 900112", isTrusted: true },
      { key: "Emma Wilson", phone: "07700 900113", isTrusted: true },
    ]);
  });

  it("skips trusted IDs that don't resolve to a human record", () => {
    const dogs = { Bella: { id: "d1", name: "Bella", humanId: "Sarah Jones" } };
    const humans = {
      "Sarah Jones": { phone: "111", trustedIds: ["Ghost User", "Dave Smith"] },
      "Dave Smith": { phone: "112" },
    };
    const entries = buildSearchEntries(dogs, humans);
    expect(entries[0].humans.map((h) => h.key)).toEqual(["Sarah Jones", "Dave Smith"]);
  });

  it("keeps a dog even when the owner lookup fails but humanId is set", () => {
    const dogs = { Orphan: { id: "d2", name: "Orphan", humanId: "Missing Owner" } };
    const humans = {};
    const entries = buildSearchEntries(dogs, humans);
    expect(entries).toHaveLength(1);
    expect(entries[0].humans).toEqual([
      { key: "Missing Owner", phone: "", isTrusted: false },
    ]);
  });

  it("returns an entry with no humans if the dog has no humanId", () => {
    const dogs = { Stray: { id: "d3", name: "Stray" } };
    const entries = buildSearchEntries(dogs, {});
    expect(entries[0].humans).toEqual([]);
  });

  it("flags hasAlerts when the dog has alerts", () => {
    const dogs = {
      Fox: { id: "d4", name: "Fox", humanId: "h1", alerts: ["Sensitive paws"] },
      Bella: { id: "d5", name: "Bella", humanId: "h1" },
    };
    const humans = { h1: { phone: "000" } };
    const entries = buildSearchEntries(dogs, humans);
    expect(entries.find((e) => e.dog.id === "d4").hasAlerts).toBe(true);
    expect(entries.find((e) => e.dog.id === "d5").hasAlerts).toBe(false);
  });

  it("does not duplicate a dog that used to produce one entry per human", () => {
    const dogs = { Bella: { id: "d1", name: "Bella", humanId: "Sarah Jones" } };
    const humans = {
      "Sarah Jones": { phone: "111", trustedIds: ["Dave Smith", "Emma Wilson"] },
      "Dave Smith": { phone: "112" },
      "Emma Wilson": { phone: "113" },
    };
    const entries = buildSearchEntries(dogs, humans);
    expect(entries.filter((e) => e.dog.id === "d1")).toHaveLength(1);
  });
});

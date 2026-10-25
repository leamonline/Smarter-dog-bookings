import { describe, expect, it } from "vitest";
import { lastVisitEntries, readRepeatEntries, repeatLandingStep, resolveRepeatSeed } from "./repeatBooking";

const dog = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  name: id.toUpperCase(),
  size: "small",
  isPregnant: false,
  ...over,
});

describe("lastVisitEntries", () => {
  it("returns nothing without history", () => {
    expect(lastVisitEntries([])).toEqual([]);
  });

  it("takes every dog from the newest date only", () => {
    const entries = lastVisitEntries([
      { dogId: "a", service: "full-groom", bookingDate: "2026-09-02" },
      { dogId: "b", service: "bath-and-brush", bookingDate: "2026-09-02" },
      { dogId: "a", service: "bath-and-deshed", bookingDate: "2026-08-01" },
    ]);
    expect(entries).toEqual([
      { dogId: "a", service: "full-groom" },
      { dogId: "b", service: "bath-and-brush" },
    ]);
  });

  it("skips rows without a dog or service and repeated dogs", () => {
    const entries = lastVisitEntries([
      { dogId: null, service: "full-groom", bookingDate: "2026-09-02" },
      { dogId: "a", service: "full-groom", bookingDate: "2026-09-02" },
      { dogId: "a", service: "bath-and-brush", bookingDate: "2026-09-02" },
      { dogId: "b", service: "", bookingDate: "2026-09-02" },
    ]);
    expect(entries).toEqual([{ dogId: "a", service: "full-groom" }]);
  });

  it("caps a visit at four dogs", () => {
    const rows = ["a", "b", "c", "d", "e"].map((id) => ({
      dogId: id,
      service: "full-groom",
      bookingDate: "2026-09-02",
    }));
    expect(lastVisitEntries(rows)).toHaveLength(4);
  });
});

describe("resolveRepeatSeed", () => {
  it("refills dogs and services from fresh data", () => {
    const seed = resolveRepeatSeed(
      [{ dogId: "a", service: "full-groom" }],
      [dog("a", { size: "medium" })],
    );
    expect(seed.selectedDogs).toEqual([{ dogId: "a", name: "A", size: "medium" }]);
    expect(seed.services).toEqual({ a: "full-groom" });
    expect(repeatLandingStep(seed)).toBe(3);
  });

  it("never carries Puppy Groom over, so the customer picks again", () => {
    const seed = resolveRepeatSeed([{ dogId: "a", service: "puppy-groom" }], [dog("a")]);
    expect(seed.selectedDogs).toHaveLength(1);
    expect(seed.services).toEqual({});
    expect(repeatLandingStep(seed)).toBe(2);
  });

  it("drops a service the dog's current size cannot have", () => {
    const seed = resolveRepeatSeed(
      [{ dogId: "a", service: "puppy-groom" }, { dogId: "b", service: "full-groom" }],
      [dog("a", { size: "large" }), dog("b")],
    );
    expect(seed.services).toEqual({ b: "full-groom" });
    expect(repeatLandingStep(seed)).toBe(2);
  });

  it("leaves out dogs that are gone, pregnant or without a confirmed size", () => {
    const seed = resolveRepeatSeed(
      [
        { dogId: "gone", service: "full-groom" },
        { dogId: "preg", service: "full-groom" },
        { dogId: "unsized", service: "full-groom" },
        { dogId: "ok", service: "full-groom" },
      ],
      [dog("preg", { isPregnant: true }), dog("unsized", { size: "" }), dog("ok")],
    );
    expect(seed.selectedDogs.map((d) => d.dogId)).toEqual(["ok"]);
  });

  it("yields an empty seed when nothing is eligible", () => {
    expect(resolveRepeatSeed([{ dogId: "x", service: "full-groom" }], []).selectedDogs).toEqual([]);
  });
});

describe("readRepeatEntries", () => {
  it("keeps only well-formed, distinct entries", () => {
    expect(
      readRepeatEntries([
        { dogId: "a", service: "full-groom" },
        { dogId: "a", service: "bath-and-brush" },
        { dogId: 7, service: "full-groom" },
        { dogId: "b" },
        null,
        "x",
      ]),
    ).toEqual([{ dogId: "a", service: "full-groom" }]);
  });

  it("returns nothing for non-arrays", () => {
    expect(readRepeatEntries(undefined)).toEqual([]);
    expect(readRepeatEntries({ dogId: "a" })).toEqual([]);
  });
});

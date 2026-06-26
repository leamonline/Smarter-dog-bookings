import { describe, it, expect } from "vitest";
import { buildWizardBookings } from "./buildWizardBookings.js";

const dogs = [
  { clientKey: "a", name: "Bella", breed: "Poodle", size: "small" },
  { clientKey: "b", name: "Max", breed: "Labrador", size: "large" },
  { clientKey: "c", name: "Sky", breed: "Pug", size: "small" },
];
const keyToDogId = { a: "dog-a", b: "dog-b", c: "dog-c" };
const selections = {
  a: { booked: true, service: "full-groom", addons: ["Flea Bath"] },
  b: { booked: true, service: "bath-brush", addons: [] },
  c: { booked: false, service: "full-groom", addons: [] },
};

function seqIds() {
  let n = 0;
  return () => `id-${n++}`;
}

describe("buildWizardBookings", () => {
  it("emits one booking per BOOKED dog only (deselected dogs excluded)", () => {
    const out = buildWizardBookings(
      { humanId: "h1", keyToDogId, dogs, selections, dateStr: "2026-07-01", slot: "09:00" },
      seqIds(),
    );
    expect(out).toHaveLength(2);
    expect(out.map((b) => b.dogName)).toEqual(["Bella", "Max"]);
  });

  it("carries owner/date/slot/size/service/addons and maps clientKey → real dog id", () => {
    const out = buildWizardBookings(
      { humanId: "h1", keyToDogId, dogs, selections, dateStr: "2026-07-01", slot: "09:00" },
      seqIds(),
    );
    expect(out[0]).toMatchObject({
      slot: "09:00",
      dogName: "Bella",
      breed: "Poodle",
      size: "small",
      service: "full-groom",
      addons: ["Flea Bath"],
      owner: "h1",
      _dogId: "dog-a",
      _bookingDate: "2026-07-01",
    });
    expect(out[1]._dogId).toBe("dog-b");
    expect(out[1].size).toBe("large");
    // every row gets a fresh id
    expect(out[0].id).not.toBe(out[1].id);
  });

  it("defaults addons to [] and size to 'small' when missing", () => {
    const out = buildWizardBookings(
      {
        humanId: "h1",
        keyToDogId: { a: "dog-a" },
        dogs: [{ clientKey: "a", name: "X", breed: "?", size: "" }],
        selections: { a: { booked: true, service: "full-groom" } },
        dateStr: "2026-07-01",
        slot: "10:00",
      },
      seqIds(),
    );
    expect(out[0].addons).toEqual([]);
    expect(out[0].size).toBe("small");
  });

  it("returns [] when nothing is booked", () => {
    const out = buildWizardBookings(
      {
        humanId: "h1",
        keyToDogId,
        dogs,
        selections: { a: { booked: false }, b: { booked: false }, c: { booked: false } },
        dateStr: "2026-07-01",
        slot: "09:00",
      },
      seqIds(),
    );
    expect(out).toEqual([]);
  });
});

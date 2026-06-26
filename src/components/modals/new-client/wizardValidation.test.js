import { describe, it, expect } from "vitest";
import { canAdvanceCustomer, canAdvanceDogs, canConfirm, bookedDogs } from "./wizardValidation.js";

describe("canAdvanceCustomer", () => {
  it("requires a non-empty name, surname and phone", () => {
    expect(canAdvanceCustomer({ name: "Amanda", surname: "Booth", phone: "07985 630521" })).toBe(true);
    expect(canAdvanceCustomer({ name: "Amanda", surname: "", phone: "x" })).toBe(false);
    expect(canAdvanceCustomer({ name: "  ", surname: "Booth", phone: "x" })).toBe(false);
    expect(canAdvanceCustomer({ name: "Amanda", surname: "Booth", phone: "  " })).toBe(false);
    expect(canAdvanceCustomer(null)).toBe(false);
  });
});

describe("canAdvanceDogs", () => {
  it("needs at least one dog, each with a name and a size", () => {
    expect(canAdvanceDogs([{ clientKey: "a", name: "Bella", size: "small" }])).toBe(true);
    expect(canAdvanceDogs([])).toBe(false);
    expect(canAdvanceDogs([{ name: "Bella", size: "" }])).toBe(false);
    expect(canAdvanceDogs([{ name: "", size: "small" }])).toBe(false);
    expect(canAdvanceDogs(null)).toBe(false);
  });
});

describe("bookedDogs / canConfirm", () => {
  const dogs = [
    { clientKey: "a", name: "Bella", size: "small" },
    { clientKey: "b", name: "Max", size: "large" },
  ];

  it("bookedDogs returns only ticked dogs", () => {
    const sel = { a: { booked: true }, b: { booked: false } };
    expect(bookedDogs(dogs, sel).map((d) => d.clientKey)).toEqual(["a"]);
  });

  it("canConfirm requires date, slot, >=1 booked, and a service on each booked dog", () => {
    const ok = { a: { booked: true, service: "full-groom" }, b: { booked: false } };
    expect(canConfirm(dogs, ok, "2026-07-01", "09:00")).toBe(true);
    expect(canConfirm(dogs, ok, "", "09:00")).toBe(false);
    expect(canConfirm(dogs, ok, "2026-07-01", "")).toBe(false);
    expect(canConfirm(dogs, { a: { booked: false }, b: { booked: false } }, "2026-07-01", "09:00")).toBe(false);
    expect(canConfirm(dogs, { a: { booked: true, service: "" }, b: { booked: false } }, "2026-07-01", "09:00")).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { orderSafetyFacts } from "./safetyOrder";

describe("orderSafetyFacts", () => {
  it("puts handling restrictions first, then behaviour, then the softer notes", () => {
    expect(
      orderSafetyFacts(["Senior (Needs breaks)", "Fear of dryer", "Bites / Nips", "Pregnant"]),
    ).toEqual(["Pregnant", "Bites / Nips", "Fear of dryer", "Senior (Needs breaks)"]);
  });

  it("keeps staff's own order among warnings of the same kind", () => {
    expect(orderSafetyFacts(["Reactive to dogs", "Bites / Nips"])).toEqual(["Reactive to dogs", "Bites / Nips"]);
  });

  it("keeps free text nobody categorised, ahead of the softer notes", () => {
    expect(orderSafetyFacts(["Nervous / Anxious", "Allergic to oatmeal shampoo"])).toEqual([
      "Allergic to oatmeal shampoo",
      "Nervous / Anxious",
    ]);
  });

  it("never adds, drops or rewrites a warning, and does not touch its input", () => {
    const input = ["Muzzle only", "Bites / Nips", "Sensitive paws"];
    const out = orderSafetyFacts(input);
    expect([...out].sort()).toEqual([...input].sort());
    expect(input).toEqual(["Muzzle only", "Bites / Nips", "Sensitive paws"]);
  });

  it("does not infer anything from the wording", () => {
    // "bite" in free text is not the recorded "Bites / Nips" warning.
    expect(orderSafetyFacts(["Fear of dryer", "bite risk"])).toEqual(["bite risk", "Fear of dryer"]);
  });
});

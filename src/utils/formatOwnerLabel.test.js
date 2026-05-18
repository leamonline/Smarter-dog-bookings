import { describe, it, expect } from "vitest";
import { formatOwnerLabel } from "./formatOwnerLabel.js";

describe("formatOwnerLabel", () => {
  it("renders just the first name when surname is empty", () => {
    const humans = {
      "Andrea": {
        id: "h-1", fullName: "Andrea", name: "Andrea", surname: "", phone: "07700900111",
      },
    };
    const dog = { id: "d-1", _humanId: "h-1", humanId: "Andrea" };
    expect(formatOwnerLabel(dog, humans).label).toBe("Andrea");
  });

  it("refuses to render a UUID-shaped name", () => {
    const dog = { id: "d-2", humanId: "1b2e9d3a-4c5f-6789-abcd-ef0123456789" };
    expect(formatOwnerLabel(dog, {}).label).toBe("Unknown owner");
  });

  it("falls back to Unknown owner when humans map is empty", () => {
    const dog = { id: "d-3", humanId: "Anna Cragg" };
    expect(formatOwnerLabel(dog, {}).label).toBe("Anna Cragg");
  });
});

// The ratchet counters are tested next to the ratchets that use them. This file
// tests the part that is new: rewriting ceilings downwards for
// `npm run check:design-system -- --lower`. It must only ever lower a ceiling.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CEILINGS, RATCHETS, lowerCeilingsInSource } from "./ratchets";

const SAMPLE = `before
export const CEILINGS = {
  alpha: { one: 10, two: 5 },
  beta: { solo: 3 },
} as const;
after`;

describe("lowerCeilingsInSource", () => {
  it("lowers a ceiling to a lower measured count and reports the change", () => {
    const { text, changes } = lowerCeilingsInSource(SAMPLE, { alpha: { one: 7, two: 5 }, beta: { solo: 3 } });
    expect(text).toContain("alpha: { one: 7, two: 5 },");
    expect(changes).toEqual([{ id: "alpha", key: "one", from: 10, to: 7 }]);
  });

  it("never raises a ceiling, even when the count is above it", () => {
    const { text, changes } = lowerCeilingsInSource(SAMPLE, { alpha: { one: 99, two: 99 }, beta: { solo: 99 } });
    expect(text).toBe(SAMPLE);
    expect(changes).toEqual([]);
  });

  it("can lower several ceilings, including down to zero", () => {
    const { text, changes } = lowerCeilingsInSource(SAMPLE, { alpha: { one: 0, two: 4 }, beta: { solo: 0 } });
    expect(text).toContain("alpha: { one: 0, two: 4 },");
    expect(text).toContain("beta: { solo: 0 },");
    expect(changes).toHaveLength(3);
  });

  it("leaves unknown ratchets and unmeasured keys alone, and keeps the text around the block", () => {
    const { text, changes } = lowerCeilingsInSource(SAMPLE, { gamma: { x: 0 }, alpha: { one: 4 } });
    expect(text).toContain("alpha: { one: 4, two: 5 },");
    expect(text).toContain("beta: { solo: 3 },");
    expect(text.startsWith("before\n")).toBe(true);
    expect(text.endsWith("} as const;\nafter")).toBe(true);
    expect(changes).toEqual([{ id: "alpha", key: "one", from: 10, to: 4 }]);
  });

  it("refuses a file with no CEILINGS block", () => {
    expect(() => lowerCeilingsInSource("nothing here", {})).toThrow("Cannot find the CEILINGS block");
  });
});

describe("the real ceilings block", () => {
  const source = readFileSync(fileURLToPath(new URL("./ratchets.ts", import.meta.url)), "utf8");

  it("is in the format --lower rewrites, so reformatting it would be caught here", () => {
    const current = Object.fromEntries(Object.entries(CEILINGS).map(([id, keys]) => [id, { ...keys }]));
    // If the regex could not read a line, lowering to zero would change nothing.
    const zeroed = Object.fromEntries(Object.entries(current).map(([id, keys]) => [id, Object.fromEntries(Object.keys(keys).map((k) => [k, 0]))]));
    const { changes } = lowerCeilingsInSource(source, zeroed);
    const nonZero = Object.entries(CEILINGS).flatMap(([id, keys]) => Object.entries(keys).filter(([, v]) => v > 0).map(([k]) => `${id}.${k}`));
    expect(changes.map((c) => `${c.id}.${c.key}`).sort()).toEqual(nonZero.sort());
  });

  it("has a registry entry, with a label for every key, for each ratchet", () => {
    expect(RATCHETS.map((r) => r.id).sort()).toEqual(Object.keys(CEILINGS).sort());
    for (const ratchet of RATCHETS) {
      expect(Object.keys(ratchet.keys).sort()).toEqual(Object.keys(CEILINGS[ratchet.id]).sort());
    }
  });
});

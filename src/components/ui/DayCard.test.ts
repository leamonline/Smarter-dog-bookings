// What DayCard promises about its source: a fixed header, and no data access.
// File-reading checks, so they run in the node project rather than jsdom.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (name: string) => readFileSync(`src/components/ui/${name}`, "utf8");

describe("DayCard strip and face heights", () => {
  it("are fixed by CSS, so every card is the same height and a new line can never move the cards below", () => {
    const css = read("dayCard.css");
    expect(css).toMatch(/\.wallet-strip\s*\{[^}]*height:\s*var\(--stack-strip-height,\s*72px\)/);
    expect(css).toMatch(/\.wallet-face\s*\{[^}]*height:\s*var\(--stack-face-height,\s*56px\)/);
  });
});

describe("DayCard stays presentational", () => {
  it("imports no hook, engine, context or Supabase module", () => {
    const imports = [...read("DayCard.jsx").matchAll(/^import .* from "([^"]+)"/gm)].map((m) => m[1]);
    expect(imports.length).toBeGreaterThan(0);
    for (const spec of imports) expect(spec).not.toMatch(/supabase|engine|hooks|contexts/);
  });
});

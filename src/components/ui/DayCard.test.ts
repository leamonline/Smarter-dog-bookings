// What DayCard promises about its source: a fixed header, and no data access.
// File-reading checks, so they run in the node project rather than jsdom.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (name: string) => readFileSync(`src/components/ui/${name}`, "utf8");

describe("DayCard header height", () => {
  it("is fixed by CSS, so a new row can never move the cards below", () => {
    expect(read("dayCard.css")).toMatch(
      /\.wallet-header\s*\{[^}]*height:\s*var\(--stack-header-height,\s*144px\)/,
    );
  });
});

describe("DayCard stays presentational", () => {
  it("imports no hook, engine, context or Supabase module", () => {
    const imports = [...read("DayCard.jsx").matchAll(/^import .* from "([^"]+)"/gm)].map((m) => m[1]);
    expect(imports.length).toBeGreaterThan(0);
    for (const spec of imports) expect(spec).not.toMatch(/supabase|engine|hooks|contexts/);
  });
});

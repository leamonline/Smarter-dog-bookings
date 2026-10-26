/**
 * Hard-coded colour ratchet.
 *
 * A colour in a component should come from a token (a Tailwind class such as
 * `text-ink` or `bg-brand-coral-light`, or a `var(--color-…)`), so one change
 * to the palette reaches every screen and the contrast tests in
 * designTokens.integrity.test.ts and designTokens.a11y.test.ts can vouch for
 * it. A hex or rgb() literal inside a .jsx/.tsx file bypasses all of that.
 *
 * This counts the literals still left. The ceiling is the count when the
 * ratchet was added. Lower it when you replace a literal with a token; never
 * raise it to fit a feature.
 *
 * Not counted (see ALLOWED, each with its reason): the files that ARE the
 * source of a deliberately fixed colour. Status, size and safety colours carry
 * meaning staff rely on, are frozen on purpose, and are resolved in one place
 * each, so a literal there is the design rather than drift.
 *
 * Also not counted: comments, test files, .ts/.css files (constants and
 * stylesheets are where tokens are defined), and `#` anchors such as
 * href="#main".
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ALLOWED_COLOUR_FILES,
  CEILINGS,
  SRC_DIR,
  countColourLiterals,
  measureColourLiterals,
  topFiles,
} from "./designSystemHealth/ratchets";

const CEILING = CEILINGS.hardCodedColours.literals;

describe("hard-coded colour ratchet", () => {
  const { totals, perFile } = measureColourLiterals();

  it(`colour literals in components stay at or below ${CEILING}`, () => {
    expect(
      totals.literals,
      `${totals.literals} hex/rgb colour literals found (ceiling ${CEILING}). Use a token (a Tailwind ` +
        `class or var(--color-…)) instead. Most: ${topFiles(perFile.literals!, 8)}`,
    ).toBeLessThanOrEqual(CEILING);
  });

  it("every allowed file still exists and still needs its exception", () => {
    for (const rel of Object.keys(ALLOWED_COLOUR_FILES)) {
      const source = readFileSync(join(SRC_DIR, rel), "utf8");
      expect(countColourLiterals(source), `${rel} no longer has a colour literal: remove it from ALLOWED`).toBeGreaterThan(0);
    }
  });
});

// A ratchet that miscounts is worse than none, so check the scanner itself.
describe("colour literal scanner", () => {
  it("counts hex colours of every length and rgb/hsl functions", () => {
    expect(countColourLiterals('const a = "#fff", b = "#ffcc00", c = "#ffcc0080", d = "rgba(0,0,0,.1)", e = "hsl(1 2% 3%)";')).toBe(5);
  });

  it("ignores comments", () => {
    expect(countColourLiterals("// #ff0000\n/* rgba(0,0,0,1) and #fff */\nconst a = 1;")).toBe(0);
  });

  it("ignores a trailing line comment but still counts code before it", () => {
    expect(countColourLiterals("const a = 1; // previous colour #fff")).toBe(0);
    expect(countColourLiterals('const a = "#fff"; // was #000')).toBe(1);
  });

  it("does not mistake // inside a string for a comment", () => {
    expect(countColourLiterals('const u = "https://x.test/", c = "#fff";')).toBe(1);
    expect(countColourLiterals("const c = `//${x}`, d = \"#000\";")).toBe(1);
  });

  it("ignores anchors and ids", () => {
    expect(countColourLiterals('<a href="#main" /><label htmlFor="#abc" /><div id="#face" />')).toBe(0);
  });

  it("does not count var(--color-…) or Tailwind classes", () => {
    expect(countColourLiterals('<div className="bg-brand-yellow text-ink" style={{ color: "var(--color-ink)" }} />')).toBe(0);
  });

  it("counts a colour inside an inline style", () => {
    expect(countColourLiterals('<div style={{ color: "#1F1F1F" }} />')).toBe(1);
  });
});

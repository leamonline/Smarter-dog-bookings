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
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const srcDir = fileURLToPath(new URL(".", import.meta.url));

const CEILING = 135;

/** Files where a colour literal is the design, not drift. Keep this short. */
const ALLOWED: Record<string, string> = {
  "components/ui/BookingStatusBadge.tsx": "the one resolver for booking-status colours (frozen operational palette)",
  "components/ui/SizeDot.jsx": "dog-size colours (frozen operational palette)",
  "components/icons/index.jsx": "brand artwork: multi-colour SVG illustrations",
};

const HEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g;
const FUNC = /\b(?:rgb|rgba|hsl|hsla)\(/g;

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.(jsx|tsx)$/.test(entry) && !/\.test\.[jt]sx?$/.test(entry)) out.push(full);
  }
  return out;
}

// Drops block comments, whole-line comments and trailing `// …` comments. A `//`
// inside a string ("https://…") is not a comment, so each line is walked with
// the quote state tracked rather than cut with a regex.
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => {
      let quote: string | null = null;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (quote) {
          if (ch === "\\") i++;
          else if (ch === quote) quote = null;
        } else if (ch === '"' || ch === "'" || ch === "`") {
          quote = ch;
        } else if (ch === "/" && line[i + 1] === "/") {
          return line.slice(0, i);
        }
      }
      return line;
    })
    .join("\n");
}

// A `#abc` right after `href="`, `to="`, `id="` and similar is an anchor, not a colour.
const ANCHOR_BEFORE = /(?:href|to|id|htmlFor|aria-[a-z]+)=["']$/;

function countColourLiterals(source: string): number {
  const text = stripComments(source);
  let count = 0;
  for (const match of text.matchAll(HEX)) {
    if (ANCHOR_BEFORE.test(text.slice(Math.max(0, match.index! - 14), match.index!))) continue;
    count++;
  }
  count += (text.match(FUNC) ?? []).length;
  return count;
}

function countAll() {
  let total = 0;
  const perFile = new Map<string, number>();
  for (const file of sourceFiles(srcDir)) {
    const rel = relative(srcDir, file);
    if (rel in ALLOWED) continue;
    const n = countColourLiterals(readFileSync(file, "utf8"));
    if (!n) continue;
    total += n;
    perFile.set(rel, n);
  }
  return { total, perFile };
}

describe("hard-coded colour ratchet", () => {
  const { total, perFile } = countAll();

  it(`colour literals in components stay at or below ${CEILING}`, () => {
    const biggest = [...perFile]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([f, n]) => `${f} (${n})`)
      .join(", ");
    expect(
      total,
      `${total} hex/rgb colour literals found (ceiling ${CEILING}). Use a token (a Tailwind ` +
        `class or var(--color-…)) instead. Most: ${biggest}`,
    ).toBeLessThanOrEqual(CEILING);
  });

  it("every allowed file still exists and still needs its exception", () => {
    for (const rel of Object.keys(ALLOWED)) {
      const source = readFileSync(join(srcDir, rel), "utf8");
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

/**
 * No whitespace inside a Tailwind arbitrary value.
 *
 * Class names are split on spaces, so `bg-[rgba(31, 31, 31, 0.45)]` is not one
 * class but three broken ones, and the background never applies. Nothing
 * complains: the page just loses a style (once, every modal backdrop stopped
 * dimming the screen behind it). Inside `[...]` write the value without spaces,
 * or use `_` where Tailwind should read a space: `shadow-[0_8px_32px_black]`.
 *
 * Ordinary CSS files and inline style objects are unaffected; they may keep
 * their spaces.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const srcDir = fileURLToPath(new URL(".", import.meta.url));

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.(jsx?|tsx?)$/.test(entry) && !/\.test\.[jt]sx?$/.test(entry)) out.push(full);
  }
  return out;
}

// A utility name, `-[`, then anything without a quote or `]` that contains
// whitespace, then `]`. Quotes are excluded so a string such as
// `items[0] + "x"` or a JS array index is not mistaken for a class.
const SPACED_ARBITRARY_VALUE = /(?<![\w$.\])])[a-z0-9:!-]*-\[[^\]"'`\n]*\s[^\]"'`\n]*\]/g;

export function spacedArbitraryValues(source: string): string[] {
  return [...source.matchAll(SPACED_ARBITRARY_VALUE)].map((m) => m[0]);
}

describe("Tailwind arbitrary values", () => {
  it("contain no whitespace anywhere in src", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(srcDir)) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, index) => {
        for (const found of spacedArbitraryValues(line)) {
          offenders.push(`${relative(srcDir, file)}:${index + 1}  ${found}`);
        }
      });
    }
    expect(offenders, `class names with a space inside [...]:\n  ${offenders.join("\n  ")}`).toEqual([]);
  });

  // A guard that cannot fail is not a guard, so check the scanner itself.
  it("finds a spaced colour, a spaced shadow and a variant-prefixed one", () => {
    expect(spacedArbitraryValues('className="bg-[rgba(31, 31, 31, 0.45)] p-2"')).toEqual(["bg-[rgba(31, 31, 31, 0.45)]"]);
    expect(spacedArbitraryValues('className="shadow-[0 8px 32px black]"')).toHaveLength(1);
    expect(spacedArbitraryValues('className="sm:hover:text-[#1F1F1F ]"')).toHaveLength(1);
  });

  it("allows the correct forms", () => {
    expect(spacedArbitraryValues('className="bg-[rgba(31,31,31,0.45)] shadow-[0_8px_32px_black] w-[min(560px,95vw)]"')).toEqual([]);
  });

  it("is not fooled by array indexing or arithmetic", () => {
    expect(spacedArbitraryValues("const x = items[ 0 ]; const y = a - [1, 2].length;")).toEqual([]);
  });

  it("does flag a spaced value inside a quoted class string, which is where class names live", () => {
    expect(spacedArbitraryValues('const s = "text-[not a class]";')).toEqual(["text-[not a class]"]);
  });
});

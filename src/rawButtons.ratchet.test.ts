/**
 * Raw button ratchet.
 *
 * Action buttons should be `Button` (or `IconButton` when it is only an icon)
 * from src/components/ui. Hand-written buttons each carry their own radius,
 * size, focus ring and disabled look, and the old `.btn-*` CSS classes are a
 * second system that Button already covers.
 *
 * Two counts, both of which may only go down:
 *   - `legacy`: a <button> styled with the `.btn` / `.btn-primary` /
 *     `.btn-danger` / `.btn-ghost` / `.btn-sm` classes. These are near
 *     drop-ins for <Button>, so this one is meant to reach zero.
 *   - `raw`: every <button> outside the shared kit. Some of these are
 *     legitimately not a Button (a whole-row or card that is clickable, a tab,
 *     a toggle chip, the day card's heading), so this ceiling is a floor to
 *     reduce towards, not a target of zero.
 *
 * Ceilings are the counts when the ratchet was added. Lower one when you
 * migrate; never raise one to fit a feature, use Button or IconButton.
 *
 * Not counted: the shared kit itself (src/components/ui), test files, and the
 * customer portal's `portal-btn` buttons, which are a separate system on purpose.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const srcDir = fileURLToPath(new URL(".", import.meta.url));

const CEILINGS = { raw: 475, legacy: 12 } as const;

type Kind = keyof typeof CEILINGS;

// `btn`, `btn-primary` and friends as whole class tokens. `portal-btn` must not
// match: it is a different system, and `-` is not a word character.
const LEGACY_CLASS = /(?:^|[\s"'`{])btn(?:-(?:primary|danger|ghost|sm|pill))?(?=[\s"'`}]|$)/;
const PORTAL_CLASS = /(?:^|[\s"'`{])portal-btn/;

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.(jsx|tsx)$/.test(entry) && !/\.test\.[jt]sx?$/.test(entry)) out.push(full);
  }
  return out;
}

// The text of a JSX opening tag, from `<button` to its closing `>`. A `>` inside
// `{…}` (an arrow function, a comparison) or inside a quoted string does not end it.
function openingTag(source: string, start: number): string {
  let depth = 0;
  let quote: string | null = null;
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'" || (ch === "`" && depth > 0)) {
      quote = ch;
    } else if (ch === "{") depth++;
    else if (ch === "}") depth--;
    else if (ch === ">" && depth === 0) return source.slice(start, i + 1);
  }
  return source.slice(start);
}

function countInSource(source: string): Record<Kind, number> {
  const counts: Record<Kind, number> = { raw: 0, legacy: 0 };
  for (const match of source.matchAll(/<button\b/g)) {
    const tag = openingTag(source, match.index!);
    if (PORTAL_CLASS.test(tag)) continue;
    counts.raw++;
    if (LEGACY_CLASS.test(tag)) counts.legacy++;
  }
  return counts;
}

function countRawButtons() {
  const totals: Record<Kind, number> = { raw: 0, legacy: 0 };
  const perFile: Record<Kind, Map<string, number>> = { raw: new Map(), legacy: new Map() };
  const sharedKit = join(srcDir, "components", "ui") + "/";
  for (const file of sourceFiles(srcDir)) {
    if (file.startsWith(sharedKit)) continue;
    const counts = countInSource(readFileSync(file, "utf8"));
    for (const kind of Object.keys(counts) as Kind[]) {
      if (!counts[kind]) continue;
      totals[kind] += counts[kind];
      perFile[kind].set(relative(srcDir, file), counts[kind]);
    }
  }
  return { totals, perFile };
}

describe("raw buttons ratchet", () => {
  const { totals, perFile } = countRawButtons();

  for (const kind of Object.keys(CEILINGS) as Kind[]) {
    it(`${kind === "raw" ? "hand-written <button>" : "<button> using .btn classes"} stays at or below ${CEILINGS[kind]}`, () => {
      const biggest = [...perFile[kind]]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([f, n]) => `${f} (${n})`)
        .join(", ");
      expect(
        totals[kind],
        `${totals[kind]} found (ceiling ${CEILINGS[kind]}). Use Button, or IconButton for an ` +
          `icon-only one, from components/ui. Most: ${biggest}`,
      ).toBeLessThanOrEqual(CEILINGS[kind]);
    });
  }
});

// A ratchet that miscounts is worse than none, so check the scanner itself.
describe("raw buttons scanner", () => {
  it("counts a plain button and a legacy-class button", () => {
    expect(countInSource('<button className="x">a</button><button className="btn btn-ghost">b</button>')).toEqual({
      raw: 2,
      legacy: 1,
    });
  });

  it("does not count the shared Button or IconButton (capitalised)", () => {
    expect(countInSource("<Button>a</Button><IconButton label=\"x\" />")).toEqual({ raw: 0, legacy: 0 });
  });

  it("does not count the portal's separate portal-btn system", () => {
    expect(countInSource('<button className="portal-btn portal-btn--primary">a</button>')).toEqual({ raw: 0, legacy: 0 });
  });

  it("matches btn as a whole class token only", () => {
    expect(countInSource('<button className="btn-like">a</button>').legacy).toBe(0);
    expect(countInSource('<button className="px-3 btn">a</button>').legacy).toBe(1);
    expect(countInSource("<button className={`btn ${extra}`}>a</button>").legacy).toBe(1);
  });

  it("reads past an arrow function inside the tag to find a later className", () => {
    expect(countInSource('<button onClick={(e) => go(e)} className="btn btn-primary">a</button>').legacy).toBe(1);
  });

  it("is not fooled by > inside a string", () => {
    expect(countInSource('<button title="a>b" className="btn">a</button>').legacy).toBe(1);
  });

  it("counts every element, not every line", () => {
    expect(countInSource('<button>a</button><button>b</button>\n<button>c</button>').raw).toBe(3);
  });
});

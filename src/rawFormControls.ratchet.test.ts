/**
 * Raw form-control ratchet.
 *
 * Text fields, text areas and dropdowns should be `Input`, `Textarea` and
 * `Select` from src/components/ui (wrapped in `Field` for a label, hint and
 * error). Until they existed, every form carried its own class string, so
 * radius, border, focus and text size drifted, and a control's contrast and
 * iOS focus-zoom behaviour depended on which form it happened to be in.
 *
 * This counts the raw elements still left. Ceilings are the counts when the
 * ratchet was added. Lower a ceiling when you migrate a form; never raise one
 * to fit a feature, use the shared control instead.
 *
 * Not counted: the shared controls themselves (src/components/ui), test files,
 * and inputs that are not text-like (checkbox, radio, hidden, file, range,
 * colour, and button types), which have no shared control yet.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const srcDir = fileURLToPath(new URL(".", import.meta.url));

const CEILINGS = { input: 61, textarea: 17, select: 19 } as const;

type Kind = keyof typeof CEILINGS;

const NON_TEXT_TYPE = /\btype\s*=\s*\{?\s*["'](?:checkbox|radio|hidden|file|range|color|submit|button|image|reset)["']/;

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.(jsx|tsx)$/.test(entry) && !/\.test\.[jt]sx?$/.test(entry)) out.push(full);
  }
  return out;
}

// The text of a JSX opening tag, from `<name` to its closing `>`. A `>` inside
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
  const counts: Record<Kind, number> = { input: 0, textarea: 0, select: 0 };
  for (const match of source.matchAll(/<(input|textarea|select)\b/g)) {
    if (match[1] === "input" && NON_TEXT_TYPE.test(openingTag(source, match.index!))) continue;
    counts[match[1] as Kind]++;
  }
  return counts;
}

function countRawControls() {
  const totals: Record<Kind, number> = { input: 0, textarea: 0, select: 0 };
  const perFile: Record<Kind, Map<string, number>> = { input: new Map(), textarea: new Map(), select: new Map() };
  const sharedControls = join(srcDir, "components", "ui") + "/";
  for (const file of sourceFiles(srcDir)) {
    if (file.startsWith(sharedControls)) continue;
    const counts = countInSource(readFileSync(file, "utf8"));
    for (const kind of Object.keys(counts) as Kind[]) {
      if (!counts[kind]) continue;
      totals[kind] += counts[kind];
      perFile[kind].set(relative(srcDir, file), counts[kind]);
    }
  }
  return { totals, perFile };
}

describe("raw form controls ratchet", () => {
  const { totals, perFile } = countRawControls();

  for (const kind of Object.keys(CEILINGS) as Kind[]) {
    it(`raw <${kind}> stays at or below ${CEILINGS[kind]}`, () => {
      const biggest = [...perFile[kind]]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([f, n]) => `${f} (${n})`)
        .join(", ");
      expect(
        totals[kind],
        `${totals[kind]} raw <${kind}> found (ceiling ${CEILINGS[kind]}). Use the shared ` +
          `Input, Textarea or Select from components/ui, inside a Field. Most: ${biggest}`,
      ).toBeLessThanOrEqual(CEILINGS[kind]);
    });
  }
});

// A ratchet that miscounts is worse than none, so check the scanner itself.
describe("raw form controls scanner", () => {
  it("counts text inputs, textareas and selects", () => {
    expect(countInSource('<input type="text" /><textarea rows={3} /><select><option /></select>')).toEqual({
      input: 1,
      textarea: 1,
      select: 1,
    });
  });

  it("does not count the shared controls (capitalised) or non-text inputs", () => {
    const source =
      '<Input /><Select /><Textarea /><input type="checkbox" /><input type="radio" /><input type="hidden" /><input type="file" />';
    expect(countInSource(source)).toEqual({ input: 0, textarea: 0, select: 0 });
  });

  it("reads past an arrow function inside the tag to find a later type", () => {
    expect(countInSource('<input onChange={(e) => set(e.target.value)} type="checkbox" />').input).toBe(0);
    expect(countInSource('<input onChange={(e) => set(e.target.value)} type="text" />').input).toBe(1);
  });

  it("is not fooled by > inside a string", () => {
    expect(countInSource('<input value="a>b" type="checkbox" />').input).toBe(0);
  });

  it("counts an input whose type is dynamic", () => {
    expect(countInSource("<input type={kind} />").input).toBe(1);
  });

  it("counts every element, not every line", () => {
    expect(countInSource('<input type="text" /><input type="email" />\n<input />').input).toBe(3);
  });
});

/**
 * Hand-typed radius and shadow ratchet.
 *
 * Corner radius and shadow come from a short scale (docs/ux/radius-and-elevation.md):
 * `rounded-control`, `rounded-card`, `rounded-full`, and `shadow-card-resting`,
 * `shadow-elevated`, `shadow-modal`. A `shadow-[0_2px_8px_rgba(…)]` or
 * `rounded-[10px]` typed into a class list is a value that skipped the scale,
 * and eight of the shadows found were exact copies of a token that already
 * existed.
 *
 * This counts the hand-typed ones still left. Ceilings are the counts when the
 * ratchet was added. Lower one when you replace a value with a token; never
 * raise one to fit a feature.
 *
 * Not counted: test files, CSS files and inline style objects (where the tokens
 * themselves are defined and a literal is sometimes the point).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const srcDir = fileURLToPath(new URL(".", import.meta.url));

const CEILINGS = { shadow: 37, radius: 6 } as const;

type Kind = keyof typeof CEILINGS;

// A `shadow-[…]` / `rounded-[…]` utility, with any variant prefix (hover:, md:).
// The lookbehind keeps a JS index such as `shadow[0]` or `x.rounded[1]` out.
const PATTERNS: Record<Kind, RegExp> = {
  shadow: /(?<![\w$.\])])(?:[a-z0-9:!-]*:)?shadow-\[[^\]"'`\n]+\]/g,
  radius: /(?<![\w$.\])])(?:[a-z0-9:!-]*:)?rounded(?:-(?:t|b|l|r|tl|tr|bl|br|s|e))?-\[[^\]"'`\n]+\]/g,
};

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.(jsx|tsx)$/.test(entry) && !/\.test\.[jt]sx?$/.test(entry)) out.push(full);
  }
  return out;
}

function countInSource(source: string): Record<Kind, number> {
  return {
    shadow: (source.match(PATTERNS.shadow) ?? []).length,
    radius: (source.match(PATTERNS.radius) ?? []).length,
  };
}

function countAll() {
  const totals: Record<Kind, number> = { shadow: 0, radius: 0 };
  const perFile: Record<Kind, Map<string, number>> = { shadow: new Map(), radius: new Map() };
  for (const file of sourceFiles(srcDir)) {
    const counts = countInSource(readFileSync(file, "utf8"));
    for (const kind of Object.keys(counts) as Kind[]) {
      if (!counts[kind]) continue;
      totals[kind] += counts[kind];
      perFile[kind].set(relative(srcDir, file), counts[kind]);
    }
  }
  return { totals, perFile };
}

describe("hand-typed radius and shadow ratchet", () => {
  const { totals, perFile } = countAll();

  for (const kind of Object.keys(CEILINGS) as Kind[]) {
    it(`hand-typed ${kind === "shadow" ? "shadow-[…]" : "rounded-[…]"} stays at or below ${CEILINGS[kind]}`, () => {
      const biggest = [...perFile[kind]]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([f, n]) => `${f} (${n})`)
        .join(", ");
      expect(
        totals[kind],
        `${totals[kind]} found (ceiling ${CEILINGS[kind]}). Use a token from ` +
          `docs/ux/radius-and-elevation.md. Most: ${biggest}`,
      ).toBeLessThanOrEqual(CEILINGS[kind]);
    });
  }
});

// A ratchet that miscounts is worse than none, so check the scanner itself.
describe("hand-typed radius and shadow scanner", () => {
  it("counts an arbitrary shadow and an arbitrary radius", () => {
    expect(countInSource('className="shadow-[0_2px_8px_rgba(0,0,0,0.04)] rounded-[10px]"')).toEqual({ shadow: 1, radius: 1 });
  });

  it("counts them with a variant prefix and a corner suffix", () => {
    expect(countInSource('className="hover:shadow-[0_4px_12px_black] md:rounded-t-[14px]"')).toEqual({ shadow: 1, radius: 1 });
  });

  it("does not count the tokens", () => {
    expect(countInSource('className="shadow-card-resting shadow-modal rounded-control rounded-card rounded-full"')).toEqual({
      shadow: 0,
      radius: 0,
    });
  });

  it("does not mistake a JS index for a class", () => {
    expect(countInSource("const a = shadow[0]; const b = x.rounded[1];")).toEqual({ shadow: 0, radius: 0 });
  });

  it("counts every utility, not every line", () => {
    expect(countInSource('"shadow-[a] shadow-[b]"\n"shadow-[c]"').shadow).toBe(3);
  });
});

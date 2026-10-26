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
 * `card16` counts the stock `rounded-2xl`. That is exactly 16px, the card radius, so
 * it is written `rounded-card` and the card radius stays one edit. `tile12` counts
 * the stock `rounded-xl`, exactly 12px, which is written `rounded-tile`. The
 * customer portal keeps its own radius tokens and is not counted.
 *
 * Not counted: test files, CSS files and inline style objects (where the tokens
 * themselves are defined and a literal is sometimes the point).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const srcDir = fileURLToPath(new URL(".", import.meta.url));

const CEILINGS = { shadow: 37, radius: 6, card16: 0, tile12: 0 } as const;

type Kind = keyof typeof CEILINGS;

// A `shadow-[…]` / `rounded-[…]` utility, with any variant prefix (hover:, md:).
// The lookbehind keeps a JS index such as `shadow[0]` or `x.rounded[1]` out.
const PORTAL_FILES = ["components/customer/", "CustomerApp.jsx", "components/auth/CustomerLoginPage", "components/auth/ResetPasswordPage"];

const PATTERNS: Record<Kind, RegExp> = {
  shadow: /(?<![\w$.\])])(?:[a-z0-9:!-]*:)?shadow-\[[^\]"'`\n]+\]/g,
  radius: /(?<![\w$.\])])(?:[a-z0-9:!-]*:)?rounded(?:-(?:t|b|l|r|tl|tr|bl|br|s|e))?-\[[^\]"'`\n]+\]/g,
  card16: /(?<![\w-])(?:[a-z0-9:!-]*:)?rounded(?:-(?:t|b|l|r|tl|tr|bl|br|s|e|ss|se|ee|es))?-2xl(?![\w-])/g,
  tile12: /(?<![\w-])(?:[a-z0-9:!-]*:)?rounded(?:-(?:t|b|l|r|tl|tr|bl|br|s|e|ss|se|ee|es))?-xl(?![\w-])/g,
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
    card16: (source.match(PATTERNS.card16) ?? []).length,
    tile12: (source.match(PATTERNS.tile12) ?? []).length,
  };
}

function countAll() {
  const totals: Record<Kind, number> = { shadow: 0, radius: 0, card16: 0, tile12: 0 };
  const perFile: Record<Kind, Map<string, number>> = { shadow: new Map(), radius: new Map(), card16: new Map(), tile12: new Map() };
  for (const file of sourceFiles(srcDir)) {
    const rel = relative(srcDir, file);
    const counts = countInSource(readFileSync(file, "utf8"));
    for (const kind of Object.keys(counts) as Kind[]) {
      if (!counts[kind]) continue;
      if ((kind === "card16" || kind === "tile12") && PORTAL_FILES.some((p) => rel.includes(p))) continue;
      totals[kind] += counts[kind];
      perFile[kind].set(relative(srcDir, file), counts[kind]);
    }
  }
  return { totals, perFile };
}

describe("hand-typed radius and shadow ratchet", () => {
  const { totals, perFile } = countAll();

  for (const kind of Object.keys(CEILINGS) as Kind[]) {
    const label = { shadow: "hand-typed shadow-[…]", radius: "hand-typed rounded-[…]", card16: "stock rounded-2xl (use rounded-card)", tile12: "stock rounded-xl (use rounded-tile)" }[kind];
    it(`${label} stays at or below ${CEILINGS[kind]}`, () => {
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
    expect(countInSource('className="shadow-[0_2px_8px_rgba(0,0,0,0.04)] rounded-[10px]"')).toEqual({ shadow: 1, radius: 1, card16: 0, tile12: 0 });
  });

  it("counts them with a variant prefix and a corner suffix", () => {
    expect(countInSource('className="hover:shadow-[0_4px_12px_black] md:rounded-t-[14px]"')).toEqual({ shadow: 1, radius: 1, card16: 0, tile12: 0 });
  });

  it("does not count the tokens", () => {
    expect(countInSource('className="shadow-card-resting shadow-modal rounded-control rounded-card rounded-full"')).toEqual({
      shadow: 0,
      radius: 0,
      card16: 0,
      tile12: 0,
    });
  });

  it("counts stock rounded-2xl with variants and corners, but not rounded-card or rounded-xl", () => {
    expect(countInSource('"rounded-2xl md:rounded-2xl rounded-t-2xl rounded-card rounded-xl rounded-2xl-x"').card16).toBe(3);
  });

  it("counts stock rounded-xl, but not rounded-tile or rounded-2xl", () => {
    const counts = countInSource('"rounded-xl md:rounded-xl rounded-b-xl rounded-tile rounded-2xl rounded-xl-x"');
    expect(counts.tile12).toBe(3);
    expect(counts.card16).toBe(1);
  });

  it("does not mistake a JS index for a class", () => {
    expect(countInSource("const a = shadow[0]; const b = x.rounded[1];")).toEqual({ shadow: 0, radius: 0, card16: 0, tile12: 0 });
  });

  it("counts every utility, not every line", () => {
    expect(countInSource('"shadow-[a] shadow-[b]"\n"shadow-[c]"').shadow).toBe(3);
  });
});

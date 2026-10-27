import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Complements designTokens.a11y.test.ts. That file pins the pairs that must
// pass; this one keeps the numbers we PUBLISH honest (the design system quotes
// contrast ratios in prose, and prose drifts), stops duplicate token names
// from multiplying, and records which names are one value under two labels.

const srcDir = fileURLToPath(new URL(".", import.meta.url));
const css = readFileSync(join(srcDir, "index.css"), "utf8");
const portal = readFileSync(join(srcDir, "customer-portal.css"), "utf8");

// First definition wins: index.css declares each token once in :root, and the
// portal file only re-exports shorthand aliases of the same names.
function definitions(source: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const m of source.matchAll(/--([a-z0-9-]+):\s*([^;]+);/gi)) {
    if (!found.has(m[1])) found.set(m[1], m[2].trim());
  }
  return found;
}
const tokens = new Map([...definitions(portal), ...definitions(css)]);

function resolve(name: string, seen: string[] = []): string {
  if (seen.includes(name)) throw new Error(`Circular token ${seen.join(" -> ")} -> ${name}`);
  const raw = tokens.get(name);
  if (raw === undefined) throw new Error(`Unknown token --${name}`);
  const alias = raw.match(/^var\(--([a-z0-9-]+)\)$/i);
  if (alias) return resolve(alias[1], [...seen, name]);
  const hex = raw.match(/^#[0-9a-f]{6}$/i);
  if (!hex) throw new Error(`--${name} is not a plain hex colour: ${raw}`);
  return hex[0].toUpperCase();
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [bright, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (bright + 0.05) / (dark + 0.05);
}

const WHITE = "#FFFFFF";
const PAPER = () => resolve("color-brand-paper");
const PAGE = "#F8FAFC"; // --color-surface-page is theme(--color-slate-50)

describe("design tokens: published contrast ratios match the CSS", () => {
  // [foreground token, background, ratio the design system documents]. When a
  // colour is retuned, this fails until the documented number is updated too.
  const claims: Array<[string, () => string, number]> = [
    ["color-brand-ink", () => WHITE, 16.5],
    ["color-brand-ink", PAPER, 14.5],
    ["color-brand-ink", () => resolve("color-brand-yellow"), 10.9],
    ["color-brand-cyan", () => WHITE, 6.2],
    ["color-brand-cyan", PAPER, 5.4],
    ["color-brand-cyan-dark", () => WHITE, 8.3],
    ["color-brand-coral-dark", () => WHITE, 4.85],
    ["color-brand-coral-deep", () => WHITE, 6.9],
    ["color-brand-coral-text", () => WHITE, 5.6],
    ["color-brand-coral-text", () => resolve("color-brand-coral-light"), 4.6],
    ["color-brand-teal", () => WHITE, 4.13],
    ["color-brand-teal-text", () => WHITE, 6.0],
    ["color-brand-teal-dark", () => WHITE, 6.3],
    ["color-brand-green-600", () => WHITE, 5.2],
    ["color-brand-green-700", () => WHITE, 5.2],
    ["color-brand-green-800", () => resolve("color-brand-green-100"), 7.0],
    ["color-brand-whatsapp", () => WHITE, 1.98],
    ["color-brand-whatsapp-dark", () => WHITE, 6.2],
    ["color-brand-mustard", () => WHITE, 3.25],
    ["color-ink-muted", () => WHITE, 5.8],
    ["color-ink-muted", () => PAGE, 5.5],
    ["color-text-muted", () => WHITE, 5.8],
    ["color-text-muted", () => PAGE, 5.5],
    ["color-text-muted", PAPER, 5.1],
    ["color-text-placeholder", () => WHITE, 2.6],
    ["color-ink-muted", PAPER, 5.1],
    ["color-ink-muted", () => resolve("color-sd-sky-tint"), 5.2],
  ];

  it.each(claims)("%s on %#: documented ratio holds", (fg, bg, documented) => {
    expect(contrast(resolve(fg), bg())).toBeCloseTo(documented, 1);
  });
});

describe("design tokens: one value, one canonical name", () => {
  // Names that carry the same value on purpose. If one of these pairs ever
  // diverges, decide deliberately which name is meant and update both lists.
  it.each([
    ["color-brand-green", "color-brand-green-500"],
    ["color-brand-purple", "color-brand-ink"],
    ["color-ink", "color-brand-ink"],
    ["color-ink-muted", "color-text-muted"],
    ["color-brand-green-700", "color-brand-green-600"],
  ])("--%s and --%s resolve to the same colour", (alias, canonical) => {
    expect(resolve(alias)).toBe(resolve(canonical));
  });

  it("keeps warnings off the action yellow, with a readable ink", () => {
    expect(resolve("color-feedback-warning")).not.toBe(resolve("color-brand-yellow"));
    expect(
      contrast(resolve("color-feedback-warning-ink"), resolve("color-feedback-warning-tint")),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it("does not bring back the unused pre-reskin portal literals", () => {
    for (const dead of ["sd-cyan-light", "sd-teal", "sd-coral-light"]) {
      expect(definitions(portal).has(dead), `--${dead} was removed as unused`).toBe(false);
    }
  });
});

describe("fonts: Montserrat faces", () => {
  // A ranged weight (`font-weight: 400 700`) matches every weight exactly and,
  // declared last, outranks the static faces, so ordinary text silently falls
  // back to the system font. Only visible on Linux, where the fallback is wide:
  // it broke the phone inbox layout test on CI while passing on a Mac.
  it("declares every face with a single weight", () => {
    const faces = [...css.matchAll(/@font-face\s*\{[^}]*font-family:\s*"Montserrat"[^}]*\}/g)].map((m) => m[0]);
    expect(faces.length).toBeGreaterThanOrEqual(8);
    for (const face of faces) {
      expect(face).toMatch(/font-weight:\s*(400|500|600|700);/);
    }
  });

  it("covers every weight with a latin-ext face", () => {
    for (const weight of [400, 500, 600, 700]) {
      const ext = new RegExp(`font-weight:\\s*${weight};[^}]*montserrat-latin-ext\\.woff2`);
      expect(css, `latin-ext face for weight ${weight}`).toMatch(ext);
    }
  });
});

describe("design tokens: deprecated names may not spread", () => {
  function sourceFiles(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) sourceFiles(full, out);
      else if (/\.(css|jsx?|tsx?)$/.test(entry) && !/\.test\.[jt]sx?$/.test(entry)) out.push(full);
    }
    return out;
  }
  const files = sourceFiles(srcDir).map((f) => readFileSync(f, "utf8"));
  const count = (pattern: RegExp) =>
    files.reduce((total, text) => total + (text.match(pattern) ?? []).length, 0);

  // The plum brand (rgb 45, 0, 75) was retired in the reskin; its faint tints
  // lingered in ~100 borders and shadows. The charcoal ink replaces them.
  it("has no retired plum tints left", () => {
    expect(count(/rgba?\(\s*45\s*,\s*0\s*,\s*75\b/g)).toBe(0);
  });

  // Warnings use the feedback-warning tokens and mustard, never Tailwind's amber,
  // which is a second, unrelated yellow-orange. See docs/ux/warm-colours.md.
  // The one exception is the `caution` safety-alert tint in alertTints.js: dog
  // safety colours are operational and frozen (design system, "Colours that
  // carry meaning are frozen"), so it keeps its amber.
  it("has no Tailwind amber left, apart from the frozen caution safety tint", () => {
    expect(count(/\bamber-\d+\b/g)).toBe(3);
    const tints = readFileSync(join(srcDir, "components", "modals", "shell", "alertTints.js"), "utf8");
    expect(tints.match(/\bamber-\d+\b/g)).toHaveLength(3);
  });

  // A space inside a Tailwind arbitrary value splits the class in two, so the
  // utility silently never applies (the modal backdrops went transparent once).
  // `bg-[rgba(31, 31, 31, 0.45)]` is wrong; `bg-[rgba(31,31,31,0.45)]` is right.
  it("has no spaces inside Tailwind arbitrary rgba() values", () => {
    expect(count(/-\[[^\]"'`\n]*rgba\(\s*\d+\s*,\s/g)).toBe(0);
  });

  // Ratchets, not bans: the existing uses are fine, new ones are not. Lower
  // the ceiling as call sites move to brand-ink / text-ink. Never raise it.
  it.each([
    ["brand-purple", /\bbrand-purple\b/g, 14],
    // The portal's --sd-* shorthand names were all renamed to canonical tokens.
    ["--sd-* shorthand", /var\(--sd-/g, 0],
  ])("%s stays at or below its ceiling", (_name, pattern, ceiling) => {
    expect(count(pattern)).toBeLessThanOrEqual(ceiling);
  });
});

/**
 * The counting rules and ceilings behind the design-system ratchets.
 *
 * One place, read by two things: the ratchet tests (which fail if a count rises)
 * and `npm run check:design-system` (which prints every count against its
 * ceiling and, with --lower, writes lower ceilings back to CEILINGS below). They
 * share this file so a test and the report can never disagree about a number.
 *
 * Rules, the same as each ratchet has always had:
 *  - a ceiling is the count when the ratchet was added or last lowered;
 *  - lower a ceiling when you replace something, with `npm run check:design-system
 *    -- --lower`; never raise one to fit a feature, use the shared piece instead.
 *
 * Self-contained on purpose: only Node built-ins, no cross-file imports, so Node
 * can run it directly (type stripping) from the command as well as Vitest.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The ceilings. Keep one line per ratchet: --lower rewrites the numbers in place.
 */
export const CEILINGS = {
  rawFormControls: { input: 61, textarea: 17, select: 19 },
  rawButtons: { raw: 449, legacy: 0 },
  hardCodedColours: { literals: 88 },
  offScale: { shadow: 35, radius: 3, card16: 0, tile12: 0 },
  smallText: { underFloor: 27, namedSizes: 0 },
  handRolledDialogs: { overlays: 0 },
} as const;

export type RatchetId = keyof typeof CEILINGS;

export const SRC_DIR = fileURLToPath(new URL("..", import.meta.url));

export type Measurement = {
  totals: Record<string, number>;
  perFile: Record<string, Map<string, number>>;
};

// ---------------------------------------------------------------- shared helpers

export function sourceFiles(dir: string = SRC_DIR, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.(jsx|tsx)$/.test(entry) && !/\.test\.[jt]sx?$/.test(entry)) out.push(full);
  }
  return out;
}

/** The files with the most hits, for a failure message: "path (n), path (n)". */
export function topFiles(perFile: Map<string, number>, limit = 6): string {
  return [...perFile]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([file, n]) => `${file} (${n})`)
    .join(", ");
}

function emptyMeasurement(keys: readonly string[]): Measurement {
  return {
    totals: Object.fromEntries(keys.map((key) => [key, 0])),
    perFile: Object.fromEntries(keys.map((key) => [key, new Map<string, number>()])),
  };
}

function add(m: Measurement, key: string, file: string, n: number): void {
  if (!n) return;
  m.totals[key] = (m.totals[key] ?? 0) + n;
  m.perFile[key]!.set(file, n);
}

// The text of a JSX opening tag, from `<name` to its closing `>`. A `>` inside
// `{…}` (an arrow function, a comparison) or inside a quoted string does not end it.
export function openingTag(source: string, start: number): string {
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

/** Files of the customer portal, which keeps its own radius tokens. */
export const PORTAL_FILES = [
  "components/customer/",
  "CustomerApp.jsx",
  "components/auth/CustomerLoginPage",
  "components/auth/ResetPasswordPage",
];

// ------------------------------------------------------------ 1. raw form controls

const NON_TEXT_TYPE = /\btype\s*=\s*\{?\s*["'](?:checkbox|radio|hidden|file|range|color|submit|button|image|reset)["']/;

export function countRawFormControls(source: string): Record<"input" | "textarea" | "select", number> {
  const counts = { input: 0, textarea: 0, select: 0 };
  for (const match of source.matchAll(/<(input|textarea|select)\b/g)) {
    if (match[1] === "input" && NON_TEXT_TYPE.test(openingTag(source, match.index!))) continue;
    counts[match[1] as keyof typeof counts]++;
  }
  return counts;
}

export function measureRawFormControls(srcDir: string = SRC_DIR): Measurement {
  const m = emptyMeasurement(Object.keys(CEILINGS.rawFormControls));
  const sharedControls = join(srcDir, "components", "ui") + "/";
  for (const file of sourceFiles(srcDir)) {
    if (file.startsWith(sharedControls)) continue;
    const counts = countRawFormControls(readFileSync(file, "utf8"));
    for (const [kind, n] of Object.entries(counts)) add(m, kind, relative(srcDir, file), n);
  }
  return m;
}

// ----------------------------------------------------------------- 2. raw buttons

// `btn`, `btn-primary` and friends as whole class tokens. `portal-btn` must not
// match: it is a different system, and `-` is not a word character.
const LEGACY_CLASS = /(?:^|[\s"'`{])btn(?:-(?:primary|danger|ghost|sm|pill))?(?=[\s"'`}]|$)/;
const PORTAL_BTN_CLASS = /(?:^|[\s"'`{])portal-btn/;

export function countRawButtons(source: string): { raw: number; legacy: number } {
  const counts = { raw: 0, legacy: 0 };
  for (const match of source.matchAll(/<button\b/g)) {
    const tag = openingTag(source, match.index!);
    if (PORTAL_BTN_CLASS.test(tag)) continue;
    counts.raw++;
    if (LEGACY_CLASS.test(tag)) counts.legacy++;
  }
  return counts;
}

export function measureRawButtons(srcDir: string = SRC_DIR): Measurement {
  const m = emptyMeasurement(Object.keys(CEILINGS.rawButtons));
  const sharedKit = join(srcDir, "components", "ui") + "/";
  for (const file of sourceFiles(srcDir)) {
    if (file.startsWith(sharedKit)) continue;
    const counts = countRawButtons(readFileSync(file, "utf8"));
    for (const [kind, n] of Object.entries(counts)) add(m, kind, relative(srcDir, file), n);
  }
  return m;
}

// ------------------------------------------------------- 3. hard-coded colour literals

/** Files where a colour literal is the design, not drift. Keep this short. */
export const ALLOWED_COLOUR_FILES: Record<string, string> = {
  "components/ui/BookingStatusBadge.tsx": "the one resolver for booking-status colours (frozen operational palette)",
  "components/ui/SizeDot.jsx": "dog-size colours (frozen operational palette)",
  "components/icons/index.jsx": "brand artwork: multi-colour SVG illustrations",
};

const HEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g;
const COLOUR_FUNCTION = /\b(?:rgb|rgba|hsl|hsla)\(/g;

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

export function countColourLiterals(source: string): number {
  const text = stripComments(source);
  let count = 0;
  for (const match of text.matchAll(HEX)) {
    if (ANCHOR_BEFORE.test(text.slice(Math.max(0, match.index! - 14), match.index!))) continue;
    count++;
  }
  count += (text.match(COLOUR_FUNCTION) ?? []).length;
  return count;
}

export function measureColourLiterals(srcDir: string = SRC_DIR): Measurement {
  const m = emptyMeasurement(Object.keys(CEILINGS.hardCodedColours));
  for (const file of sourceFiles(srcDir)) {
    const rel = relative(srcDir, file);
    if (rel in ALLOWED_COLOUR_FILES) continue;
    add(m, "literals", rel, countColourLiterals(readFileSync(file, "utf8")));
  }
  return m;
}

// ----------------------------------------------- 4. off-scale radius and shadow values

// A `shadow-[…]` / `rounded-[…]` utility, with any variant prefix (hover:, md:).
// The lookbehind keeps a JS index such as `shadow[0]` or `x.rounded[1]` out.
const OFF_SCALE = {
  shadow: /(?<![\w$.\])])(?:[a-z0-9:!-]*:)?shadow-\[[^\]"'`\n]+\]/g,
  radius: /(?<![\w$.\])])(?:[a-z0-9:!-]*:)?rounded(?:-(?:t|b|l|r|tl|tr|bl|br|s|e))?-\[[^\]"'`\n]+\]/g,
  card16: /(?<![\w-])(?:[a-z0-9:!-]*:)?rounded(?:-(?:t|b|l|r|tl|tr|bl|br|s|e|ss|se|ee|es))?-2xl(?![\w-])/g,
  tile12: /(?<![\w-])(?:[a-z0-9:!-]*:)?rounded(?:-(?:t|b|l|r|tl|tr|bl|br|s|e|ss|se|ee|es))?-xl(?![\w-])/g,
} as const;

export type OffScaleKind = keyof typeof OFF_SCALE;

export function countOffScale(source: string): Record<OffScaleKind, number> {
  return {
    shadow: (source.match(OFF_SCALE.shadow) ?? []).length,
    radius: (source.match(OFF_SCALE.radius) ?? []).length,
    card16: (source.match(OFF_SCALE.card16) ?? []).length,
    tile12: (source.match(OFF_SCALE.tile12) ?? []).length,
  };
}

export function measureOffScale(srcDir: string = SRC_DIR): Measurement {
  const m = emptyMeasurement(Object.keys(CEILINGS.offScale));
  for (const file of sourceFiles(srcDir)) {
    const rel = relative(srcDir, file);
    const counts = countOffScale(readFileSync(file, "utf8"));
    for (const [kind, n] of Object.entries(counts)) {
      // The portal keeps its own radius tokens, so the stock-radius counts skip it.
      if ((kind === "card16" || kind === "tile12") && PORTAL_FILES.some((p) => rel.includes(p))) continue;
      add(m, kind, rel, n);
    }
  }
  return m;
}

// ----------------------------------------------------------------- 5. small text

export function belowFloor(source: string): string[] {
  return [...source.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)].filter((m) => Number(m[1]) < 12).map((m) => m[0]);
}

/** Hand-written 12, 13, 14 or 16px sizes where a named size exists. */
export function namedSizeStragglers(source: string): number {
  return [...source.matchAll(/text-\[(?:12|13|14|16)px\]/g)].length;
}

export function measureSmallText(srcDir: string = SRC_DIR): Measurement {
  const m = emptyMeasurement(Object.keys(CEILINGS.smallText));
  for (const file of sourceFiles(srcDir)) {
    const source = readFileSync(file, "utf8");
    const rel = relative(srcDir, file);
    add(m, "underFloor", rel, belowFloor(source).length);
    add(m, "namedSizes", rel, namedSizeStragglers(source));
  }
  return m;
}

// ------------------------------------------------------------- lowering ceilings

export type CeilingChange = { id: string; key: string; from: number; to: number };

/**
 * Rewrites the CEILINGS block of this file's own source, lowering any ceiling whose
 * measured count is lower, and nothing else. A ceiling is never raised, a count
 * above its ceiling is left for a person to fix, and the one-line-per-ratchet
 * formatting is kept. Pure: takes the file text, returns the new text.
 */
export function lowerCeilingsInSource(
  source: string,
  measured: Record<string, Record<string, number>>,
): { text: string; changes: CeilingChange[] } {
  const start = source.indexOf("export const CEILINGS = {");
  const end = source.indexOf("} as const;", start);
  if (start < 0 || end < 0) throw new Error("Cannot find the CEILINGS block");
  const block = source.slice(start, end);
  const changes: CeilingChange[] = [];
  const rewritten = block.replace(/^(\s+)(\w+): \{ ([^}]*) \},$/gm, (line, indent: string, id: string, body: string) => {
    const counts = measured[id];
    if (!counts) return line;
    const pairs = body.split(",").map((pair) => pair.trim()).filter(Boolean);
    const next = pairs.map((pair) => {
      const [key, value] = pair.split(":").map((part) => part.trim()) as [string, string];
      const from = Number(value);
      const count = counts[key];
      if (count === undefined || !Number.isFinite(from) || count >= from) return `${key}: ${from}`;
      changes.push({ id, key, from, to: count });
      return `${key}: ${count}`;
    });
    return `${indent}${id}: { ${next.join(", ")} },`;
  });
  return { text: source.slice(0, start) + rewritten + source.slice(end), changes };
}

// ------------------------------------------------------------ 6. hand-rolled dialogs

// A dialog written by hand skips the focus trap, Escape stacking, reference-counted
// scroll lock and screen-reader isolation that AccessibleModal and ModalShell give
// every other dialog. Each marker below is a sign someone rebuilt them: the dialog
// roles, `aria-modal` as a JSX attribute (a leading space keeps selector strings
// such as '[aria-modal="true"]' out), or a full-screen `fixed inset-0` overlay.
const HAND_ROLLED_DIALOG = /\brole=["']?(?:alert)?dialog\b|\saria-modal=|\bfixed inset-0\b/g;

export function countHandRolledDialogs(source: string): number {
  return (source.match(HAND_ROLLED_DIALOG) ?? []).length;
}

export function measureHandRolledDialogs(srcDir: string = SRC_DIR): Measurement {
  const m = emptyMeasurement(Object.keys(CEILINGS.handRolledDialogs));
  const kit = join(srcDir, "components", "ui") + "/";
  for (const file of sourceFiles(srcDir)) {
    if (file.startsWith(kit)) continue;
    add(m, "overlays", relative(srcDir, file), countHandRolledDialogs(readFileSync(file, "utf8")));
  }
  return m;
}

// --------------------------------------------------------------------- registry

export const RATCHETS: ReadonlyArray<{
  id: RatchetId;
  title: string;
  /** What each key counts, in words, for the report. */
  keys: Record<string, string>;
  measure: (srcDir?: string) => Measurement;
}> = [
  {
    id: "rawFormControls",
    title: "Raw form controls (use Input, Textarea, Select inside a Field)",
    keys: { input: "<input> text-like", textarea: "<textarea>", select: "<select>" },
    measure: measureRawFormControls,
  },
  {
    id: "rawButtons",
    title: "Hand-written buttons (use Button or IconButton)",
    keys: { raw: "<button> outside the kit", legacy: "<button> on the old .btn classes" },
    measure: measureRawButtons,
  },
  {
    id: "hardCodedColours",
    title: "Hard-coded colour literals (use a token)",
    keys: { literals: "hex / rgb() / hsl() in components" },
    measure: measureColourLiterals,
  },
  {
    id: "offScale",
    title: "Off-scale radius and shadow (use the scale in docs/ux/radius-and-elevation.md)",
    keys: {
      shadow: "hand-typed shadow-[…]",
      radius: "hand-typed rounded-[…]",
      card16: "stock rounded-2xl (use rounded-card)",
      tile12: "stock rounded-xl (use rounded-tile)",
    },
    measure: measureOffScale,
  },
  {
    id: "smallText",
    title: "Small and hand-written text sizes (use a named size)",
    keys: { underFloor: "text-[Npx] under 12px", namedSizes: "text-[12|13|14|16px] where a name exists" },
    measure: measureSmallText,
  },
  {
    id: "handRolledDialogs",
    title: "Hand-rolled dialogs (use ModalShell or AccessibleModal from the kit)",
    keys: { overlays: "role=dialog, aria-modal or fixed inset-0 outside the kit" },
    measure: measureHandRolledDialogs,
  },
];

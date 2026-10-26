// Rebuilds .design-sync/.cache/compiled-tailwind.css — the `cfg.cssEntry` the
// design-sync converter scrapes for tokens + component CSS.
//
// WHY THIS EXISTS (not auto-derived): the app uses Tailwind v4 CSS-first @theme
// config (src/index.css), so brand classes like `bg-brand-yellow` don't exist
// as real CSS until Tailwind compiles them. The only source of the compiled
// output is a production build's dist/ CSS. This script concatenates the chunks
// the 33 synced UI-kit components actually need and strips the noise that leaks
// in from concatenating app-wide CSS.
//
// Run AFTER `npm run build`, from the repo root:  node .design-sync/build-css-entry.mjs
//
// Chunk selection (combined build nests the app under dist/app/assets/):
//   index-*.css        — Tailwind utilities + src/index.css @theme tokens (the big one)
//   skeleton-*.css     — Skeleton pulse animation
//   CustomerApp-*.css  — customer-portal.css tokens
//   PageHeader-*.css   — this is dayCard.css (the .wallet-* header LAYOUT; DayCard needs it)
// DELIBERATELY EXCLUDED:
//   TodayView-*.css    — dayStack.css (.wallet-appointment{position:absolute}); the stack's
//                        positioning, which would collapse a standalone DayCard preview.
//   BookingWizard-*.css — not a UI-kit concern.

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ASSETS = "dist/app/assets";
const OUT = ".design-sync/.cache/compiled-tailwind.css";

// Match hashed chunk names by prefix so the content hashes don't matter.
const WANT_PREFIXES = ["index-", "skeleton-", "CustomerApp-", "PageHeader-"];

const files = readdirSync(ASSETS).filter(
  (f) => f.endsWith(".css") && WANT_PREFIXES.some((p) => f.startsWith(p)),
);
// Deterministic order: tokens/utilities first, then the small layout/animation chunks.
const order = (f) => WANT_PREFIXES.findIndex((p) => f.startsWith(p));
files.sort((a, b) => order(a) - order(b));

if (!files.some((f) => f.startsWith("index-"))) {
  console.error(`✗ no index-*.css in ${ASSETS}. Run \`npm run build\` first.`);
  process.exit(1);
}

let css = files.map((f) => `/* --- ${f} --- */\n${readFileSync(join(ASSETS, f), "utf8")}`).join("\n");

// 1. Strip arbitrary-value font classes for families outside the kit's vocabulary
//    (DM Sans, Sora — used elsewhere in the app, never in src/components/ui).
//    Verified empty: grep -rn "DM Sans\|Sora" src/components/ui/*.{jsx,tsx}
const beforeFontRules = css.length;
css = css.replace(/\.font-\\\[[^{}]*\{font-family:(?:DM Sans|Sora)[^}]*\}/g, "");

// 2. Drop Caveat @font-face blocks — Caveat ships via cfg.extraFonts
//    (@fontsource/caveat/700.css), so these build-output subset copies are noise
//    and their /app/assets/ url()s would dangle.
css = css.replace(/@font-face\{[^}]*font-family:Caveat[^}]*\}/g, "");

// 3. Strip the dangling .text-[var(--sd-coral)] rule — --sd-* tokens were removed.
css = css.replace(/\.text-\\\[var\\\(--sd-coral\\\)\\\]\{[^}]*\}/g, "");

// 4. Rewrite web-root-absolute font urls to filesystem-relative paths the
//    converter can resolve (relative to this file's own directory, .design-sync/.cache/).
//    Files live in public/app/fonts/ ; /app/fonts/X -> ../../public/app/fonts/X
css = css.replace(/url\(\/app\/fonts\//g, "url(../../public/app/fonts/");

writeFileSync(OUT, css);
console.log(`✓ wrote ${OUT}`);
console.log(`  chunks: ${files.join(", ")}`);
console.log(`  size: ${(css.length / 1024).toFixed(1)} KiB (was ~${(beforeFontRules / 1024).toFixed(1)} KiB pre-clean)`);
const remainingUrls = [...css.matchAll(/url\(([^)]*fonts[^)]*)\)/g)].map((m) => m[1]);
const abs = remainingUrls.filter((u) => u.startsWith("/"));
if (abs.length) console.warn(`  ⚠ ${abs.length} font url()s still web-absolute (dangling): ${[...new Set(abs)].slice(0, 5).join(", ")}`);
else console.log(`  all ${new Set(remainingUrls).size} font url()s rewritten to filesystem-relative`);

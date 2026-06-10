#!/usr/bin/env node
// Debt #4 guard: a relative import written as "./foo.js" while the file on
// disk is foo.ts / foo.tsx hides what is and isn't typed. Vite's bundler
// resolution accepts the lie, so nothing else catches it. This script fails
// (exit 1) on any such import; `--fix` rewrites the specifier to be
// extensionless, which Vite, tsc (moduleResolution: bundler), and Vitest all
// resolve correctly.
//
// A blanket ESLint import/extensions "never" rule would also flag the
// hundreds of honest extension-ful imports of real .js/.jsx files that are
// this codebase's convention — so the guard targets only the lie.
//
// Wired into `npm run lint` so CI blocks regressions.
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), "..");
const SRC = join(ROOT, "src");
const FIX = process.argv.includes("--fix");

const SOURCE_RE = /\.(js|jsx|ts|tsx)$/;
// import ... from "./x.js" | export ... from "./x.js" | import("./x.js")
const SPECIFIER_RE = /(from\s+|import\s*\()\s*(["'])(\.[^"']+\.(?:js|jsx))\2/g;

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (SOURCE_RE.test(entry)) yield full;
  }
}

let violations = 0;
for (const file of walk(SRC)) {
  const original = readFileSync(file, "utf8");
  let changed = original;
  for (const match of original.matchAll(SPECIFIER_RE)) {
    const specifier = match[3];
    const base = resolve(dirname(file), specifier).replace(/\.(js|jsx)$/, "");
    const literalExists = existsSync(resolve(dirname(file), specifier));
    const tsExists = existsSync(`${base}.ts`) || existsSync(`${base}.tsx`);
    if (!literalExists && tsExists) {
      violations += 1;
      const bare = specifier.replace(/\.(js|jsx)$/, "");
      if (FIX) {
        changed = changed
          .replaceAll(`"${specifier}"`, `"${bare}"`)
          .replaceAll(`'${specifier}'`, `'${bare}'`);
      } else {
        console.error(
          `${file.slice(ROOT.length + 1)}: "${specifier}" resolves to a TypeScript file — drop the extension`,
        );
      }
    }
  }
  if (FIX && changed !== original) writeFileSync(file, changed);
}

if (violations > 0 && !FIX) {
  console.error(
    `\n${violations} import(s) claim .js/.jsx but resolve to .ts/.tsx. Run: node scripts/check-import-extensions.mjs --fix`,
  );
  process.exit(1);
}
if (FIX) console.log(`Rewrote ${violations} lying import specifier(s).`);

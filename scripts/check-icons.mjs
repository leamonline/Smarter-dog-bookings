#!/usr/bin/env node
/**
 * Proves the committed app-icon PNGs belong to the committed app-icon.svg.
 *
 * Nothing in the CI bar rasterises icons, so without this the SVG and the PNGs
 * can disagree and the deploy stays green: the manifest, the favicon and the
 * source all say "new brand" while every home screen keeps the old one. Worse,
 * /app/(fonts|icons|images)/ is served `immutable` for a year, so a stale icon
 * is pinned on devices that already fetched it.
 *
 * Four levels, weakest to strongest:
 *   1. the source SVG still hashes to what the lockfile recorded
 *   2. every committed PNG still hashes to what the lockfile recorded
 *   3. every committed PNG's IHDR still declares the recorded dimensions
 *   4. re-render and byte-compare — only when Chromium is present AND its build
 *      matches the one that wrote the lockfile
 *
 * Be precise about what each level buys. 1-3 are TAMPER-EVIDENT: they prove
 * these PNGs were recorded against this SVG by the generator, in one run, and
 * that nothing has been edited since. They do NOT prove the pixels depict the
 * SVG — only level 4 does that, because Chromium's output is byte-deterministic
 * for a fixed build. 1-3 need no dependencies and run in `npm run lint`;
 * 4 runs wherever a matching Chromium exists, which in practice means CI.
 *
 * Run: node scripts/check-icons.mjs   (or npm run check:icons)
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng, comparePixels } from './lib/png-compare.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lockPath = path.join(repoRoot, 'public', 'app', 'icons', 'icons.lock.json');

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const rel = (p) => path.relative(repoRoot, p);

const failures = [];
const fail = (msg) => failures.push(msg);

if (!fs.existsSync(lockPath)) {
  console.error(`\n✗ ${rel(lockPath)} is missing. Run \`npm run icons:build\`.\n`);
  process.exit(1);
}
const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));

// --- 1. source
const svgPath = path.join(repoRoot, lock.source.path);
if (!fs.existsSync(svgPath)) {
  fail(`source ${lock.source.path} is missing`);
} else {
  const actual = sha256(fs.readFileSync(svgPath));
  if (actual !== lock.source.sha256) {
    fail(
      `${lock.source.path} has changed since the icons were generated\n` +
        `      recorded ${lock.source.sha256.slice(0, 16)}…  actual ${actual.slice(0, 16)}…\n` +
        '      Run `npm run icons:build` and commit the regenerated PNGs.',
    );
  }
}

/** Width and height straight out of the PNG's IHDR (bytes 16-23). */
function pngSize(buf) {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

// --- 2 and 3. outputs
for (const out of lock.outputs) {
  const p = path.join(repoRoot, out.path);
  if (!fs.existsSync(p)) {
    fail(`${out.path} is missing — run \`npm run icons:build\``);
    continue;
  }
  const buf = fs.readFileSync(p);
  const actual = sha256(buf);
  if (actual !== out.sha256) {
    fail(
      `${out.path} does not match the lockfile\n` +
        `      recorded ${out.sha256.slice(0, 16)}…  actual ${actual.slice(0, 16)}…`,
    );
  }
  const size = pngSize(buf);
  if (!size) fail(`${out.path} is not a readable PNG`);
  else if (size.width !== out.width || size.height !== out.height) {
    fail(
      `${out.path} is ${size.width}x${size.height}, lockfile says ${out.width}x${out.height}`,
    );
  }
}

if (failures.length > 0) {
  console.error('\n✗ icon check failed:\n');
  for (const f of failures) console.error(`  • ${f}`);
  console.error('');
  process.exit(1);
}

console.log(
  `Icon provenance OK (${lock.outputs.length} PNGs against ${lock.source.path}, hashes and dimensions).`,
);

// --- 4. the real proof, when the renderer matches
const explicit =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || process.env.PW_CHROMIUM_PATH || null;
let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.log('  Skipped render proof: playwright is not installed here.');
  process.exit(0);
}
if (explicit && !fs.existsSync(explicit)) {
  console.log(`  Skipped render proof: ${explicit} does not exist.`);
  process.exit(0);
}

let browser;
try {
  browser = await chromium.launch(explicit ? { executablePath: explicit } : {});
} catch {
  console.log('  Skipped render proof: no usable Chromium on this machine.');
  process.exit(0);
}

try {
  const version = browser.version();
  // Chromium is byte-deterministic for a fixed build, so when the build matches
  // we can demand identical bytes. It usually will not match — CI installs
  // Playwright's own browser and a developer's machine may have another — and a
  // proof that skips whenever that happens is not a proof. So the fallback
  // decodes both images and compares pixels: anti-aliasing moves a few edge
  // pixels, the wrong artwork moves a great many.
  const exact = version === lock.renderer.chromium;
  const MAX_DIFFERING = 0.01; // 1% of pixels
  console.log(
    exact
      ? `  Chromium ${version} matches the lockfile — comparing bytes.`
      : `  Chromium ${version} here, lockfile recorded ${lock.renderer.chromium} — comparing pixels (tolerance ${MAX_DIFFERING * 100}%).`,
  );

  const svg = fs.readFileSync(svgPath, 'utf8');
  const html = (size) =>
    `<!doctype html><html><head><meta charset="utf-8"><style>
      html, body { margin: 0; padding: 0; background: transparent; }
      body { width: ${size}px; height: ${size}px; }
      svg { display: block; width: ${size}px; height: ${size}px; }
    </style></head><body>${svg}</body></html>`;

  const context = await browser.newContext();
  const mismatches = [];
  for (const out of lock.outputs) {
    const page = await context.newPage();
    await page.setViewportSize({ width: out.width, height: out.height });
    await page.setContent(html(out.width), { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    const buf = await page.locator('svg').screenshot({ omitBackground: true });
    await page.close();

    if (exact) {
      if (sha256(buf) !== out.sha256) mismatches.push(`${out.path} (bytes differ)`);
      continue;
    }
    const committed = decodePng(fs.readFileSync(path.join(repoRoot, out.path)));
    const rendered = decodePng(buf);
    const cmp = comparePixels(committed, rendered);
    if (!cmp.comparable) {
      mismatches.push(`${out.path} (${cmp.reason})`);
    } else if (cmp.ratio > MAX_DIFFERING) {
      mismatches.push(
        `${out.path} (${(cmp.ratio * 100).toFixed(2)}% of pixels differ — ${cmp.differing} of ${cmp.total})`,
      );
    }
  }

  if (mismatches.length > 0) {
    console.error(
      `\n✗ render proof failed on Chromium ${version} — these PNGs are not what this SVG renders to:\n`,
    );
    for (const m of mismatches) console.error(`  • ${m}`);
    console.error('\n  Run `npm run icons:build` and commit the result.\n');
    process.exit(1);
  }
  console.log(
    `  Render proof passed: all ${lock.outputs.length} PNGs re-render ${exact ? 'byte-identical' : 'within tolerance'} on Chromium ${version}.`,
  );
} finally {
  await browser?.close();
}

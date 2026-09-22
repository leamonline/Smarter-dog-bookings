// Generates public/app/icons/app-icon.svg — the white Smarter Dog silhouette on
// a full-bleed black square, and the single source render-icons.mjs rasterises.
//
// The dog is NOT hardcoded here. It is read from the approved master,
// public/app/logos/smarter-dog-silhouette.svg, and only translated and
// uniformly scaled. The master's proportions are frozen (see the asset README
// and the plan's Recorded decisions), so a non-uniform transform would be a
// defect; keeping the geometry in one place is what makes that checkable.
//
// Full-bleed is deliberate. render-icons.mjs screenshots with
// `omitBackground: true`, so any corner radius here becomes a transparent
// corner in every PNG — exactly what a maskable icon must not have. Phones
// apply their own mask, so the square wastes nothing.
//
// Run: node scripts/build-app-icon-svg.mjs  (or npm run icons:build)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const masterPath = path.join(repoRoot, 'public', 'app', 'logos', 'smarter-dog-silhouette.svg');
const outPath = path.join(repoRoot, 'public', 'app', 'icons', 'app-icon.svg');

const CANVAS = 1024;
// Maskable safe zone: keep the artwork inside the central 80% so a phone's own
// mask (circle, squircle or rounded square) cannot cut into the dog.
const SAFE = 0.8;

const master = fs.readFileSync(masterPath, 'utf8');

const viewBox = master.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
if (!viewBox) throw new Error(`no viewBox in ${path.relative(repoRoot, masterPath)}`);
const [, vbW, vbH] = viewBox.map(Number);

const d = master.match(/<path[^>]*\sd="([^"]+)"/);
if (!d) throw new Error(`no path data in ${path.relative(repoRoot, masterPath)}`);

// Uniform scale, centred. One factor for both axes — never two.
const scale = (CANVAS * SAFE) / Math.max(vbW, vbH);
const drawnW = vbW * scale;
const drawnH = vbH * scale;
const x = (CANVAS - drawnW) / 2;
const y = (CANVAS - drawnH) / 2;

const r = (n) => Number(n.toFixed(4));

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS} ${CANVAS}">
  <title>Smarter Dog</title>
  <rect width="${CANVAS}" height="${CANVAS}" fill="#000000"/>
  <g transform="translate(${r(x)} ${r(y)}) scale(${r(scale)})">
    <path fill="#ffffff" d="${d[1]}"/>
  </g>
</svg>
`;

fs.writeFileSync(outPath, svg);
console.log(
  `wrote ${path.relative(repoRoot, outPath)} (${svg.length} bytes) — dog ${r(drawnW)}x${r(drawnH)} at ${r(SAFE * 100)}% of ${CANVAS}`,
);

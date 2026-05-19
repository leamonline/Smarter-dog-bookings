// Generates public/icons/app-icon.svg with the dog silhouette embedded as a
// base64 data URL so the SVG renders without depending on relative paths.
// Run: node scripts/build-app-icon-svg.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const silhouettePath = path.join(repoRoot, 'public', 'images', 'dog-silhouette.png');
const outPath = path.join(repoRoot, 'public', 'icons', 'app-icon.svg');

const dogB64 = fs.readFileSync(silhouettePath).toString('base64');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <rect x="0" y="0" width="1024" height="1024" rx="180" ry="180" fill="#00B8E0"/>

  <text x="490" y="345"
        text-anchor="middle"
        font-family="'Quicksand', 'Nunito', 'Avenir Next', 'Trebuchet MS', system-ui, sans-serif"
        font-weight="700"
        font-size="190"
        fill="#000000"
        letter-spacing="-2">Smarter</text>

  <g>
    <text x="380" y="635"
          text-anchor="middle"
          font-family="'Quicksand', 'Nunito', 'Avenir Next', 'Trebuchet MS', system-ui, sans-serif"
          font-weight="700"
          font-size="240"
          fill="#F5C518">dog</text>
    <g transform="translate(378 555) scale(0.40)" fill="#00B8E0">
      <ellipse cx="0" cy="55" rx="78" ry="58"/>
      <ellipse cx="-70" cy="-15" rx="28" ry="36" transform="rotate(-22 -70 -15)"/>
      <ellipse cx="-26" cy="-58" rx="26" ry="34"/>
      <ellipse cx="26"  cy="-58" rx="26" ry="34"/>
      <ellipse cx="70"  cy="-15" rx="28" ry="36" transform="rotate(22 70 -15)"/>
    </g>
  </g>

  <image x="620" y="600" width="370" height="370" preserveAspectRatio="xMidYMid meet"
    href="data:image/png;base64,${dogB64}" />
</svg>
`;

fs.writeFileSync(outPath, svg);
console.log(`wrote ${path.relative(repoRoot, outPath)} (${svg.length} bytes)`);

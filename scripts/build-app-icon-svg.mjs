// Generates public/icons/app-icon.svg — a calendar-with-paw icon on deep blue.
// Run: node scripts/build-app-icon-svg.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const outPath = path.join(repoRoot, 'public', 'icons', 'app-icon.svg');

const BLUE_DARK = '#1532B0';
const YELLOW = '#F5B81D';
const YELLOW_DARK = '#D69A0C';
const PAPER = '#FFFFFF';
const PAPER_SHADOW = '#C8CCD6';
const PAPER_DEEP_SHADOW = '#9097A8';
const RING = '#1A1A1A';
const RING_HIGHLIGHT = '#4A4A4A';

const padX = 160;
const paperX = padX;
const paperY = 240;
const paperW = 1024 - padX * 2;   // 704
const paperH = 660;
const paperR = 44;
const headerH = 170;

// Spiral ring loops — black "U" shapes that arch over the page top.
const ringCount = 4;
const ringWidth = 56;             // outer width of the ring loop
const ringHeight = 150;           // total visible height (above page top)
const ringSpacing = paperW / (ringCount + 1);
const ringTopY = paperY - 100;    // top of the loop
const ringPostY = paperY + 60;    // bottom of the post (inside paper)

let rings = '';
for (let i = 1; i <= ringCount; i++) {
  const cx = paperX + ringSpacing * i;
  const x = cx - ringWidth / 2;
  rings += `
  <g>
    <!-- Drop shadow -->
    <rect x="${x + 3}" y="${ringTopY + 8}" width="${ringWidth}" height="${ringPostY - ringTopY}"
          rx="${ringWidth / 2}" fill="#0A1C70" opacity="0.55"/>
    <!-- Ring body -->
    <rect x="${x}" y="${ringTopY}" width="${ringWidth}" height="${ringPostY - ringTopY}"
          rx="${ringWidth / 2}" fill="${RING}"/>
    <!-- Specular highlight -->
    <rect x="${cx + ringWidth / 2 - 12}" y="${ringTopY + 14}" width="6" height="${(ringPostY - ringTopY) * 0.55}"
          rx="3" fill="${RING_HIGHLIGHT}"/>
    <!-- Inner highlight on top loop -->
    <ellipse cx="${cx}" cy="${ringTopY + 12}" rx="${ringWidth / 2 - 8}" ry="6" fill="#5A5A5A" opacity="0.6"/>
  </g>`;
}

// Paw print — debossed look: 1 pad + 4 toes
const pawCx = 512;
const pawCy = paperY + headerH + (paperH - headerH) / 2 + 28;

function pawShapes(scale, dx, dy, fill, opacity = 1) {
  return `
  <g transform="translate(${pawCx + dx} ${pawCy + dy}) scale(${scale})" fill="${fill}" opacity="${opacity}">
    <ellipse cx="0" cy="78" rx="118" ry="92"/>
    <ellipse cx="-122" cy="-24" rx="44" ry="58" transform="rotate(-22 -122 -24)"/>
    <ellipse cx="-42"  cy="-94" rx="40" ry="56"/>
    <ellipse cx="42"   cy="-94" rx="40" ry="56"/>
    <ellipse cx="122"  cy="-24" rx="44" ry="58" transform="rotate(22 122 -24)"/>
  </g>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <linearGradient id="paperGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFFFFF"/>
      <stop offset="1" stop-color="#EEF1F6"/>
    </linearGradient>
    <linearGradient id="yellowGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFCE36"/>
      <stop offset="1" stop-color="${YELLOW_DARK}"/>
    </linearGradient>
    <linearGradient id="blueGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#2A52F0"/>
      <stop offset="1" stop-color="#1430B0"/>
    </linearGradient>
    <radialGradient id="pawInset" cx="0.5" cy="0.4" r="0.7">
      <stop offset="0" stop-color="#A9AEBC"/>
      <stop offset="0.6" stop-color="#C5C9D2"/>
      <stop offset="1" stop-color="#E6E8EE"/>
    </radialGradient>
    <clipPath id="paperClip">
      <rect x="${paperX}" y="${paperY}" width="${paperW}" height="${paperH}" rx="${paperR}" ry="${paperR}"/>
    </clipPath>
  </defs>

  <!-- Deep-blue rounded-square background -->
  <rect x="0" y="0" width="1024" height="1024" rx="180" ry="180" fill="url(#blueGrad)"/>

  <!-- Paper drop shadow -->
  <rect x="${paperX - 6}" y="${paperY + 18}" width="${paperW + 12}" height="${paperH}" rx="${paperR}" ry="${paperR}"
        fill="#0A1C70" opacity="0.55"/>

  <g clip-path="url(#paperClip)">
    <!-- White paper body -->
    <rect x="${paperX}" y="${paperY}" width="${paperW}" height="${paperH}" fill="url(#paperGrad)"/>

    <!-- Yellow top band -->
    <rect x="${paperX}" y="${paperY}" width="${paperW}" height="${headerH}" fill="url(#yellowGrad)"/>
    <!-- Shadow seam below the yellow band -->
    <rect x="${paperX}" y="${paperY + headerH}" width="${paperW}" height="8" fill="${YELLOW_DARK}" opacity="0.35"/>
    <rect x="${paperX}" y="${paperY + headerH + 8}" width="${paperW}" height="14" fill="#000" opacity="0.06"/>

    <!-- Debossed paw print: dark "depth" shape, then paper-colored hollow that sits inside it, then highlight rim -->
    ${pawShapes(1.0, 4, 6, PAPER_DEEP_SHADOW, 0.55)}
    ${pawShapes(0.96, 0, 0, 'url(#pawInset)', 1)}
    ${pawShapes(0.92, -3, -5, '#F5F6FA', 0.9)}

    <!-- Page curl: the underside of the curling paper at the bottom-right corner -->
    <!-- Shadow under the curl -->
    <path d="
      M ${paperX + paperW - 165} ${paperY + paperH}
      Q ${paperX + paperW - 70} ${paperY + paperH - 30}
        ${paperX + paperW} ${paperY + paperH - 165}
      L ${paperX + paperW} ${paperY + paperH}
      Z"
      fill="${PAPER_DEEP_SHADOW}" opacity="0.55"/>
    <!-- The curled paper itself -->
    <path d="
      M ${paperX + paperW - 150} ${paperY + paperH}
      Q ${paperX + paperW - 50} ${paperY + paperH - 60}
        ${paperX + paperW} ${paperY + paperH - 150}
      Q ${paperX + paperW - 40} ${paperY + paperH - 100}
        ${paperX + paperW - 150} ${paperY + paperH}
      Z"
      fill="#F5F6FA"/>
  </g>

  <!-- Spiral rings on top -->
  ${rings}
</svg>
`;

fs.writeFileSync(outPath, svg);
console.log(`wrote ${path.relative(repoRoot, outPath)} (${svg.length} bytes)`);

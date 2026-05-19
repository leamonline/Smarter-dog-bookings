// Generates public/icons/app-icon.svg — clean flat calendar-with-paw.
//
// Design: royal-blue rounded square, white calendar page with a yellow
// header band, four clean hole-punch circles on the band (no metal posts),
// a bold solid paw on the page, and a small flat fold corner. Aims to read
// at favicon size and feel intentional rather than overworked.
//
// Run: node scripts/build-app-icon-svg.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const outPath = path.join(repoRoot, 'public', 'icons', 'app-icon.svg');

// Canvas + paper geometry (1024x1024 viewBox)
const W = 1024;
const padX = 140;
const paperX = padX;
const paperY = 210;
const paperW = W - padX * 2;   // 744
const paperH = 720;
const paperR = 48;
const headerH = 184;

// Hole-punch circles (no posts, no metal — just clean dark holes on the band)
const holeCount = 4;
const holeSpacing = paperW / (holeCount + 1);
const holeCy = paperY + headerH / 2 + 4;
const holeR = 30;

let holes = '';
for (let i = 1; i <= holeCount; i++) {
  const cx = paperX + holeSpacing * i;
  holes += `
    <g>
      <!-- Soft cast shadow inside the hole -->
      <ellipse cx="${cx}" cy="${holeCy + 4}" rx="${holeR + 1}" ry="${holeR + 1}" fill="#5C3F02" opacity="0.55"/>
      <!-- Hole interior -->
      <circle cx="${cx}" cy="${holeCy}" r="${holeR}" fill="#1F1206"/>
      <!-- Subtle top rim highlight (paper edge catching light) -->
      <path d="M ${cx - holeR + 4} ${holeCy - 4}
               A ${holeR - 4} ${holeR - 4} 0 0 1 ${cx + holeR - 4} ${holeCy - 4}"
            fill="none" stroke="#FFFFFF" stroke-width="2" opacity="0.45" stroke-linecap="round"/>
    </g>`;
}

// Paw geometry — solid, confident, centered in the white area
const pawCx = W / 2;
const pawCy = paperY + headerH + (paperH - headerH) / 2 + 24;
const pawColor = '#1F3DDD';   // matches brand royal blue

// Page curl — small flat fold in the bottom-right corner
const foldL = 140;
const foldX = paperX + paperW;
const foldY = paperY + paperH;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${W}" width="${W}" height="${W}">
  <defs>
    <linearGradient id="yellowGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFCC42"/>
      <stop offset="1" stop-color="#F0AE10"/>
    </linearGradient>
    <linearGradient id="foldGrad" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0" stop-color="#C7CCD8"/>
      <stop offset="1" stop-color="#EEF0F5"/>
    </linearGradient>
    <clipPath id="paperClip">
      <path d="
        M ${paperX + paperR} ${paperY}
        H ${paperX + paperW - paperR}
        Q ${paperX + paperW} ${paperY} ${paperX + paperW} ${paperY + paperR}
        V ${foldY - foldL}
        L ${foldX - foldL} ${foldY}
        H ${paperX + paperR}
        Q ${paperX} ${foldY} ${paperX} ${foldY - paperR}
        V ${paperY + paperR}
        Q ${paperX} ${paperY} ${paperX + paperR} ${paperY}
        Z"/>
    </clipPath>
  </defs>

  <!-- Royal-blue background, iOS-safe rounded square -->
  <rect x="0" y="0" width="${W}" height="${W}" rx="180" ry="180" fill="#1F3DDD"/>

  <!-- Soft drop shadow under the paper -->
  <path d="
    M ${paperX + paperR} ${paperY + 22}
    H ${paperX + paperW - paperR}
    Q ${paperX + paperW + 4} ${paperY + 22} ${paperX + paperW + 4} ${paperY + paperR + 22}
    V ${foldY - foldL + 22}
    L ${foldX - foldL} ${foldY + 22}
    H ${paperX + paperR}
    Q ${paperX - 4} ${foldY + 22} ${paperX - 4} ${foldY - paperR + 22}
    V ${paperY + paperR + 22}
    Q ${paperX - 4} ${paperY + 22} ${paperX + paperR} ${paperY + 22} Z"
    fill="#0A1C70" opacity="0.42"/>

  <g clip-path="url(#paperClip)">
    <!-- White paper body -->
    <rect x="${paperX}" y="${paperY}" width="${paperW}" height="${paperH}" fill="#FFFFFF"/>

    <!-- Yellow header band -->
    <rect x="${paperX}" y="${paperY}" width="${paperW}" height="${headerH}" fill="url(#yellowGrad)"/>
    <!-- Crisp separator under the band -->
    <rect x="${paperX}" y="${paperY + headerH}" width="${paperW}" height="3" fill="#A77807" opacity="0.5"/>

    <!-- Hole-punches -->
    ${holes}

    <!-- Bold royal-blue paw print -->
    <g transform="translate(${pawCx} ${pawCy})" fill="${pawColor}">
      <!-- Main pad -->
      <ellipse cx="0" cy="92" rx="158" ry="126"/>
      <!-- Outer side toes -->
      <ellipse cx="-168" cy="-30" rx="62" ry="84" transform="rotate(-22 -168 -30)"/>
      <ellipse cx="168"  cy="-30" rx="62" ry="84" transform="rotate(22 168 -30)"/>
      <!-- Inner top toes -->
      <ellipse cx="-60" cy="-130" rx="58" ry="78"/>
      <ellipse cx="60"  cy="-130" rx="58" ry="78"/>
    </g>
  </g>

  <!-- Page-fold triangle (visible because the clip path cut the corner) -->
  <!-- Paper back -->
  <path d="
    M ${foldX - foldL} ${foldY}
    L ${foldX} ${foldY - foldL}
    L ${foldX} ${foldY}
    Z" fill="url(#foldGrad)"/>
  <!-- Fold edge shadow -->
  <line x1="${foldX - foldL}" y1="${foldY}" x2="${foldX}" y2="${foldY - foldL}"
        stroke="#8C92A2" stroke-width="3" stroke-linecap="round" opacity="0.7"/>
  <!-- Tiny inner highlight along the fold for definition -->
  <line x1="${foldX - foldL + 6}" y1="${foldY - 4}" x2="${foldX - 4}" y2="${foldY - foldL + 6}"
        stroke="#FFFFFF" stroke-width="1.5" stroke-linecap="round" opacity="0.55"/>
</svg>
`;

fs.writeFileSync(outPath, svg);
console.log(`wrote ${path.relative(repoRoot, outPath)} (${svg.length} bytes)`);

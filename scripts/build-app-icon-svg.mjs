// Generates public/icons/app-icon.svg — a calendar-with-paw icon on deep blue.
// Run: node scripts/build-app-icon-svg.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const outPath = path.join(repoRoot, 'public', 'icons', 'app-icon.svg');

const padX = 150;
const paperX = padX;
const paperY = 270;
const paperW = 1024 - padX * 2;   // 724
const paperH = 660;
const paperR = 46;
const headerH = 180;

// Spiral binding rings — taller, more loop-like, with visible eyelet holes through the yellow band.
const ringCount = 4;
const ringW = 64;
const ringTop = paperY - 140;
const ringPostBottom = paperY + 22;
const ringSpacing = paperW / (ringCount + 1);

let rings = '';
for (let i = 1; i <= ringCount; i++) {
  const cx = paperX + ringSpacing * i;
  const x = cx - ringW / 2;
  rings += `
  <g>
    <!-- Drop shadow on the paper below the ring -->
    <ellipse cx="${cx + 4}" cy="${ringPostBottom + 12}" rx="${ringW / 2 + 4}" ry="10" fill="#0A1C70" opacity="0.35"/>

    <!-- Punched eyelet hole through the yellow header band -->
    <ellipse cx="${cx}" cy="${paperY + 78}" rx="${ringW / 2 - 12}" ry="${ringW / 2 - 18}" fill="#8A5E03"/>
    <ellipse cx="${cx}" cy="${paperY + 76}" rx="${ringW / 2 - 16}" ry="${ringW / 2 - 22}" fill="#3A2602"/>

    <!-- The metal ring loop body. A tall vertical pill, rounded at top and bottom. -->
    <rect x="${x}" y="${ringTop}" width="${ringW}" height="${ringPostBottom - ringTop}" rx="${ringW / 2}" ry="${ringW / 2}"
          fill="#1A1A1A"/>

    <!-- Inner shading to suggest the hollow loop / 3D form (darker centre) -->
    <rect x="${x + 16}" y="${ringTop + 16}" width="${ringW - 32}" height="${ringPostBottom - ringTop - 50}"
          rx="${(ringW - 32) / 2}" fill="#000" opacity="0.7"/>

    <!-- Right-edge specular highlight -->
    <rect x="${cx + ringW / 2 - 12}" y="${ringTop + 18}" width="6" height="${(ringPostBottom - ringTop) * 0.6}"
          rx="3" fill="#5A5A5A"/>
    <!-- Top cap highlight -->
    <ellipse cx="${cx - 6}" cy="${ringTop + 14}" rx="${ringW / 2 - 18}" ry="7" fill="#7A7A7A" opacity="0.95"/>
    <!-- Bright top sliver -->
    <ellipse cx="${cx - 8}" cy="${ringTop + 10}" rx="${ringW / 2 - 26}" ry="3" fill="#B5B5B5" opacity="0.9"/>
    <!-- Dark base shadow where ring enters page -->
    <ellipse cx="${cx}" cy="${ringPostBottom - 2}" rx="${ringW / 2 - 4}" ry="5" fill="#000" opacity="0.7"/>
  </g>`;
}

// Paw print
const pawCx = 512;
const pawCy = paperY + headerH + (paperH - headerH) / 2 + 30;

function pawShapes(scale, dx, dy, fill, opacity = 1) {
  return `
  <g transform="translate(${pawCx + dx} ${pawCy + dy}) scale(${scale})" fill="${fill}" opacity="${opacity}">
    <ellipse cx="0" cy="80" rx="128" ry="100"/>
    <ellipse cx="-132" cy="-22" rx="48" ry="62" transform="rotate(-22 -132 -22)"/>
    <ellipse cx="-46"  cy="-104" rx="44" ry="60"/>
    <ellipse cx="46"   cy="-104" rx="44" ry="60"/>
    <ellipse cx="132"  cy="-22" rx="48" ry="62" transform="rotate(22 132 -22)"/>
  </g>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <linearGradient id="paperGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFFFFF"/>
      <stop offset="1" stop-color="#ECEFF4"/>
    </linearGradient>
    <linearGradient id="paperBack" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0" stop-color="#C4C9D2"/>
      <stop offset="0.4" stop-color="#E2E6ED"/>
      <stop offset="1" stop-color="#F8F9FC"/>
    </linearGradient>
    <linearGradient id="yellowGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFD24A"/>
      <stop offset="0.5" stop-color="#F5B81D"/>
      <stop offset="1" stop-color="#C98E08"/>
    </linearGradient>
    <linearGradient id="blueGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#2E58F5"/>
      <stop offset="1" stop-color="#142EB0"/>
    </linearGradient>
    <radialGradient id="pawInset" cx="0.35" cy="0.3" r="0.95">
      <stop offset="0" stop-color="#7E869B"/>
      <stop offset="0.35" stop-color="#A6ACBC"/>
      <stop offset="0.75" stop-color="#D4D8E0"/>
      <stop offset="1" stop-color="#F0F2F6"/>
    </radialGradient>
    <linearGradient id="pawRim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="1"/>
      <stop offset="0.35" stop-color="#FFFFFF" stop-opacity="0.4"/>
      <stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
    </linearGradient>
    <clipPath id="paperClip">
      <rect x="${paperX}" y="${paperY}" width="${paperW}" height="${paperH}" rx="${paperR}" ry="${paperR}"/>
    </clipPath>
  </defs>

  <!-- Deep-blue rounded-square background -->
  <rect x="0" y="0" width="1024" height="1024" rx="180" ry="180" fill="url(#blueGrad)"/>

  <!-- Paper drop shadow -->
  <rect x="${paperX - 8}" y="${paperY + 26}" width="${paperW + 16}" height="${paperH}" rx="${paperR}" ry="${paperR}"
        fill="#0A1C70" opacity="0.55"/>
  <!-- Sliver of a second page underneath, suggesting a small stack -->
  <rect x="${paperX + 6}" y="${paperY + 12}" width="${paperW - 12}" height="${paperH}" rx="${paperR}" ry="${paperR}"
        fill="#DCE0E9"/>

  <g clip-path="url(#paperClip)">
    <!-- White paper body -->
    <rect x="${paperX}" y="${paperY}" width="${paperW}" height="${paperH}" fill="url(#paperGrad)"/>

    <!-- Yellow top band -->
    <rect x="${paperX}" y="${paperY}" width="${paperW}" height="${headerH}" fill="url(#yellowGrad)"/>
    <!-- Shadow seam below the yellow band onto the white -->
    <rect x="${paperX}" y="${paperY + headerH}" width="${paperW}" height="6" fill="#A37207" opacity="0.55"/>
    <rect x="${paperX}" y="${paperY + headerH + 6}" width="${paperW}" height="24" fill="#000" opacity="0.08"/>

    <!-- Debossed paw print: deep shadow → mid inset gradient → bright rim -->
    ${pawShapes(1.0, 12, 16, '#3F465A', 0.35)}
    ${pawShapes(1.0, 5, 7, '#7E869B', 0.55)}
    ${pawShapes(0.97, 0, 0, 'url(#pawInset)', 1)}
    ${pawShapes(0.92, -4, -6, '#F4F5F8', 1)}
    ${pawShapes(0.95, -3, -10, 'url(#pawRim)', 0.85)}
  </g>

  <!-- Page curl (outside the paper clip so it can extend past the rounded corner) -->
  <!-- Shadow cast below the lifted corner -->
  <path d="
    M ${paperX + paperW - 260} ${paperY + paperH + 6}
    Q ${paperX + paperW - 100} ${paperY + paperH + 14}
      ${paperX + paperW + 8} ${paperY + paperH - 248}
    L ${paperX + paperW + 22} ${paperY + paperH - 244}
    Q ${paperX + paperW - 80} ${paperY + paperH + 32}
      ${paperX + paperW - 270} ${paperY + paperH + 24}
    Z" fill="#0A1C70" opacity="0.4"/>

  <!-- The peeled corner itself: triangle from bottom-edge to right-edge,
       with a curved inner edge representing the rolled paper. -->
  <path d="
    M ${paperX + paperW - 240} ${paperY + paperH - 6}
    L ${paperX + paperW - 6} ${paperY + paperH - 240}
    Q ${paperX + paperW - 30} ${paperY + paperH - 130}
      ${paperX + paperW - 110} ${paperY + paperH - 60}
    Q ${paperX + paperW - 180} ${paperY + paperH - 22}
      ${paperX + paperW - 240} ${paperY + paperH - 6}
    Z" fill="url(#paperBack)"/>

  <!-- Crease/fold-line shadow -->
  <path d="
    M ${paperX + paperW - 240} ${paperY + paperH - 6}
    L ${paperX + paperW - 6} ${paperY + paperH - 240}"
    stroke="#9097A8" stroke-width="3" fill="none" opacity="0.55"/>

  <!-- Spiral rings on top -->
  ${rings}
</svg>
`;

fs.writeFileSync(outPath, svg);
console.log(`wrote ${path.relative(repoRoot, outPath)} (${svg.length} bytes)`);

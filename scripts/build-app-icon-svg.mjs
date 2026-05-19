// Generates public/icons/app-icon.svg — calendar-with-paw icon, modeled on
// the user-supplied 3D-render reference (flat royal-blue background, white
// calendar paper, yellow header, four black spiral rings with paper-rim
// eyelets, debossed paw, large peeled bottom-right corner).
//
// Run: node scripts/build-app-icon-svg.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const outPath = path.join(repoRoot, 'public', 'icons', 'app-icon.svg');

// Geometry (1024x1024 viewBox)
const padX = 160;
const paperX = padX;
const paperY = 250;
const paperW = 1024 - padX * 2;   // 704
const paperH = 680;
const paperR = 36;
const headerH = 200;

// Spiral binding rings
const ringCount = 4;
const ringW = 82;                 // outer width of the eyelet
const ringPostW = 54;             // black metal post width
const ringTop = paperY - 114;     // top of the post above the page
const ringPostBottom = paperY + 78;
const ringSpacing = paperW / (ringCount + 1);

let rings = '';
for (let i = 1; i <= ringCount; i++) {
  const cx = paperX + ringSpacing * i;
  const eyeletCy = paperY + 100;
  rings += `
  <g>
    <!-- Soft drop shadow from the post/eyelet onto the yellow band -->
    <ellipse cx="${cx + 6}" cy="${eyeletCy + 12}" rx="${ringW / 2 + 2}" ry="9" fill="#7A5400" opacity="0.55"/>

    <!-- Eyelet: white paper rim peeking out around the post -->
    <ellipse cx="${cx}" cy="${eyeletCy}" rx="${ringW / 2}" ry="${ringW / 2 - 8}" fill="#FFFFFF"/>
    <!-- Subtle paper-shadow inside the rim -->
    <ellipse cx="${cx - 1}" cy="${eyeletCy - 1}" rx="${ringW / 2 - 3}" ry="${ringW / 2 - 11}" fill="#E2E5EC"/>
    <!-- Dark hole interior (the punch-through visible behind the post) -->
    <ellipse cx="${cx}" cy="${eyeletCy + 2}" rx="${ringW / 2 - 10}" ry="${ringW / 2 - 16}" fill="#1A1306"/>

    <!-- The black metal post — vertical capsule ending inside the eyelet -->
    <rect x="${cx - ringPostW / 2}" y="${ringTop}"
          width="${ringPostW}" height="${eyeletCy - ringTop + 6}"
          rx="${ringPostW / 2}" ry="${ringPostW / 2}"
          fill="#181818"/>

    <!-- Right-edge specular highlight on the post -->
    <rect x="${cx + ringPostW / 2 - 12}" y="${ringTop + 16}" width="6" height="${(eyeletCy - ringTop) * 0.6}"
          rx="3" fill="#5E5E5E"/>
    <!-- Top cap highlight -->
    <ellipse cx="${cx - 4}" cy="${ringTop + 14}" rx="${ringPostW / 2 - 10}" ry="6" fill="#7A7A7A"/>
    <ellipse cx="${cx - 6}" cy="${ringTop + 10}" rx="${ringPostW / 2 - 18}" ry="3" fill="#B8B8B8"/>
    <!-- Left-edge subtle shadow on the post -->
    <rect x="${cx - ringPostW / 2 + 3}" y="${ringTop + 18}" width="3" height="${(eyeletCy - ringTop) * 0.6}"
          rx="1.5" fill="#000" opacity="0.5"/>
    <!-- Dark line where the post meets the eyelet (settles it into the hole) -->
    <ellipse cx="${cx}" cy="${eyeletCy - 2}" rx="${ringPostW / 2 - 1}" ry="5" fill="#000" opacity="0.7"/>
  </g>`;
}

// Paw — five debossed shapes.
const pawCx = 512;
const pawCy = paperY + headerH + (paperH - headerH) / 2 + 16;

function pawShapes(scale, dx, dy, fill, opacity = 1) {
  return `
  <g transform="translate(${pawCx + dx} ${pawCy + dy}) scale(${scale})" fill="${fill}" opacity="${opacity}">
    <ellipse cx="0" cy="78" rx="130" ry="106"/>
    <ellipse cx="-138" cy="-26" rx="50" ry="64" transform="rotate(-22 -138 -26)"/>
    <ellipse cx="-48"  cy="-108" rx="46" ry="62"/>
    <ellipse cx="48"   cy="-108" rx="46" ry="62"/>
    <ellipse cx="138"  cy="-26" rx="50" ry="64" transform="rotate(22 138 -26)"/>
  </g>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <!-- Paw "recess floor" — softly lit, lighter at bottom -->
    <linearGradient id="pawFloor" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#DDE1E9"/>
      <stop offset="1" stop-color="#F6F7FA"/>
    </linearGradient>
    <!-- Paper backside gradient for the page curl -->
    <linearGradient id="paperBack" x1="0" y1="0" x2="1" y2="-1">
      <stop offset="0" stop-color="#B7BCC9"/>
      <stop offset="0.5" stop-color="#E2E5EC"/>
      <stop offset="1" stop-color="#F8F9FC"/>
    </linearGradient>
    <linearGradient id="yellowGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFCC42"/>
      <stop offset="0.5" stop-color="#F2B41C"/>
      <stop offset="1" stop-color="#D89A06"/>
    </linearGradient>
    <clipPath id="paperClip">
      <rect x="${paperX}" y="${paperY}" width="${paperW}" height="${paperH}" rx="${paperR}" ry="${paperR}"/>
    </clipPath>
  </defs>

  <!-- Flat royal-blue background — matches the reference render -->
  <rect x="0" y="0" width="1024" height="1024" rx="180" ry="180" fill="#1F3DDD"/>

  <!-- Paper drop shadow (soft, below + slightly right) -->
  <rect x="${paperX - 6}" y="${paperY + 26}" width="${paperW + 12}" height="${paperH}" rx="${paperR}" ry="${paperR}"
        fill="#0A1C70" opacity="0.5"/>

  <!-- Three sheets stacked underneath the top page, peeking out at the bottom edge.
       Bigger Y offsets so each layer is clearly visible as a sliver. -->
  <rect x="${paperX + 26}" y="${paperY + 32}" width="${paperW - 52}" height="${paperH}" rx="${paperR - 10}" ry="${paperR - 10}"
        fill="#A8AEBC"/>
  <rect x="${paperX + 18}" y="${paperY + 22}" width="${paperW - 36}" height="${paperH}" rx="${paperR - 8}" ry="${paperR - 8}"
        fill="#C8CCD7"/>
  <rect x="${paperX + 10}" y="${paperY + 12}" width="${paperW - 20}" height="${paperH}" rx="${paperR - 6}" ry="${paperR - 6}"
        fill="#E4E7EE"/>

  <g clip-path="url(#paperClip)">
    <!-- White paper body -->
    <rect x="${paperX}" y="${paperY}" width="${paperW}" height="${paperH}" fill="#FFFFFF"/>

    <!-- Yellow top band -->
    <rect x="${paperX}" y="${paperY}" width="${paperW}" height="${headerH}" fill="url(#yellowGrad)"/>
    <!-- Soft shadow line where the yellow band meets the white paper -->
    <rect x="${paperX}" y="${paperY + headerH}" width="${paperW}" height="4" fill="#A77807" opacity="0.45"/>
    <rect x="${paperX}" y="${paperY + headerH + 4}" width="${paperW}" height="26" fill="#000" opacity="0.05"/>

    <!-- Debossed paw — clean two-layer approach:
           1. Main shape filled solid mid-gray = the "recess wall in shadow"
           2. Slightly smaller shape on top, offset DOWN, filled with light gradient
              = the "recess floor" visible through the opening of the wall.
           The dark crescent left at the top is the deboss shadow. -->
    ${pawShapes(1.0, 0, 0, '#A1A8B9', 1)}
    ${pawShapes(0.94, 0, 10, 'url(#pawFloor)', 1)}
  </g>

  <!-- Page curl (drawn outside the clip so it overlaps the rounded corner). -->
  <!-- Soft shadow cast on the page below the lifted corner -->
  <path d="
    M ${paperX + paperW - 230} ${paperY + paperH + 2}
    Q ${paperX + paperW - 80} ${paperY + paperH + 22}
      ${paperX + paperW + 4} ${paperY + paperH - 218}
    L ${paperX + paperW + 22} ${paperY + paperH - 214}
    Q ${paperX + paperW - 50} ${paperY + paperH + 38}
      ${paperX + paperW - 240} ${paperY + paperH + 18}
    Z" fill="#0A1C70" opacity="0.4"/>

  <!-- The exposed back of the peeled corner -->
  <path d="
    M ${paperX + paperW - 210} ${paperY + paperH - 2}
    L ${paperX + paperW - 2} ${paperY + paperH - 210}
    Q ${paperX + paperW - 16} ${paperY + paperH - 104}
      ${paperX + paperW - 92} ${paperY + paperH - 50}
    Q ${paperX + paperW - 154} ${paperY + paperH - 18}
      ${paperX + paperW - 210} ${paperY + paperH - 2}
    Z" fill="url(#paperBack)"/>

  <!-- Inner crease highlight along the underside of the curl -->
  <path d="
    M ${paperX + paperW - 190} ${paperY + paperH - 10}
    Q ${paperX + paperW - 60} ${paperY + paperH - 22}
      ${paperX + paperW - 12} ${paperY + paperH - 190}"
    stroke="#FFFFFF" stroke-width="2" fill="none" opacity="0.55"/>

  <!-- Fold crease shadow along the hypotenuse -->
  <path d="
    M ${paperX + paperW - 210} ${paperY + paperH - 2}
    L ${paperX + paperW - 2} ${paperY + paperH - 210}"
    stroke="#7C8294" stroke-width="2.5" fill="none" opacity="0.65"/>

  <!-- Rings on top -->
  ${rings}
</svg>
`;

fs.writeFileSync(outPath, svg);
console.log(`wrote ${path.relative(repoRoot, outPath)} (${svg.length} bytes)`);

// Generates public/app/icons/app-icon.svg — calendar-with-paw icon, hand-tuned
// from the user-supplied Figma export: dark-navy frame, brighter blue panel,
// white calendar page with a yellow header, four spiral binding posts going
// through light eyelets, and a soft-grey paw print.
//
// The geometry is hard-coded rather than computed so this file can be edited
// 1:1 with the design source. Run: node scripts/build-app-icon-svg.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const outPath = path.join(repoRoot, 'public', 'app', 'icons', 'app-icon.svg');

// Blue rounded square fills the full canvas (no navy frame). Inner artwork
// is scaled up around the canvas centre so the paper takes most of the icon.
// Dark binding posts thread through the eyelets on the yellow header band.
const svg = `<svg width="1024" height="1024" viewBox="0 0 1024 1024" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="1024" height="1024" rx="180" fill="#1E88F5"/>
  <g transform="translate(512 512) scale(1.30) translate(-512 -497)">
    <rect x="202" y="207" width="620" height="584" rx="78" fill="#FFFFFF"/>
    <path d="M202 285C202 242 237 207 280 207H744C787 207 822 242 822 285V345H202V285Z" fill="#FFD51D"/>
    <circle cx="320" cy="260" r="34" fill="#F7F9FB"/>
    <circle cx="444" cy="260" r="34" fill="#F7F9FB"/>
    <circle cx="568" cy="260" r="34" fill="#F7F9FB"/>
    <circle cx="694" cy="260" r="34" fill="#F7F9FB"/>
    <rect x="302" y="166" width="37" height="118" rx="18.5" fill="#0D2A44"/>
    <rect x="425" y="166" width="37" height="118" rx="18.5" fill="#0D2A44"/>
    <rect x="550" y="166" width="37" height="118" rx="18.5" fill="#0D2A44"/>
    <rect x="675" y="166" width="37" height="118" rx="18.5" fill="#0D2A44"/>
    <ellipse cx="454" cy="446" rx="39" ry="56" fill="#D8DEE5"/>
    <ellipse cx="560" cy="446" rx="39" ry="56" fill="#D8DEE5"/>
    <ellipse cx="381" cy="518" rx="39" ry="52" transform="rotate(-22 381 518)" fill="#D8DEE5"/>
    <ellipse cx="640" cy="518" rx="39" ry="52" transform="rotate(22 640 518)" fill="#D8DEE5"/>
    <path d="M432 581C452 541 482 517 513 517C544 517 574 541 594 581C620 594 633 620 630 647C626 679 603 694 570 691C550 689 533 679 513 679C493 679 475 689 455 691C422 694 393 679 389 647C386 620 406 594 432 581Z" fill="#D8DEE5"/>
  </g>
</svg>
`;

fs.writeFileSync(outPath, svg);
console.log(`wrote ${path.relative(repoRoot, outPath)} (${svg.length} bytes)`);

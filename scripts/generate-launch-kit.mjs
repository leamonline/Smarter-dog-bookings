import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "outputs", "launch-kit");
const assetDir = path.join(outDir, "assets");
const previewDir = path.join(outDir, "previews", "png");
const exportPngDir = path.join(outDir, "exports", "png");
const retinaPngDir = path.join(outDir, "exports", "png-2x");

const colours = {
  // Palette pulled from the supplied directory screenshot. The dominant colour
  // is not the accents; it is the quiet white-card system.
  purple: "#243044",
  purpleSoft: "#65758C",
  yellow: "#F2C84B",
  yellowDark: "#D6A62A",
  cyan: "#35B7D1",
  cyanDark: "#2396B1",
  coral: "#D95B70",
  coralDark: "#C94D63",
  teal: "#3F8577",
  tealDark: "#2F7569",
  green: "#3F8577",
  mint: "#EAFBF3",
  sky: "#F8FAFC",
  butter: "#FFF7DA",
  coralTint: "#FFF2F4",
  lavender: "#F4F7FA",
  paper: "#F7F9FC",
  white: "#FFFFFF",
  slate: "#6E7F96",
  stone: "#E3EAF2",
  dark: "#243044",
};

let fontCss = `
  .display { font-family: "Poppins", "Montserrat", system-ui, sans-serif; font-weight: 700; }
  .sans { font-family: "Montserrat", system-ui, sans-serif; }
  .caps { font-family: "Montserrat", system-ui, sans-serif; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; }
`;

const assets = [];
let dogSilhouetteDataUrl = "";

function esc(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function readDataUrl(relativePath, mime) {
  const bytes = await fs.readFile(path.join(root, relativePath));
  return `data:${mime};base64,${bytes.toString("base64")}`;
}

async function buildFontCss() {
  const font = async (relativePath) => {
    const bytes = await fs.readFile(path.join(root, relativePath));
    return `data:font/woff2;base64,${bytes.toString("base64")}`;
  };

  const montserrat700 = await font("public/app/fonts/montserrat-700.woff2");
  const montserrat600 = await font("public/app/fonts/montserrat-600.woff2");
  const montserrat500 = await font("public/app/fonts/montserrat-500.woff2");
  const poppins700 = await font("public/app/fonts/poppins-700.woff2");

  return `
  @font-face {
    font-family: "Montserrat";
    src: url("${montserrat700}") format("woff2");
    font-weight: 700;
  }
  @font-face {
    font-family: "Montserrat";
    src: url("${montserrat600}") format("woff2");
    font-weight: 600;
  }
  @font-face {
    font-family: "Montserrat";
    src: url("${montserrat500}") format("woff2");
    font-weight: 500;
  }
  @font-face {
    font-family: "Poppins";
    src: url("${poppins700}") format("woff2");
    font-weight: 700;
  }
  .display { font-family: "Poppins", "Montserrat", system-ui, sans-serif; font-weight: 700; }
  .sans { font-family: "Montserrat", system-ui, sans-serif; }
  .caps { font-family: "Montserrat", system-ui, sans-serif; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; }
`;
}

function svgShell({ width, height, title, desc, defs = "", body }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
  <title id="title">${esc(title)}</title>
  <desc id="desc">${esc(desc)}</desc>
  <defs>
    <style>${fontCss}</style>
    <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="14" stdDeviation="14" flood-color="#243044" flood-opacity="0.10"/>
    </filter>
    <filter id="tightShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="5" stdDeviation="6" flood-color="#243044" flood-opacity="0.10"/>
    </filter>
    ${defs}
  </defs>
  ${body}
</svg>
`;
}

async function writeAsset({ type, file, width, height, title, desc, body, defs, previewWidth, previewHeight, category, notes }) {
  const dir = path.join(assetDir, type);
  await fs.mkdir(dir, { recursive: true });
  const svg = svgShell({ width, height, title, desc, body, defs });
  const svgPath = path.join(dir, file);
  await fs.writeFile(svgPath, svg, "utf8");
  const previewFile = file.replace(/\.svg$/, ".png");
  const previewPath = path.join(previewDir, previewFile);
  const item = {
    id: file.replace(/\.svg$/, ""),
    index: assets.length + 1,
    title,
    category,
    notes,
    width,
    height,
    output: path.relative(outDir, svgPath),
    href: path.relative(outDir, svgPath),
    src: path.relative(outDir, previewPath),
    png: path.join("exports", "png", previewFile),
    previewWidth,
    previewHeight,
  };
  if (category === "banners") {
    item.retinaPng = path.join("exports", "png-2x", previewFile.replace(/\.png$/, "@2x.png"));
  }
  assets.push(item);
}

function logoLockup(x, y, width, logoDataUrl, mode = "dark") {
  const bg = mode === "pill" ? `<rect x="${x - 24}" y="${y - 16}" width="${width + 48}" height="${width / 4 + 32}" rx="34" fill="${colours.white}" opacity="0.96"/>` : "";
  return `${bg}<image href="${logoDataUrl}" x="${x}" y="${y}" width="${width}" height="${width / 4}" preserveAspectRatio="xMidYMid meet"/>`;
}

function appIcon(x, y, size, iconDataUrl) {
  return `<image href="${iconDataUrl}" x="${x}" y="${y}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet"/>`;
}

function dogMark(x, y, width, opacity = 0.9) {
  if (!dogSilhouetteDataUrl) return "";
  return `<image href="${dogSilhouetteDataUrl}" x="${x}" y="${y}" width="${width}" height="${width * 1.145}" opacity="${opacity}" preserveAspectRatio="xMidYMid meet"/>`;
}

function launchIconDataUrl() {
  const svg = `<svg width="1024" height="1024" viewBox="0 0 1024 1024" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="1024" height="1024" rx="180" fill="${colours.purple}"/>
    <rect x="170" y="190" width="684" height="648" rx="96" fill="${colours.white}"/>
    <path d="M170 286C170 233 213 190 266 190H758C811 190 854 233 854 286V360H170V286Z" fill="${colours.yellow}"/>
    <rect x="288" y="136" width="42" height="164" rx="21" fill="${colours.purple}"/>
    <rect x="414" y="136" width="42" height="164" rx="21" fill="${colours.purple}"/>
    <rect x="540" y="136" width="42" height="164" rx="21" fill="${colours.purple}"/>
    <rect x="666" y="136" width="42" height="164" rx="21" fill="${colours.purple}"/>
    <circle cx="310" cy="270" r="34" fill="${colours.white}"/>
    <circle cx="436" cy="270" r="34" fill="${colours.white}"/>
    <circle cx="562" cy="270" r="34" fill="${colours.white}"/>
    <circle cx="688" cy="270" r="34" fill="${colours.white}"/>
    <ellipse cx="452" cy="470" rx="40" ry="58" fill="${colours.stone}"/>
    <ellipse cx="572" cy="470" rx="40" ry="58" fill="${colours.stone}"/>
    <ellipse cx="374" cy="546" rx="40" ry="54" transform="rotate(-22 374 546)" fill="${colours.stone}"/>
    <ellipse cx="650" cy="546" rx="40" ry="54" transform="rotate(22 650 546)" fill="${colours.stone}"/>
    <path d="M428 622C452 576 482 552 512 552C542 552 572 576 596 622C622 636 636 662 632 692C628 726 604 742 570 738C548 736 532 724 512 724C492 724 476 736 454 738C420 742 396 726 392 692C388 662 402 636 428 622Z" fill="${colours.stone}"/>
    <circle cx="760" cy="744" r="72" fill="${colours.green}"/>
  </svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

function pawIcon(cx, cy, s, fill = colours.purple, opacity = 1) {
  return `
    <g opacity="${opacity}" transform="translate(${cx} ${cy}) scale(${s})">
      <ellipse cx="-42" cy="-35" rx="20" ry="30" fill="${fill}" transform="rotate(-10 -42 -35)"/>
      <ellipse cx="0" cy="-48" rx="21" ry="32" fill="${fill}"/>
      <ellipse cx="42" cy="-35" rx="20" ry="30" fill="${fill}" transform="rotate(10 42 -35)"/>
      <ellipse cx="-62" cy="10" rx="18" ry="27" fill="${fill}" transform="rotate(-28 -62 10)"/>
      <ellipse cx="62" cy="10" rx="18" ry="27" fill="${fill}" transform="rotate(28 62 10)"/>
      <path d="M-48 74C-18 24 18 24 48 74C84 84 98 126 76 154C52 184 22 162 0 162C-22 162 -52 184 -76 154C-98 126 -84 84 -48 74Z" fill="${fill}"/>
    </g>`;
}

function calendarIcon(x, y, w, h, accent = colours.yellow) {
  const header = h * 0.23;
  return `
    <g filter="url(#tightShadow)">
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${w * 0.08}" fill="${colours.white}"/>
      <path d="M${x} ${y + w * 0.08}C${x} ${y + w * 0.036} ${x + w * 0.036} ${y} ${x + w * 0.08} ${y}H${x + w * 0.92}C${x + w * 0.964} ${y} ${x + w} ${y + w * 0.036} ${x + w} ${y + w * 0.08}V${y + header}H${x}Z" fill="${accent}"/>
      ${[0.24, 0.43, 0.62, 0.81].map((p) => `<rect x="${x + w * p - 8}" y="${y - 20}" width="16" height="72" rx="8" fill="${colours.purple}"/>`).join("")}
      ${[0, 1, 2].map((row) => [0, 1, 2, 3].map((col) => {
        const cx = x + w * (0.2 + col * 0.2);
        const cy = y + header + h * (0.2 + row * 0.19);
        const fill = row === 1 && col === 2 ? colours.coral : row === 2 && col === 0 ? colours.teal : colours.stone;
        return `<rect x="${cx}" y="${cy}" width="${w * 0.12}" height="${h * 0.085}" rx="14" fill="${fill}"/>`;
      }).join("")).join("")}
    </g>`;
}

function chatStack(x, y, w, h) {
  return `
    <g filter="url(#tightShadow)">
      <rect x="${x + w * 0.1}" y="${y}" width="${w * 0.82}" height="${h * 0.32}" rx="${h * 0.16}" fill="${colours.white}"/>
      <circle cx="${x + w * 0.24}" cy="${y + h * 0.16}" r="${h * 0.035}" fill="${colours.cyanDark}"/>
      <rect x="${x + w * 0.32}" y="${y + h * 0.12}" width="${w * 0.42}" height="${h * 0.07}" rx="10" fill="${colours.stone}"/>
      <rect x="${x}" y="${y + h * 0.26}" width="${w * 0.86}" height="${h * 0.32}" rx="${h * 0.16}" fill="${colours.yellow}"/>
      <circle cx="${x + w * 0.16}" cy="${y + h * 0.42}" r="${h * 0.035}" fill="${colours.purple}"/>
      <rect x="${x + w * 0.24}" y="${y + h * 0.38}" width="${w * 0.48}" height="${h * 0.07}" rx="10" fill="${colours.purple}" opacity="0.2"/>
      <rect x="${x + w * 0.14}" y="${y + h * 0.52}" width="${w * 0.82}" height="${h * 0.32}" rx="${h * 0.16}" fill="${colours.white}"/>
      <circle cx="${x + w * 0.3}" cy="${y + h * 0.68}" r="${h * 0.035}" fill="${colours.coral}"/>
      <rect x="${x + w * 0.38}" y="${y + h * 0.64}" width="${w * 0.38}" height="${h * 0.07}" rx="10" fill="${colours.stone}"/>
    </g>`;
}

function featurePill(x, y, text, fill, ink = colours.purple, icon = "") {
  const width = Math.max(260, text.length * 17 + 90);
  return `
    <g>
      <rect x="${x}" y="${y}" width="${width}" height="74" rx="37" fill="${fill}" stroke="${ink}" stroke-opacity="0.14" stroke-width="2"/>
      ${icon ? `<text class="sans" x="${x + 36}" y="${y + 48}" font-size="30" font-weight="700" fill="${ink}">${esc(icon)}</text>` : ""}
      <text class="sans" x="${x + (icon ? 82 : 38)}" y="${y + 47}" font-size="26" font-weight="700" fill="${ink}">${esc(text)}</text>
    </g>`;
}

function dashboardMockup(x, y, w, h, variant = "staff") {
  const navW = w * 0.19;
  const topH = h * 0.13;
  const bodyX = x + navW;
  const bodyY = y + topH;
  const bodyW = w - navW;
  const bodyH = h - topH;
  const cols = 5;
  const rows = 4;
  return `
    <g filter="url(#softShadow)">
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${w * 0.035}" fill="${colours.white}"/>
      <rect x="${x}" y="${y}" width="${w}" height="${topH}" rx="${w * 0.035}" fill="${colours.purple}"/>
      <path d="M${x} ${y + topH * 0.72}H${x + w}V${y + topH}H${x}Z" fill="${colours.purple}"/>
      <circle cx="${x + topH * 0.44}" cy="${y + topH * 0.48}" r="${topH * 0.16}" fill="${colours.yellow}"/>
      <rect x="${x + topH * 0.78}" y="${y + topH * 0.33}" width="${w * 0.2}" height="${topH * 0.22}" rx="14" fill="${colours.white}" opacity="0.26"/>
      <rect x="${x + w * 0.69}" y="${y + topH * 0.28}" width="${w * 0.1}" height="${topH * 0.32}" rx="18" fill="${colours.yellow}"/>
      <rect x="${x + w * 0.81}" y="${y + topH * 0.28}" width="${w * 0.13}" height="${topH * 0.32}" rx="18" fill="${colours.white}" opacity="0.2"/>
      <rect x="${x}" y="${bodyY}" width="${navW}" height="${bodyH}" fill="${colours.paper}"/>
      ${["Week", "Inbox", "Dogs", "Reports"].map((label, i) => `
        <rect x="${x + navW * 0.12}" y="${bodyY + bodyH * (0.1 + i * 0.17)}" width="${navW * 0.76}" height="${bodyH * 0.09}" rx="18" fill="${i === 0 ? colours.yellow : colours.white}"/>
        <text class="sans" x="${x + navW * 0.22}" y="${bodyY + bodyH * (0.1 + i * 0.17) + bodyH * 0.058}" font-size="${Math.max(16, w * 0.019)}" font-weight="700" fill="${colours.purple}">${label}</text>
      `).join("")}
      <rect x="${bodyX + bodyW * 0.04}" y="${bodyY + bodyH * 0.06}" width="${bodyW * 0.28}" height="${bodyH * 0.08}" rx="18" fill="${colours.sky}"/>
      <rect x="${bodyX + bodyW * 0.67}" y="${bodyY + bodyH * 0.06}" width="${bodyW * 0.13}" height="${bodyH * 0.08}" rx="18" fill="${colours.mint}"/>
      <rect x="${bodyX + bodyW * 0.82}" y="${bodyY + bodyH * 0.06}" width="${bodyW * 0.12}" height="${bodyH * 0.08}" rx="18" fill="${colours.coralTint}"/>
      ${Array.from({ length: cols }).map((_, col) => {
        const gx = bodyX + bodyW * 0.04 + col * (bodyW * 0.18);
        return `<text class="caps" x="${gx}" y="${bodyY + bodyH * 0.23}" font-size="${Math.max(13, w * 0.014)}" fill="${colours.slate}">${["Mon", "Tue", "Wed", "Thu", "Fri"][col]}</text>`;
      }).join("")}
      ${Array.from({ length: rows }).map((_, row) => Array.from({ length: cols }).map((_, col) => {
        const gx = bodyX + bodyW * 0.04 + col * (bodyW * 0.18);
        const gy = bodyY + bodyH * 0.27 + row * (bodyH * 0.16);
        const gw = bodyW * 0.145;
        const gh = bodyH * 0.11;
        const palette = [colours.sky, colours.butter, colours.mint, colours.coralTint, colours.lavender];
        const busy = (row + col) % 3 !== 1;
        const fill = busy ? palette[(row + col) % palette.length] : colours.white;
        return `
          <rect x="${gx}" y="${gy}" width="${gw}" height="${gh}" rx="16" fill="${fill}" stroke="${colours.stone}" stroke-width="2"/>
          ${busy ? `<rect x="${gx + 18}" y="${gy + 18}" width="${gw * 0.48}" height="12" rx="6" fill="${colours.purple}" opacity="0.22"/>
          <rect x="${gx + 18}" y="${gy + 42}" width="${gw * 0.66}" height="10" rx="5" fill="${colours.purple}" opacity="0.12"/>` : ""}
        `;
      }).join("")).join("")}
      ${variant === "staff" ? `
        <rect x="${bodyX + bodyW * 0.04}" y="${bodyY + bodyH * 0.84}" width="${bodyW * 0.28}" height="${bodyH * 0.08}" rx="18" fill="${colours.purple}"/>
        <text class="sans" x="${bodyX + bodyW * 0.07}" y="${bodyY + bodyH * 0.891}" font-size="${Math.max(15, w * 0.017)}" font-weight="700" fill="${colours.white}">AI draft ready</text>
        <rect x="${bodyX + bodyW * 0.36}" y="${bodyY + bodyH * 0.84}" width="${bodyW * 0.24}" height="${bodyH * 0.08}" rx="18" fill="${colours.yellow}"/>
        <text class="sans" x="${bodyX + bodyW * 0.39}" y="${bodyY + bodyH * 0.891}" font-size="${Math.max(15, w * 0.017)}" font-weight="700" fill="${colours.purple}">Approve</text>
      ` : ""}
    </g>`;
}

function phoneMockup(x, y, w, h) {
  return `
    <g filter="url(#softShadow)">
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${w * 0.15}" fill="${colours.purple}"/>
      <rect x="${x + w * 0.07}" y="${y + h * 0.035}" width="${w * 0.86}" height="${h * 0.93}" rx="${w * 0.1}" fill="${colours.paper}"/>
      <rect x="${x + w * 0.34}" y="${y + h * 0.055}" width="${w * 0.32}" height="${h * 0.035}" rx="${h * 0.015}" fill="${colours.purple}"/>
      <text class="display" x="${x + w * 0.14}" y="${y + h * 0.19}" font-size="${w * 0.085}" fill="${colours.purple}">Join the Pack</text>
      <rect x="${x + w * 0.14}" y="${y + h * 0.235}" width="${w * 0.72}" height="${h * 0.12}" rx="${w * 0.045}" fill="${colours.white}" stroke="${colours.stone}" stroke-width="2"/>
      <text class="sans" x="${x + w * 0.2}" y="${y + h * 0.305}" font-size="${w * 0.048}" font-weight="700" fill="${colours.purple}">Pick dog</text>
      <rect x="${x + w * 0.14}" y="${y + h * 0.39}" width="${w * 0.72}" height="${h * 0.12}" rx="${w * 0.045}" fill="${colours.sky}"/>
      <text class="sans" x="${x + w * 0.2}" y="${y + h * 0.46}" font-size="${w * 0.048}" font-weight="700" fill="${colours.purple}">Choose service</text>
      <rect x="${x + w * 0.14}" y="${y + h * 0.545}" width="${w * 0.72}" height="${h * 0.12}" rx="${w * 0.045}" fill="${colours.butter}"/>
      <text class="sans" x="${x + w * 0.2}" y="${y + h * 0.615}" font-size="${w * 0.048}" font-weight="700" fill="${colours.purple}">Book slot</text>
      <rect x="${x + w * 0.14}" y="${y + h * 0.75}" width="${w * 0.72}" height="${h * 0.1}" rx="${w * 0.05}" fill="${colours.yellow}"/>
      <text class="sans" x="${x + w * 0.285}" y="${y + h * 0.812}" font-size="${w * 0.05}" font-weight="700" fill="${colours.purple}">Confirm</text>
    </g>`;
}

function burst(cx, cy, r1, r2, points, fill, rotate = 0) {
  const coords = Array.from({ length: points * 2 }).map((_, i) => {
    const angle = ((Math.PI * 2 * i) / (points * 2)) + (rotate * Math.PI / 180);
    const radius = i % 2 === 0 ? r2 : r1;
    return `${cx + Math.cos(angle) * radius},${cy + Math.sin(angle) * radius}`;
  });
  return `<polygon points="${coords.join(" ")}" fill="${fill}"/>`;
}

function uiCard(x, y, w, h, accent, radius = 34) {
  return `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}" fill="${colours.white}" stroke="${colours.stone}" stroke-width="3" filter="url(#tightShadow)"/>
    <path d="M${x + radius} ${y}H${x + w - radius}Q${x + w} ${y} ${x + w} ${y + radius}V${y + 10}H${x}V${y + radius}Q${x} ${y} ${x + radius} ${y}Z" fill="${accent}"/>
  `;
}

function miniDogRow(x, y, items) {
  return items.map(([label, accent], i) => `
    <g transform="translate(${x + i * 154} ${y})">
      <circle cx="18" cy="18" r="18" fill="${accent}"/>
      <text class="sans" x="18" y="25" font-size="21" font-weight="700" text-anchor="middle" fill="${colours.dark}">${label[0]}</text>
      <text class="sans" x="48" y="26" font-size="25" font-weight="700" fill="${colours.slate}">${label}</text>
    </g>
  `).join("");
}

function textLines(lines, x, y, size, leading, fill = colours.dark, cls = "display", attrs = "") {
  return lines.map((line, i) => `<text class="${cls}" x="${x}" y="${y + i * leading}" font-size="${size}" fill="${fill}" ${attrs}>${esc(line)}</text>`).join("");
}

function rule(x, y, width, accent) {
  return `<rect x="${x}" y="${y}" width="${width}" height="18" rx="9" fill="${accent}"/>`;
}

function stickerFrame(shape, accent, tint) {
  if (shape === "ticket") {
    return {
      content: { x: 150, y: 318, w: 515 },
      dog: { x: 650, y: 270, size: 118 },
      svg: `
        <path d="M156 214H744Q798 214 798 268V368A82 82 0 0 0 798 532V632Q798 686 744 686H156Q102 686 102 632V532A82 82 0 0 0 102 368V268Q102 214 156 214Z" fill="${tint}" stroke="${colours.stone}" stroke-width="5" filter="url(#tightShadow)"/>
        ${rule(178, 214, 544, accent)}
      `,
    };
  }
  if (shape === "pill") {
    return {
      content: { x: 158, y: 326, w: 505 },
      dog: { x: 655, y: 285, size: 110 },
      svg: `
        <rect x="86" y="224" width="728" height="452" rx="226" fill="${tint}" stroke="${colours.stone}" stroke-width="5" filter="url(#tightShadow)"/>
        ${rule(324, 224, 252, accent)}
      `,
    };
  }
  if (shape === "circle") {
    return {
      content: { x: 180, y: 306, w: 470 },
      dog: { x: 642, y: 300, size: 110 },
      svg: `
        <circle cx="450" cy="450" r="322" fill="${tint}" stroke="${colours.stone}" stroke-width="5" filter="url(#tightShadow)"/>
        <path d="M238 206A322 322 0 0 1 662 206" fill="none" stroke="${accent}" stroke-width="20" stroke-linecap="round"/>
      `,
    };
  }
  if (shape === "tag") {
    return {
      content: { x: 150, y: 312, w: 500 },
      dog: { x: 638, y: 304, size: 112 },
      svg: `
        <path d="M126 220H632L782 370V654Q782 704 732 704H126Q76 704 76 654V270Q76 220 126 220Z" fill="${tint}" stroke="${colours.stone}" stroke-width="5" filter="url(#tightShadow)"/>
        <circle cx="682" cy="318" r="22" fill="${accent}"/>
        ${rule(166, 220, 460, accent)}
      `,
    };
  }
  if (shape === "burst") {
    return {
      content: { x: 178, y: 306, w: 475 },
      dog: { x: 610, y: 525, size: 116 },
      svg: `
        ${burst(450, 450, 318, 366, 18, accent)}
        <circle cx="450" cy="450" r="294" fill="${tint}" stroke="${colours.white}" stroke-width="16" filter="url(#tightShadow)"/>
      `,
    };
  }
  if (shape === "square") {
    return {
      content: { x: 170, y: 312, w: 495 },
      dog: { x: 640, y: 292, size: 116 },
      svg: `
        <rect x="150" y="178" width="600" height="544" rx="58" fill="${tint}" stroke="${colours.stone}" stroke-width="5" filter="url(#tightShadow)"/>
        ${rule(150, 178, 600, accent)}
      `,
    };
  }
  if (shape === "label") {
    return {
      content: { x: 160, y: 320, w: 500 },
      dog: { x: 642, y: 300, size: 112 },
      svg: `
        <path d="M174 220H726L810 450L726 680H174L90 450L174 220Z" fill="${tint}" stroke="${colours.stone}" stroke-width="5" filter="url(#tightShadow)"/>
        ${rule(230, 220, 440, accent)}
      `,
    };
  }
  return stickerFrame("square", accent, tint);
}

function stickerDesign({ shape, tint, accent, title, meta, note, details = "", titleFill = colours.dark }) {
  const frame = stickerFrame(shape, accent, tint);
  const titleLines = Array.isArray(title) ? title : [title];
  const c = frame.content;
  const titleSize = titleLines.length > 1 ? 60 : 68;
  return `
    <g>
      ${frame.svg}
      ${dogMark(frame.dog.x, frame.dog.y, frame.dog.size, 0.88)}
      ${textLines(titleLines, c.x, c.y, titleSize, 72, titleFill)}
      <text class="sans" x="${c.x}" y="${c.y + 178}" font-size="27" font-weight="700" fill="${colours.slate}">${esc(meta)}</text>
      ${note ? `<text class="sans" x="${c.x}" y="${c.y + 224}" font-size="23" font-weight="700" fill="${accent}">${esc(note)}</text>` : ""}
      ${details}
    </g>
  `;
}

function stickerBookingSorted() {
  return stickerDesign({
    shape: "ticket",
    tint: colours.butter,
    accent: colours.yellow,
    title: ["Bookings", "sorted"],
    meta: "Launch-ready calendar",
    note: "plan the day",
    details: `
      <rect x="150" y="594" width="300" height="30" rx="15" fill="${colours.yellow}"/>
      <rect x="480" y="594" width="155" height="30" rx="15" fill="${colours.stone}"/>
    `,
  });
}

function stickerWhatsappCalm() {
  return stickerDesign({
    shape: "pill",
    tint: colours.mint,
    accent: colours.teal,
    title: ["WhatsApp", "calm"],
    meta: "Staff-approved replies",
    note: "reply with care",
    details: chatStack(442, 500, 245, 160),
  });
}

function stickerCapacity() {
  return stickerDesign({
    shape: "circle",
    tint: colours.coralTint,
    accent: colours.coral,
    title: ["2-2-1", "ready"],
    meta: "Capacity-aware booking",
    note: "small / medium / large",
    titleFill: colours.dark,
    details: `
      <circle cx="216" cy="604" r="20" fill="${colours.yellow}"/><text class="sans" x="216" y="612" font-size="22" font-weight="700" text-anchor="middle" fill="${colours.dark}">S</text>
      <circle cx="318" cy="604" r="20" fill="${colours.teal}"/><text class="sans" x="318" y="612" font-size="22" font-weight="700" text-anchor="middle" fill="${colours.white}">M</text>
      <circle cx="420" cy="604" r="20" fill="${colours.coral}"/><text class="sans" x="420" y="612" font-size="22" font-weight="700" text-anchor="middle" fill="${colours.white}">L</text>
    `,
  });
}

function stickerJoinPack() {
  return stickerDesign({
    shape: "tag",
    tint: colours.mint,
    accent: colours.teal,
    title: ["Join the", "Pack"],
    meta: "Customer portal",
    note: "book online",
    titleFill: colours.dark,
    details: `
      <rect x="150" y="584" width="330" height="48" rx="24" fill="${colours.butter}" stroke="${colours.yellow}" stroke-width="3"/>
      <text class="sans" x="315" y="616" font-size="21" font-weight="700" text-anchor="middle" fill="${colours.dark}">manage dogs</text>
    `,
  });
}

function stickerMessagePile() {
  return stickerDesign({
    shape: "burst",
    tint: colours.white,
    accent: colours.coral,
    title: ["No message", "pile-ups"],
    meta: "Inbox handled gently",
    note: "one calm queue",
    details: `
      <circle cx="630" cy="360" r="38" fill="${colours.coral}"/>
      <circle cx="690" cy="314" r="24" fill="${colours.yellow}"/>
    `,
  });
}

function stickerRepeat() {
  return stickerDesign({
    shape: "square",
    tint: colours.white,
    accent: colours.yellow,
    title: ["Book. Groom.", "Remind."],
    meta: "Then repeat",
    note: "Repeat.",
    titleFill: colours.dark,
    details: `
      <rect x="170" y="604" width="118" height="42" rx="21" fill="${colours.butter}" stroke="${colours.yellow}" stroke-width="3"/>
      <text class="sans" x="229" y="632" font-size="18" font-weight="700" text-anchor="middle" fill="${colours.dark}">Book</text>
      <rect x="306" y="604" width="128" height="42" rx="21" fill="${colours.mint}" stroke="${colours.teal}" stroke-width="3"/>
      <text class="sans" x="370" y="632" font-size="18" font-weight="700" text-anchor="middle" fill="${colours.dark}">Groom</text>
      <rect x="452" y="604" width="146" height="42" rx="21" fill="${colours.coralTint}" stroke="${colours.coral}" stroke-width="3"/>
      <text class="sans" x="525" y="632" font-size="18" font-weight="700" text-anchor="middle" fill="${colours.dark}">Remind</text>
    `,
  });
}

function stickerPickup() {
  return stickerDesign({
    shape: "pill",
    tint: colours.butter,
    accent: colours.yellow,
    title: ["Ready for", "pickup"],
    meta: "Salon status",
    note: "collection clear",
    details: `<rect x="158" y="594" width="270" height="30" rx="15" fill="${colours.teal}"/>`,
  });
}

function stickerLaunchCrew() {
  return stickerDesign({
    shape: "label",
    tint: colours.sky,
    accent: colours.teal,
    title: ["Launch", "crew"],
    meta: "SmarterDog",
    note: "first through the door",
    details: `<circle cx="658" cy="570" r="66" fill="${colours.mint}" stroke="${colours.teal}" stroke-width="4"/>`,
  });
}

function stickerSheetBody() {
  const stickers = [
    stickerBookingSorted(),
    stickerWhatsappCalm(),
    stickerCapacity(),
    stickerJoinPack(),
    stickerMessagePile(),
    stickerRepeat(),
    stickerPickup(),
    stickerLaunchCrew(),
  ];
  const scale = 0.78;
  const positions = [
    [120, 470], [1240, 470],
    [120, 1190], [1240, 1190],
    [120, 1910], [1240, 1910],
    [120, 2630], [1240, 2630],
  ];
  return `
    <rect width="2480" height="3508" fill="${colours.paper}"/>
    <rect x="140" y="100" width="2200" height="280" rx="42" fill="${colours.white}" stroke="${colours.stone}" stroke-width="3" filter="url(#tightShadow)"/>
    ${rule(140, 100, 2200, colours.yellow)}
    <text class="display" x="210" y="212" font-size="80" fill="${colours.dark}">SmarterDog launch stickers</text>
    <text class="sans" x="214" y="294" font-size="34" font-weight="700" fill="${colours.slate}">Eight aligned sticker cuts using the app colours and logo dog mark.</text>
    ${dogMark(2040, 138, 150, 0.18)}
    ${dogMark(2210, 142, 118, 0.30)}
    ${positions.map(([x, y], i) => `<g transform="translate(${x} ${y}) scale(${scale})">${stickers[i]}</g>`).join("")}
    <text class="caps" x="160" y="3428" font-size="26" fill="${colours.slate}">A4 sticker sheet - editable SVG - native PNG export included</text>
  `;
}

function posterFeature(x, y, w, h, accent, title, copy) {
  return `
    <g transform="translate(${x} ${y})">
      <rect x="0" y="0" width="${w}" height="${h}" rx="40" fill="${colours.white}" stroke="${colours.stone}" stroke-width="4" filter="url(#tightShadow)"/>
      ${rule(0, 0, w, accent)}
      ${dogMark(w - 170, h - 185, 110, 0.08)}
      <text class="display" x="56" y="112" font-size="60" fill="${colours.dark}">${esc(title)}</text>
      <text class="sans" x="56" y="190" font-size="36" font-weight="600" fill="${colours.slate}">${esc(copy)}</text>
      <rect x="56" y="${h - 118}" width="430" height="44" rx="22" fill="${accent}" opacity="0.16"/>
      <rect x="56" y="${h - 118}" width="300" height="44" rx="22" fill="${accent}"/>
    </g>
  `;
}

function posterOne(logoDataUrl, iconDataUrl) {
  return `
    <rect width="3508" height="4961" fill="${colours.paper}"/>
    ${logoLockup(220, 180, 700, logoDataUrl)}
    ${appIcon(3040, 170, 210, iconDataUrl)}
    <rect x="220" y="620" width="3068" height="1390" rx="70" fill="${colours.white}" stroke="${colours.stone}" stroke-width="4" filter="url(#softShadow)"/>
    ${rule(220, 620, 3068, colours.yellow)}
    ${dogMark(2890, 840, 220, 0.10)}
    <text class="caps" x="340" y="830" font-size="54" fill="${colours.slate}">now launching</text>
    ${textLines(["Your salon day,", "organised."], 332, 1160, 220, 250, colours.dark)}
    <text class="sans" x="344" y="1720" font-size="54" font-weight="600" fill="${colours.slate}">Bookings, WhatsApp, reminders, capacity and reports in one calm dashboard.</text>
    ${dashboardMockup(360, 2300, 2780, 1380, "staff")}
    ${posterFeature(360, 3990, 620, 250, colours.yellow, "Calendar", "Clear weeks")}
    ${posterFeature(1050, 3990, 620, 250, colours.teal, "Waitlist", "Fill gaps")}
    ${posterFeature(1740, 3990, 620, 250, colours.coral, "AI drafts", "Approve replies")}
    ${posterFeature(2430, 3990, 620, 250, colours.cyan, "Reports", "Know demand")}
    <text class="display" x="220" y="4685" font-size="86" fill="${colours.dark}">SmarterDog Salon Booking Platform</text>
  `;
}

function posterTwo(logoDataUrl) {
  return `
    <rect width="3508" height="4961" fill="${colours.paper}"/>
    ${logoLockup(220, 180, 720, logoDataUrl)}
    <rect x="220" y="620" width="3068" height="1120" rx="70" fill="${colours.white}" stroke="${colours.stone}" stroke-width="4" filter="url(#softShadow)"/>
    ${rule(220, 620, 3068, colours.teal)}
    ${dogMark(2920, 780, 230, 0.10)}
    <text class="caps" x="340" y="830" font-size="50" fill="${colours.coralDark}">built for grooming salons</text>
    ${textLines(["Not a generic", "appointment book."], 332, 1110, 172, 200, colours.dark)}
    <text class="sans" x="344" y="1560" font-size="48" font-weight="600" fill="${colours.slate}">Dog sizes, trusted contacts, staged grooms, collection notes and message approvals all matter.</text>
    ${posterFeature(260, 2020, 1400, 560, colours.teal, "Capacity engine", "Protect the day before it gets overbooked.")}
    ${posterFeature(1848, 2020, 1400, 560, colours.teal, "WhatsApp inbox", "Draft replies and proposed booking actions.")}
    ${posterFeature(260, 2740, 1400, 560, colours.yellow, "Customer portal", "Clients can book, manage dogs and rebook.")}
    ${posterFeature(1848, 2740, 1400, 560, colours.coral, "Reports", "Know demand, revenue and service mix.")}
    <rect x="220" y="4140" width="3068" height="360" rx="70" fill="${colours.white}" stroke="${colours.stone}" stroke-width="4" filter="url(#tightShadow)"/>
    ${rule(220, 4140, 3068, colours.yellow)}
    <text class="display" x="340" y="4320" font-size="86" fill="${colours.dark}">Bookings sorted.</text>
    <text class="display" x="1280" y="4320" font-size="86" fill="${colours.dark}">Messages calmer.</text>
    <text class="display" x="2380" y="4320" font-size="86" fill="${colours.dark}">Dogs on time.</text>
  `;
}

function posterThree(logoDataUrl) {
  return `
    <rect width="3508" height="4961" fill="${colours.paper}"/>
    ${logoLockup(220, 180, 720, logoDataUrl)}
    <rect x="220" y="600" width="3068" height="1680" rx="70" fill="${colours.white}" stroke="${colours.stone}" stroke-width="4" filter="url(#softShadow)"/>
    ${rule(220, 600, 3068, colours.coral)}
    <text class="caps" x="340" y="820" font-size="50" fill="${colours.slate}">customer launch poster</text>
    ${textLines(["Join the", "Pack."], 332, 1185, 240, 280, colours.dark)}
    <text class="sans" x="344" y="1705" font-size="48" font-weight="600" fill="${colours.slate}">Book your next groom online,</text>
    <text class="sans" x="344" y="1770" font-size="48" font-weight="600" fill="${colours.slate}">manage your dogs, and keep</text>
    <text class="sans" x="344" y="1835" font-size="48" font-weight="600" fill="${colours.slate}">appointments close to hand.</text>
    ${phoneMockup(2290, 820, 680, 1090)}
    ${dogMark(1960, 1840, 210, 0.12)}
    <g transform="translate(300 2660)">
      ${[
        ["1", "Pick dog", colours.teal],
        ["2", "Choose service", colours.yellow],
        ["3", "Select slot", colours.teal],
        ["4", "Confirm", colours.yellow],
      ].map(([n, label, accent], i) => `
        <g transform="translate(${i * 760} 0)">
          <rect x="0" y="0" width="600" height="330" rx="42" fill="${colours.white}" stroke="${colours.stone}" stroke-width="4" filter="url(#tightShadow)"/>
          ${rule(0, 0, 600, accent)}
          <circle cx="90" cy="176" r="66" fill="${accent === colours.yellow ? colours.butter : colours.mint}" stroke="${accent}" stroke-width="5"/>
          <text class="display" x="90" y="200" font-size="68" text-anchor="middle" fill="${colours.dark}">${n}</text>
          <text class="sans" x="190" y="192" font-size="42" font-weight="700" fill="${colours.dark}">${label}</text>
        </g>
      `).join("")}
    </g>
    <rect x="220" y="3990" width="3068" height="560" rx="70" fill="${colours.white}" stroke="${colours.stone}" stroke-width="4" filter="url(#tightShadow)"/>
    ${rule(220, 3990, 3068, colours.yellow)}
    ${textLines(["Less back-and-forth.", "More happy arrivals."], 340, 4215, 110, 136, colours.dark)}
  `;
}

function webBanner(logoDataUrl, iconDataUrl) {
  return `
    <rect width="1600" height="600" fill="${colours.paper}"/>
    <rect x="48" y="44" width="1504" height="512" rx="42" fill="${colours.white}" stroke="${colours.stone}" stroke-width="3" filter="url(#softShadow)"/>
    ${rule(48, 44, 1504, colours.yellow)}
    ${logoLockup(88, 82, 320, logoDataUrl)}
    <text class="caps" x="88" y="206" font-size="28" fill="${colours.slate}">software launch</text>
    <text class="display" x="84" y="310" font-size="78" fill="${colours.dark}">SmarterDog is live</text>
    <text class="sans" x="88" y="374" font-size="31" font-weight="600" fill="${colours.slate}">A calmer booking platform for grooming salons.</text>
    <rect x="88" y="434" width="410" height="70" rx="35" fill="${colours.butter}" stroke="${colours.yellow}" stroke-width="3"/>
    <text class="sans" x="132" y="480" font-size="27" font-weight="700" fill="${colours.dark}">Book. Groom. Remind.</text>
    ${dashboardMockup(900, 162, 560, 300, "staff")}
    ${appIcon(1370, 70, 126, iconDataUrl)}
  `;
}

function socialBanner() {
  return `
    <rect width="1200" height="628" fill="${colours.paper}"/>
    <rect x="50" y="50" width="1100" height="528" rx="36" fill="${colours.white}" stroke="${colours.stone}" stroke-width="3" filter="url(#softShadow)"/>
    ${rule(50, 50, 1100, colours.yellow)}
    <text class="caps" x="94" y="130" font-size="26" fill="${colours.slate}">launch announcement</text>
    ${textLines(["One calm dashboard", "for the whole day."], 90, 242, 72, 82, colours.dark)}
    <text class="sans" x="94" y="394" font-size="31" font-weight="600" fill="${colours.slate}">Bookings, WhatsApp and reminders.</text>
    <text class="sans" x="94" y="438" font-size="31" font-weight="600" fill="${colours.slate}">Capacity, waitlist and reports.</text>
    <text class="display" x="94" y="535" font-size="38" fill="${colours.dark}">SmarterDog Salon Booking Platform</text>
    ${chatStack(820, 184, 260, 236)}
    ${dogMark(910, 430, 112, 0.22)}
  `;
}

function emailBanner(logoDataUrl) {
  return `
    <rect width="1200" height="400" fill="${colours.paper}"/>
    <rect x="38" y="34" width="1124" height="332" rx="32" fill="${colours.white}" stroke="${colours.stone}" stroke-width="3" filter="url(#softShadow)"/>
    ${rule(38, 34, 1124, colours.teal)}
    ${logoLockup(60, 54, 280, logoDataUrl)}
    <text class="display" x="58" y="178" font-size="60" fill="${colours.dark}">Now launching:</text>
    <text class="display" x="58" y="248" font-size="50" fill="${colours.coralDark}">booking built for grooming.</text>
    <text class="sans" x="60" y="326" font-size="26" font-weight="700" fill="${colours.slate}">Staff dashboard + customer portal + reminders + WhatsApp inbox</text>
    ${calendarIcon(874, 72, 200, 200, colours.coral)}
    ${dogMark(780, 245, 76, 0.20)}
  `;
}

function storyBanner(iconDataUrl) {
  return `
    <rect width="1080" height="1920" fill="${colours.paper}"/>
    <rect x="90" y="120" width="900" height="1120" rx="56" fill="${colours.white}" stroke="${colours.stone}" stroke-width="4" filter="url(#softShadow)"/>
    ${rule(90, 120, 900, colours.yellow)}
    ${appIcon(390, 220, 210, iconDataUrl)}
    <text class="caps" x="540" y="560" font-size="38" text-anchor="middle" fill="${colours.slate}">launch day</text>
    <text class="display" x="540" y="770" font-size="118" text-anchor="middle" fill="${colours.dark}">Bookings</text>
    <text class="display" x="540" y="905" font-size="118" text-anchor="middle" fill="${colours.coralDark}">sorted.</text>
    <text class="display" x="540" y="1060" font-size="118" text-anchor="middle" fill="${colours.dark}">Messages</text>
    <text class="display" x="540" y="1195" font-size="118" text-anchor="middle" fill="${colours.tealDark}">calmer.</text>
    ${dogMark(745, 292, 118, 0.16)}
    <rect x="90" y="1360" width="900" height="390" rx="56" fill="${colours.white}" stroke="${colours.stone}" stroke-width="4" filter="url(#tightShadow)"/>
    ${rule(90, 1360, 900, colours.teal)}
    <text class="sans" x="540" y="1515" font-size="38" font-weight="700" text-anchor="middle" fill="${colours.slate}">SmarterDog Salon Booking Platform</text>
    <text class="display" x="540" y="1648" font-size="70" text-anchor="middle" fill="${colours.dark}">Built for grooming salons.</text>
  `;
}

async function renderSvgToPng(page, asset, pngPath, width, height) {
  const svgPath = path.join(outDir, asset.output);
  await fs.mkdir(path.dirname(pngPath), { recursive: true });
  const svg = await fs.readFile(svgPath, "utf8");
  const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  await page.setViewportSize({ width, height });
  await page.setContent(`<!doctype html>
    <html>
      <head><meta charset="utf-8"><style>html,body{margin:0;width:100%;height:100%;background:white;}#frame{width:${width}px;height:${height}px;display:flex;background:white;}img{width:100%;height:100%;object-fit:contain;display:block;}</style></head>
      <body><div id="frame"><img src="${dataUrl}" alt=""></div></body>
    </html>`);
  await page.locator("#frame").screenshot({ path: pngPath });
}

async function renderPreviews() {
  await fs.mkdir(previewDir, { recursive: true });
  await fs.mkdir(exportPngDir, { recursive: true });
  await fs.mkdir(retinaPngDir, { recursive: true });
  const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  const launchOptions = await fs.access(chromePath).then(
    () => ({ executablePath: chromePath }),
    () => ({}),
  );
  const browser = await chromium.launch(launchOptions);
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const asset of assets) {
    const previewPath = path.join(outDir, asset.src);
    const exportPath = path.join(outDir, asset.png);
    await renderSvgToPng(page, asset, previewPath, asset.width, asset.height);
    await fs.copyFile(previewPath, exportPath);
    if (asset.retinaPng) {
      await renderSvgToPng(page, asset, path.join(outDir, asset.retinaPng), asset.width * 2, asset.height * 2);
    }
  }
  await browser.close();
}

async function writeDocs() {
  const manifest = assets.map(({ previewWidth, previewHeight, ...item }) => item);
  await fs.writeFile(path.join(outDir, "review-manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");
  await fs.writeFile(path.join(outDir, "review-options.json"), JSON.stringify({
    title: "SmarterDog Launch Kit",
    summary: "Launch stickers, posters and promotional banners for the SmarterDog Salon Booking Platform.",
    preset: "image-wall",
    showCaptions: true,
    showControls: true,
    minTileWidth: 260,
    contactSheetOutput: "launch-kit-contact-sheet.png",
  }, null, 2) + "\n", "utf8");

  const md = `# SmarterDog Launch Kit

Launch artwork for the SmarterDog Salon Booking Platform.

## Creative direction

Warm, energetic and operationally useful: screenshot-matched off-white canvas, white cards, dark ink, muted slate text, mustard booking yellow, teal dog-status accents, dusty alert pink and tiny cyan detail. Short copy speaks to grooming-specific pain points.

## Copy principles

- Exact claims only: no fake testimonials, discounts, savings figures or partner marks.
- Feature-led lines: bookings, WhatsApp, reminders, capacity, customer portal, waitlist and reports.
- Tone: calm, friendly, salon-aware, with enough launch punch to feel celebratory.

## Assets

${manifest.map((item) => `- ${item.title}: \`${item.output}\` (${item.width} x ${item.height})`).join("\n")}

## PNG exports

- Native-size PNG exports: \`outputs/launch-kit/exports/png/\`
- 2x banner PNG exports: \`outputs/launch-kit/exports/png-2x/\`
- Browser preview PNGs now render at native asset size instead of reduced review-board size.

## Suggested next edits

- Replace the generic launch wording with the exact launch date or URL when ready.
- Export the A3 posters to PDF for print.
- Use the 1600 x 600 banner for the website hero, 1200 x 628 for social/link previews, 1200 x 400 for email, and 1080 x 1920 for stories.
`;
  await fs.writeFile(path.join(outDir, "launch-kit.md"), md, "utf8");
}

async function main() {
  fontCss = await buildFontCss();
  const logoDataUrl = await readDataUrl("scripts/assets/legacy-logo.png", "image/png");
  dogSilhouetteDataUrl = await readDataUrl("scripts/assets/legacy-dog-silhouette.png", "image/png");
  const iconDataUrl = launchIconDataUrl();

  await fs.mkdir(outDir, { recursive: true });

  await writeAsset({
    type: "stickers",
    file: "sticker-sheet-a4.svg",
    width: 2480,
    height: 3508,
    previewWidth: 840,
    previewHeight: 1188,
    title: "A4 Launch Sticker Sheet",
    desc: "Eight SmarterDog launch stickers on an A4 sheet.",
    category: "stickers",
    notes: "Print-and-cut sheet for launch packs, laptop stickers or salon counter giveaways.",
    body: stickerSheetBody(),
  });

  const stickerSet = [
    ["sticker-bookings-sorted.svg", "Bookings Sorted Sticker", stickerBookingSorted()],
    ["sticker-whatsapp-calm.svg", "WhatsApp Calm Sticker", stickerWhatsappCalm()],
    ["sticker-capacity-ready.svg", "2-2-1 Ready Sticker", stickerCapacity()],
    ["sticker-join-the-pack.svg", "Join the Pack Sticker", stickerJoinPack()],
    ["sticker-message-pile-ups.svg", "No More Message Pile-ups Sticker", stickerMessagePile()],
    ["sticker-book-groom-remind-repeat.svg", "Book Groom Remind Repeat Sticker", stickerRepeat()],
    ["sticker-ready-for-pickup.svg", "Ready for Pickup Sticker", stickerPickup()],
    ["sticker-launch-crew.svg", "Launch Crew Sticker", stickerLaunchCrew()],
  ];

  for (const [file, title, body] of stickerSet) {
    await writeAsset({
      type: "stickers",
      file,
      width: 900,
      height: 900,
      previewWidth: 720,
      previewHeight: 720,
      title,
      desc: `${title} for the SmarterDog launch kit.`,
      category: "stickers",
      notes: "Individual editable sticker SVG.",
      body: `<rect width="900" height="900" fill="${colours.white}"/>${body}`,
    });
  }

  await writeAsset({
    type: "posters",
    file: "poster-salon-day-organised-a3.svg",
    width: 3508,
    height: 4961,
    previewWidth: 840,
    previewHeight: 1188,
    title: "Poster - Salon Day",
    desc: "A high-energy launch poster showing the SmarterDog staff dashboard promise.",
    category: "posters",
    notes: "Best for salon walls, launch announcements and partner print packs.",
    body: posterOne(logoDataUrl, iconDataUrl),
  });

  await writeAsset({
    type: "posters",
    file: "poster-not-generic-appointment-book-a3.svg",
    width: 3508,
    height: 4961,
    previewWidth: 840,
    previewHeight: 1188,
    title: "Poster - Grooming Specific",
    desc: "Feature-led poster explaining why grooming salons need a specialised system.",
    category: "posters",
    notes: "Best for B2B software launch, sales decks and local salon outreach.",
    body: posterTwo(logoDataUrl),
  });

  await writeAsset({
    type: "posters",
    file: "poster-join-the-pack-a3.svg",
    width: 3508,
    height: 4961,
    previewWidth: 840,
    previewHeight: 1188,
    title: "Poster - Join The Pack",
    desc: "Customer-facing portal launch poster.",
    category: "posters",
    notes: "Best for existing salon customers and front-of-house portal launch.",
    body: posterThree(logoDataUrl),
  });

  await writeAsset({
    type: "banners",
    file: "banner-web-launch-1600x600.svg",
    width: 1600,
    height: 600,
    previewWidth: 1200,
    previewHeight: 450,
    title: "Web Banner",
    desc: "Wide website launch banner.",
    category: "banners",
    notes: "Website hero or announcement strip.",
    body: webBanner(logoDataUrl, iconDataUrl),
  });

  await writeAsset({
    type: "banners",
    file: "banner-social-one-calm-dashboard-1200x628.svg",
    width: 1200,
    height: 628,
    previewWidth: 1200,
    previewHeight: 628,
    title: "Social Banner",
    desc: "Social preview banner for launch posts.",
    category: "banners",
    notes: "Facebook, LinkedIn, link preview and announcement posts.",
    body: socialBanner(),
  });

  await writeAsset({
    type: "banners",
    file: "banner-email-now-launching-1200x400.svg",
    width: 1200,
    height: 400,
    previewWidth: 1200,
    previewHeight: 400,
    title: "Email Banner",
    desc: "Email hero banner for a launch announcement.",
    category: "banners",
    notes: "Email newsletter or announcement header.",
    body: emailBanner(logoDataUrl),
  });

  await writeAsset({
    type: "banners",
    file: "banner-story-bookings-sorted-1080x1920.svg",
    width: 1080,
    height: 1920,
    previewWidth: 540,
    previewHeight: 960,
    title: "Story Banner",
    desc: "Vertical social story launch banner.",
    category: "banners",
    notes: "Instagram/Facebook story style announcement.",
    body: storyBanner(iconDataUrl),
  });

  await renderPreviews();
  await writeDocs();
  console.log(`Generated ${assets.length} launch assets in ${outDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

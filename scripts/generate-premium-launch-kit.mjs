import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "outputs", "launch-kit-premium");
const assetDir = path.join(outDir, "assets");
const exportDir = path.join(outDir, "exports", "png");
const retinaDir = path.join(outDir, "exports", "png-2x");

const screenshotPath = "/var/folders/_7/ygh8jxbs6tx49l2gx10kg3tc0000gn/T/codex-clipboard-d13d8155-b09e-4ce8-9905-f12d04b8c148.png";

const colours = {
  ink: "#223047",
  ink2: "#2E3A52",
  slate: "#6F7F96",
  paper: "#F7F9FC",
  white: "#FFFFFF",
  line: "#E4EBF4",
  yellow: "#F4C84A",
  yellowSoft: "#FFF6D8",
  teal: "#3F8A7B",
  tealSoft: "#E9F8F1",
  coral: "#D95B70",
  coralSoft: "#FFF0F3",
  cyan: "#34B7D1",
};

let fontCss = "";
let logoDataUrl = "";
let dogDataUrl = "";
let dashboardDataUrl = "";
let clipCounter = 0;
const assets = [];

function esc(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function readDataUrl(file, mime) {
  const bytes = await fs.readFile(path.isAbsolute(file) ? file : path.join(root, file));
  return `data:${mime};base64,${bytes.toString("base64")}`;
}

async function buildFontCss() {
  const font = async (relativePath) => {
    const bytes = await fs.readFile(path.join(root, relativePath));
    return `data:font/woff2;base64,${bytes.toString("base64")}`;
  };
  const montserrat700 = await font("public/app/fonts/montserrat-700.woff2");
  const montserrat600 = await font("public/app/fonts/montserrat-600.woff2");
  const poppins700 = await font("public/app/fonts/poppins-700.woff2");
  const poppins600 = await font("public/app/fonts/poppins-600.woff2");
  return `
    @font-face { font-family: "Montserrat"; src: url("${montserrat700}") format("woff2"); font-weight: 700; }
    @font-face { font-family: "Montserrat"; src: url("${montserrat600}") format("woff2"); font-weight: 600; }
    @font-face { font-family: "Poppins"; src: url("${poppins700}") format("woff2"); font-weight: 700; }
    @font-face { font-family: "Poppins"; src: url("${poppins600}") format("woff2"); font-weight: 600; }
    .display { font-family: "Poppins", "Montserrat", system-ui, sans-serif; font-weight: 700; }
    .sans { font-family: "Montserrat", system-ui, sans-serif; font-weight: 700; }
    .body { font-family: "Montserrat", system-ui, sans-serif; font-weight: 600; }
    .caps { font-family: "Montserrat", system-ui, sans-serif; font-weight: 700; letter-spacing: 0.075em; text-transform: uppercase; }
  `;
}

function svgShell({ width, height, title, desc, body, defs = "" }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
  <title id="title">${esc(title)}</title>
  <desc id="desc">${esc(desc)}</desc>
  <defs>
    <style>${fontCss}</style>
    <filter id="softShadow" x="-20%" y="-20%" width="140%" height="150%">
      <feDropShadow dx="0" dy="22" stdDeviation="24" flood-color="#223047" flood-opacity="0.14"/>
    </filter>
    <filter id="smallShadow" x="-20%" y="-20%" width="140%" height="150%">
      <feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#223047" flood-opacity="0.12"/>
    </filter>
    <filter id="whiteDog">
      <feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 1 0"/>
    </filter>
    <linearGradient id="inkWash" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#243044"/>
      <stop offset="1" stop-color="#172338"/>
    </linearGradient>
    <linearGradient id="paperWash" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#FFFFFF"/>
      <stop offset="1" stop-color="#F4F7FB"/>
    </linearGradient>
    ${defs}
  </defs>
  ${body}
</svg>
`;
}

function lines(items, x, y, size, leading, fill = colours.ink, cls = "display", attrs = "") {
  return items.map((item, index) => `<text class="${cls}" x="${x}" y="${y + index * leading}" font-size="${size}" fill="${fill}" ${attrs}>${esc(item)}</text>`).join("");
}

function logo(x, y, width, mode = "dark") {
  const bg = mode === "pill" ? `<rect x="${x - 26}" y="${y - 18}" width="${width + 52}" height="${width / 4 + 36}" rx="${width / 18}" fill="${colours.white}" opacity="0.98"/>` : "";
  return `${bg}<image href="${logoDataUrl}" x="${x}" y="${y}" width="${width}" height="${width / 4}" preserveAspectRatio="xMidYMid meet"/>`;
}

function dog(x, y, width, opacity = 1, white = false) {
  return `<image href="${dogDataUrl}" x="${x}" y="${y}" width="${width}" height="${width * 1.145}" opacity="${opacity}" ${white ? 'filter="url(#whiteDog)"' : ""} preserveAspectRatio="xMidYMid meet"/>`;
}

function accentBar(x, y, width, colour = colours.yellow, height = 18) {
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${height / 2}" fill="${colour}"/>`;
}

function button(x, y, width, label, fill = colours.yellowSoft, stroke = colours.yellow, ink = colours.ink, height = 70) {
  return `
    <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${height / 2}" fill="${fill}" stroke="${stroke}" stroke-width="3"/>
    <text class="sans" x="${x + width / 2}" y="${y + height * 0.62}" font-size="${height * 0.34}" text-anchor="middle" fill="${ink}">${esc(label)}</text>
  `;
}

function chip(x, y, width, label, fill, stroke, ink = colours.ink) {
  return `
    <rect x="${x}" y="${y}" width="${width}" height="48" rx="24" fill="${fill}" stroke="${stroke}" stroke-width="3"/>
    <text class="sans" x="${x + width / 2}" y="${y + 31}" font-size="20" text-anchor="middle" fill="${ink}">${esc(label)}</text>
  `;
}

function productCrop(x, y, width, height, options = {}) {
  const id = `screenClip${clipCounter++}`;
  const crop = options.crop || { x: 520, y: 300, w: 2550, h: 1780 };
  const scale = Math.max(width / crop.w, height / crop.h);
  const imageX = x - crop.x * scale;
  const imageY = y - crop.y * scale;
  const imageW = 3612 * scale;
  const imageH = 2338 * scale;
  const radius = options.radius ?? 36;
  return `
    <g filter="${options.shadow === false ? "" : "url(#softShadow)"}">
      <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="${colours.white}"/>
      <clipPath id="${id}"><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}"/></clipPath>
      <image href="${dashboardDataUrl}" x="${imageX}" y="${imageY}" width="${imageW}" height="${imageH}" clip-path="url(#${id})" preserveAspectRatio="xMidYMid slice"/>
      <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="none" stroke="${options.stroke || colours.line}" stroke-width="${options.strokeWidth || 3}"/>
    </g>
  `;
}

function browserProduct(x, y, width, height, options = {}) {
  const top = Math.min(92, height * 0.12);
  return `
    <g>
      <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${options.radius || 42}" fill="${colours.white}" filter="url(#softShadow)"/>
      <rect x="${x}" y="${y}" width="${width}" height="${top}" rx="${options.radius || 42}" fill="${colours.ink}"/>
      <path d="M${x} ${y + top * 0.58}H${x + width}V${y + top}H${x}Z" fill="${colours.ink}"/>
      <circle cx="${x + 38}" cy="${y + top * 0.5}" r="${top * 0.16}" fill="${colours.yellow}"/>
      <rect x="${x + 82}" y="${y + top * 0.38}" width="${width * 0.22}" height="${top * 0.16}" rx="${top * 0.08}" fill="${colours.white}" opacity="0.30"/>
      <rect x="${x + width * 0.75}" y="${y + top * 0.34}" width="${width * 0.10}" height="${top * 0.24}" rx="${top * 0.12}" fill="${colours.yellow}"/>
      <rect x="${x + width * 0.875}" y="${y + top * 0.34}" width="${width * 0.08}" height="${top * 0.24}" rx="${top * 0.12}" fill="${colours.white}" opacity="0.22"/>
      ${productCrop(x, y + top, width, height - top, { shadow: false, radius: 0, crop: options.crop, stroke: "none", strokeWidth: 0 })}
      <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${options.radius || 42}" fill="none" stroke="${colours.line}" stroke-width="3"/>
    </g>
  `;
}

function phonePortal(x, y, width, height) {
  const innerX = x + width * 0.09;
  const innerY = y + height * 0.06;
  const innerW = width * 0.82;
  return `
    <g filter="url(#softShadow)">
      <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${width * 0.14}" fill="${colours.ink}"/>
      <rect x="${innerX}" y="${innerY}" width="${innerW}" height="${height * 0.88}" rx="${width * 0.09}" fill="${colours.paper}"/>
      <rect x="${x + width * 0.37}" y="${y + height * 0.08}" width="${width * 0.26}" height="${height * 0.025}" rx="${height * 0.012}" fill="${colours.ink}"/>
      <text class="display" x="${innerX + width * 0.08}" y="${y + height * 0.23}" font-size="${width * 0.075}" fill="${colours.ink}">Join the Pack</text>
      <rect x="${innerX + width * 0.08}" y="${y + height * 0.28}" width="${innerW - width * 0.16}" height="${height * 0.11}" rx="${width * 0.035}" fill="${colours.white}" stroke="${colours.line}" stroke-width="2"/>
      <text class="sans" x="${innerX + width * 0.14}" y="${y + height * 0.35}" font-size="${width * 0.047}" fill="${colours.ink}">Pick dog</text>
      <text class="sans" x="${innerX + width * 0.14}" y="${y + height * 0.50}" font-size="${width * 0.047}" fill="${colours.ink}">Choose service</text>
      <rect x="${innerX + width * 0.08}" y="${y + height * 0.57}" width="${innerW - width * 0.16}" height="${height * 0.11}" rx="${width * 0.035}" fill="${colours.yellowSoft}"/>
      <text class="sans" x="${innerX + width * 0.14}" y="${y + height * 0.64}" font-size="${width * 0.047}" fill="${colours.ink}">Book slot</text>
      <rect x="${innerX + width * 0.08}" y="${y + height * 0.76}" width="${innerW - width * 0.16}" height="${height * 0.095}" rx="${width * 0.04}" fill="${colours.yellow}"/>
      <text class="sans" x="${x + width / 2}" y="${y + height * 0.82}" font-size="${width * 0.046}" text-anchor="middle" fill="${colours.ink}">Confirm</text>
    </g>
  `;
}

function premiumWebBanner() {
  return `
    <rect width="1600" height="600" fill="${colours.paper}"/>
    <rect x="46" y="44" width="1508" height="512" rx="44" fill="${colours.white}" stroke="${colours.line}" stroke-width="3" filter="url(#softShadow)"/>
    ${accentBar(46, 44, 1508, colours.yellow, 16)}
    ${logo(92, 82, 300)}
    <text class="caps" x="92" y="205" font-size="26" fill="${colours.slate}">software launch</text>
    <text class="display" x="88" y="306" font-size="82" fill="${colours.ink}">SmarterDog is live</text>
    <text class="body" x="92" y="365" font-size="31" fill="${colours.slate}">Beautiful booking software</text>
    <text class="body" x="92" y="405" font-size="31" fill="${colours.slate}">for real grooming days.</text>
    ${button(92, 430, 360, "Book. Groom. Remind.")}
    ${browserProduct(865, 150, 590, 320, { radius: 36 })}
    ${dog(1372, 420, 105, 0.14)}
  `;
}

function premiumSocialBanner() {
  return `
    <rect width="1200" height="628" fill="${colours.paper}"/>
    <rect x="50" y="50" width="1100" height="528" rx="42" fill="${colours.white}" stroke="${colours.line}" stroke-width="3" filter="url(#softShadow)"/>
    ${accentBar(50, 50, 1100, colours.teal, 16)}
    <text class="caps" x="96" y="130" font-size="25" fill="${colours.slate}">launch announcement</text>
    ${lines(["The salon day,", "finally tidy."], 92, 242, 78, 86)}
    <text class="body" x="96" y="398" font-size="31" fill="${colours.slate}">Bookings, reminders and WhatsApp.</text>
    <text class="body" x="96" y="440" font-size="31" fill="${colours.slate}">Capacity in one calm place.</text>
    <text class="display" x="96" y="528" font-size="40" fill="${colours.ink}">SmarterDog Salon Booking Platform</text>
    ${productCrop(760, 150, 330, 246, { crop: { x: 1280, y: 450, w: 1500, h: 1080 }, radius: 32 })}
    ${dog(892, 430, 124, 0.16)}
  `;
}

function premiumEmailBanner() {
  return `
    <rect width="1200" height="400" fill="${colours.paper}"/>
    <rect x="38" y="34" width="1124" height="332" rx="34" fill="${colours.white}" stroke="${colours.line}" stroke-width="3" filter="url(#smallShadow)"/>
    ${accentBar(38, 34, 1124, colours.coral, 14)}
    ${logo(62, 60, 260)}
    <text class="display" x="62" y="185" font-size="60" fill="${colours.ink}">Now launching</text>
    <text class="display" x="62" y="252" font-size="50" fill="${colours.coral}">booking built for grooming.</text>
    <text class="body" x="64" y="326" font-size="26" fill="${colours.slate}">Staff dashboard + customer portal + reminders + WhatsApp inbox</text>
    ${productCrop(820, 82, 260, 200, { crop: { x: 1320, y: 440, w: 1300, h: 980 }, radius: 24 })}
  `;
}

function premiumStoryBanner() {
  return `
    <rect width="1080" height="1920" fill="${colours.paper}"/>
    <rect x="90" y="112" width="900" height="1140" rx="64" fill="url(#inkWash)" filter="url(#softShadow)"/>
    ${accentBar(90, 112, 900, colours.yellow, 18)}
    ${logo(150, 180, 310, "pill")}
    ${dog(740, 198, 120, 0.24, true)}
    <text class="caps" x="150" y="410" font-size="34" fill="${colours.yellow}">launch day</text>
    ${lines(["Bookings", "sorted."], 145, 620, 124, 136, colours.white)}
    ${lines(["Messages", "calmer."], 145, 925, 118, 130, colours.white)}
    ${button(150, 1110, 430, "Built for grooming salons", colours.white, colours.white, colours.ink, 76)}
    <rect x="90" y="1350" width="900" height="390" rx="56" fill="${colours.white}" stroke="${colours.line}" stroke-width="4" filter="url(#smallShadow)"/>
    ${accentBar(90, 1350, 900, colours.teal, 16)}
    <text class="body" x="540" y="1515" font-size="38" text-anchor="middle" fill="${colours.slate}">SmarterDog Salon Booking Platform</text>
    <text class="display" x="540" y="1645" font-size="72" text-anchor="middle" fill="${colours.ink}">Your salon day, organised.</text>
  `;
}

function premiumLaunchPoster() {
  return `
    <rect width="3508" height="4961" fill="${colours.paper}"/>
    ${logo(250, 210, 660)}
    <rect x="220" y="610" width="3068" height="1880" rx="86" fill="url(#inkWash)" filter="url(#softShadow)"/>
    ${accentBar(220, 610, 3068, colours.yellow, 22)}
    <text class="caps" x="360" y="875" font-size="54" fill="${colours.yellow}">software launch</text>
    ${lines(["Beautiful booking", "software."], 350, 1200, 180, 204, colours.white)}
    ${lines(["For real", "grooming days."], 350, 1645, 118, 140, colours.white)}
    <text class="body" x="360" y="2145" font-size="50" fill="#D7E0EC">Bookings, reminders, WhatsApp and capacity in one calm command centre.</text>
    ${browserProduct(1905, 1080, 1040, 720, { radius: 56 })}
    ${dog(2730, 1980, 260, 0.20, true)}
    ${posterCard(310, 2830, 850, 520, colours.yellow, "Bookings", "Plan each day without overfilling it.")}
    ${posterCard(1328, 2830, 850, 520, colours.teal, "Messages", "Keep WhatsApp decisions calm and clear.")}
    ${posterCard(2346, 2830, 850, 520, colours.coral, "Capacity", "Respect 2-2-1 limits before the diary gets messy.")}
    <rect x="220" y="3920" width="3068" height="560" rx="80" fill="${colours.white}" stroke="${colours.line}" stroke-width="4" filter="url(#smallShadow)"/>
    ${accentBar(220, 3920, 3068, colours.yellow, 18)}
    <text class="display" x="360" y="4150" font-size="112" fill="${colours.ink}">SmarterDog Salon Booking Platform</text>
    <text class="body" x="365" y="4295" font-size="48" fill="${colours.slate}">A calmer system for salon teams, customers and the dogs in between.</text>
  `;
}

function posterCard(x, y, width, height, accent, title, copy) {
  return `
    <g transform="translate(${x} ${y})">
      <rect x="0" y="0" width="${width}" height="${height}" rx="52" fill="${colours.white}" stroke="${colours.line}" stroke-width="4" filter="url(#smallShadow)"/>
      ${accentBar(0, 0, width, accent, 18)}
      <text class="display" x="62" y="150" font-size="72" fill="${colours.ink}">${esc(title)}</text>
      <text class="body" x="64" y="244" font-size="34" fill="${colours.slate}">${esc(copy)}</text>
      <rect x="64" y="390" width="430" height="42" rx="21" fill="${accent}" opacity="0.16"/>
      <rect x="64" y="390" width="300" height="42" rx="21" fill="${accent}"/>
      ${dog(width - 190, height - 190, 115, 0.08)}
    </g>
  `;
}

function premiumCustomerPoster() {
  return `
    <rect width="3508" height="4961" fill="${colours.paper}"/>
    ${logo(250, 210, 660)}
    <rect x="220" y="620" width="3068" height="1830" rx="86" fill="${colours.white}" stroke="${colours.line}" stroke-width="4" filter="url(#softShadow)"/>
    ${accentBar(220, 620, 3068, colours.coral, 22)}
    <text class="caps" x="360" y="890" font-size="52" fill="${colours.slate}">customer launch poster</text>
    ${lines(["Join the", "Pack."], 350, 1230, 235, 260, colours.ink)}
    <text class="body" x="360" y="1850" font-size="54" fill="${colours.slate}">Book online, manage your dogs and keep appointments close to hand.</text>
    ${phonePortal(2310, 900, 560, 910)}
    ${dog(1970, 1890, 190, 0.11)}
    <g transform="translate(300 2860)">
      ${[
        ["1", "Pick dog", colours.teal],
        ["2", "Choose service", colours.yellow],
        ["3", "Select slot", colours.teal],
        ["4", "Confirm", colours.yellow],
      ].map(([n, label, accent], index) => `
        <g transform="translate(${index * 760} 0)">
          <rect x="0" y="0" width="600" height="340" rx="48" fill="${colours.white}" stroke="${colours.line}" stroke-width="4" filter="url(#smallShadow)"/>
          ${accentBar(0, 0, 600, accent, 16)}
          <circle cx="92" cy="178" r="68" fill="${accent === colours.yellow ? colours.yellowSoft : colours.tealSoft}" stroke="${accent}" stroke-width="5"/>
          <text class="display" x="92" y="202" font-size="68" text-anchor="middle" fill="${colours.ink}">${n}</text>
          <text class="sans" x="190" y="194" font-size="42" fill="${colours.ink}">${label}</text>
        </g>
      `).join("")}
    </g>
    <rect x="220" y="4050" width="3068" height="520" rx="78" fill="${colours.white}" stroke="${colours.line}" stroke-width="4" filter="url(#smallShadow)"/>
    ${accentBar(220, 4050, 3068, colours.yellow, 18)}
    ${lines(["Less back-and-forth.", "More happy arrivals."], 360, 4255, 104, 128, colours.ink)}
  `;
}

function stickerBase(fill, accent, shape = "rounded") {
  if (shape === "circle") {
    return `
      <circle cx="450" cy="450" r="330" fill="${fill}" stroke="${colours.line}" stroke-width="5" filter="url(#smallShadow)"/>
      <path d="M232 210A330 330 0 0 1 668 210" fill="none" stroke="${accent}" stroke-width="22" stroke-linecap="round"/>
    `;
  }
  if (shape === "ticket") {
    return `
      <path d="M152 210H748Q802 210 802 264V365A86 86 0 0 0 802 535V636Q802 690 748 690H152Q98 690 98 636V535A86 86 0 0 0 98 365V264Q98 210 152 210Z" fill="${fill}" stroke="${colours.line}" stroke-width="5" filter="url(#smallShadow)"/>
      ${accentBar(178, 210, 544, accent, 18)}
    `;
  }
  if (shape === "tag") {
    return `
      <path d="M126 210H638L790 362V650Q790 702 738 702H126Q74 702 74 650V262Q74 210 126 210Z" fill="${fill}" stroke="${colours.line}" stroke-width="5" filter="url(#smallShadow)"/>
      <circle cx="690" cy="310" r="22" fill="${accent}"/>
      ${accentBar(164, 210, 460, accent, 18)}
    `;
  }
  if (shape === "hex") {
    return `
      <path d="M190 230H710L810 450L710 670H190L90 450L190 230Z" fill="${fill}" stroke="${colours.line}" stroke-width="5" filter="url(#smallShadow)"/>
      ${accentBar(240, 230, 420, accent, 18)}
    `;
  }
  return `
    <rect x="148" y="178" width="604" height="544" rx="64" fill="${fill}" stroke="${colours.line}" stroke-width="5" filter="url(#smallShadow)"/>
    ${accentBar(148, 178, 604, accent, 18)}
  `;
}

function sticker({ fill, accent, shape, title, subline, dogWhite = false }) {
  const isCircle = shape === "circle";
  const titleX = isCircle ? 185 : 170;
  const titleY = isCircle ? 332 : 330;
  const dogX = isCircle ? 625 : 640;
  const dogY = isCircle ? 314 : 300;
  return `
    <rect width="900" height="900" fill="${colours.white}"/>
    ${stickerBase(fill, accent, shape)}
    ${dog(dogX, dogY, 118, dogWhite ? 0.24 : 0.92, dogWhite)}
    ${lines(Array.isArray(title) ? title : [title], titleX, titleY, 66, 76, dogWhite ? colours.white : colours.ink)}
    <text class="sans" x="${titleX}" y="${titleY + 185}" font-size="28" fill="${dogWhite ? "#D7E0EC" : colours.slate}">${esc(subline)}</text>
  `;
}

function stickerSheet() {
  const items = [
    sticker({ fill: colours.yellowSoft, accent: colours.yellow, shape: "ticket", title: ["Bookings", "sorted."], subline: "Calm calendar control" }),
    sticker({ fill: colours.tealSoft, accent: colours.teal, shape: "rounded", title: ["Messages", "calmer."], subline: "WhatsApp without the scramble" }),
    sticker({ fill: colours.coralSoft, accent: colours.coral, shape: "circle", title: ["2-2-1", "ready"], subline: "Capacity-aware booking" }),
    sticker({ fill: colours.tealSoft, accent: colours.teal, shape: "tag", title: ["Join the", "Pack"], subline: "Customer portal launch" }),
    sticker({ fill: "url(#inkWash)", accent: colours.yellow, shape: "circle", title: ["Launch", "crew"], subline: "SmarterDog is live", dogWhite: true }),
    sticker({ fill: colours.white, accent: colours.coral, shape: "hex", title: ["Built for", "grooming"], subline: "Not generic appointments" }),
  ];
  const positions = [
    [150, 620], [1330, 620],
    [150, 1530], [1330, 1530],
    [150, 2440], [1330, 2440],
  ];
  return `
    <rect width="2480" height="3508" fill="${colours.paper}"/>
    <rect x="140" y="110" width="2200" height="300" rx="50" fill="${colours.white}" stroke="${colours.line}" stroke-width="4" filter="url(#smallShadow)"/>
    ${accentBar(140, 110, 2200, colours.yellow, 18)}
    <text class="display" x="220" y="230" font-size="78" fill="${colours.ink}">Premium launch stickers</text>
    <text class="body" x="224" y="310" font-size="34" fill="${colours.slate}">Six bold badges. Big type. Clear cuts. The logo dog as a proper brand mark.</text>
    ${dog(2050, 145, 145, 0.16)}
    ${dog(2210, 150, 118, 0.28)}
    ${positions.map(([x, y], index) => `<g transform="translate(${x} ${y}) scale(0.82)">${items[index].replace('<rect width="900" height="900" fill="#FFFFFF"/>', "")}</g>`).join("")}
    <text class="caps" x="160" y="3420" font-size="26" fill="${colours.slate}">A4 sticker sheet - native PNG and editable SVG included</text>
  `;
}

function writeStickerAssets() {
  return [
    ["sticker-bookings-sorted.svg", "Sticker - Bookings Sorted", sticker({ fill: colours.yellowSoft, accent: colours.yellow, shape: "ticket", title: ["Bookings", "sorted."], subline: "Calm calendar control" })],
    ["sticker-messages-calmer.svg", "Sticker - Messages Calmer", sticker({ fill: colours.tealSoft, accent: colours.teal, shape: "rounded", title: ["Messages", "calmer."], subline: "WhatsApp without the scramble" })],
    ["sticker-capacity-ready.svg", "Sticker - 2-2-1 Ready", sticker({ fill: colours.coralSoft, accent: colours.coral, shape: "circle", title: ["2-2-1", "ready"], subline: "Capacity-aware booking" })],
    ["sticker-join-the-pack.svg", "Sticker - Join the Pack", sticker({ fill: colours.tealSoft, accent: colours.teal, shape: "tag", title: ["Join the", "Pack"], subline: "Customer portal launch" })],
    ["sticker-launch-crew.svg", "Sticker - Launch Crew", sticker({ fill: "url(#inkWash)", accent: colours.yellow, shape: "circle", title: ["Launch", "crew"], subline: "SmarterDog is live", dogWhite: true })],
    ["sticker-built-for-grooming.svg", "Sticker - Built for Grooming", sticker({ fill: colours.white, accent: colours.coral, shape: "hex", title: ["Built for", "grooming"], subline: "Not generic appointments" })],
  ];
}

async function writeAsset({ type, file, width, height, title, desc, body, category, notes }) {
  const dir = path.join(assetDir, type);
  await fs.mkdir(dir, { recursive: true });
  const svg = svgShell({ width, height, title, desc, body });
  const svgPath = path.join(dir, file);
  await fs.writeFile(svgPath, svg, "utf8");
  const pngFile = file.replace(/\.svg$/, ".png");
  const pngPath = path.join(exportDir, pngFile);
  assets.push({
    id: file.replace(/\.svg$/, ""),
    index: assets.length + 1,
    title,
    category,
    notes,
    width,
    height,
    output: path.relative(outDir, svgPath),
    href: path.relative(outDir, svgPath),
    src: path.relative(outDir, pngPath),
    png: path.relative(outDir, pngPath),
    retinaPng: category === "banners" ? path.join("exports", "png-2x", pngFile.replace(/\.png$/, "@2x.png")) : undefined,
  });
}

async function renderSvg(page, asset, targetPath, width, height) {
  const svgPath = path.join(outDir, asset.output);
  const svg = await fs.readFile(svgPath, "utf8");
  const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await page.setViewportSize({ width, height });
  await page.setContent(`<!doctype html>
    <html>
      <head><meta charset="utf-8"><style>html,body{margin:0;width:100%;height:100%;background:white;}#frame{width:${width}px;height:${height}px;display:flex;}img{width:100%;height:100%;display:block;}</style></head>
      <body><div id="frame"><img src="${dataUrl}" alt=""></div></body>
    </html>`);
  await page.locator("#frame").screenshot({ path: targetPath });
}

async function renderAssets() {
  await fs.mkdir(exportDir, { recursive: true });
  await fs.mkdir(retinaDir, { recursive: true });
  const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  const launchOptions = await fs.access(chromePath).then(
    () => ({ executablePath: chromePath }),
    () => ({}),
  );
  const browser = await chromium.launch(launchOptions);
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const asset of assets) {
    const pngPath = path.join(outDir, asset.png);
    await renderSvg(page, asset, pngPath, asset.width, asset.height);
    if (asset.retinaPng) {
      await renderSvg(page, asset, path.join(outDir, asset.retinaPng), asset.width * 2, asset.height * 2);
    }
  }
  await browser.close();
}

async function writeDocs() {
  const manifest = assets.map(({ retinaPng, ...asset }) => ({
    ...asset,
    ...(retinaPng ? { retinaPng } : {}),
  }));
  await fs.writeFile(path.join(outDir, "review-manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");
  await fs.writeFile(path.join(outDir, "review-options.json"), JSON.stringify({
    title: "SmarterDog Premium Launch Direction",
    summary: "Premium launch direction using real product screenshots, stronger hierarchy and bold badge-style stickers.",
    preset: "image-wall",
    showCaptions: true,
    showControls: true,
    minTileWidth: 280,
    contactSheetOutput: "review-contact-sheet.png",
  }, null, 2) + "\n", "utf8");
  await fs.writeFile(path.join(outDir, "launch-kit.md"), `# SmarterDog Premium Launch Direction

This run moves away from tiny SVG mockups and into a cleaner launch campaign system:

- real product screenshot crops for credibility;
- fewer, stronger claims;
- bold sticker badges instead of mini posters;
- calmer premium surfaces based on the app palette.

Native PNG exports live in \`exports/png/\`. 2x banner exports live in \`exports/png-2x/\`.
`, "utf8");
}

async function writeShowcase() {
  const image = async (relativePath) => readDataUrl(path.join(outDir, relativePath), "image/png");
  const web = await image("exports/png/banner-web-launch-1600x600.png");
  const social = await image("exports/png/banner-social-launch-1200x628.png");
  const poster = await image("exports/png/poster-software-launch-a3.png");
  const stickerSheetPng = await image("exports/png/sticker-sheet-a4.png");
  const stickers = await Promise.all([
    "sticker-bookings-sorted.png",
    "sticker-messages-calmer.png",
    "sticker-capacity-ready.png",
    "sticker-join-the-pack.png",
    "sticker-launch-crew.png",
    "sticker-built-for-grooming.png",
  ].map((file) => image(`exports/png/${file}`)));

  const card = (x, y, w, h, label, body) => `
    <g>
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="34" fill="${colours.white}" stroke="${colours.line}" stroke-width="3" filter="url(#smallShadow)"/>
      ${body}
      <text class="caps" x="${x + 24}" y="${y + h - 24}" font-size="18" fill="${colours.slate}">${esc(label)}</text>
    </g>
  `;

  const body = `
    <rect width="3600" height="2400" fill="${colours.paper}"/>
    <rect x="90" y="80" width="3420" height="250" rx="52" fill="url(#inkWash)" filter="url(#softShadow)"/>
    ${accentBar(90, 80, 3420, colours.yellow, 18)}
    ${logo(145, 136, 360, "pill")}
    <text class="display" x="585" y="182" font-size="64" fill="${colours.white}">Premium launch direction</text>
    <text class="body" x="590" y="244" font-size="30" fill="#D7E0EC">Real product imagery, calmer hierarchy, bold badge stickers, and stronger campaign surfaces.</text>
    ${dog(3260, 130, 120, 0.28, true)}

    ${card(110, 420, 1540, 660, "web hero banner", `<image href="${web}" x="155" y="482" width="1450" height="544" preserveAspectRatio="xMidYMid meet"/>`)}
    ${card(1690, 420, 860, 660, "social launch card", `<image href="${social}" x="1735" y="500" width="770" height="403" preserveAspectRatio="xMidYMid meet"/>`)}
    ${card(2590, 420, 900, 1450, "a3 launch poster", `<image href="${poster}" x="2672" y="500" width="736" height="1041" preserveAspectRatio="xMidYMid meet"/>`)}

    ${card(110, 1120, 760, 750, "premium sticker sheet", `<image href="${stickerSheetPng}" x="274" y="1186" width="432" height="611" preserveAspectRatio="xMidYMid meet"/>`)}

    <g transform="translate(910 1120)">
      <rect x="0" y="0" width="1640" height="750" rx="34" fill="${colours.white}" stroke="${colours.line}" stroke-width="3" filter="url(#smallShadow)"/>
      <text class="caps" x="28" y="56" font-size="18" fill="${colours.slate}">sticker badges</text>
      ${stickers.map((src, index) => {
        const x = 120 + (index % 3) * 485;
        const y = 104 + Math.floor(index / 3) * 300;
        return `<image href="${src}" x="${x}" y="${y}" width="250" height="250" preserveAspectRatio="xMidYMid meet"/>`;
      }).join("")}
    </g>
  `;
  const svg = svgShell({
    width: 3600,
    height: 2400,
    title: "Premium Launch Kit Contact Sheet",
    desc: "Premium SmarterDog launch kit contact sheet.",
    body,
  });
  const svgPath = path.join(outDir, "launch-kit-contact-sheet.svg");
  await fs.writeFile(svgPath, svg, "utf8");

  const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  const launchOptions = await fs.access(chromePath).then(
    () => ({ executablePath: chromePath }),
    () => ({}),
  );
  const browser = await chromium.launch(launchOptions);
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  await page.setViewportSize({ width: 3600, height: 2400 });
  await page.setContent(`<!doctype html><html><body style="margin:0"><img src="${dataUrl}" style="width:3600px;height:2400px;display:block"></body></html>`);
  await page.locator("img").screenshot({ path: path.join(outDir, "launch-kit-contact-sheet.png") });
  await browser.close();
}

async function main() {
  fontCss = await buildFontCss();
  logoDataUrl = await readDataUrl("scripts/assets/legacy-logo.png", "image/png");
  dogDataUrl = await readDataUrl("scripts/assets/legacy-dog-silhouette.png", "image/png");
  dashboardDataUrl = await readDataUrl(screenshotPath, "image/png");

  await fs.rm(outDir, { recursive: true, force: true });
  await fs.mkdir(outDir, { recursive: true });

  await writeAsset({
    type: "stickers",
    file: "sticker-sheet-a4.svg",
    width: 2480,
    height: 3508,
    title: "A4 Sticker Sheet",
    desc: "Premium launch sticker sheet for SmarterDog.",
    category: "stickers",
    notes: "Print sheet with six bold premium launch badges.",
    body: stickerSheet(),
  });

  for (const [file, title, body] of writeStickerAssets()) {
    await writeAsset({
      type: "stickers",
      file,
      width: 900,
      height: 900,
      title,
      desc: `${title} for the premium SmarterDog launch direction.`,
      category: "stickers",
      notes: "Individual premium launch badge.",
      body,
    });
  }

  await writeAsset({
    type: "posters",
    file: "poster-software-launch-a3.svg",
    width: 3508,
    height: 4961,
    title: "A3 Poster - Software Launch",
    desc: "Premium software launch poster using real product screenshot imagery.",
    category: "posters",
    notes: "Hero launch poster for business-facing promotion.",
    body: premiumLaunchPoster(),
  });

  await writeAsset({
    type: "posters",
    file: "poster-customer-portal-a3.svg",
    width: 3508,
    height: 4961,
    title: "A3 Poster - Customer Portal",
    desc: "Premium customer-facing Join the Pack launch poster.",
    category: "posters",
    notes: "Front-of-house customer poster for portal launch.",
    body: premiumCustomerPoster(),
  });

  await writeAsset({
    type: "banners",
    file: "banner-web-launch-1600x600.svg",
    width: 1600,
    height: 600,
    title: "Web Banner",
    desc: "Premium web launch banner.",
    category: "banners",
    notes: "Website hero or announcement strip.",
    body: premiumWebBanner(),
  });

  await writeAsset({
    type: "banners",
    file: "banner-social-launch-1200x628.svg",
    width: 1200,
    height: 628,
    title: "Social Banner",
    desc: "Premium social launch card.",
    category: "banners",
    notes: "Social/link preview launch asset.",
    body: premiumSocialBanner(),
  });

  await writeAsset({
    type: "banners",
    file: "banner-email-launch-1200x400.svg",
    width: 1200,
    height: 400,
    title: "Email Banner",
    desc: "Premium email launch banner.",
    category: "banners",
    notes: "Newsletter or email hero.",
    body: premiumEmailBanner(),
  });

  await writeAsset({
    type: "banners",
    file: "banner-story-launch-1080x1920.svg",
    width: 1080,
    height: 1920,
    title: "Story Banner",
    desc: "Premium vertical story launch banner.",
    category: "banners",
    notes: "Instagram/Facebook story format.",
    body: premiumStoryBanner(),
  });

  await renderAssets();
  await writeDocs();
  await writeShowcase();
  console.log(`Generated ${assets.length} premium launch assets in ${outDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

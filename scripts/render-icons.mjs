// Renders public/app/icons/app-icon.svg to PNGs at the sizes iOS / Android / PWA need.
// Usage: node scripts/render-icons.mjs
//
// Output:
//   public/app/apple-touch-icon.png            (180x180)
//   public/app/icons/apple-touch-icon-180.png  (180x180, mirror for explicit reference)
//   public/app/icons/icon-192.png              (192x192)
//   public/app/icons/icon-512.png              (512x512)
//   public/app/icons/icon-1024.png             (1024x1024, master)

import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const publicDir = path.join(repoRoot, 'public', 'app');
const iconsDir = path.join(publicDir, 'icons');
const svgPath = path.join(iconsDir, 'app-icon.svg');

const svg = fs.readFileSync(svgPath, 'utf8');

const targets = [
  { out: path.join(publicDir, 'apple-touch-icon.png'),         size: 180 },
  { out: path.join(iconsDir,  'apple-touch-icon-180.png'),     size: 180 },
  { out: path.join(iconsDir,  'icon-192.png'),                 size: 192 },
  { out: path.join(iconsDir,  'icon-512.png'),                 size: 512 },
  { out: path.join(iconsDir,  'icon-1024.png'),                size: 1024 },
];

const html = (size) => `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  html, body { margin: 0; padding: 0; background: transparent; }
  body { width: ${size}px; height: ${size}px; }
  svg { display: block; width: ${size}px; height: ${size}px; }
</style>
</head>
<body>
${svg}
</body>
</html>`;

const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});
try {
  const context = await browser.newContext({ baseURL: 'http://localhost:0' });
  for (const { out, size } of targets) {
    const page = await context.newPage();
    await page.setViewportSize({ width: size, height: size });
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.startsWith('/fonts/')) {
        const fp = path.join(publicDir, url.pathname);
        if (fs.existsSync(fp)) {
          return route.fulfill({ status: 200, body: fs.readFileSync(fp), headers: { 'content-type': 'font/woff2' } });
        }
      }
      return route.continue();
    });
    await page.setContent(html(size), { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    const buf = await page.locator('svg').screenshot({ omitBackground: true });
    fs.writeFileSync(out, buf);
    await page.close();
    console.log(`wrote ${path.relative(repoRoot, out)} (${size}x${size}, ${buf.length} bytes)`);
  }
} finally {
  await browser.close();
}

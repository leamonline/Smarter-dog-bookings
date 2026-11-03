/**
 * Writes one HTML file per public marketing route after `vite build`.
 *
 * React Router framework mode would replace BrowserRouter and the Vite React
 * plugin. vite-react-ssg does not target this Vite 8 + React Router 7 app.
 * This script renders the existing tree with renderToString and stamps the
 * route's own head into the built shell. The booking app is a separate build
 * and is not touched.
 */
import { brotliCompressSync, gzipSync } from 'node:zlib';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const websiteRoot = fileURLToPath(new URL('..', import.meta.url));
const distDir = join(websiteRoot, 'dist');

function writeHtml(relativePath, html) {
  const file = join(distDir, relativePath);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
  writeFileSync(`${file}.gz`, gzipSync(Buffer.from(html)));
  writeFileSync(`${file}.br`, brotliCompressSync(Buffer.from(html)));
}

function assertOutput(relativePath, html, localBusinessId) {
  const localBusiness = html.split(localBusinessId).length - 1;
  if (localBusiness !== 1) {
    throw new Error(`${relativePath} has ${localBusiness} LocalBusiness script ids, expected 1`);
  }
  if (html.includes('07507 731487')) {
    throw new Error(`${relativePath} still contains the old phone number`);
  }
}

const vite = await createServer({
  root: websiteRoot,
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'warn',
});

try {
  const { render } = await vite.ssrLoadModule('/src/entry-server.jsx');
  const {
    FAQ_SCRIPT_ID,
    LOCAL_BUSINESS_SCRIPT_ID,
    NOT_FOUND_RENDER_PATH,
    NOT_FOUND_SEO,
    PRERENDER_PATHS,
    faqSchemaFor,
    routeSeoFor,
    stampHtml,
  } = await vite.ssrLoadModule('/src/seo/publicSeo.js');
  const template = readFileSync(join(distDir, 'index.html'), 'utf8');

  for (const path of PRERENDER_PATHS) {
    const body = await render(path);
    const html = stampHtml(template, {
      path,
      body,
      seo: routeSeoFor(path),
      faq: faqSchemaFor(path),
    });
    const relativePath = path === '/' ? 'index.html' : `${path.slice(1)}/index.html`;
    writeHtml(relativePath, html);
    assertOutput(relativePath, html, LOCAL_BUSINESS_SCRIPT_ID);
  }

  const notFoundBody = await render(NOT_FOUND_RENDER_PATH);
  const notFoundHtml = stampHtml(template, {
    path: NOT_FOUND_RENDER_PATH,
    body: notFoundBody,
    seo: NOT_FOUND_SEO,
    faq: null,
  });
  writeHtml('404.html', notFoundHtml);
  assertOutput('404.html', notFoundHtml, LOCAL_BUSINESS_SCRIPT_ID);

  const services = readFileSync(join(distDir, 'services/index.html'), 'utf8');
  if (!services.includes('De-shed')) {
    throw new Error('prerendered /services HTML does not contain De-shed');
  }
  if (!services.includes('<title>Services | Smarter Dog Grooming Salon</title>')) {
    throw new Error('prerendered /services is missing its own title');
  }
  if (!services.includes('rel="canonical" href="https://smarterdog.co.uk/services"')) {
    throw new Error('prerendered /services is missing its canonical');
  }
  const nervous = readFileSync(join(distDir, 'nervous-anxious-dog-grooming/index.html'), 'utf8');
  if (!nervous.includes('No cages, no cabinet dryers')) {
    throw new Error('prerendered nervous-dog page is missing its copy');
  }
  if ((nervous.match(new RegExp(FAQ_SCRIPT_ID, 'g')) || []).length !== 1) {
    throw new Error('prerendered nervous-dog page should have one FAQPage script');
  }
  console.log(`prerendered ${PRERENDER_PATHS.length} marketing routes plus 404.html`);
} finally {
  await vite.close();
}

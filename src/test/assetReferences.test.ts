import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Every asset URL the deployment hands a browser must resolve to a real file.
//
// Unknown paths 404. A missing hashed chunk is not rewritten to HTML, so the
// browser does not try to execute text/html as a module. Headers still match
// on the request path: /app/(fonts|icons|images)/(.*) is immutable, so a typo
// under that prefix can cache its 404 for a year. A dangling reference must
// never be committed.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** Where a root-absolute URL's file lives on disk, or null if not ours to check. */
function resolveUrl(url: string): string | null {
  let p = url;

  // Our own production origin is written out in full for og:image, because the
  // page has no base a relative path could resolve against for a crawler.
  const ORIGIN = "https://smarterdog.co.uk";
  if (p.startsWith(ORIGIN)) p = p.slice(ORIGIN.length);

  if (!p.startsWith("/")) return null;          // relative or another origin
  p = p.split("?")[0].split("#")[0];

  // The booking app's own namespace.
  if (p.startsWith("/app/")) return path.join(repoRoot, "public", p.slice(1));

  // Anything else at the root comes from the marketing site's build, which is
  // copied first in scripts/build-combined.mjs, or from the booking app's
  // short allowlist of root files.
  const website = path.join(repoRoot, "website", "public", p.slice(1));
  if (fs.existsSync(website)) return website;
  return path.join(repoRoot, "public", p.slice(1));
}

const ASSET = /\.(?:png|svg|jpe?g|webp|avif|ico|woff2?|json|js)$/i;

function urlsIn(text: string): string[] {
  const found = new Set<string>();
  // href="…", src="…", content="…", url(…) and bare "…" in JS/JSON.
  for (const [, url] of text.matchAll(/["'(]((?:https?:\/\/[^"')\s]+|\/[^"')\s]+))["')]/g)) {
    if (ASSET.test(url)) found.add(url);
  }
  return [...found];
}

const SOURCES = [
  "index.html",
  "public/app/manifest.json",
  "public/push-sw.js",
];

describe("asset references resolve to real files", () => {
  it.each(SOURCES)("%s points at nothing that is missing", (rel) => {
    const text = fs.readFileSync(path.join(repoRoot, rel), "utf8");
    const dangling: string[] = [];
    for (const url of urlsIn(text)) {
      const resolved = resolveUrl(url);
      if (resolved === null) continue;          // external origin — not ours
      if (!fs.existsSync(resolved)) {
        dangling.push(`${url}  ->  ${path.relative(repoRoot, resolved)}`);
      }
    }
    expect(dangling).toEqual([]);
  });

  it("checks a meaningful number of urls, so a broken regex cannot pass silently", () => {
    const total = SOURCES.reduce(
      (n, rel) => n + urlsIn(fs.readFileSync(path.join(repoRoot, rel), "utf8"))
        .filter((u) => resolveUrl(u) !== null).length,
      0,
    );
    expect(total).toBeGreaterThanOrEqual(10);
  });

  it("would catch a typo — the guard is not vacuous", () => {
    // The exact failure this exists to prevent: /app/icons/icon-192.svg does
    // not exist, and on the real deployment would serve marketing HTML with a
    // one-year immutable cache rather than a 404.
    expect(resolveUrl("/app/icons/icon-192.svg")).not.toBeNull();
    expect(fs.existsSync(resolveUrl("/app/icons/icon-192.svg")!)).toBe(false);
    expect(fs.existsSync(resolveUrl("/app/icons/icon-192.png")!)).toBe(true);
    // And the og:image, written as an absolute url, still resolves.
    expect(fs.existsSync(resolveUrl("https://smarterdog.co.uk/og-booking-2026.png")!)).toBe(true);
  });
});

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolveLegacyRedirect, resolveMount } from "../routing/entrypoints";
import { DEFAULT_POSTHOG_HOST } from "../lib/analytics";

const config = JSON.parse(readFileSync("vercel.json", "utf8"));
const BOOKING_SHELL = "/app/index.html";

const rewriteFor = (source: string) =>
  config.rewrites.find((r: { source: string }) => r.source === source);
const redirectFor = (source: string) =>
  config.redirects.find((r: { source: string }) => r.source === source);
const indexOfRewrite = (source: string) =>
  config.rewrites.findIndex((r: { source: string }) => r.source === source);

describe("vercel routing table", () => {
  it("builds and publishes the combined output", () => {
    expect(config.buildCommand).toBe("node scripts/build-combined.mjs");
    expect(config.outputDirectory).toBe("dist-combined");
  });

  it("sends every booking entrance to the booking shell, not the marketing page", () => {
    // /app/index.html rather than /index.html: at the merged root "/" is the
    // marketing site, so rewriting there would serve the wrong app entirely.
    for (const source of [
      "/book", "/book/:path*", "/staff", "/staff/:path*", "/reset-password",
    ]) {
      expect(rewriteFor(source), source).toBeDefined();
      expect(rewriteFor(source).destination, source).toBe(BOOKING_SHELL);
    }
  });

  it("serves the installed staff app launch URL explicitly before the marketing fallback", () => {
    const manifest = JSON.parse(readFileSync("public/app/manifest.json", "utf8"));
    // The live /staff/:path* rule did not match the bare /staff/ launch URL.
    // Pin an exact rule using the manifest rather than assuming wildcard
    // matching or slash normalisation will send a home-screen launch here.
    expect(manifest.start_url).toBe("/staff/");
    expect(manifest.scope).toBe("/staff/");
    expect(rewriteFor(manifest.start_url)?.destination).toBe(BOOKING_SHELL);
    expect(resolveMount(manifest.start_url)).not.toBeNull();
  });

  it("does not rewrite unknown paths onto the marketing homepage", () => {
    // Public marketing routes are real HTML files, so Vercel serves them from
    // the filesystem. Anything else with no file and no rewrite is a 404
    // (404.html). A catch-all to /index.html used to answer those with HTTP 200
    // and the homepage shell, and it also turned a missing hashed asset into
    // text/html, which the browser refuses as a module.
    const destinations = config.rewrites.map((r: { destination: string }) => r.destination);
    // The marketing homepage is a file at /index.html. Rewriting other URLs
    // there is what made unknown paths return HTTP 200. Route HTML is served
    // from its own file instead.
    expect(destinations).not.toContain("/index.html");
    expect(indexOfRewrite("/((?!assets/|app/assets/).*)")).toBe(-1);
    expect(indexOfRewrite("/(.*)")).toBe(-1);
    expect(rewriteFor("/services").destination).toBe("/services/index.html");
    expect(rewriteFor("/nervous-anxious-dog-grooming").destination).toBe("/nervous-anxious-dog-grooming/index.html");
    expect(rewriteFor("/nonexistent-xyz")).toBeUndefined();
    for (const source of ["/book", "/book/:path*", "/staff", "/staff/", "/staff/:path*", "/reset-password", "/reset-password/"]) {
      expect(rewriteFor(source).destination, source).toBe(BOOKING_SHELL);
    }
  });

  it("redirects a trailing slash on a marketing page to the page without one", () => {
    // A rewrite that served /services/ as HTML left the browser on the slashed
    // URL. The client SEO map is keyed without the slash, so that page became
    // noindex with a Page Not Found title. Redirect first, then the unslashed
    // rewrite serves the file.
    const marketing = [
      "/approach", "/community", "/faq", "/houndsly",
      "/matted-coat-policy", "/privacy", "/services", "/terms",
      "/nervous-anxious-dog-grooming", "/senior-blind-deaf-dog-grooming",
      "/doodle-grooming-matted-coats", "/dog-de-shedding-ashton-under-lyne",
      "/sensitive-skin-dog-grooming-natural-shampoo", "/independent-dog-groomer-vs-chain",
    ];
    for (const path of marketing) {
      const rule = redirectFor(`${path}/`);
      expect(rule, path).toBeDefined();
      expect(rule.destination, path).toBe(path);
      expect(rule.permanent, path).toBe(true);
      expect(rewriteFor(`${path}/`), path).toBeUndefined();
      expect(rewriteFor(path).destination, path).toBe(`${path}/index.html`);
    }
  });

  it("sends www to the apex host and retires the old Website Builder paths", () => {
    const wwwRoot = config.redirects.find((r: { source: string; has?: { value: string }[] }) =>
      r.source === "/" && r.has?.[0]?.value === "www.smarterdog.co.uk");
    const wwwRest = config.redirects.find((r: { source: string; has?: { value: string }[] }) =>
      r.source === "/:path*" && r.has?.[0]?.value === "www.smarterdog.co.uk");
    expect(wwwRoot.destination).toBe("https://smarterdog.co.uk/");
    expect(wwwRoot.permanent).toBe(true);
    expect(wwwRest.destination).toBe("https://smarterdog.co.uk/:path*");
    expect(wwwRest.permanent).toBe(true);
    // Wayback Machine, 200 responses on the old site: /home, /about,
    // /contact-us, /f-a-qs, /raw-food. /services already exists.
    expect(redirectFor("/home").destination).toBe("/");
    expect(redirectFor("/home/").destination).toBe("/");
    expect(redirectFor("/about").destination).toBe("/approach");
    expect(redirectFor("/about/").destination).toBe("/approach");
    expect(redirectFor("/contact-us").destination).toBe("/");
    expect(redirectFor("/f-a-qs").destination).toBe("/faq");
    expect(redirectFor("/f-a-qs/").destination).toBe("/faq");
    expect(redirectFor("/raw-food").destination).toBe("/");
    expect(redirectFor("/raw-food/").destination).toBe("/");
    for (const rule of [wwwRoot, wwwRest, redirectFor("/home"), redirectFor("/about"), redirectFor("/f-a-qs"), redirectFor("/raw-food")]) {
      expect(rule.permanent).toBe(true);
    }
  });

  it("agrees with the client-side resolver about where old URLs go", () => {
    // Vercel answers first and the SPA answers for pages already open, so the
    // two must not disagree about a URL.
    expect(redirectFor("/customer").destination).toBe(resolveLegacyRedirect("/customer"));
    expect(redirectFor("/customer/book").destination).toBe(resolveLegacyRedirect("/customer/book"));
    // The resolver sends /stafflogin to /staff/; Vercel drops the trailing
    // slash, and the router treats them as the same route.
    expect(`${redirectFor("/stafflogin").destination}/`).toBe(resolveLegacyRedirect("/stafflogin"));
  });

  it("matches the more specific /customer redirect first", () => {
    // /customer/:path* would otherwise turn /customer/book into /book/book.
    const specific = config.redirects.findIndex((r: { source: string }) => r.source === "/customer/book");
    const wildcard = config.redirects.findIndex((r: { source: string }) => r.source === "/customer/:path*");
    expect(specific).toBeGreaterThanOrEqual(0);
    expect(specific).toBeLessThan(wildcard);
  });

  it("retires /customer permanently but keeps /stafflogin changeable", () => {
    expect(redirectFor("/customer").permanent).toBe(true);
    // A 308 here would be cached in staff browsers forever, so the entrance
    // could not be changed later.
    expect(redirectFor("/stafflogin").permanent).toBe(false);
  });

  it("redirects the staff paths that existed before the move", () => {
    // These used to be top-level: /today, /dogs, /inbox. The booking app's own
    // resolver handles them, but on the merged origin they never reach it —
    // an unmatched path is now a real 404, so a staff bookmark would miss the
    // app entirely without these redirects. Caught on production after the
    // marketing site moved to "/".
    for (const path of [
      "/today", "/dogs", "/humans", "/inbox", "/reports",
      "/settings", "/whatsapp", "/needs-attention", "/booking-workspace",
    ]) {
      const rule = redirectFor(path);
      expect(rule, path).toBeDefined();
      // The server must agree with the client resolver about the target.
      expect(rule.destination, path).toBe(resolveLegacyRedirect(path));
    }
  });

  it("carries the rest of the path on a legacy staff redirect", () => {
    // /dogs/:id is a real staff URL people share with each other.
    expect(redirectFor("/dogs/:path*").destination).toBe("/staff/dogs/:path*");
    expect(redirectFor("/humans/:path*").destination).toBe("/staff/humans/:path*");
  });

  it("never redirects a marketing page to the staff app", () => {
    // The website owns these; a stray rule here would take the salon's own
    // pages off the air.
    const marketing = [
      "/approach", "/community", "/faq", "/houndsly",
      "/matted-coat-policy", "/privacy", "/services", "/terms",
      "/nervous-anxious-dog-grooming", "/senior-blind-deaf-dog-grooming",
      "/doodle-grooming-matted-coats", "/dog-de-shedding-ashton-under-lyne",
      "/sensitive-skin-dog-grooming-natural-shampoo", "/independent-dog-groomer-vs-chain",
    ];
    const sources = config.redirects.map((r: { source: string }) => r.source);
    for (const path of marketing) expect(sources, path).not.toContain(path);
  });

  it("mounts every rewritten path in the app the rewrite implies", () => {
    for (const path of ["/book", "/book/new", "/staff", "/staff/today", "/reset-password", "/reset-password/"]) {
      expect(resolveMount(path), path).not.toBeNull();
    }
  });

  it("keeps the strict CSP on the booking app only", () => {
    const csp = config.headers.filter((h: { headers: { key: string }[] }) =>
      h.headers.some((x) => x.key === "Content-Security-Policy"));
    expect(csp).toHaveLength(1);
    // The marketing site is served without a CSP today (Bluehost sets none) and
    // loads Google Fonts, GA and EmailJS, which this policy would block.
    expect(csp[0].source).not.toBe("/(.*)");
    for (const prefix of ["book", "staff", "stafflogin", "reset-password", "app"]) {
      expect(csp[0].source, prefix).toContain(prefix);
    }
  });

  it("lets the booking app reach the default PostHog host", () => {
    // Without it the browser blocks every capture and analytics.ts swallows
    // the failure, so analytics would look switched on while sending nothing.
    const csp = config.headers
      .flatMap((h: { headers: { key: string; value: string }[] }) => h.headers)
      .find((x: { key: string }) => x.key === "Content-Security-Policy");
    const connectSrc = csp.value.split(";").map((d: string) => d.trim()).find((d: string) => d.startsWith("connect-src"));
    expect(connectSrc.split(/\s+/)).toContain(DEFAULT_POSTHOG_HOST);
  });

  it("never lets a service worker be cached", () => {
    // A long-lived sw.js pins staff on an old deploy until the cache expires.
    // "push-sw", not "sw" — "reset-password" contains "sw" and matches first.
    for (const marker of ["push-sw", "workbox"]) {
      const rule = config.headers.find((h: { source: string }) => h.source.includes(marker));
      expect(rule, marker).toBeDefined();
      expect(rule.headers[0].value, marker).toMatch(/max-age=0|no-cache|no-store/);
    }
  });

  it("uses source patterns Vercel will actually accept", () => {
    // Vercel compiles `source` with path-to-regexp, which rejects a capturing
    // group inside a capturing group. A combined
    // `/(sw.js|...|workbox-(.*).js)` rule failed the deployment with
    // `invalid-route-source-pattern` — and nothing in the CI bar caught it,
    // because the file is valid JSON and the tests only read its contents.
    const nested = (source: string) => {
      let depth = 0;
      for (let i = 0; i < source.length; i += 1) {
        if (source[i] === "\\") { i += 1; continue; }
        if (source[i] === "(") {
          const nonCapturing =
            source.startsWith("(?:", i) ||
            source.startsWith("(?=", i) ||
            source.startsWith("(?!", i);
          if (depth > 0 && !nonCapturing) return true;
          depth += 1;
        } else if (source[i] === ")") depth -= 1;
      }
      return false;
    };
    const sources: string[] = [
      ...config.redirects, ...config.rewrites, ...config.headers,
    ].map((r: { source: string }) => r.source);
    expect(sources.length).toBeGreaterThan(10);
    expect(nested("((a))")).toBe(true);
    expect(nested("/((?!assets/).*)")).toBe(false);
    for (const source of sources) {
      expect(source, source).toMatch(/^\//);
      expect(nested(source), `nested capturing group: ${source}`).toBe(false);
    }
  });

  it("does not force HTTPS on subdomains this deployment does not serve", () => {
    // includeSubDomains covers every *.smarterdog.co.uk, and the salon's
    // webmail, cpanel and ftp are Bluehost services on plain HTTP. Pinning
    // them to HTTPS locks staff out of their own email for a year, in any
    // browser that has loaded the marketing site.
    const hsts = config.headers
      .flatMap((h: { headers: { key: string; value: string }[] }) => h.headers)
      .filter((h: { key: string }) => h.key === "Strict-Transport-Security");
    expect(hsts.length).toBeGreaterThan(0);
    for (const h of hsts) {
      expect(h.value).toMatch(/max-age=\d+/);
      expect(h.value).not.toMatch(/includeSubDomains/i);
    }
  });

  it("keeps the vercel.app origin out of the index", () => {
    // Same deployment, two hostnames: without this the marketing pages would
    // be indexable twice and compete with smarterdog.co.uk.
    const rule = config.headers.find((h: { has?: unknown }) => h.has);
    expect(rule.has[0]).toEqual({ type: "host", value: "smarterdog.vercel.app" });
    expect(rule.headers[0].value).toMatch(/noindex/);
  });
});

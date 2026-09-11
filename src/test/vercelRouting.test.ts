import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolveLegacyRedirect, resolveMount } from "../routing/entrypoints";

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

  it("keeps the marketing catch-all last", () => {
    // A catch-all placed above the booking rewrites would swallow them.
    const catchAll = indexOfRewrite("/(.*)");
    expect(catchAll).toBe(config.rewrites.length - 1);
    expect(config.rewrites[catchAll].destination).toBe("/index.html");
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
    // "/" is the marketing site, so an unmatched path falls through to the
    // website's catch-all and a staff bookmark lands on the salon's homepage.
    // Caught on production after merge; the preview check had only tried an
    // invented path, which is genuinely meant to reach the website.
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
    const marketing = ["/approach", "/community", "/faq", "/houndsly",
                       "/matted-coat-policy", "/privacy", "/services", "/terms"];
    const sources = config.redirects.map((r: { source: string }) => r.source);
    for (const path of marketing) expect(sources, path).not.toContain(path);
  });

  it("mounts every rewritten path in the app the rewrite implies", () => {
    for (const path of ["/book", "/book/new", "/staff", "/staff/today", "/reset-password"]) {
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
          if (depth > 0 && !source.startsWith("(?:", i)) return true;
          depth += 1;
        } else if (source[i] === ")") depth -= 1;
      }
      return false;
    };
    const sources: string[] = [
      ...config.redirects, ...config.rewrites, ...config.headers,
    ].map((r: { source: string }) => r.source);
    expect(sources.length).toBeGreaterThan(10);
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

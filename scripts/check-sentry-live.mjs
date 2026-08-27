// Is browser error reporting actually LIVE on a deployed build?
//
// WHY THIS EXISTS
//
// `logger.error` forwards to Sentry, and 159 call sites across the app rely on
// that. But `initSentry()` returns early when VITE_SENTRY_DSN is absent, and
// `captureException` returns early when init did not run — so with no DSN the
// entire reporting layer is a silent no-op. Nothing in the app says so, and the
// code reads exactly the same either way.
//
// On 27 August 2026 that was the live state: production carried no DSN, so
// every logger.error in the app had always reported to nothing. Establishing
// that took fetching all 106 chunks of the production bundle and grepping them.
// This script is that archaeology, made repeatable.
//
// THE SIGNAL
//
// Vite inlines `import.meta.env.VITE_SENTRY_DSN` at BUILD time. With no DSN it
// becomes `undefined`, so `if (!dsn) return` is statically true, `Sentry.init`
// is unreachable, and Rollup tree-shakes the whole `@sentry/react` namespace
// import away. vite.config.js routes `node_modules/@sentry/**` into its own
// chunk, so the question "was a DSN present at build time?" reduces to "does
// the deployed sentry chunk still contain the SDK?".
//
// That makes this a property of the artefact rather than of a config screen:
// it cannot be fooled by a variable that is set but not redeployed, which is
// the failure this is most likely to be run against.
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const DEFAULT_ORIGIN = "https://smarterdog.vercel.app";

// Identifiers that only appear if the real SDK survived tree-shaking. A stub
// chunk is a few dozen bytes of re-export and contains none of them.
const SDK_MARKERS = [
  "captureException",
  "getCurrentScope",
  "@sentry",
  "sentry.io",
];

/**
 * Decide whether a deployed sentry chunk carries the SDK.
 * Pure, so the decision is testable without a network round trip.
 */
export function classifySentryChunk(source) {
  if (typeof source !== "string" || source.trim() === "") return "inactive";
  return SDK_MARKERS.some((marker) => source.includes(marker))
    ? "active"
    : "inactive";
}

/**
 * Asset paths listed in the workbox precache manifest baked into sw.js.
 * The manifest is the only place the FULL chunk list appears — index.html
 * references just the entry chunks, and Sentry is not among them.
 */
export function precachedAssets(serviceWorkerSource) {
  const matches = serviceWorkerSource.matchAll(
    /"([^"]*assets\/[A-Za-z0-9._-]+\.js)"/g,
  );
  return [...new Set([...matches].map((match) => match[1]))];
}

export function findSentryChunk(assetPaths) {
  return assetPaths.find((asset) => /assets\/sentry-[^/]*\.js$/.test(asset));
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} for ${url}`);
  }
  return response.text();
}

function absolute(origin, assetPath) {
  return new URL(assetPath, origin).toString();
}

async function main() {
  const origin = (process.argv[2] || DEFAULT_ORIGIN).replace(/\/+$/, "");
  process.stdout.write(`Checking browser error reporting at ${origin}\n`);

  const serviceWorker = await fetchText(`${origin}/sw.js`);
  const assets = precachedAssets(serviceWorker);
  if (assets.length === 0) {
    throw new Error(
      "No precached assets found in sw.js — the build layout may have changed.",
    );
  }

  const sentryChunk = findSentryChunk(assets);
  if (!sentryChunk) {
    // The manual chunk rule always emits the chunk, even when empty, so its
    // absence means the build no longer matches this script's assumptions.
    throw new Error(
      `No sentry chunk among ${assets.length} precached assets. ` +
        "Check the manualChunks rule in vite.config.js.",
    );
  }

  const source = await fetchText(absolute(origin, sentryChunk));
  const verdict = classifySentryChunk(source);

  process.stdout.write(`  ${sentryChunk} — ${source.length} bytes\n`);

  if (verdict === "active") {
    process.stdout.write(
      "\nError reporting is ACTIVE: the Sentry SDK is present, so this build " +
        "was made with VITE_SENTRY_DSN set.\n",
    );
    return 0;
  }

  process.stdout.write(
    "\nError reporting is INACTIVE: the SDK was tree-shaken out, so this " +
      "build was made WITHOUT VITE_SENTRY_DSN.\n" +
      "Every logger.error call in the app is a no-op against this deploy.\n" +
      "See docs/error-reporting.md to enable it.\n",
  );
  return 1;
}

// Exit code carries the verdict so this can gate a release check later, but it
// is deliberately not wired into CI: CI builds have no DSN by design, so it
// would always report inactive there. This asks about a DEPLOY, not a build.
//
// Guarded so the pure helpers above can be imported by tests without firing a
// network request, matching scripts/check-doc-links.mjs.
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main()
    .then((code) => process.exit(code))
    .catch((error) => {
      process.stderr.write(`check-sentry-live failed: ${error.message}\n`);
      process.exit(2);
    });
}

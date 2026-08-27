// Guards scripts/check-sentry-live.mjs — the check that answers "is browser
// error reporting actually live on this deploy?".
//
// The question matters because the app cannot tell you. `initSentry()` returns
// early with no VITE_SENTRY_DSN and `captureException` returns early when init
// did not run, so all 159 logger call sites become no-ops while the source
// reads exactly the same. On 27 August 2026 that was production's real state,
// and establishing it meant fetching and grepping all 106 bundle chunks.
//
// The detection exploits a build-time property rather than a config screen:
// Vite inlines the DSN, so without one `if (!dsn) return` is statically true,
// `Sentry.init` is unreachable, and Rollup drops the whole SDK. Measured on
// this repository, the chunk vite.config.js reserves for `@sentry/**` is
// 86,201 bytes with a DSN and 36 bytes without — a signal with no middle
// ground. These tests pin the classifier at both ends of it, so a future
// refactor cannot quietly turn the check into one that always says "inactive"
// (which would look reassuringly green while reporting nothing).
import { describe, expect, it } from "vitest";
import {
  classifySentryChunk,
  classifyServiceWorkerResponse,
  findSentryChunk,
  precachedAssets,
} from "../../scripts/check-sentry-live.mjs";

// The complete contents of the chunk production served on 27 August 2026,
// verbatim. A local DSN-less build reproduced this byte for byte, right down
// to the content hash in its filename.
const TREE_SHAKEN_STUB = 'import"./react-vendor-C5CtoF6S.js";\n';

describe("classifySentryChunk", () => {
  it("calls a tree-shaken stub inactive", () => {
    expect(classifySentryChunk(TREE_SHAKEN_STUB)).toBe("inactive");
  });

  it("calls a chunk carrying the SDK active", () => {
    // Any one marker is enough; the real chunk contains all of them.
    expect(classifySentryChunk("function captureException(e){}")).toBe("active");
    expect(classifySentryChunk("getCurrentScope()")).toBe("active");
    expect(classifySentryChunk("/* @sentry/react */")).toBe("active");
  });

  it("treats an empty or missing chunk as inactive", () => {
    // Fail closed. Reporting "active" on no evidence is the one answer that
    // would let the dark state persist unnoticed.
    expect(classifySentryChunk("")).toBe("inactive");
    expect(classifySentryChunk("   ")).toBe("inactive");
    expect(classifySentryChunk(undefined as unknown as string)).toBe("inactive");
  });
});

describe("precachedAssets", () => {
  // index.html references only the entry chunks, and Sentry is not among them
  // — the workbox manifest in sw.js is the only full list.
  const SERVICE_WORKER = `
    self.__WB_MANIFEST=[
      {"url":"assets/index-ijYHUAy_.js","revision":null},
      {"url":"assets/sentry-DKgiNFpY.js","revision":null},
      {"url":"assets/react-vendor-C5CtoF6S.js","revision":null},
      {"url":"index.html","revision":"abc"}
    ]`;

  it("lists every javascript asset once", () => {
    expect(precachedAssets(SERVICE_WORKER)).toEqual([
      "assets/index-ijYHUAy_.js",
      "assets/sentry-DKgiNFpY.js",
      "assets/react-vendor-C5CtoF6S.js",
    ]);
  });

  it("finds the sentry chunk among them", () => {
    expect(findSentryChunk(precachedAssets(SERVICE_WORKER))).toBe(
      "assets/sentry-DKgiNFpY.js",
    );
  });

  it("returns nothing when the build no longer emits one", () => {
    // The caller raises rather than guessing: a missing chunk means the
    // manualChunks rule changed and this check's assumption no longer holds.
    expect(findSentryChunk(["assets/index-abc.js"])).toBeUndefined();
  });

  it("anchors on the chunk NAME, not the word appearing anywhere", () => {
    // Vite names it `sentry-<hash>.js` from the manualChunks key, so the match
    // is on the prefix. A chunk that merely contains "sentry" in its name is a
    // different chunk and must not be read as the SDK's.
    expect(findSentryChunk(["assets/sentry-anything-abc.js"])).toBe(
      "assets/sentry-anything-abc.js",
    );
    expect(findSentryChunk(["assets/not-sentry-abc.js"])).toBeUndefined();
    expect(findSentryChunk(["assets/vendor-sentry-abc.js"])).toBeUndefined();
  });
});

describe("classifyServiceWorkerResponse", () => {
  // Found by running the check against this PR's own Vercel preview. Protected
  // previews answer /sw.js with a 302 to an SSO page, which fetch follows to a
  // perfectly successful HTML response — so the script read an auth page as a
  // service worker with no assets in it and blamed the build layout. An access
  // problem reported as a build problem is the kind of wrong answer that costs
  // someone an afternoon.
  it("accepts a service worker served directly as javascript", () => {
    expect(
      classifyServiceWorkerResponse({
        redirected: false,
        contentType: "application/javascript; charset=utf-8",
      }),
    ).toBe("ok");
    expect(
      classifyServiceWorkerResponse({
        redirected: false,
        contentType: "text/javascript",
      }),
    ).toBe("ok");
  });

  it("rejects anything it was redirected to", () => {
    // A build serves sw.js at its own origin. A redirect means something else
    // answered, whatever it then returned.
    expect(
      classifyServiceWorkerResponse({
        redirected: true,
        contentType: "application/javascript",
      }),
    ).toBe("unreachable");
  });

  it("rejects a login page wearing a 200", () => {
    expect(
      classifyServiceWorkerResponse({
        redirected: false,
        contentType: "text/html; charset=utf-8",
      }),
    ).toBe("unreachable");
  });

  it("proceeds when the server states no content type", () => {
    // Absent is not the same as wrong; the asset checks downstream still have
    // to agree before any verdict is reported.
    expect(
      classifyServiceWorkerResponse({ redirected: false, contentType: null }),
    ).toBe("ok");
  });
});
